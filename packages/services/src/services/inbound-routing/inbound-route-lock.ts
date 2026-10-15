import type { InboundNumberRef } from "./inbound-routing.types";

/**
 * The Redis lock held by everything that writes a number's inbound route and
 * by a transfer of the number to another workspace. The workspace a writer
 * checks while holding it is still the number's when the route is written.
 */
export function inboundRouteLockKey(ref: InboundNumberRef): string {
  return `inbound-route:${ref.kind}:${ref.id}`;
}
