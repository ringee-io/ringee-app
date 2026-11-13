import type { AnalyticsPropertyValue } from "./sanitize";

/**
 * The analytics provider seam (Stage 4B). Domain code depends on this
 * interface through `PRODUCT_ANALYTICS_PROVIDER`; only the adapter imports the
 * provider SDK (ESLint ARCH-001). Swapping or removing the provider never
 * touches a business service.
 */
export const PRODUCT_ANALYTICS_PROVIDER = Symbol("PRODUCT_ANALYTICS_PROVIDER");

/** One fact on the wire: sanitized, with its stable id and original time. */
export interface AnalyticsWireEvent {
  /** Stable across retries — the provider deduplicates on it. */
  uuid: string;
  event: string;
  distinctId: string;
  timestamp: Date;
  /** Already allowlisted and sanitized; may include `$groups`. */
  properties: Record<string, unknown>;
}

export type AnalyticsDeliveryResult =
  | { ok: true }
  | {
      ok: false;
      /** False when resending the same batch cannot succeed (invalid payload). */
      retryable: boolean;
      /** A bounded code, never a provider message. */
      code: string;
    };

/** Where an exception happened, as the error-tracking contract allows. */
export interface ExceptionTelemetryContext {
  /** A human's analytics id, or a technical actor's (`system:<workspace>`). */
  distinctId: string;
  /** Sanitized, scalar properties (component, operation, journey step…). */
  properties: Record<string, AnalyticsPropertyValue>;
  /** `{ workspace: <workspace key> }` when the exception has a workspace. */
  groups?: Record<string, string>;
}

export interface ProductAnalyticsProvider {
  /** False when no project is configured: nothing is ever sent. */
  readonly enabled: boolean;
  /** Error tracking can be switched off on its own. */
  readonly errorTrackingEnabled: boolean;
  /** Sends one batch and says whether the provider accepted it. Never throws. */
  sendBatch(events: AnalyticsWireEvent[]): Promise<AnalyticsDeliveryResult>;
  /**
   * Captures an already-sanitized exception through the provider SDK's own
   * exception capture. Fire-and-forget: never throws, never awaits delivery.
   */
  captureException(error: Error, context: ExceptionTelemetryContext): void;
  /** Flushes what the SDK still holds; bounded. */
  shutdown(): Promise<void>;
}

/** Used when analytics is not configured or deliberately switched off. */
export class DisabledProductAnalyticsProvider
  implements ProductAnalyticsProvider
{
  readonly enabled = false;
  readonly errorTrackingEnabled = false;

  sendBatch(): Promise<AnalyticsDeliveryResult> {
    return Promise.resolve({
      ok: false,
      retryable: false,
      code: "analytics_disabled",
    });
  }

  captureException(): void {
    // Nothing is captured while analytics is off.
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}
