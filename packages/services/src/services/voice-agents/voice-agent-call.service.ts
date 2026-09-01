import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { randomBytes } from "crypto";
import { apiConfiguration } from "@ringee/configuration";
import {
  AiVoiceAgent,
  AiVoiceAgentCall,
  AiVoiceAgentCallRepository,
  AiVoiceAgentCallStatus,
  CallRepository,
  CallStatus,
  OutboundSource,
} from "@ringee/database";
import {
  hashApiKey,
  normalizePhoneE164,
  VoiceAgentProviderService,
  type OwnershipContext,
} from "@ringee/platform";
import { ContactService } from "../contact.service";
import { CreditService } from "../credit.service";
import { NumberPurchasedService } from "../number.purchased.service";
import { ComplianceService } from "../outbound/compliance.service";
import { UserService } from "../user.service";
import { VoiceAgentBlueprintRegistry } from "./blueprints/voice-agent-blueprint.registry";
import { VoiceAgentService } from "./voice-agent.service";
import {
  AI_VOICE_AGENT_CALL_SOURCE,
  AI_VOICE_AGENT_CONTACT_SOURCE,
  contactIdentityFromVariables,
} from "./voice-agent.types";

/** Seconds to keep ringing before the provider gives up. */
const RING_TIMEOUT_SECONDS = 45;

export interface StartVoiceAgentCallInput {
  /** Destination in any dialable form; normalized to E.164 here. */
  to: string;
  /**
   * Which of the workspace's numbers to present. Overrides the agent's own
   * assignment; see `resolveCallerId` for the full order.
   */
  fromNumberId?: string;
  /** Values for the agent type's dynamic variables (§11). */
  variables?: Record<string, string>;
  /** Caller-supplied passthrough, echoed back on the result (§12). */
  metadata?: Record<string, unknown>;
}

export interface StartVoiceAgentCallResult {
  id: string;
  status: AiVoiceAgentCallStatus;
}

/**
 * The one execution path.
 *
 * Web, the public API, the CLI and MCP all land here — §12 is explicit that
 * there is a single mechanism regardless of origin, and that is what keeps the
 * gates below (calling rights, DNC, balance, caller ID) impossible to bypass by
 * picking a different surface.
 */
@Injectable()
export class VoiceAgentCallService {
  private readonly logger = new Logger(VoiceAgentCallService.name);

  constructor(
    private readonly agents: VoiceAgentService,
    private readonly blueprints: VoiceAgentBlueprintRegistry,
    private readonly agentCalls: AiVoiceAgentCallRepository,
    private readonly callRepository: CallRepository,
    private readonly provider: VoiceAgentProviderService,
    private readonly contacts: ContactService,
    private readonly compliance: ComplianceService,
    private readonly credits: CreditService,
    private readonly numbers: NumberPurchasedService,
    private readonly users: UserService,
  ) {}

