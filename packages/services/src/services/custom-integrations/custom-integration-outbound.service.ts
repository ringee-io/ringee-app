import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "crypto";
import {
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
  ) {}

  /**
   * Fan out an event to every active custom integration in the workspace that
   * is subscribed to it AND has an outbound URL configured. Fire-and-forget:
   * errors are logged, never thrown.
   */
  async enqueue(input: {
    ctx: OwnershipContext;
    eventEnum: CustomIntegrationEventType;
    subjectId: string;
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

      for (const integration of integrations) {
        if (!integration.outboundUrl) continue;
        const eventId = `evt_${randomUUID().replace(/-/g, "")}`;
        const envelope: OutboundEventEnvelope = {
          event: eventName,
          eventId,
          occurredAt,
          workspaceId: integration.organizationId ?? integration.userId,
          integrationId: integration.id,
          data: input.data,
        };
        await this.deliveries.enqueue({
          integrationId: integration.id,
          eventType: input.eventEnum,
          subjectId: input.subjectId,
          destinationUrl: integration.outboundUrl,
          payload: envelope as unknown as Record<string, unknown>,
          dedupeKey: `${integration.id}:${input.eventEnum}:${input.subjectId}:v1`,
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
}
