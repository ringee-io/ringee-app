import { Injectable, Logger } from "@nestjs/common";
import { TriggerLoopClient } from "./triggerloop.client";
import { TriggerLoopOutboxService } from "./triggerloop-outbox.service";
import {
  TriggerLoopEventName,
  TriggerLoopSubject,
  TriggerLoopWorkflowKey,
} from "../types/triggerloop.types";

/**
 * Thin, intent-named facade on top of TriggerLoopClient. Ringee services
 * should depend on this service, not on the raw HTTP client — it keeps the
 * transport swappable and concentrates the TriggerLoop vocabulary in one
 * place.
 *
 * Every call is durable: we try a direct send first and fall back to the
 * outbox if TriggerLoop is unreachable, so a degraded TriggerLoop cannot
 * take down the product path AND we do not lose events.
 */
@Injectable()
export class TriggerLoopEventPublisher {
  private readonly logger = new Logger(TriggerLoopEventPublisher.name);

  constructor(
    private readonly client: TriggerLoopClient,
    private readonly outbox: TriggerLoopOutboxService,
  ) {}

  async publish(
    eventName: TriggerLoopEventName,
    subject: TriggerLoopSubject,
    payload: Record<string, unknown> = {},
  ): Promise<void> {
    try {
      await this.outbox.send({
        kind: "event",
        endpoint: this.client.eventsEndpoint,
        payload: this.client.buildEventBody({ eventName, subject, payload }),
      });
    } catch (err) {
      this.logger.warn(
        `Failed to publish ${eventName} for ${subject.type}:${subject.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  async startWorkflow(
    workflowKey: TriggerLoopWorkflowKey,
    subject: TriggerLoopSubject,
    payload: Record<string, unknown> = {},
  ): Promise<void> {
    try {
      await this.outbox.send({
        kind: "startWorkflow",
        endpoint: this.client.startWorkflowEndpoint,
        payload: this.client.buildStartWorkflowBody({
          workflowKey,
          subject,
          payload,
        }),
      });
    } catch (err) {
      this.logger.warn(
        `Failed to start workflow ${workflowKey} for ${subject.type}:${subject.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  async cancelWorkflow(
    workflowInstanceId: string,
    reason?: string,
  ): Promise<void> {
    try {
      await this.outbox.send({
        kind: "cancelWorkflow",
        endpoint: this.client.cancelWorkflowEndpoint,
        payload: this.client.buildCancelWorkflowBody({
          workflowInstanceId,
          reason,
        }),
      });
    } catch (err) {
      this.logger.warn(
        `Failed to cancel workflow ${workflowInstanceId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  // Convenience wrappers — encode Ringee's vocabulary, not TriggerLoop's.
  userRegistered(userId: string, data: { email?: string; plan?: string } = {}) {
    return this.publish("user.registered", { type: "user", id: userId }, data);
  }

  emailVerified(userId: string, email: string) {
    return this.publish(
      "user.emailVerified",
      { type: "user", id: userId },
      {
        email,
      },
    );
  }

  workspaceCreated(userId: string, organizationId: string) {
    return this.publish(
      "workspace.created",
      { type: "user", id: userId },
      { organizationId },
    );
  }

  creditsAdded(userId: string, amount: number, organizationId?: string) {
    return this.publish(
      "credits.added",
      { type: "user", id: userId },
      {
        amount,
        organizationId,
      },
    );
  }

  phoneNumberAssigned(userId: string, phoneNumber: string) {
    return this.publish(
      "phoneNumber.assigned",
      { type: "user", id: userId },
      { phoneNumber },
    );
  }

  contactsImported(userId: string, count: number) {
    return this.publish(
      "contacts.imported",
      { type: "user", id: userId },
      { count },
    );
  }

  firstCallCompleted(userId: string, callId: string) {
    return this.publish(
      "call.firstCompleted",
      { type: "user", id: userId },
      { callId },
    );
  }

  userBecameActive(userId: string) {
    return this.publish("user.becameActive", { type: "user", id: userId });
  }

  userInactive(userId: string, lastActivityAt: Date) {
    return this.publish(
      "user.inactive",
      { type: "user", id: userId },
      {
        lastActivityAt: lastActivityAt.toISOString(),
      },
    );
  }
}
