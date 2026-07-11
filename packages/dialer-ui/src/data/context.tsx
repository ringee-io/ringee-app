"use client";

import { createContext, useContext, type ReactNode } from "react";
import {
  DEFAULT_DIALER_LABELS,
  type DialerContextValue,
  type DialerDataClient,
  type DialerLabels,
  type DialerNotify,
  type DialerRecordingSettings,
  type DialerSlots,
} from "./types";

/**
 * Safe defaults so the shared modal never crashes when a host forgets the
 * provider: actions reject loudly, every rich panel is simply hidden, and
 * notifications fall back to the console.
 */
const DEFAULT_DATA: DialerDataClient = {
  saveCallOutcome: async () => {
    throw new Error(
      "[dialer-ui] No DialerProvider mounted — saveCallOutcome is unavailable.",
    );
  },
};

const DEFAULT_RECORDING_SETTINGS: DialerRecordingSettings = {
  recordAllCalls: false,
  transcribeRealtime: false,
};

const DEFAULT_NOTIFY: DialerNotify = (kind, message) => {
  console[kind === "error" ? "error" : "log"](`[dialer] ${message}`);
};

const DialerContext = createContext<DialerContextValue>({
  data: DEFAULT_DATA,
  recordingSettings: DEFAULT_RECORDING_SETTINGS,
  slots: {},
  labels: DEFAULT_DIALER_LABELS,
  notify: DEFAULT_NOTIFY,
});

export interface DialerProviderProps {
  data: DialerDataClient;
  recordingSettings?: DialerRecordingSettings;
  slots?: DialerSlots;
  labels?: Partial<DialerLabels>;
  notify?: DialerNotify;
  children: ReactNode;
}

/**
 * Wraps the Active Call Modal with everything host-specific. Mounted once per
 * host around wherever the modal renders (the web app's `ShowActiveCall`, the
 * extension's side panel root).
 */
export function DialerProvider({
  data,
  recordingSettings = DEFAULT_RECORDING_SETTINGS,
  slots = {},
  labels,
  notify = DEFAULT_NOTIFY,
  children,
}: DialerProviderProps) {
  const value: DialerContextValue = {
    data,
    recordingSettings,
    slots,
    labels: { ...DEFAULT_DIALER_LABELS, ...labels },
    notify,
  };
  return (
    <DialerContext.Provider value={value}>{children}</DialerContext.Provider>
  );
}

export function useDialer(): DialerContextValue {
  return useContext(DialerContext);
}
