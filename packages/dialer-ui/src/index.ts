// The single, shared Active Call experience used by both `apps/frontend` and
// `apps/browser-extension`. There is no second modal anywhere in the monorepo.
export { ActiveCallModal } from "./components/active-call-modal";
export type { ActiveCallModalProps } from "./components/active-call-modal";
export { PostCallView } from "./components/post-call-view";

export { DialerProvider, useDialer } from "./data/context";
export type { DialerProviderProps } from "./data/context";
export type {
  DialerDataClient,
  DialerRecordingSettings,
  DialerSlots,
  DialerLabels,
  DialerNotify,
  DialerContextValue,
} from "./data/types";
export { DEFAULT_DIALER_LABELS } from "./data/types";
