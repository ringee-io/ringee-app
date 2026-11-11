import { Logger } from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import { PostHog } from "posthog-node";
import {
  DisabledProductAnalyticsProvider,
  type AnalyticsDeliveryResult,
  type AnalyticsWireEvent,
  type ExceptionTelemetryContext,
  type ProductAnalyticsProvider,
} from "./product-analytics.provider";
import { scrubExceptionEvent } from "./exception-scrub";

const BATCH_TIMEOUT_MS = 10_000;
/** PostHog refuses bodies above 20 MB; stay far below it. */
const MAX_BATCH_BYTES = 2_000_000;

export interface PostHogProviderConfig {
  /** The project token (`phc_…`) — an ingestion key, not a management key. */
  token: string;
  /** Ingestion host, e.g. `https://us.i.posthog.com`. */
  host: string;
  errorTracking: boolean;
}

/**
 * PostHog behind `ProductAnalyticsProvider`.
 *
 * Facts go through the documented batch capture endpoint rather than the
 * SDK's queue, because the outbox needs to know whether a batch was accepted:
 * the SDK's immediate send swallows delivery errors. Each event keeps the
 * outbox row's UUID and the original timestamp, which is what lets PostHog
 * deduplicate a resend. Exceptions use the SDK's own `captureException`, so
 * stack frames are built the way PostHog's error tracking expects; its
 * `before_send` strips source context lines and redacts messages once more.
 */
export class PostHogProductAnalyticsProvider
  implements ProductAnalyticsProvider
{
  readonly enabled = true;
  readonly errorTrackingEnabled: boolean;
  private readonly logger = new Logger("PostHogProductAnalytics");
  private client: PostHog | null = null;

  constructor(
    private readonly config: PostHogProviderConfig,
    private readonly http: typeof fetch = fetch,
  ) {
    this.errorTrackingEnabled = config.errorTracking;
  }

  async sendBatch(
    events: AnalyticsWireEvent[],
  ): Promise<AnalyticsDeliveryResult> {
    if (!events.length) return { ok: true };
    const body = JSON.stringify({
      api_key: this.config.token,
      historical_migration: false,
      batch: events.map((event) => ({
        event: event.event,
        distinct_id: event.distinctId,
        uuid: event.uuid,
        timestamp: event.timestamp.toISOString(),
        properties: { ...event.properties, $lib: "ringee-backend" },
      })),
    });
    if (body.length > MAX_BATCH_BYTES) {
      return { ok: false, retryable: false, code: "batch_too_large" };
    }
    try {
      const response = await this.http(`${this.config.host}/batch/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(BATCH_TIMEOUT_MS),
      });
      if (response.ok) return { ok: true };
      const retryable = response.status === 429 || response.status >= 500;
      return { ok: false, retryable, code: `http_${response.status}` };
    } catch (error) {
      const name = (error as { name?: string })?.name;
      return {
        ok: false,
        retryable: true,
        code:
          name === "TimeoutError" || name === "AbortError"
            ? "timeout"
            : "network",
      };
    }
  }

  captureException(error: Error, context: ExceptionTelemetryContext): void {
    if (!this.errorTrackingEnabled) return;
    try {
      this.sdk().captureException(error, context.distinctId, {
        ...context.properties,
        ...(context.groups ? { $groups: context.groups } : {}),
      });
    } catch (failure) {
      // Telemetry must never fail the operation it observes.
      this.logger.warn(
        `Exception capture failed: ${(failure as Error)?.name ?? "unknown"}`,
      );
    }
  }

  async shutdown(): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.shutdown(5_000);
    } catch {
      // Best effort on the way out.
    }
  }

  private sdk(): PostHog {
    if (!this.client) {
      this.client = new PostHog(this.config.token, {
        host: this.config.host,
        flushAt: 20,
        flushInterval: 10_000,
        disableGeoip: true,
        // Uncaught exceptions keep their existing owners (Nest, the worker's
        // own logging); only the scoped captures of the journeys are sent.
        enableExceptionAutocapture: false,
        before_send: (event) => (event ? scrubExceptionEvent(event) : event),
      });
      this.client.on("error", () => {
        // Delivery failures of diagnostics are not retried or logged with
        // their payload; the facts outbox has its own accounting.
      });
    }
    return this.client;
  }
}

/**
 * The provider this installation runs with, from configuration. A missing
 * token, an explicit `POSTHOG_ENABLED=false` or an invalid host disables
 * analytics — never the API: telemetry is optional by design.
 */
export function createProductAnalyticsProvider(): ProductAnalyticsProvider {
  const token = apiConfiguration.POSTHOG_PROJECT_TOKEN?.trim();
  if (!token || !apiConfiguration.POSTHOG_ENABLED) {
    return new DisabledProductAnalyticsProvider();
  }
  const host = normalizeHost(apiConfiguration.POSTHOG_HOST);
  if (!host) {
    new Logger("PostHogProductAnalytics").warn(
      "POSTHOG_HOST is not a valid https URL; product analytics is disabled.",
    );
    return new DisabledProductAnalyticsProvider();
  }
  return new PostHogProductAnalyticsProvider({
    token,
    host,
    errorTracking: apiConfiguration.POSTHOG_ERROR_TRACKING_ENABLED,
  });
}

export function normalizeHost(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
      return null;
    }
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}
