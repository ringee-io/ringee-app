import type { ExceptionCaptureContext } from "./product-analytics.service";

/**
 * Scoped error tracking for the Stage 4B journeys, reachable from any service
 * without widening its constructor: `ProductAnalyticsService` registers itself
 * here when the application starts, and `captureJourneyException` forwards to
 * it. With no registration (a unit test, analytics switched off) a capture is
 * a no-op.
 *
 * Use it only where an operation already handles a *technical* failure — a
 * provider error, an unexpected crash, a failed write — next to its existing
 * log line, never for an expected product blocker (no balance, no inventory,
 * a cancelled checkout, no calendar). It never throws, never awaits delivery
 * and never changes what the caller does next: retries, releases and claims
 * stay exactly as they were.
 */
type JourneyExceptionSink = (
  error: unknown,
  context: ExceptionCaptureContext,
) => void;

let sink: JourneyExceptionSink | null = null;

/** Called by `ProductAnalyticsService` on module init and destroy. */
export function registerJourneyExceptionSink(
  next: JourneyExceptionSink | null,
): void {
  sink = next;
}

export function captureJourneyException(
  error: unknown,
  context: ExceptionCaptureContext,
): void {
  if (!sink) return;
  try {
    sink(error, context);
  } catch {
    // Telemetry never surfaces as a failure of the operation it observes.
  }
}
