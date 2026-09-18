/**
 * External carrier (Bring Your Own Carrier) routing — pure helpers with no
 * `@telnyx/webrtc` import, so they run in plain Node tests.
 *
 * The server authorizes the route; the browser only receives where to send the
 * leg and a signed token proving the pre-dial. Credentials, the PBX identity
 * and the caller ID the carrier presents all stay on the server side.
 */

/** SIP header carrying the signed pre-dial token of an external carrier leg. */
export const EXTERNAL_CARRIER_CALL_HEADER = "X-Ringee-Byoc-Call-Id";

/** A server-authorized route through the workspace's own carrier. */
export interface CarrierRoute {
  /** SIP destination returned by the pre-flight. Never built client-side. */
  destinationUri: string;
  /** Signed pre-dial token the server adopts the leg with. */
  callToken: string;
}

/** Why a carrier leg failed, in terms that are safe to show a user. */
export type CarrierCallFailure =
  | "rejected"
  | "destination"
  | "timeout"
  | "unavailable";

/**
 * Classify the SIP status a carrier leg ended with. `null` for endings that are
 * not failures of the route — answered, busy, unanswered, declined or
 * cancelled — which the dialer already presents as ordinary call endings.
 */
export function carrierCallFailure(
  sipCode: unknown,
): CarrierCallFailure | null {
  const code = typeof sipCode === "string" ? Number(sipCode) : sipCode;
  if (typeof code !== "number" || !Number.isInteger(code) || code < 400)
    return null;
  if ([480, 486, 487, 600, 603].includes(code)) return null;
  if ([401, 403, 407].includes(code)) return "rejected";
  if ([404, 410, 484, 485, 604].includes(code)) return "destination";
  if ([408, 504].includes(code)) return "timeout";
  return "unavailable";
}
