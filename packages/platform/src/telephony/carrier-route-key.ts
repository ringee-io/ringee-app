import { createHmac, timingSafeEqual } from "crypto";
import { deriveSdkKey } from "../sdk/secrets";

/**
 * The routing key in an external carrier connection's Internal SIP URI
 * (`<key>@<subdomain>.sip.telnyx.com`). It names the SIP endpoint whose PBX
 * delivered a call and is HMAC-signed: every connection on the account can
 * place a call to Ringee's Call Control application, so the key — not the
 * destination alone — is what proves a call came through that endpoint.
 *
 * Lower-case letters and digits only, the characters every SIP URI field on
 * the provider accepts: `rcr` + endpoint UUID (hex) + 128-bit MAC (hex).
 */
const KEY = /^rcr([0-9a-f]{32})([0-9a-f]{32})$/;

function mac(endpointHex: string): string {
  return createHmac("sha256", deriveSdkKey("carrier_route"))
    .update(`carrier-route:${endpointHex}`)
    .digest("hex")
    .slice(0, 32);
}

export function signCarrierRouteKey(endpointId: string): string {
  const hex = endpointId.replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex))
    throw new Error("A carrier route key names a UUID.");
  return `rcr${hex}${mac(hex)}`;
}

/** Whether a SIP user part has the shape of a route key (MAC not checked). */
export function isCarrierRouteKey(value: string | null | undefined): boolean {
  return KEY.test((value ?? "").toLowerCase());
}

/** The endpoint id a genuine key names, or null. */
export function verifyCarrierRouteKey(
  value: string | null | undefined,
): string | null {
  const match = (value ?? "").toLowerCase().match(KEY);
  if (!match) return null;
  const expected = Buffer.from(mac(match[1]), "hex");
  const actual = Buffer.from(match[2], "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return null;
  const h = match[1];
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
