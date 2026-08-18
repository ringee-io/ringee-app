import { Offer, OfferStatus } from "@ringee/database";

export type OfferWindowReason = "status" | "not_started" | "ended";

/**
 * Whether an offer is live at `now` — ACTIVE and inside its date window.
 *
 * The catalogue query already filters on this in SQL; this is the same rule as
 * a pure predicate so every direct action (start, submit) re-checks it against
 * the row it actually loaded, and so a cached list cannot show an offer that
 * expired a moment ago.
 */
export function offerWindowFailure(
  offer: Pick<Offer, "status" | "startsAt" | "endsAt">,
  now: Date,
): OfferWindowReason | null {
  if (offer.status !== OfferStatus.ACTIVE) return "status";
  if (offer.startsAt && offer.startsAt > now) return "not_started";
  if (offer.endsAt && offer.endsAt <= now) return "ended";
  return null;
}

export function isOfferLive(
  offer: Pick<Offer, "status" | "startsAt" | "endsAt">,
  now: Date,
): boolean {
  return offerWindowFailure(offer, now) === null;
}
