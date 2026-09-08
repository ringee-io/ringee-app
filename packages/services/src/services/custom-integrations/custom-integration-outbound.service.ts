import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "crypto";
import {
  AiVoiceAgentCallRepository,
  Call,
  CustomIntegrationDeliveryRepository,
  CustomIntegrationEventType,
  CustomIntegrationRepository,
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
  voiceAgentExternalId,
} from "./custom-integration-event-builders";

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
      const data = await this.withVoiceAgentExternalId(input.ctx, input.data);

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
   * Every event tied to an AI voice-agent call carries the caller's external
   * correlation id at `data.externalId`. Meeting, callback and recording events
   * all expose their source `callId`, so one central lookup covers the entire
   * fan-out instead of relying on each producer to remember the metadata.
   */
  private async withVoiceAgentExternalId(
    ctx: OwnershipContext,
    data: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (typeof data.externalId === "string" && data.externalId.trim()) {
      return data;
    }
    const callId = typeof data.callId === "string" ? data.callId : null;
    if (!callId) return data;

    const agentCall = await this.agentCalls.findByCallId(callId);
    const owned = ctx.organizationId
      ? agentCall?.organizationId === ctx.organizationId
      : agentCall?.organizationId === null && agentCall.userId === ctx.userId;
    if (!owned) return data;

    const externalId = voiceAgentExternalId(agentCall?.metadata);
    return externalId ? { ...data, externalId } : data;
  }
}
