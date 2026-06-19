import type { CallState } from "../contracts/call";

/**
 * Telnyx WebRTC reports many granular call states. Both the web app and the
 * extension collapse them into the same {@link CallState} so the Active Call
 * Modal renders identically no matter which host drives it.
 */
export const TELNYX_TO_STATE: Record<string, CallState> = {
  new: "connecting",
  trying: "connecting",
  requesting: "connecting",
  recovering: "connecting",
  ringing: "ringing",
  answering: "ringing",
  early: "ringing",
  active: "active",
  held: "held",
  hangup: "ended",
  destroy: "ended",
  purge: "ended",
};

export function mapTelnyxState(telnyxState: string | undefined): CallState {
  if (!telnyxState) return "connecting";
  return TELNYX_TO_STATE[telnyxState] ?? "connecting";
}
