import { InboundDestinationType, NumberInboundMode } from "@ringee/database";
import type { InboundNumberRecord } from "./inbound-number.types";

/** A route that was never written down: what the number does by default. */
export interface ImplicitInboundRoute {
  destinationType: InboundDestinationType;
  destinationId: string;
}

/**
 * Inbound behavior of a number that has **no** `InboundRoute` row.
 *
 * Every existing customer is in this state, so this is the behavior that has
 * to be preserved exactly. It lives alone, in one pure function, for one
 * reason: once every number carries an explicit route, migrating is deleting
 * this file and the single branch that calls it — not unpicking fallbacks from
 * the middle of the router.
 *
 * Today's rules, unchanged:
 *
 * - A number pinned to a desk phone rings that desk phone and nothing else.
 *   For a Ringee DID that is `inboundMode = desk_phone_only`; for a BYOC DID
 *   it is having an `inboundSipDeviceId` at all.
 * - A Ringee DID with no pin rings its workspace, which Ringee delivers as the
 *   number owner's WebRTC session(s) plus a push to their devices.
 * - A BYOC DID with no pin is **not routed inbound** — `null` here, refused by
 *   the resolver, exactly as `NUM-007` has it today.
 */
export function legacyInboundDestination(
  number: InboundNumberRecord,
): ImplicitInboundRoute | null {
  const pinnedToDeskPhone =
    number.ref.kind === "external"
      ? !!number.legacySipDeviceId
      : number.legacyMode === NumberInboundMode.desk_phone_only &&
        !!number.legacySipDeviceId;

  if (pinnedToDeskPhone && number.legacySipDeviceId)
    return {
      destinationType: InboundDestinationType.desk_phone,
      destinationId: number.legacySipDeviceId,
    };

  if (number.ref.kind === "external" || !number.ownerUserId) return null;

  return {
    destinationType: InboundDestinationType.user,
    destinationId: number.ownerUserId,
  };
}
