import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "crypto";
import {
  AiVoiceAgentCall,
  AiVoiceAgentCallRepository,
  AiVoiceAgentRepository,
  Call,
  CustomIntegrationDeliveryRepository,
  CustomIntegrationEventType,
  CustomIntegrationRepository,
  User,
  UserEmail,
  UserRepository,
} from "@ringee/database";
import {
  OUTBOUND_EVENT_ENUM_TO_NAME,
  OutboundEventEnum,
  OutboundEventName,
  OwnershipContext,
} from "@ringee/platform";
import {
  buildCallEventData,
  callOwnershipFromCall,
  pickCallTerminalEvent,
  primaryEmailOf,
  userRef,
  voiceAgentExternalId,
  voiceAgentRef,
} from "./custom-integration-event-builders";

/** `UserRepository.findById` loads the addresses; the model type omits them. */
type UserWithEmails = User & { emails?: UserEmail[] };

export interface OutboundEventEnvelope {
  event: OutboundEventName;
  eventId: string;
  occurredAt: string;
  workspaceId: string;
  integrationId: string;
  data: Record<string, unknown>;
}

@Injectable()
export class CustomIntegrationOutboundService {
  private readonly logger = new Logger(CustomIntegrationOutboundService.name);

  constructor(
    private readonly integrations: CustomIntegrationRepository,
    private readonly deliveries: CustomIntegrationDeliveryRepository,
    private readonly agentCalls: AiVoiceAgentCallRepository,
    private readonly users: UserRepository,
    private readonly voiceAgents: AiVoiceAgentRepository,
  ) {}

  /**
   * Publish the terminal event for a persisted call through the canonical
   * workspace fan-out. More than one provider callback may report the same
   * ending; `enqueue`'s per-integration dedupe key makes those replays safe.
   */
  async enqueueCallTerminal(call: Call): Promise<void> {
    const ctx = callOwnershipFromCall(call);
    if (!ctx) return;

    await this.enqueue({
      ctx,
      eventEnum: pickCallTerminalEvent(call),
      subjectId: call.id,
      data: buildCallEventData(call),
      occurredAt: call.endedAt ?? undefined,
    });
  }

  /**
   * Fan out an event to every active custom integration in the workspace that
   * is subscribed to it AND has an outbound URL configured. Fire-and-forget:
   * errors are logged, never thrown.
   */
  async enqueue(input: {
    ctx: OwnershipContext;
    eventEnum: CustomIntegrationEventType;
    subjectId: string;
    /** Stable identity for one event transition; defaults to the subject. */
    dedupeKey?: string;
    data: Record<string, unknown>;
    occurredAt?: Date;
  }): Promise<void> {
    try {
      const integrations = await this.integrations.findActiveSubscribed(
        input.ctx,
        input.eventEnum,
      );
      if (integrations.length === 0) return;

      const eventName =
        OUTBOUND_EVENT_ENUM_TO_NAME[input.eventEnum as OutboundEventEnum];
      const occurredAt = (input.occurredAt ?? new Date()).toISOString();
      const data = await this.withActors(input.ctx, input.data);

      for (const integration of integrations) {
        if (!integration.outboundUrl) continue;
        const eventId = `evt_${randomUUID().replace(/-/g, "")}`;
        const envelope: OutboundEventEnvelope = {
          event: eventName,
          eventId,
          occurredAt,
          workspaceId: integration.organizationId ?? integration.userId,
          integrationId: integration.id,
          data,
        };
        await this.deliveries.enqueue({
          integrationId: integration.id,
          eventType: input.eventEnum,
          subjectId: input.subjectId,
          destinationUrl: integration.outboundUrl,
          payload: envelope as unknown as Record<string, unknown>,
          dedupeKey: `${integration.id}:${input.eventEnum}:${input.dedupeKey ?? input.subjectId}:v1`,
        });
      }
    } catch (err) {
      this.logger.error(
        `custom-integration enqueue failed (${input.eventEnum} subject=${input.subjectId}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * Every outbound event names who is behind it: `data.user` is the workspace
   * member the event belongs to, and `data.agent` is the AI voice agent when
   * one placed the call. Events tied to an agent call also carry the caller's
   * own correlation id at `data.externalId`.
   *
   * Meeting, callback and recording events all expose their source `callId`, so
   * one central lookup covers the entire fan-out instead of relying on each
   * producer to remember the agent and the metadata. A producer that already
   * resolved any of these keeps its own, richer value.
   */
  private async withActors(
    ctx: OwnershipContext,
    data: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const [user, agentCall] = await Promise.all([
      this.resolveUser(ctx, data),
      this.resolveAgentCall(ctx, data),
    ]);

    const enriched = { ...data };
    if (user) enriched.user = user;

    if (agentCall) {
      if (
        typeof enriched.externalId !== "string" ||
        !enriched.externalId.trim()
      ) {
        const externalId = voiceAgentExternalId(agentCall.metadata);
        if (externalId) enriched.externalId = externalId;
      }
      if (!enriched.agent && agentCall.agentId) {
        const agent = await this.voiceAgents.findRefForOwner(
          ctx,
          agentCall.agentId,
        );
        const ref = voiceAgentRef(agent);
        if (ref) enriched.agent = ref;
      }
    }

    return enriched;
  }

  /** The workspace member the event belongs to, with their primary email. */
  private async resolveUser(
    ctx: OwnershipContext,
    data: Record<string, unknown>,
  ): Promise<Record<string, unknown> | undefined> {
    if (data.user) return undefined;
    try {
      const user = (await this.users.findById(
        ctx.userId,
      )) as UserWithEmails | null;
      return userRef(user, primaryEmailOf(user));
    } catch (err) {
      // An event with no actor is still worth delivering.
      this.logger.warn(
        `Could not resolve event actor ${ctx.userId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return undefined;
    }
  }

  /**
   * The agent call behind this event, when the event names a call AND that call
   * belongs to the caller's workspace. The ownership check is what keeps one
   * workspace's correlation ids and agent names out of another's webhooks.
   */
  private async resolveAgentCall(
    ctx: OwnershipContext,
    data: Record<string, unknown>,
  ): Promise<AiVoiceAgentCall | null> {
    const callId = typeof data.callId === "string" ? data.callId : null;
    if (!callId) return null;

    const agentCall = await this.agentCalls.findByCallId(callId);
    if (!agentCall) return null;

    const owned = ctx.organizationId
      ? agentCall.organizationId === ctx.organizationId
      : agentCall.organizationId === null && agentCall.userId === ctx.userId;
    return owned ? agentCall : null;
  }
}
