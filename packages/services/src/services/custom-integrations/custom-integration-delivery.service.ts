import { Injectable, Logger } from "@nestjs/common";
import {
  CustomIntegrationDelivery,
  CustomIntegrationDeliveryRepository,
  CustomIntegrationRepository,
} from "@ringee/database";
import { signOutboundEvent } from "@ringee/platform";
import { CustomIntegrationService } from "./custom-integration.service";

const MAX_ATTEMPTS = 10;
const BASE_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;
// Deliveries are independent rows, so send them in small parallel waves: a
// batch of 25 against dead endpoints (15s timeout each) drops from ~6min
// sequential to ~1.5min, keeping the drain well inside its activity timeout.
const DRAIN_CONCURRENCY = 5;

export interface DeliveryAttemptResult {
  ok: boolean;
  statusCode?: number;
  latencyMs: number;
  error?: string;
}

@Injectable()
export class CustomIntegrationDeliveryService {
  private readonly logger = new Logger(CustomIntegrationDeliveryService.name);

  constructor(
    private readonly deliveries: CustomIntegrationDeliveryRepository,
    private readonly integrations: CustomIntegrationRepository,
    private readonly integrationSvc: CustomIntegrationService,
  ) {}

  async drain(batchSize = 20): Promise<number> {
    const batch = await this.deliveries.claimDueBatch(new Date(), batchSize);
    for (let i = 0; i < batch.length; i += DRAIN_CONCURRENCY) {
      const wave = batch.slice(i, i + DRAIN_CONCURRENCY);
      const results = await Promise.allSettled(
        wave.map((delivery) => this.process(delivery)),
      );
      for (const [j, result] of results.entries()) {
        if (result.status === "rejected") {
          this.logger.error(
            `Delivery ${wave[j].id} processing threw: ${result.reason}`,
          );
        }
      }
    }
    return batch.length;
  }

  /** Send a single delivery row. Schedules retry on failure. */
  private async process(delivery: CustomIntegrationDelivery): Promise<void> {
    const integration = await this.integrations.findById(
      delivery.integrationId,
    );
    if (!integration) {
      await this.deliveries.markFailed(delivery.id, "integration not found");
      return;
    }
    if (integration.status !== "active") {
      await this.deliveries.markFailed(delivery.id, "integration disabled");
      return;
    }

    const secret = this.integrationSvc.decryptSigningSecret(integration);
    const body = JSON.stringify(delivery.payload);
    const signed = signOutboundEvent(body, secret);

    const result = await this.send(
      delivery.destinationUrl,
      body,
      signed.signatureHeader,
      signed.timestampHeader,
    );

    if (result.ok) {
      await this.deliveries.markSent(delivery.id, signed.signature);
      return;
    }

    const attempts = delivery.attemptCount + 1;
    const errMsg = result.error ?? `HTTP ${result.statusCode}`;
    if (attempts >= MAX_ATTEMPTS) {
      await this.deliveries.markFailed(delivery.id, errMsg);
      return;
    }
    const backoff = Math.min(
      BASE_BACKOFF_MS * 2 ** delivery.attemptCount,
      MAX_BACKOFF_MS,
    );
    const nextAttemptAt = new Date(Date.now() + backoff);
    await this.deliveries.scheduleRetry(delivery.id, nextAttemptAt, errMsg);
  }

  /** Public helper used by the "test webhook" controller action. */
  async sendTest(integrationId: string): Promise<DeliveryAttemptResult> {
    const integration = await this.integrations.findById(integrationId);
    if (!integration || !integration.outboundUrl) {
      return { ok: false, latencyMs: 0, error: "no outbound URL configured" };
    }
    const secret = this.integrationSvc.decryptSigningSecret(integration);
    const body = JSON.stringify({
      event: "test.ping",
      eventId: `evt_test_${Date.now()}`,
      occurredAt: new Date().toISOString(),
      workspaceId: integration.organizationId ?? integration.userId,
      integrationId: integration.id,
      data: { message: "Hello from Ringee custom integrations." },
    });
    const signed = signOutboundEvent(body, secret);
    return this.send(
      integration.outboundUrl,
      body,
      signed.signatureHeader,
      signed.timestampHeader,
    );
  }

  private async send(
    url: string,
    body: string,
    signatureHeader: string,
    timestampHeader: string,
  ): Promise<DeliveryAttemptResult> {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Ringee-Webhooks/1.0",
          "Ringee-Signature": signatureHeader,
          "Ringee-Timestamp": timestampHeader,
        },
        body,
        signal: controller.signal,
      });
      const latencyMs = Date.now() - started;
      if (res.status >= 200 && res.status < 300) {
        return { ok: true, statusCode: res.status, latencyMs };
      }
      return {
        ok: false,
        statusCode: res.status,
        latencyMs,
        error: `non-2xx status ${res.status}`,
      };
    } catch (err) {
      const latencyMs = Date.now() - started;
      return {
        ok: false,
        latencyMs,
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
