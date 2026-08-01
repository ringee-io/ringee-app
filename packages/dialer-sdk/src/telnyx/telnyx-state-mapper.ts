import type { DialerState } from "../types";

/**
 * The internal `@ringee/dialer-core` engine already collapses Telnyx's many
 * granular states into a small `CallState`. This maps that engine state onto
 * the SDK's PUBLIC {@link DialerState} so raw Telnyx state never leaks into the
 * public contract.
 *
 * Engine CallState: idle | requesting | connecting | ringing | active | held |
 *                   ended | failed
 */
const ENGINE_TO_PUBLIC: Record<string, DialerState> = {
  idle: "ready",
  requesting: "connecting",
  connecting: "dialing",
  ringing: "ringing",
  active: "active",
  held: "held",
  ended: "ended",
  failed: "error",
};

export function mapEngineState(engineState: string | undefined): DialerState {
  if (!engineState) return "connecting";
  return ENGINE_TO_PUBLIC[engineState] ?? "connecting";
}
