import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { createHash, randomBytes, randomUUID } from "crypto";
import { apiConfiguration } from "@ringee/configuration";
import {
  AiVoiceAgent,
  AiVoiceAgentCall,
  AiVoiceAgentCallDispatchRepository,
  AiVoiceAgentCallRepository,
  AiVoiceAgentCallStatus,
  AiVoiceAgentType,
  CallRepository,
  Call,
  CallStatus,
  OutboundSource,
  OrganizationRepository,
  CustomIntegrationRepository,
  Prisma,
} from "@ringee/database";
import {
  TRAFFIC_LEVEL,
  agedTrafficClass,
  accountSlot,
  hashApiKey,
  isDispatchSource,
  isInWorkspace,
  normalizePhoneE164,
  ProviderDispatchDeferredError,
  ProviderDispatchService,
  resolveTrafficClass,
  VoiceAgentCallRefusedError,
  VoiceAgentProviderService,
  workspaceKeyOf,
  workspaceOf,
  type DispatchPermit,
  type DispatchSource,
  type OwnershipContext,
} from "@ringee/platform";
import { ContactService } from "../contact.service";
import { DispatchKickService } from "../dispatch/dispatch-kick.service";
import { CreditService } from "../credit.service";
import { NumberPurchasedService } from "../number.purchased.service";
import { ComplianceService } from "../outbound/compliance.service";
import { UserService } from "../user.service";
import { VoiceAgentBlueprintRegistry } from "./blueprints/voice-agent-blueprint.registry";
import { assertVoiceAgentAccess } from "./voice-agent-access";
import { VoiceAgentService } from "./voice-agent.service";
import { voiceAgentRuntimeVariables } from "./voice-agent-conversation";
import {
  AI_VOICE_AGENT_CALL_SOURCE,
  AI_VOICE_AGENT_CONTACT_SOURCE,
  contactIdentityFromVariables,
} from "./voice-agent.types";

/** Seconds to keep ringing before the provider gives up. */
const RING_TIMEOUT_SECONDS = 45;

/** How long a dispatcher may hold a queued call before another may take it. */
export const DISPATCH_CLAIM_LEASE_MS = 30_000;
/**
 * A call this old is no longer live, whatever its row says: the longest agent
 * call is 15 minutes, so a row that has said `created` for longer is a ghost
 * and must not hold a workspace's slot.
 */
const LIVE_CALL_WINDOW_MS = 20 * 60_000;
/** Attempts that fail for a reason other than capacity before the queue gives up. */
const MAX_DISPATCH_ERRORS = 8;

/** What one dispatch attempt of a queued call came to. */
export type DispatchOutcome =
  | { outcome: "placed"; status: AiVoiceAgentCallStatus }
  | { outcome: "deferred"; reason: string; retryAfterMs: number }
  | { outcome: "skipped"; reason: "not_claimed" | "cancelled" | "expired" }
  /** A rule or the provider refused it; it is over and will not be retried. */
  | { outcome: "failed"; reason: string }
  /** The provider may have placed a leg; it is reconciled, never redialed. */
  | { outcome: "in_doubt" };

type DispatchAttempt =
  | { kind: "placed"; result: StartVoiceAgentCallResult }
  | { kind: "deferred"; reason: string; retryAfterMs: number }
  | { kind: "skipped"; reason: "not_claimed" | "cancelled" | "expired" };

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
  /**
   * Internal, never accepted from a client: a durable caller's correlation,
   * written on the agent call before the leg is placed. A second start under
   * the same key finds that row and never dials again (AGENT-019).
   */
  idempotencyKey?: string;
  /**
   * Internal: the member a meeting booked on this call is with. The caller
   * has already checked they belong to the workspace (CAL-003).
   */
  responsibleUserId?: string;
  /**
   * Internal, never accepted from a client: what is starting the call. It sets
   * the call's traffic class for outbound pacing (CPS-003); absent, the call is
   * a person's. `queue` lets a call that finds no provider capacity wait in the
   * durable queue instead of failing — only for callers with nothing durable
   * of their own behind them (the public API, MCP), and only when the queue is
   * enabled (CPS-006).
   */
  dispatch?: {
    source: DispatchSource;
    queue?: boolean;
    integrationId?: string;
  };
}

export type VoiceAgentPlacementGuard = (call: {
  agentCallId: string;
  callId: string;
}) => Promise<void>;

export interface StartVoiceAgentCallResult {
  id: string;
  status: AiVoiceAgentCallStatus;
  /** Present only while the call waits for capacity: nothing has been dialed. */
  queue?: { queuedAt: Date; expiresAt: Date };
}

/** What an external client may choose about a call (never its idempotency key). */
export type StartVoiceAgentCallForClientInput = Pick<
  StartVoiceAgentCallInput,
  "to" | "fromNumberId" | "variables" | "metadata"
>;

export interface StartVoiceAgentCallForClientResult
  extends StartVoiceAgentCallResult {
  /** True when the client's key had already started this call: nothing was placed now. */
  replayed: boolean;
}

/**
 * The stored form of a client's idempotency key (HOOK-008).
 *
 * It is namespaced by the integration that sent it and hashed. Two integrations
 * can therefore use the same key without meeting; a client can never collide
 * with the keys Ringee's own workers persist (`meeting:…`), which share the
 * column; and the stored value discloses nothing the client sent.
 */
export function clientIdempotencyKey(scope: string, key: string): string {
  const digest = createHash("sha256").update(key).digest("hex");
  return `client:${scope}:${digest}`;
}

/**
 * Whether an agent call failed before the provider accepted any leg, so nothing
 * was ever dialed for it. `closeUnplacedCall` is the only writer of `failed`
 * without a control id: a leg that may be live is never marked failed, and a
 * status callback writes the control id with the status.
 */
export function failedBeforePlacement(
  call: Pick<AiVoiceAgentCall, "status" | "providerCallControlId">,
): boolean {
  return (
    call.status === AiVoiceAgentCallStatus.failed && !call.providerCallControlId
  );
}

