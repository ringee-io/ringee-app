/**
 * Traffic classes for outbound provider dispatch (CPS-003).
 *
 * Every outbound call attempt belongs to exactly one class. The class decides
 * how much of the shared provider budget the attempt may use and what happens
 * when that budget is short:
 *
 * | Level | Label | Class         | When it is short                              |
 * | ----- | ----- | ------------- | --------------------------------------------- |
 * | 0     | P0    | `interactive` | wait briefly, then defer safely  |
 * | 1     | P1    | `scheduled`   | wait up to its bound, then retry later        |
 * | 2     | P2    | `automation`  | defer (queue or next tick)                    |
 * | 3     | P3    | `background`  | defer (queue)                                 |
 *
 * A lower level may use everything a higher level may use, plus a share the
 * higher levels can never take (see `deriveLimits`): the interactive reserve.
 */
export const TRAFFIC_CLASSES = [
  "interactive",
  "scheduled",
  "automation",
  "background",
] as const;

export type TrafficClass = (typeof TRAFFIC_CLASSES)[number];
export type TrafficLevel = 0 | 1 | 2 | 3;

export const TRAFFIC_LEVEL: Readonly<Record<TrafficClass, TrafficLevel>> = {
  interactive: 0,
  scheduled: 1,
  automation: 2,
  background: 3,
};

export const TRAFFIC_LABEL: Readonly<Record<TrafficClass, string>> = {
  interactive: "P0",
  scheduled: "P1",
  automation: "P2",
  background: "P3",
};

export function trafficClassOfLevel(level: number): TrafficClass {
  const found = TRAFFIC_CLASSES[level];
  if (!found) throw new RangeError(`Unknown traffic level ${level}`);
  return found;
}

export function isTrafficClass(value: unknown): value is TrafficClass {
  return (
    typeof value === "string" &&
    (TRAFFIC_CLASSES as readonly string[]).includes(value)
  );
}

/**
 * Where an outbound attempt comes from. Declared by the caller, never by a
 * request: a client cannot pick its own class.
 */
export const DISPATCH_SOURCES = [
  // A person pressed a button and a browser, extension, SDK or phone dials.
  "web_dial",
  "extension_dial",
  "sdk_dial",
  "session_dial",
  "preview_dial",
  "desk_phone_dial",
  "voicemail_drop",
  "caller_id_verification",
  // Legs the server creates for a call a person is already part of.
  "inbound_ring",
  "call_transfer",
  "desk_phone_bridge",
  "carrier_bridge",
  // The campaign dialer places a lead for an agent who is waiting.
  "progressive_dial",
  // AI voice agent calls.
  "agent_reminder",
  "agent_callback",
  "agent_automation",
  "agent_dashboard",
  "agent_api",
  "agent_mcp",
  // An undeclared outbound request is still paced and reported so its owner
  // can declare the source. It never overrides the account ceiling.
  "unscoped",
] as const;

export type DispatchSource = (typeof DISPATCH_SOURCES)[number];

export function isDispatchSource(value: unknown): value is DispatchSource {
  return (
    typeof value === "string" &&
    (DISPATCH_SOURCES as readonly string[]).includes(value)
  );
}

/** The class each source gets unless the backoffice moves it. */
export const DEFAULT_CLASS_BY_SOURCE: Readonly<
  Record<DispatchSource, TrafficClass>
> = {
  web_dial: "interactive",
  extension_dial: "interactive",
  sdk_dial: "interactive",
  session_dial: "interactive",
  preview_dial: "interactive",
  desk_phone_dial: "interactive",
  voicemail_drop: "interactive",
  caller_id_verification: "interactive",
  inbound_ring: "interactive",
  call_transfer: "interactive",
  desk_phone_bridge: "interactive",
  carrier_bridge: "interactive",
  progressive_dial: "automation",
  agent_reminder: "scheduled",
  agent_callback: "scheduled",
  agent_automation: "automation",
  // A person pressing "call" on an agent in the dashboard.
  agent_dashboard: "interactive",
  agent_api: "background",
  agent_mcp: "background",
  unscoped: "interactive",
};

/**
 * Sources an administrator may NOT move out of `interactive`: pacing them like
 * background work would delay a person who is waiting on the line.
 */
export const INTERACTIVE_ONLY_SOURCES: ReadonlySet<DispatchSource> = new Set([
  "web_dial",
  "extension_dial",
  "sdk_dial",
  "session_dial",
  "preview_dial",
  "desk_phone_dial",
  "voicemail_drop",
  "caller_id_verification",
  "inbound_ring",
  "call_transfer",
  "desk_phone_bridge",
  "carrier_bridge",
  "unscoped",
]);

export function resolveTrafficClass(
  source: DispatchSource,
  overrides: Partial<Record<DispatchSource, TrafficClass>> = {},
): TrafficClass {
  if (INTERACTIVE_ONLY_SOURCES.has(source))
    return DEFAULT_CLASS_BY_SOURCE[source];
  return overrides[source] ?? DEFAULT_CLASS_BY_SOURCE[source];
}

/** Aging preserves the interactive reserve and the shared account ceiling. */
export function agedTrafficClass(
  cls: TrafficClass,
  queuedAt: Date,
  nowMs: number,
  agingMs: number,
): TrafficClass {
  if (cls === "interactive") return cls;
  const promotions = Math.max(
    0,
    Math.floor((nowMs - queuedAt.getTime()) / agingMs),
  );
  return trafficClassOfLevel(Math.max(1, TRAFFIC_LEVEL[cls] - promotions));
}
