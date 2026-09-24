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
const ROUTE_KEY = /^rcr([0-9a-f]{32})([0-9a-f]{32})$/;

/**
 * The key a browser addresses Ringee's Call Control application with to place
 * one pre-dialed call through an external carrier:
 * `sip:<key>@<subdomain>.sip.telnyx.com`. It names that pre-created call and
 * nothing about the carrier — the server, not the browser, sends the call on
 * to it. Same alphabet and shape as the route key: `rco` + call UUID (hex) +
 * 128-bit MAC (hex), MAC'd under its own label so neither key passes as the
 * other.
 */
const CALL_KEY = /^rco([0-9a-f]{32})([0-9a-f]{32})$/;

function mac(label: string, hex: string): string {
  return createHmac("sha256", deriveSdkKey("carrier_route"))
    .update(`${label}:${hex}`)
    .digest("hex")
    .slice(0, 32);
}

function sign(prefix: string, label: string, id: string): string {
  const hex = id.replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex))
    throw new Error(`A ${label} key names a UUID.`);
  return `${prefix}${hex}${mac(label, hex)}`;
}

function verify(
  pattern: RegExp,
  label: string,
  value: string | null | undefined,
): string | null {
  const match = (value ?? "").toLowerCase().match(pattern);
  if (!match) return null;
  const expected = Buffer.from(mac(label, match[1]), "hex");
  const actual = Buffer.from(match[2], "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return null;
  const h = match[1];
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function signCarrierRouteKey(endpointId: string): string {
  return sign("rcr", "carrier-route", endpointId);
}

/** Whether a SIP user part has the shape of a route key (MAC not checked). */
export function isCarrierRouteKey(value: string | null | undefined): boolean {
  return ROUTE_KEY.test((value ?? "").toLowerCase());
}

/** The endpoint id a genuine key names, or null. */
export function verifyCarrierRouteKey(
  value: string | null | undefined,
): string | null {
  return verify(ROUTE_KEY, "carrier-route", value);
}

export function signCarrierCallKey(callId: string): string {
  return sign("rco", "carrier-call", callId);
}

/** Whether a SIP user part has the shape of a call key (MAC not checked). */
export function isCarrierCallKey(value: string | null | undefined): boolean {
  return CALL_KEY.test((value ?? "").toLowerCase());
}

/** The call id a genuine call key names, or null. */
export function verifyCarrierCallKey(
  value: string | null | undefined,
): string | null {
  return verify(CALL_KEY, "carrier-call", value);
}