/** The first attempt's reason, short enough for a response, or nothing. */
function reasonSuffix(lastError: string | null | undefined): string {
  const reason = lastError?.replace(/\s+/g, " ").trim().slice(0, 300);
  return reason ? ` (${reason})` : "";
}

export enum VoiceAgentCallStartOutcome {
  terminal_rejection = "terminal_rejection",
  retryable_before_placement = "retryable_before_placement",
  placed_pending_reconciliation = "placed_pending_reconciliation",
}

/**
 * Carries the one fact a durable caller needs after `startCall` rejects:
 * whether another dial is safe. The original HTTP response and status are
 * retained for REST/MCP callers.
 */
export class VoiceAgentCallStartError extends HttpException {
  constructor(
    readonly outcome: VoiceAgentCallStartOutcome,
    error: unknown,
    readonly agentCallId: string | null = null,
  ) {
    const message = error instanceof Error ? error.message : String(error);
    super(
      error instanceof HttpException
        ? error.getResponse()
        : `Could not start the call: ${message}`,
      error instanceof HttpException ? error.getStatus() : 400,
      { cause: error instanceof Error ? error : undefined },
    );
    this.name = VoiceAgentCallStartError.name;
  }
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
    // Outbound pacing and the durable queue (CPS-001, CPS-006). Optional so the
    // service still builds where they are not wired, and so everything added
    // here is dormant until the settings turn it on.
    @Optional() private readonly dispatch?: ProviderDispatchService,
    @Optional()
    private readonly dispatches?: AiVoiceAgentCallDispatchRepository,
    @Optional() private readonly kicker?: DispatchKickService,
    @Optional() private readonly organizations?: OrganizationRepository,
    @Optional() private readonly integrations?: CustomIntegrationRepository,
  ) {}

  async startInbound(
    ctx: OwnershipContext,
    agentId: string,
    call: Call,
  ): Promise<void> {
    assertVoiceAgentAccess(ctx);
    // The call must be this workspace's: matching organizations alone would
    // let one person's personal workspace take another's call, since every
    // personal call has a null organization.
    if (
      !isInWorkspace(ctx, call) ||
      call.direction !== "inbound" ||
      !call.callControlId ||
      call.endedAt
    )
      throw new ForbiddenException("This inbound call is unavailable.");
    const agent = await this.agents.require(ctx, agentId);
    const existing = await this.agentCalls.findByCallId(call.id);
    if (existing && existing.agentId !== agentId)
      throw new ForbiddenException(
        "This call already belongs to another agent.",
      );
    if (
      existing?.providerConversationId ||
      existing?.status === AiVoiceAgentCallStatus.completed
    )
      return;
    if ((await this.credits.getBalance(ctx)) <= 0)
      throw new ForbiddenException("Insufficient credits");
    const config = await this.agents.inboundConfig(ctx, agentId);
    const agentCall = await this.agentCalls.createInboundOnce({
      agentId,
      callId: call.id,
      userId: ctx.userId,
      organizationId: ctx.organizationId ?? null,
      fromNumber: call.toNumber,
      toNumber: call.fromNumber,
      contactId: call.contactId,
      providerCallControlId: call.callControlId,
      status: AiVoiceAgentCallStatus.initiating,
      metadata: { direction: "inbound" },
    });
    const started = await this.provider.startInboundCall({
      callControlId: call.callControlId,
      assistantId: agent.providerAssistantId!,
      commandId: `receptionist-${call.id}`,
      config,
    });
    await this.agentCalls.markInboundStarted(
      agentCall.id,
      started.conversationId,
    );
  }

  async startCall(
    ctx: OwnershipContext,
    agentId: string,
    input: StartVoiceAgentCallInput,
    beforePlacement?: VoiceAgentPlacementGuard,
  ): Promise<StartVoiceAgentCallResult> {
    try {
      return await this.startCallInternal(ctx, agentId, input, beforePlacement);
    } catch (error) {
      if (error instanceof VoiceAgentCallStartError) throw error;
      throw new VoiceAgentCallStartError(
        this.isTerminalPolicyRejection(error)
          ? VoiceAgentCallStartOutcome.terminal_rejection
          : VoiceAgentCallStartOutcome.retryable_before_placement,
        error,
      );
    }
  }

  /**
   * Starts a call for an external client that retries — a workflow engine, a
   * script, a queue (HOOK-008).
   *
   * Without a key this is `startCall`. With one, the first request places the
   * call and every later request under the same key — a retried workflow, a
   * timed-out HTTP request sent again — returns that call and places nothing.
   * The key is checked before the gates that `startCall` runs, so a replay still
   * answers after the balance dropped or the number joined the DNC list since
   * the original request; it is the same call, not a new dial.
   *
   * The key is the client's, but the row that stores it is shared with Ringee's
   * own durable callers, so it is stored namespaced by `scope`
   * (`clientIdempotencyKey`), which the caller derives from its authentication,
   * never from the request. A key reused for another agent or destination is a
   * client mistake and is refused rather than answered with the wrong call.
   */
  async startCallForClient(
    ctx: OwnershipContext,
    agentId: string,
    input: StartVoiceAgentCallForClientInput,
    client: { scope: string; idempotencyKey?: string; integrationId?: string },
  ): Promise<StartVoiceAgentCallForClientResult> {
    const clientKey = client.idempotencyKey?.trim();
    // An integration starts calls in volume and retries: it may wait for
    // capacity in the queue (CPS-006), and it is paced as background work.
    const dispatch = {
      source: "agent_api",
      queue: true,
      integrationId: client.integrationId,
    } as const;
    if (!clientKey) {
      const started = await this.startCall(ctx, agentId, {
        ...input,
        dispatch,
      });
      return { ...started, replayed: false };
    }

    const idempotencyKey = clientIdempotencyKey(client.scope, clientKey);
    const earlier = await this.agentCalls.findByIdempotencyKey(idempotencyKey);
    if (earlier) return this.replayClientStart(ctx, agentId, input, earlier);

    try {
      const started = await this.startCall(ctx, agentId, {
        ...input,
        idempotencyKey,
        dispatch,
      });
      return { ...started, replayed: false };
    } catch (error) {
      // Two requests raced under one key and the other one placed the call.
      if (
        error instanceof VoiceAgentCallStartError &&
        error.getStatus() === HttpStatus.CONFLICT &&
        error.agentCallId
      ) {
        const winner =
          await this.agentCalls.findByIdempotencyKey(idempotencyKey);
        if (winner) return this.replayClientStart(ctx, agentId, input, winner);
      }
      throw error;
    }
  }

  private async replayClientStart(
    ctx: OwnershipContext,
    agentId: string,
    input: StartVoiceAgentCallForClientInput,
    earlier: AiVoiceAgentCall,
  ): Promise<StartVoiceAgentCallForClientResult> {
    if (earlier.status === AiVoiceAgentCallStatus.queued && this.dispatches)
      earlier = await this.requireCall(ctx, earlier.id);
    // The key carries the integration, which belongs to one workspace, so a row
    // from another one cannot match. This keeps that true if a key is ever
    // stored without its scope, and answers without saying whose call it was.
    if (!isInWorkspace(ctx, earlier)) {
      throw new ConflictException("This idempotency key cannot be used.");
    }
    if (
      earlier.agentId !== agentId ||
      earlier.toNumber !== this.requireDialableNumber(input.to)
    ) {
      throw new UnprocessableEntityException(
        "This idempotency key was already used for a different call. Send a new key to place a new call.",
      );
    }
    // A retry carries the key of the attempt it repeats, so answering it with
    // that attempt's `failed` row would read as a successful start to a client
    // that retries on error — and no call would ever have been dialed. Nothing
    // was placed, so the honest answer is the failure itself (the way a
    // replayed error stays an error): the client sends a new key to try again.
    // A call that WAS dialed and then ended badly is still answered below.
    if (failedBeforePlacement(earlier)) {
      throw new ConflictException({
        statusCode: HttpStatus.CONFLICT,
        error: "Conflict",
        code: "idempotency_key_failed",
        message: `The first attempt under this Idempotency-Key failed before the call was placed${reasonSuffix(earlier.lastError)}. Nothing was dialed. Send a new Idempotency-Key to try again.`,
      });
    }
    // Cancelled or expired in the queue: nothing was dialed either, and the
    // key must not quietly re-dial something a person withdrew.
    if (
      earlier.status === AiVoiceAgentCallStatus.cancelled ||
      earlier.status === AiVoiceAgentCallStatus.expired
    ) {
      throw new ConflictException({
        statusCode: HttpStatus.CONFLICT,
        error: "Conflict",
        code: `idempotency_key_${earlier.status}`,
        message: `The call under this Idempotency-Key was ${earlier.status} before it was dialed. Nothing was dialed. Send a new Idempotency-Key to place it again.`,
      });
    }
    const pending =
      earlier.status === AiVoiceAgentCallStatus.queued
        ? await this.dispatches?.findByAgentCallId(earlier.id)
        : null;
    return {
      id: earlier.id,
      status: earlier.status,
      replayed: true,
      ...(pending
        ? {
            queue: { queuedAt: pending.queuedAt, expiresAt: pending.expiresAt },
          }
        : {}),
    };
  }

  private async startCallInternal(
    ctx: OwnershipContext,
    agentId: string,
    input: StartVoiceAgentCallInput,
    beforePlacement?: VoiceAgentPlacementGuard,
  ): Promise<StartVoiceAgentCallResult> {
    assertVoiceAgentAccess(ctx);
    const agent = await this.agents.require(ctx, agentId);
    // A receptionist only answers the numbers routed to it. Refused before
    // anything is written, and as a policy rejection, so a surface that lists
    // every agent (API, CLI, MCP) gets a clear answer and nothing retries it.
    if (agent.type === AiVoiceAgentType.receptionist) {
      throw new BadRequestException(
        "An AI receptionist answers incoming calls and cannot place calls.",
      );
    }
    this.agents.assertReadyForCalls(agent);

    const to = this.requireDialableNumber(input.to);
    const variables = this.validateVariables(agent, input.variables ?? {});

    await this.assertCallingAllowed(ctx, to);

    const from = await this.resolveCallerId(ctx, agent, input.fromNumberId);

    // A durable caller's earlier try under the same key already has its row:
    // whatever happened to it, this start must not place a second leg or
    // write the contact again, so the key is checked before the first write.
    // Two starts racing under one key are settled by the unique key below.
    if (input.idempotencyKey) {
      const earlier = await this.agentCalls.findByIdempotencyKey(
        input.idempotencyKey,
      );
      if (earlier) throw this.alreadyStarted(earlier);
    }

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

    // A call that finds no provider capacity may wait for it in the durable
    // queue instead of failing — but only one nobody durable stands behind:
    // a reminder or a callback has its own retry and keeps its own fences.
    if (
      input.dispatch?.queue &&
      !beforePlacement &&
      (await this.queueEnabled())
    ) {
      return this.startQueued(ctx, agent, {
        to,
        from,
        variables,
        contactId: contact?.id ?? null,
        input,
      });
    }

    const callbackToken = `rvc_${randomBytes(24).toString("hex")}`;
    let agentCall: AiVoiceAgentCall | null = null;
    let callId: string | null = null;
    try {
      try {
        const data = {
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
          idempotencyKey: input.idempotencyKey ?? null,
          responsibleUserId: input.responsibleUserId ?? null,
        };
        const settings = this.dispatch
          ? (await this.dispatch.getSettings()).settings
          : null;
        agentCall =
          settings?.mode === "enforce"
            ? await this.agentCalls.createIfBelowLimit(ctx, data, {
                max:
                  settings.orgConcurrencyOverrides[workspaceKeyOf(ctx)] ??
                  settings.orgConcurrency,
                liveSince: new Date(
                  Date.now() -
                    Math.max(
                      LIVE_CALL_WINDOW_MS,
                      (apiConfiguration.AI_VOICE_AGENT_MAX_CALL_SECONDS + 120) *
                        1000,
                    ),
                ),
              })
            : await this.agentCalls.create(data);
        if (!agentCall)
          throw new ProviderDispatchDeferredError("workspace_busy", 5_000);
      } catch (error) {
        // Two starts raced under one key: the other one owns the call.
        if (
          input.idempotencyKey &&
          isUniqueViolationOn(error, "idempotencyKey")
        ) {
          const earlier = await this.agentCalls.findByIdempotencyKey(
            input.idempotencyKey,
          );
          if (earlier) throw this.alreadyStarted(earlier);
        }
        throw error;
      }

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
      callId = call.id;
      await this.agentCalls.update(agentCall.id, { callId: call.id });
    } catch (error) {
      // An earlier start under the same key: nothing of this one exists to
      // close, and the earlier row must not be touched.
      if (error instanceof VoiceAgentCallStartError) throw error;
      await this.closeUnplacedCall(callId, agentCall?.id ?? null, error);
      throw new VoiceAgentCallStartError(
        VoiceAgentCallStartOutcome.retryable_before_placement,
        error,
        agentCall?.id ?? null,
      );
    }

    try {
      await this.ensureInsightDelivery(agent);
      await this.ensureToolDelivery(ctx, agent, Boolean(beforePlacement));
      const callingAppId = await this.requireCallingApp(agent);
      // All potentially slow preparation is done. Durable callers commit their
      // current authorization immediately before the external side effect.
      // As late as possible: the pacing guarantee is only as good as the time
      // between the grant and the request, so every slow step is behind us.
      await this.reservePlacement(ctx, agentCall.id, callId);
      const permit = await this.admitPlacement(ctx, input);
      if (beforePlacement) await this.assertCallingAllowed(ctx, to);
      await beforePlacement?.({ agentCallId: agentCall.id, callId });
      return await this.placeLeg({
        ctx,
        agent,
        agentCall,
        callId,
        callingAppId,
        from,
        to,
        variables,
        callbackToken,
        permit,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (
        error instanceof VoiceAgentCallStartError &&
        error.outcome ===
          VoiceAgentCallStartOutcome.placed_pending_reconciliation
      ) {
        // The leg is live, or may be. Provider callbacks and the billing sweep
        // can repair whichever local write failed, so neither row is marked
        // failed and a durable caller must not initiate a second leg.
        this.logger.error(
          `Agent call ${agentCall.id} may have a live leg and is left to reconcile: ${message}`,
        );
        throw error;
      }

      await this.closeUnplacedCall(callId, agentCall.id, error);
      // Capacity was denied before HTTP, so no provider attempt exists. Keep
      // the failed operation for audit, but allow a bounded client retry with
      // its original key. Provider rejections and ambiguous responses retain
      // their key and can never enter this branch.
      if (
        error instanceof ProviderDispatchDeferredError &&
        input.idempotencyKey
      )
        await this.agentCalls.releaseUnsentIdempotencyKey(
          ctx,
          agentCall.id,
          input.idempotencyKey,
        );
      this.logger.error(
        `Agent call ${agentCall.id} failed to start: ${message}`,
      );
      throw new VoiceAgentCallStartError(
        this.isTerminalPolicyRejection(error)
          ? VoiceAgentCallStartOutcome.terminal_rejection
          : VoiceAgentCallStartOutcome.retryable_before_placement,
        error,
        agentCall.id,
      );
    }
  }

  /**
   * Places the leg and records what the provider answered. Shared by the inline
   * start and the queued dispatch, so both persist handles the same way and
   * both read the provider's answer by the same rule: only a refusal it stated
   * proves no leg exists (AGENT-019).
   *
   * Runs after the rows exist and, when pacing is on, after the permit: the
   * request spends that permit at the Telnyx client.
   */
  private async placeLeg(args: {
    ctx: OwnershipContext;
    agent: AiVoiceAgent;
    agentCall: AiVoiceAgentCall;
    callId: string;
    callingAppId: string;
    from: string;
    to: string;
    variables: Record<string, string>;
    callbackToken: string;
    permit: DispatchPermit | undefined;
  }): Promise<StartVoiceAgentCallResult> {
    const {
      ctx,
      agent,
      agentCall,
      callId,
      callingAppId,
      from,
      to,
      variables,
      callbackToken,
      permit,
    } = args;
    const handle = await this.runWithPermit(permit, ctx, () =>
      this.provider
        .startCall({
          assistantId: agent.providerAssistantId!,
          callingAppId,
          from,
          to,
          // The assistant is long-lived, but the clock is not. Override the
          // Ringee-owned runtime values on every dial so web, public API, CLI
          // and MCP calls all interpret dates in the agent's selected time
          // zone.
          variables: {
            ...variables,
            ...voiceAgentRuntimeVariables(agent.timezone),
          },
          conversationCallbackUrl: this.conversationCallbackUrl(),
          statusCallbackUrl: this.statusCallbackUrl(
            agentCall.id,
            callbackToken,
          ),
          ringTimeoutSeconds: RING_TIMEOUT_SECONDS,
          timeLimitSeconds: apiConfiguration.AI_VOICE_AGENT_MAX_CALL_SECONDS,
          record: true,
        })
        .catch((error: unknown) => {
          // Only a refusal the provider stated proves no leg exists. A
          // timeout, a dropped connection or a 5xx may have placed one: it is
          // left for the call's own callbacks to reconcile, never dialed
          // again (AGENT-019).
          if (error instanceof VoiceAgentCallRefusedError) throw error;
          // Refused for capacity before anything was sent: no leg exists.
          if (error instanceof ProviderDispatchDeferredError) throw error;
          throw new VoiceAgentCallStartError(
            VoiceAgentCallStartOutcome.placed_pending_reconciliation,
            error,
            agentCall.id,
          );
        }),
    );

    // Whatever handles the provider gives back are written the moment they
    // exist — an event that arrives before the first status callback (the
    // cost record, a saved recording) is looked up by control id and has
    // nothing to land on until they are.
    let persistenceError: unknown = null;
    if (handle.callControlId) {
      try {
        await this.callRepository.attachTelephony(callId, {
          callControlId: handle.callControlId,
          providerCallId: handle.providerCallId,
          callSessionId: handle.callSessionId,
        });
      } catch (error) {
        persistenceError = error;
      }
    }

    let updated: AiVoiceAgentCall | null = null;
    try {
      updated = await this.agentCalls.update(agentCall.id, {
        providerCallControlId: handle.callControlId,
        status: AiVoiceAgentCallStatus.initiating,
      });
    } catch (error) {
      persistenceError ??= error;
    }
    if (persistenceError) {
      throw new VoiceAgentCallStartError(
        VoiceAgentCallStartOutcome.placed_pending_reconciliation,
        persistenceError,
        agentCall.id,
      );
    }
    if (!updated) {
      throw new VoiceAgentCallStartError(
        VoiceAgentCallStartOutcome.placed_pending_reconciliation,
        new Error("The placed call could not be updated"),
        agentCall.id,
      );
    }

    this.logger.log(
      `🤖 Agent ${agent.name} (${agent.id}) dialing ${to} (call ${agentCall.id})`,
    );
    return { id: updated.id, status: updated.status };
  }

  // ── Outbound pacing and the dispatch queue (CPS-001, CPS-006) ───────────

  /** Whether integration-started calls may wait in the durable queue. */
  private async queueEnabled(): Promise<boolean> {
    if (!this.dispatch || !this.dispatches) return false;
    const { settings } = await this.dispatch.getSettings();
    return settings.queueEnabled && settings.mode !== "off";
  }

  /**
   * The right to place this call now, taken as late as possible: the pacing
   * guarantee is only as good as the time between the grant and the request.
   * `undefined` where pacing is not wired. Throws
   * `ProviderDispatchDeferredError` — nothing was sent — when capacity is short
   * and the call's class does not wait for it.
   */
  private async admitPlacement(
    ctx: OwnershipContext,
    input: StartVoiceAgentCallInput,
  ): Promise<DispatchPermit | undefined> {
    if (!this.dispatch) return undefined;
    const decision = await this.dispatch.admit({
      source: input.dispatch?.source ?? "agent_dashboard",
      workspace: ctx,
    });
    if (!decision.granted) {
      throw new ProviderDispatchDeferredError(
        decision.reason,
        decision.retryAfterMs,
      );
    }
    return decision.permit;
  }

  /** An admission buffer, not a fixed call price or a worst-case cost quote.
   * Holds begin only once this operation is dispatching, never while queued. */
  private async reservePlacement(
    ctx: OwnershipContext,
    agentCallId: string,
    callId: string,
  ): Promise<void> {
    if (!this.dispatch) return;
    const { settings } = await this.dispatch.getSettings();
    if (settings.mode === "off") return;
    const owner = await this.users.getCachedUserById(ctx.userId);
    if (owner?.freeCallTrial) return;
    const half = settings.agentCallCreditReservationUsd / 2;
    const reserved = await this.credits.reserveCredits(
      ctx,
      [
        { idempotencyKey: `call-cost:${callId}`, amount: half },
        { idempotencyKey: `ai-voice-agent-cost:${agentCallId}`, amount: half },
      ],
      new Date(
        Date.now() +
          Math.max(
            24 * 3_600_000,
            (apiConfiguration.AI_VOICE_AGENT_MAX_CALL_SECONDS + 3600) * 1000,
          ),
      ),
    );
    if (!reserved)
      throw new ForbiddenException(
        "Insufficient available credits for call admission.",
      );
  }

  private runWithPermit<T>(
    permit: DispatchPermit | undefined,
    ctx: OwnershipContext,
    fn: () => Promise<T>,
  ): Promise<T> {
    if (!this.dispatch) return fn();
    if (permit) return this.dispatch.runWithPermit(permit, fn);
    // No permit means the request asks for capacity itself, at the last moment.
    return this.dispatch.runInScope(
      { source: "agent_dashboard", workspace: ctx },
      fn,
    );
  }

  /**
   * Persists the operation and returns immediately. Even an idle account uses
   * the durable pump, so an integration never waits synchronously for pacing.
   */
  private async startQueued(
    ctx: OwnershipContext,
    agent: AiVoiceAgent,
    args: {
      to: string;
      from: string;
      variables: Record<string, string>;
      contactId: string | null;
      input: StartVoiceAgentCallInput;
    },
  ): Promise<StartVoiceAgentCallResult> {
    const dispatch = this.dispatch!;
    const dispatches = this.dispatches!;
    const { settings } = await dispatch.getSettings();
    const source = args.input.dispatch!.source;
    const level =
      TRAFFIC_LEVEL[resolveTrafficClass(source, settings.classOverrides)];
    const now = new Date();
    const waitMs =
      level <= 2
        ? settings.queueMaxWaitMsAutomation
        : settings.queueMaxWaitMsBackground;

    let enqueued: Awaited<ReturnType<typeof dispatches.enqueue>>;
    try {
      enqueued = await dispatches.enqueue({
        call: {
          agentId: agent.id,
          userId: ctx.userId,
          organizationId: ctx.organizationId ?? null,
          toNumber: args.to,
          fromNumber: args.from,
          contactId: args.contactId,
          variables: args.variables as object,
          metadata: (args.input.metadata ?? {}) as object,
          idempotencyKey: args.input.idempotencyKey ?? null,
          responsibleUserId: args.input.responsibleUserId ?? null,
        },
        dispatch: {
          workspaceKey: workspaceKeyOf(ctx),
          providerAccountKey: accountSlot(dispatch.getAccount()),
          trafficLevel: level,
          source,
          integrationId: args.input.dispatch?.integrationId,
          queuedAt: now,
          expiresAt: new Date(now.getTime() + waitMs),
        },
        limits: {
          perWorkspace: settings.queueMaxPerWorkspace,
          total: settings.queueMaxTotal,
        },
      });
    } catch (error) {
      // Two starts raced under one key: the other one owns the call.
      if (
        args.input.idempotencyKey &&
        isUniqueViolationOn(error, "idempotencyKey")
      ) {
        const earlier = await this.agentCalls.findByIdempotencyKey(
          args.input.idempotencyKey,
        );
        if (earlier) throw this.alreadyStarted(earlier);
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ["P2024", "P2028"].includes(error.code)
      ) {
        // Pool pressure or an uncertain transaction acknowledgement is a
        // temporary admission failure, not invalid customer input. The commit
        // may exist: preserve the key, never enqueue again here or claim that
        // nothing was accepted. A client resolves this with the same key.
        throw new VoiceAgentCallStartError(
          VoiceAgentCallStartOutcome.placed_pending_reconciliation,
          new ServiceUnavailableException({
            code: "dispatch_admission_unavailable",
            retryAfterMs: 5_000,
            message:
              "Call queue admission could not be confirmed. Retry only with the same idempotency key, or inspect the operation before submitting another call.",
          }),
        );
      }
      throw error;
    }

    if (!enqueued.queued) {
      // Backpressure: say so, with a time to come back, rather than let the
      // queue grow without bound.
      throw new VoiceAgentCallStartError(
        VoiceAgentCallStartOutcome.retryable_before_placement,
        new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            error: "Too Many Requests",
            code: "dispatch_queue_full",
            reason: enqueued.reason,
            retryAfterMs: 30_000,
            message:
              enqueued.reason === "workspace_full"
                ? "This workspace already has as many calls waiting to be dialed as it may. Nothing was queued; retry in 30s."
                : "The call queue is full. Nothing was queued; retry in 30s.",
          },
          HttpStatus.TOO_MANY_REQUESTS,
        ),
      );
    }

    const queue = {
      queuedAt: enqueued.dispatch.queuedAt,
      expiresAt: enqueued.dispatch.expiresAt,
    };
    const waiting: StartVoiceAgentCallResult = {
      id: enqueued.call.id,
      status: AiVoiceAgentCallStatus.queued,
      queue,
    };

    // Even an idle provider is dispatched by the worker. A slow provider or
    // CPS wait must never hold an n8n/API request open after durable acceptance.
    void this.kicker?.kick();
    return waiting;
  }

  /**
   * One attempt to dispatch a queued call, for the pump: it never throws, and
   * says what happened. A call is only ever placed once: the claim is a lease,
   * the commit is a compare-and-set, and nothing after the commit is retried.
   */
  async dispatchQueued(
    agentCallId: string,
    options: { maxWaitMs: number },
  ): Promise<DispatchOutcome> {
    try {
      const attempt = await this.runDispatch(agentCallId, options);
      if (attempt.kind === "placed")
        return { outcome: "placed", status: attempt.result.status };
      if (attempt.kind === "deferred")
        return {
          outcome: "deferred",
          reason: attempt.reason,
          retryAfterMs: attempt.retryAfterMs,
        };
      return { outcome: "skipped", reason: attempt.reason };
    } catch (error) {
      if (error instanceof VoiceAgentCallStartError) {
        return error.outcome ===
          VoiceAgentCallStartOutcome.placed_pending_reconciliation
          ? { outcome: "in_doubt" }
          : { outcome: "failed", reason: error.message };
      }
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Dispatching call ${agentCallId} failed: ${message}`);
      return { outcome: "failed", reason: message };
    }
  }

  /**
   * The one routine that moves a call from the queue to the provider.
   *
   *   claim → check everything again → prepare → ask for capacity → commit → place
   *
   * Everything before the commit can be walked away from: the claim is released
   * (or the call is failed, when a rule says no) and the provider has heard
   * nothing. The commit is atomic with the workspace's live-call cap. After it
   * the call is the ordinary flow, and a provider answer that cannot be read is
   * reconciled by its callbacks, never dialed again.
   */
  private async runDispatch(
    agentCallId: string,
    options: { maxWaitMs: number },
  ): Promise<DispatchAttempt> {
    const dispatch = this.dispatch;
    const dispatches = this.dispatches;
    if (!dispatch || !dispatches)
      return { kind: "skipped", reason: "not_claimed" };

    const row = await this.agentCalls.findById(agentCallId);
    if (!row || row.status !== AiVoiceAgentCallStatus.queued)
      return { kind: "skipped", reason: "not_claimed" };

    const claimToken = randomUUID();
    const claimedAt = new Date();
    if (
      !(await dispatches.claim(
        agentCallId,
        claimToken,
        claimedAt,
        DISPATCH_CLAIM_LEASE_MS,
      ))
    )
      return { kind: "skipped", reason: "not_claimed" };

    const ctx = workspaceOf(row);
    const queued = await dispatches.findByAgentCallId(agentCallId);
    if (!queued) return { kind: "skipped", reason: "not_claimed" };
    const source: DispatchSource = isDispatchSource(queued?.source)
      ? queued.source
      : "agent_api";
    const { settings } = await dispatch.getSettings();
    const liveSince = new Date(
      claimedAt.getTime() -
        Math.max(
          LIVE_CALL_WINDOW_MS,
          (apiConfiguration.AI_VOICE_AGENT_MAX_CALL_SECONDS + 120) * 1000,
        ),
    );
    const concurrency =
      settings.orgConcurrencyOverrides[workspaceKeyOf(ctx)] ??
      settings.orgConcurrency;

    const defer = async (
      reason: string,
      retryAfterMs: number,
      refund = true,
    ): Promise<DispatchAttempt> => {
      await dispatches.release(agentCallId, claimToken, {
        notBefore: new Date(Date.now() + retryAfterMs),
        reason,
        refundAttempt: refund,
      });
      return { kind: "deferred", reason, retryAfterMs };
    };

    let committed = false;
    try {
      // Everything the request checked, checked again: the world moves while a
      // call waits (a number removed, the person added to the DNC list).
      let agent: AiVoiceAgent;
      let callingAppId: string;
      try {
        assertVoiceAgentAccess(ctx);
        const owner = await this.users.getUserById(ctx.userId);
        if (
          !owner ||
          owner.blockedAt ||
          owner.canCall === false ||
          !this.organizations ||
          !(await this.organizations.isWorkspaceMember(ctx, ctx.userId))
        ) {
          throw new ForbiddenException(
            "The caller is no longer authorized in this workspace.",
          );
        }
        if (queued?.providerAccountKey !== accountSlot(dispatch.getAccount())) {
          throw new ServiceUnavailableException(
            "The queued provider account does not match this worker.",
          );
        }
        if (queued.integrationId) {
          const integration = await this.integrations?.findById(
            queued.integrationId,
          );
          if (
            !integration ||
            integration.status !== "active" ||
            !isInWorkspace(ctx, integration)
          ) {
            throw new ForbiddenException(
              "The integration that queued this call is no longer authorized.",
            );
          }
        }
        agent = await this.agents.require(ctx, row.agentId);
        if (agent.type === AiVoiceAgentType.receptionist) {
          throw new BadRequestException(
            "An AI receptionist answers incoming calls and cannot place calls.",
          );
        }
        this.agents.assertReadyForCalls(agent);
        await this.assertCallingAllowed(ctx, row.toNumber);
        const usable = await this.numbers.listOutboundCallerIds(ctx, {
          source: OutboundSource.ai_voice_agent,
          userId: ctx.userId,
        });
        if (!usable.some((number) => number.phoneNumber === row.fromNumber)) {
          throw new BadRequestException(
            "The number this call was to be placed from is no longer available.",
          );
        }

        // The workspace's live-call cap, looked at before a grant is spent on
        // it. The commit re-checks it atomically.
        if (
          (await dispatches.countLiveInWorkspace(ctx, liveSince)) >= concurrency
        ) {
          return await defer("org_concurrency", 5_000);
        }

        await this.ensureInsightDelivery(agent);
        await this.ensureToolDelivery(ctx, agent);
        callingAppId = await this.requireCallingApp(agent);
      } catch (error) {
        return await this.settleBeforeCommit(
          error,
          { agentCallId, claimToken, attempts: queued?.attempts ?? 1 },
          defer,
        );
      }

      // Capacity, as late as it can be asked for.
      const decision = await dispatch.admit({
        source,
        workspace: ctx,
        cls: agedTrafficClass(
          resolveTrafficClass(source, settings.classOverrides),
          queued.queuedAt,
          Date.now(),
          settings.queueAgingMs,
        ),
        expiresAtMs: queued.expiresAt.getTime(),
        maxWaitMs: options.maxWaitMs,
      });
      if (!decision.granted) {
        return await defer(
          `deferred:${decision.reason}`,
          decision.retryAfterMs,
        );
      }

      const callbackToken = `rvc_${randomBytes(24).toString("hex")}`;
      const result = await dispatches.commit(agentCallId, claimToken, {
        now: new Date(),
        callbackTokenHash: hashApiKey(callbackToken),
        cap: {
          ctx,
          workspaceKey: workspaceKeyOf(ctx),
          max: concurrency,
          liveSince,
        },
      });
      if (result === "at_capacity")
        return await defer("org_concurrency", 5_000);
      if (result !== "committed") {
        return {
          kind: "skipped",
          reason: result === "not_claimed" ? "not_claimed" : result,
        };
      }
      committed = true;

      // From here on this is the ordinary flow: the row exists as `created`, and
      // whatever the provider answers is read the way an inline start reads it.
      let callId: string | null = null;
      try {
        const call = await this.callRepository.createCall(ctx, {
          contact: row.contactId
            ? { connect: { id: row.contactId } }
            : undefined,
          fromNumber: row.fromNumber,
          toNumber: row.toNumber,
          direction: "outbound",
          status: CallStatus.pending,
          startedAt: new Date(),
          source: AI_VOICE_AGENT_CALL_SOURCE,
        });
        callId = call.id;
        await this.agentCalls.update(agentCallId, { callId: call.id });
        await this.reservePlacement(ctx, agentCallId, callId);
        const placed = await this.placeLeg({
          ctx,
          agent,
          agentCall: row,
          callId,
          callingAppId,
          from: row.fromNumber,
          to: row.toNumber,
          variables: (row.variables ?? {}) as Record<string, string>,
          callbackToken,
          permit: decision.permit,
        });
        return { kind: "placed", result: placed };
      } catch (error) {
        if (error instanceof ProviderDispatchDeferredError) {
          // The egress guard proves no request was sent. Only this explicit
          // outcome may move a committed operation back to the durable queue.
          await this.credits.releaseReservations(ctx, [
            `ai-voice-agent-cost:${agentCallId}`,
            ...(callId ? [`call-cost:${callId}`] : []),
          ]);
          if (callId)
            await this.callRepository.markForciblyEnded(
              callId,
              "Deferred before provider dispatch",
            );
          await dispatches.requeueUnsent(
            agentCallId,
            claimToken,
            new Date(Date.now() + error.retryAfterMs),
            error.reason,
          );
          return {
            kind: "deferred",
            reason: error.reason,
            retryAfterMs: error.retryAfterMs,
          };
        }
        if (
          error instanceof VoiceAgentCallStartError &&
          error.outcome ===
            VoiceAgentCallStartOutcome.placed_pending_reconciliation
        ) {
          this.logger.error(
            `Queued call ${agentCallId} may have a live leg and is left to reconcile: ${error.message}`,
          );
          throw error;
        }
        await this.closeUnplacedCall(callId, agentCallId, error);
        throw new VoiceAgentCallStartError(
          this.isTerminalPolicyRejection(error)
            ? VoiceAgentCallStartOutcome.terminal_rejection
            : VoiceAgentCallStartOutcome.retryable_before_placement,
          error,
          agentCallId,
        );
      }
    } finally {
      // A claim that never reached the commit must not sit on the call until
      // its lease runs out.
      if (!committed) {
        await dispatches
          .release(agentCallId, claimToken, {})
          .catch(() => undefined);
      }
    }
  }

  /**
   * An error before the commit: a rule that says no ends the call — nothing was
   * dialed and nothing will be — and anything else is tried again later, a
   * bounded number of times.
   */
  private async settleBeforeCommit(
    error: unknown,
    claim: { agentCallId: string; claimToken: string; attempts: number },
    defer: (
      reason: string,
      retryAfterMs: number,
      refund?: boolean,
    ) => Promise<DispatchAttempt>,
  ): Promise<DispatchAttempt> {
    const message = error instanceof Error ? error.message : String(error);
    const terminal =
      this.isTerminalPolicyRejection(error) ||
      claim.attempts >= MAX_DISPATCH_ERRORS;
    if (!terminal) {
      this.logger.warn(
        `Queued call ${claim.agentCallId} could not be prepared (attempt ${claim.attempts}), retrying: ${message}`,
      );
      // Backs off from 2s to a minute; an error is a real attempt, so it is
      // not refunded.
      return defer(
        `retry:${message.slice(0, 120)}`,
        Math.min(60_000, 2_000 * 2 ** Math.max(0, claim.attempts - 1)),
        false,
      );
    }
    const reason = this.isTerminalPolicyRejection(error)
      ? message
      : `The call could not be prepared after ${claim.attempts} attempts: ${message}`;
    await this.dispatches!.fail(
      claim.agentCallId,
      claim.claimToken,
      reason,
      new Date(),
    );
    throw new VoiceAgentCallStartError(
      VoiceAgentCallStartOutcome.terminal_rejection,
      error instanceof HttpException ? error : new BadRequestException(reason),
      claim.agentCallId,
    );
  }

  /**
   * Withdraws a call that has not been dialed. A call already dialed cannot be
   * cancelled here (that is a hang-up), and says so.
   */
  async cancelQueued(
    ctx: OwnershipContext,
    id: string,
  ): Promise<{ id: string; status: AiVoiceAgentCallStatus }> {
    assertVoiceAgentAccess(ctx);
    if (!this.dispatches) {
      throw new NotFoundException("AI voice agent call not found");
    }
    const result = await this.dispatches.cancel(ctx, id, new Date());
    if (result.result === "not_found")
      throw new NotFoundException("AI voice agent call not found");
    if (result.result === "not_cancellable") {
      throw new ConflictException({
        statusCode: HttpStatus.CONFLICT,
        error: "Conflict",
        code: "call_not_cancellable",
        status: result.status,
        message:
          result.status === AiVoiceAgentCallStatus.cancelled
            ? "This call was already cancelled."
            : `This call is ${result.status} and can no longer be cancelled before it is dialed.`,
      });
    }
    return { id, status: AiVoiceAgentCallStatus.cancelled };
  }

  private async closeUnplacedCall(
    callId: string | null,
    agentCallId: string | null,
    error: unknown,
  ): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    if (this.dispatch && agentCallId) {
      const owned = await this.agentCalls.findById(agentCallId);
      if (owned)
        await this.credits.releaseReservations(workspaceOf(owned), [
          `ai-voice-agent-cost:${agentCallId}`,
          ...(callId ? [`call-cost:${callId}`] : []),
        ]);
    }

    // Nothing was dialed, so the row reserved for the leg is closed here: the
    // stale-call sweep only reaches calls that made it to `ringing`.
    if (callId) {
      await this.callRepository
        .markForciblyEnded(callId, message)
        .catch((closeError: unknown) => {
          this.logger.error(
            `Could not close call ${callId} for agent call ${agentCallId ?? "unknown"}: ${
              closeError instanceof Error
                ? closeError.message
                : String(closeError)
            }`,
          );
        });
    }
    if (agentCallId) {
      await this.agentCalls
        .update(agentCallId, {
          status: AiVoiceAgentCallStatus.failed,
          lastError: message,
        })
        .catch((updateError: unknown) => {
          this.logger.error(
            `Could not mark agent call ${agentCallId} failed: ${
              updateError instanceof Error
                ? updateError.message
                : String(updateError)
            }`,
          );
        });
    }
  }

  /**
   * What a start under an already-used key reports. A try that failed before
   * the provider accepted a leg is safe to follow with a new try; anything
   * else may have a live, billable leg and is only reconciled, never redialed.
   */
  private alreadyStarted(earlier: AiVoiceAgentCall): VoiceAgentCallStartError {
    return new VoiceAgentCallStartError(
      failedBeforePlacement(earlier)
        ? VoiceAgentCallStartOutcome.retryable_before_placement
        : VoiceAgentCallStartOutcome.placed_pending_reconciliation,
      new ConflictException("This call was already started."),
      earlier.id,
    );
  }

  private isTerminalPolicyRejection(error: unknown): boolean {
    return (
      error instanceof BadRequestException ||
      error instanceof ForbiddenException ||
      error instanceof NotFoundException
    );
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
    required = false,
  ): Promise<void> {
    const verified = await this.agents
      .ensureToolEndpoints(ctx, agent)
      .catch((error: unknown) => {
        this.logger.warn(
          `Could not verify the tool endpoints for agent ${agent.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return false;
      });
    // A durable caller dials on its own, so it never runs on whatever tools
    // the assistant last saved — a move it could not confirm, a tool that no
    // longer answers. Unverified, the call is not placed and is retried.
    if (required && !verified)
      throw new Error(
        `The tools of agent ${agent.id} could not be verified before dialing`,
      );
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
    return apiConfiguration.PUBLIC_BACKEND_URL!.replace(/\/+$/, "");
  }

  // ── Reads ────────────────────────────────────────────────────

  listCalls(
    ctx: OwnershipContext,
    agentId: string,
    options?: { page?: number; limit?: number },
  ) {
    assertVoiceAgentAccess(ctx);
    return this.agentCalls.listForAgent(ctx, agentId, options);
  }

  async requireCall(
    ctx: OwnershipContext,
    id: string,
  ): Promise<AiVoiceAgentCall> {
    assertVoiceAgentAccess(ctx);
    let call = await this.agentCalls.findByIdForOwner(ctx, id);
    if (!call) throw new NotFoundException("AI voice agent call not found");
    if (call.status === AiVoiceAgentCallStatus.queued && this.dispatches) {
      await this.dispatches.expireForOwner(ctx, call.id, new Date());
      // Another poll or dispatcher can win the transition while expiry waits
      // for its row lock. Reload even when this caller moved zero rows rather
      // than return the queued snapshot taken before that transition.
      call = await this.agentCalls.findByIdForOwner(ctx, id);
      if (!call) throw new NotFoundException("AI voice agent call not found");
    }
    return call;
  }
}

/** A unique violation on one column — and only that one is "already exists". */
function isUniqueViolationOn(error: unknown, column: string): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return false;
  }
  const target = error.meta?.target;
  return Array.isArray(target)
    ? target.includes(column)
    : String(target).includes(column);
}
