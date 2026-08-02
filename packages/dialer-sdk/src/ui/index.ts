/**
 * `@ringee/dialer-sdk/ui` — the turnkey, production-ready dialer UIs
 * (Floating + Bar) built on the headless core. Import this when you want a
 * drop-in dialer; import the package root for the headless engine only.
 */
export { createFloating, createBar } from "./factory";
export type {
  FloatingOptions,
  BarOptions,
  FloatingController,
  BarController,
  CommonUIOptions,
} from "./factory";
export type { FloatingSide } from "./floating-dialer";
export type { RingeeTheme, ColorScheme } from "./theme";
export type { Strings } from "./strings";
export type { DialerContact } from "./dialer-model";

// Re-export the headless surface for convenience so a single import covers both.
export { RingeeDialer } from "../ringee-dialer";
export { RingeeError } from "../errors";
export type {
  RingeeDialerOptions,
  RingeeAgent,
  RingeeCallerId,
  StartCallInput,
  RingeeCall,
  DialerState,
  AuthState,
  RingeeEventName,
  RingeeEventHandler,
  RingeeErrorCode,
} from "../types";