  async startCall(
    ctx: OwnershipContext,
    agentId: string,
    input: StartVoiceAgentCallInput,
  ): Promise<StartVoiceAgentCallResult> {
    const agent = await this.agents.require(ctx, agentId);
    this.agents.assertReadyForCalls(agent);

    const to = this.requireDialableNumber(input.to);
    const variables = this.validateVariables(agent, input.variables ?? {});

    await this.assertCallingAllowed(ctx, to);

    const from = await this.resolveCallerId(ctx, agent, input.fromNumberId);
    // Everyone an agent dials becomes a contact in the workspace, named from
    // the variables the caller already supplied — otherwise the only record of
    // the person is a phone number on a call row, and the follow-up, the DNC
    // check and the booking tool all have nothing to hang off. Existing
    // contacts keep whatever they already have; the hint only fills blanks.
    const contact = await this.contacts
      .findOrCreateByPhone(ctx, to, {
        ...contactIdentityFromVariables(variables),
        source: AI_VOICE_AGENT_CONTACT_SOURCE,
      })
      .catch((error: unknown) => {
        // A contact is a convenience for history and for the booking tool, not
        // a precondition for placing the call.
        this.logger.warn(
          `Could not resolve a contact for ${to}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return null;
      });

    const callbackToken = `rvc_${randomBytes(24).toString("hex")}`;
    const agentCall = await this.agentCalls.create({
      agentId: agent.id,
      userId: ctx.userId,
      organizationId: ctx.organizationId ?? null,
      toNumber: to,
      fromNumber: from,
      contactId: contact?.id ?? null,
      status: AiVoiceAgentCallStatus.created,
      variables: variables as object,
      metadata: (input.metadata ?? {}) as object,
      callbackTokenHash: hashApiKey(callbackToken),
    });

    // The telephony row is created here, not on a webhook: a provider-placed
    // leg carries none of the headers the browser path uses to attribute a
    // call, so nothing downstream could build it. It is written *before* the
    // leg is placed, because a row created afterwards is one failed write away
    // from leaving a live, billable call with no history and nothing for its
    // callbacks to land on.
    const call = await this.callRepository.createCall(ctx, {
      contact: contact ? { connect: { id: contact.id } } : undefined,
      fromNumber: from,
      toNumber: to,
      direction: "outbound",
      status: CallStatus.pending,
      startedAt: new Date(),
      source: AI_VOICE_AGENT_CALL_SOURCE,
    });
    await this.agentCalls.update(agentCall.id, { callId: call.id });

    let legPlaced = false;
    try {
      await this.ensureInsightDelivery(agent);
      await this.ensureToolDelivery(ctx, agent);
      const handle = await this.provider.startCall({
        assistantId: agent.providerAssistantId!,
        callingAppId: await this.requireCallingApp(agent),
        from,
        to,
        variables,
        conversationCallbackUrl: this.conversationCallbackUrl(),
        statusCallbackUrl: this.statusCallbackUrl(agentCall.id, callbackToken),
        ringTimeoutSeconds: RING_TIMEOUT_SECONDS,
        timeLimitSeconds: apiConfiguration.AI_VOICE_AGENT_MAX_CALL_SECONDS,
        record: true,
      });

      legPlaced = true;

      // Whatever handles the provider gives back are written the moment they
      // exist — an event that arrives before the first status callback (the
      // cost record, a saved recording) is looked up by control id and has
      // nothing to land on until they are.
      if (handle.callControlId) {
        await this.callRepository.attachTelephony(call.id, {
          callControlId: handle.callControlId,
          providerCallId: handle.providerCallId,
          callSessionId: handle.callSessionId,
        });
      }

      const updated = await this.agentCalls.update(agentCall.id, {
        providerCallControlId: handle.callControlId,
        status: AiVoiceAgentCallStatus.initiating,
      });

      this.logger.log(
        `🤖 Agent ${agent.name} (${agent.id}) dialing ${to} (call ${agentCall.id})`,
      );
      return { id: updated.id, status: updated.status };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (legPlaced) {
        // The leg is live and the row is already bound to it, so the provider's
        // callbacks still carry this call to completion and its cost still
        // settles. Only the linking half failed, and marking either row failed
        // here would contradict the call the workspace is actually paying for.
        this.logger.error(
          `Agent call ${agentCall.id} was placed but could not be linked: ${message}`,
        );
        throw new BadRequestException(`Could not start the call: ${message}`);
      }

      // Nothing was dialed, so the row reserved for the leg is closed here: the
      // stale-call sweep only reaches calls that made it to `ringing`.
      await this.callRepository
        .markForciblyEnded(call.id, message)
        .catch((closeError: unknown) => {
          this.logger.error(
            `Could not close call ${call.id} for agent call ${agentCall.id}: ${
              closeError instanceof Error
                ? closeError.message
                : String(closeError)
            }`,
          );
        });
      await this.agentCalls.update(agentCall.id, {
        status: AiVoiceAgentCallStatus.failed,
        lastError: message,
      });
      this.logger.error(
        `Agent call ${agentCall.id} failed to start: ${message}`,
      );
      throw new BadRequestException(`Could not start the call: ${message}`);
    }
  }

  // ── Gates ────────────────────────────────────────────────────

  /**
   * The same three gates every other dial surface applies: the user may call at
   * all, the destination is not on the DNC list, and there is money to pay for
   * it (BILL-009). The exact cost still settles from the provider's records.
   */
  private async assertCallingAllowed(
    ctx: OwnershipContext,
    to: string,
  ): Promise<void> {
    const user = await this.users.getCachedUserById(ctx.userId);
    if (user?.canCall === false) {
      throw new ForbiddenException("Outbound calling is disabled");
    }

    // Fail closed: a list that cannot be read is "unknown", and dialing a
    // number this gate never cleared is the one outcome it exists to prevent.
    // The balance gate below refuses on the same reasoning.
    const onDnc = await this.compliance
      .findOnDNC(ctx, to)
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`DNC lookup failed for ${to}: ${message}`);
        throw new ServiceUnavailableException(
          "The Do-Not-Call list could not be checked, so the call was not placed.",
        );
      });
    if (onDnc) {
      throw new ForbiddenException(
        onDnc.reason
          ? `Destination is on the DNC list: ${onDnc.reason}`
          : "Destination is on the DNC list",
      );
    }

    if (!user?.freeCallTrial) {
      const balance = await this.credits.getBalance(ctx).catch(() => 0);
      if (balance <= 0) {
        throw new ForbiddenException("Insufficient credits");
      }
    }
  }

  private requireDialableNumber(raw: string): string {
    const normalized = normalizePhoneE164(raw);
    if (!normalized) {
      throw new BadRequestException(`"${raw}" is not a dialable phone number.`);
    }
    return normalized;
  }

  /**
   * Validates the caller's variables against the agent type's own schema.
   * Unknown keys are rejected rather than passed through: a misspelled variable
   * would silently leave a hole in what the agent says.
   */
  private validateVariables(
    agent: AiVoiceAgent,
    supplied: Record<string, string>,
  ): Record<string, string> {
    const blueprint = this.blueprints.require(agent.type);
    const allowed = new Map(blueprint.variables.map((v) => [v.key, v]));

    const unknown = Object.keys(supplied).filter((key) => !allowed.has(key));
    if (unknown.length) {
      throw new BadRequestException(
        `Unknown variables for this agent: ${unknown.join(", ")}. Accepted: ${[
          ...allowed.keys(),
        ].join(", ")}`,
      );
    }

    const resolved: Record<string, string> = {};
    for (const [key, definition] of allowed) {
      const value = supplied[key];
      const text = typeof value === "string" ? value.trim() : "";
      if (!text && definition.required) {
        throw new BadRequestException(`"${key}" is required for this agent.`);
      }
      resolved[key] = text;
    }
    return resolved;
  }

  /**
   * Picks the number to present, in one order for every trigger surface:
   * the number chosen for this call, then the one assigned to the agent, then —
   * only when the workspace has exactly one — that number.
   *
   * Beyond that the call is refused rather than guessed. A workspace runs
   * agents for several brands or countries, and the number a stranger sees is
   * not something to decide by list order. Whichever id the caller supplies is
   * validated against the workspace's own outbound-capable list: an id from a
   * client is never trusted as authorization to use a number.
   */
  private async resolveCallerId(
    ctx: OwnershipContext,
    agent: AiVoiceAgent,
    fromNumberId?: string,
  ): Promise<string> {
    const usable = await this.numbers.listOutboundCallerIds(ctx, {
      source: OutboundSource.ai_voice_agent,
      userId: ctx.userId,
    });
    if (usable.length === 0) {
      throw new BadRequestException(
        "No number in this workspace can place AI agent calls.",
      );
    }

    if (fromNumberId) {
      const chosen = usable.find((number) => number.id === fromNumberId);
      if (!chosen) {
        throw new NotFoundException(
          "That number is not available for AI agent calls.",
        );
      }
      return chosen.phoneNumber;
    }

    if (agent.callerNumberId) {
      const assigned = usable.find(
        (number) => number.id === agent.callerNumberId,
      );
      if (!assigned) {
        throw new BadRequestException(
          "The number assigned to this agent is no longer available. Assign another one, or choose a number for this call.",
        );
      }
      return assigned.phoneNumber;
    }

    if (usable.length === 1) return usable[0]!.phoneNumber;

    throw new BadRequestException(
      "This agent has no number assigned. Assign one to the agent, or choose which number to call from.",
    );
  }

  /**
   * The application this call goes out through, ready to place it.
   *
   * The provider provisions one per assistant, sometimes a moment after the
   * assistant itself, so an agent that does not have one on its row yet is
   * re-read rather than refused. Either way the application is configured
   * before the call: it is what decides the outbound route the call bills
   * through and whether its cost is ever reported back.
   */
  /**
   * Makes sure this call's analysis will have somewhere to land.
   *
   * Best-effort, exactly like the calling application beside it: an agent whose
   * analysis group still points nowhere produces a call with no summary and no
   * outcome, which is worth fixing — and never worth refusing the call the user
   * asked for.
   */
  private async ensureInsightDelivery(agent: AiVoiceAgent): Promise<void> {
    await this.agents.ensureInsightGroup(agent).catch((error: unknown) => {
      this.logger.warn(
        `Could not configure the analysis callback for agent ${agent.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
  }

  /**
   * Makes sure the tools this agent is about to use still reach Ringee.
   *
   * Same shape and same reasoning as the two beside it, and the same failure it
   * exists to prevent: an assistant whose tool URLs were written against an
   * address this backend no longer answers on holds the whole conversation and
   * then tells the person it is having a technical problem — after the call was
   * placed, dialed, answered and paid for.
   */
  private async ensureToolDelivery(
    ctx: OwnershipContext,
    agent: AiVoiceAgent,
  ): Promise<void> {
    await this.agents
      .ensureToolEndpoints(ctx, agent)
      .catch((error: unknown) => {
        this.logger.warn(
          `Could not verify the tool endpoints for agent ${agent.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
  }

  private async requireCallingApp(agent: AiVoiceAgent): Promise<string> {
    const callingAppId =
      agent.providerTexmlAppId ?? (await this.discoverCallingApp(agent));

    await this.agents
      .ensureCallingApp(agent, callingAppId)
      .catch((error: unknown) => {
        // Worth a call that bills through the provider's default route and
        // reports no cost, but not worth refusing the call the user asked for.
        this.logger.warn(
          `Could not configure the calling application for agent ${agent.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
    return callingAppId;
  }

  /** Reads the calling application off the provider for an agent without one. */
  private async discoverCallingApp(agent: AiVoiceAgent): Promise<string> {
    const assistant = await this.provider.getAssistant(
      agent.providerAssistantId!,
    );
    if (!assistant?.callingAppId) {
      throw new BadRequestException(
        "This agent is not ready to place calls yet. Try again in a moment.",
      );
    }
    return assistant.callingAppId;
  }

  // ── Callback URLs ────────────────────────────────────────────

  /**
   * Conversation events are ordinary signed provider webhooks, so they go to
   * the existing call webhook — one signature check, one normalizer, one entry
   * point into the call lifecycle.
   */
  private conversationCallbackUrl(): string {
    return `${this.publicBase()}/api/call/webhook`;
  }

  /**
   * Call status arrives in the provider's telephony-markup shape rather than as
   * a signed event, so it gets its own route, authorized by a single-use token
   * whose hash is stored on the call row.
   */
  private statusCallbackUrl(agentCallId: string, token: string): string {
    return `${this.publicBase()}/api/ai-voice-agents/webhooks/status/${agentCallId}/${token}`;
  }

  private publicBase(): string {
    return apiConfiguration.PUBLIC_BACKEND_URL.replace(/\/+$/, "");
  }

  // ── Reads ────────────────────────────────────────────────────

  listCalls(
    ctx: OwnershipContext,
    agentId: string,
    options?: { page?: number; limit?: number },
  ) {
    return this.agentCalls.listForAgent(ctx, agentId, options);
  }

  async requireCall(
    ctx: OwnershipContext,
    id: string,
  ): Promise<AiVoiceAgentCall> {
    const call = await this.agentCalls.findByIdForOwner(ctx, id);
    if (!call) throw new NotFoundException("AI voice agent call not found");
    return call;
  }
}
