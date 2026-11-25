import {
  INTERACTIVE_ONLY_SOURCES,
  isDispatchSource,
  isTrafficClass,
  type DispatchSource,
  type TrafficClass,
} from "./traffic-class";

/**
 * Outbound pacing settings (CPS-001..CPS-012).
 *
 * The durable defaults come from `@ringee/configuration`; the backoffice can
 * override any key at runtime, and an override lives in PostgreSQL — never only
 * in Redis — so a cache flush or a failover can only ever bring back the
 * environment defaults, which are the conservative ones.
 *
 * This module is pure on purpose: no configuration import, no I/O.
 */
export type CpsMode = "off" | "observe" | "enforce";

export interface DispatchSettings {
  mode: CpsMode;
  /** The CPS the provider bills nothing for. */
  ceilingCps: number;
  /** Share of the ceiling left unused to absorb dispatch-to-arrival jitter. */
  safetyMargin: number;
  /**
   * What each traffic level may use, as a share of the effective CPS. Level 0
   * is everything; each lower-priority level gets no more than the one above,
   * so the difference is capacity only the higher levels can ever take.
   */
  classCapFractions: [number, number, number, number];
  /** Automated starts per second one workspace may make (levels 1-3). */
  orgAutomationCps: number;
  /** How long an interactive dial may wait before returning a safe deferral. */
  interactiveMaxWaitMs: number;
  interactiveOnTimeout: "defer";
  scheduledMaxWaitMs: number;
  automationMaxWaitMs: number;
  backgroundMaxWaitMs: number;
  /** Longest a Redis command may take before coordination counts as down. */
  coordinationTimeoutMs: number;
  /** Classes whose dispatch is stopped. Interactive can never be paused. */
  pausedClasses: TrafficClass[];
  /** Sources an administrator moved to another class. */
  classOverrides: Partial<Record<DispatchSource, TrafficClass>>;
  queueEnabled: boolean;
  queueMaxPerWorkspace: number;
  queueMaxTotal: number;
  queueMaxWaitMsAutomation: number;
  queueMaxWaitMsBackground: number;
  /** Live agent calls one workspace may hold before queued calls wait. */
  orgConcurrency: number;
  /** Admission estimate only, held at dispatch and reconciled by the debit ledger. */
  agentCallCreditReservationUsd: number;
  /** Promote waiting automation one level at this interval, never to P0. */
  queueAgingMs: number;
  orgAutomationOverrides: Record<string, number>;
  orgConcurrencyOverrides: Record<string, number>;
  /** Estimated monthly surcharge, in USD, above which an alert fires. */
  surchargeBudgetUsd: number;
}

export type DispatchSettingKey = keyof DispatchSettings;

/** The environment-derived defaults every setting starts from. */
export interface DispatchEnvironment {
  mode: CpsMode;
  ceilingCps: number;
  safetyMargin: number;
  orgAutomationCps: number;
  queueEnabled: boolean;
  orgConcurrency: number;
  queueMaxPerWorkspace: number;
  queueMaxTotal: number;
  queueMaxWaitMinutes: number;
  surchargeBudgetUsd: number;
}

const MINUTE_MS = 60_000;

export function baselineSettings(env: DispatchEnvironment): DispatchSettings {
  return {
    mode: env.mode,
    ceilingCps: env.ceilingCps,
    safetyMargin: env.safetyMargin,
    // P3 may use half the effective CPS; P2 and P1 a little more each; the
    // top quarter can only ever be taken by a person.
    classCapFractions: [1, 0.75, 0.625, 0.5],
    orgAutomationCps: env.orgAutomationCps,
    interactiveMaxWaitMs: 3_000,
    interactiveOnTimeout: "defer",
    scheduledMaxWaitMs: 10_000,
    automationMaxWaitMs: 2_000,
    backgroundMaxWaitMs: 0,
    coordinationTimeoutMs: 750,
    pausedClasses: [],
    classOverrides: {},
    queueEnabled: env.queueEnabled,
    queueMaxPerWorkspace: env.queueMaxPerWorkspace,
    queueMaxTotal: env.queueMaxTotal,
    queueMaxWaitMsAutomation: Math.min(30, env.queueMaxWaitMinutes) * MINUTE_MS,
    queueMaxWaitMsBackground: env.queueMaxWaitMinutes * MINUTE_MS,
    orgConcurrency: env.orgConcurrency,
    agentCallCreditReservationUsd: 0.1,
    queueAgingMs: 60_000,
    orgAutomationOverrides: {},
    orgConcurrencyOverrides: {},
    surchargeBudgetUsd: env.surchargeBudgetUsd,
  };
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const numberIn =
  (min: number, max: number) =>
  (value: unknown): string | null =>
    isFiniteNumber(value) && value >= min && value <= max
      ? null
      : `must be a number between ${min} and ${max}`;

const integerIn =
  (min: number, max: number) =>
  (value: unknown): string | null =>
    isFiniteNumber(value) &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
      ? null
      : `must be an integer between ${min} and ${max}`;

const workspaceLimits =
  (min: number, max: number, integer = false) =>
  (value: unknown): string | null => {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return "must map workspace references to limits";
    if (Object.keys(value).length > 10_000)
      return "has too many workspace overrides";
    for (const [key, limit] of Object.entries(value)) {
      if (!/^(organization|personal):[0-9a-f-]{36}$/i.test(key))
        return "contains an invalid workspace reference";
      const problem = (integer ? integerIn(min, max) : numberIn(min, max))(
        limit,
      );
      if (problem) return problem;
    }
    return null;
  };

/** `null` when the value is acceptable for the key, otherwise why not. */
const VALIDATORS: {
  [K in DispatchSettingKey]: (value: unknown) => string | null;
} = {
  mode: (value) =>
    value === "off" || value === "observe" || value === "enforce"
      ? null
      : 'must be "off", "observe" or "enforce"',
  ceilingCps: numberIn(1, 1000),
  safetyMargin: numberIn(0, 0.9),
  classCapFractions: (value) => {
    if (!Array.isArray(value) || value.length !== 4)
      return "must be four numbers, one per traffic level";
    if (!value.every((v) => isFiniteNumber(v) && v > 0 && v <= 1))
      return "every share must be above 0 and at most 1";
    if (value[0] !== 1) return "the interactive level must be 1";
    for (let i = 1; i < 4; i++)
      if (value[i] > value[i - 1])
        return "a lower-priority level cannot exceed the one above it";
    return null;
  },
  orgAutomationCps: numberIn(0.1, 100),
  interactiveMaxWaitMs: integerIn(0, 30_000),
  interactiveOnTimeout: (value) =>
    value === "defer"
      ? null
      : 'must be "defer": every class shares the ceiling',
  scheduledMaxWaitMs: integerIn(0, 120_000),
  automationMaxWaitMs: integerIn(0, 60_000),
  backgroundMaxWaitMs: integerIn(0, 60_000),
  coordinationTimeoutMs: integerIn(50, 10_000),
  pausedClasses: (value) => {
    if (!Array.isArray(value) || !value.every(isTrafficClass))
      return "must be a list of traffic classes";
    if (value.includes("interactive"))
      return "interactive dispatch can never be paused";
    return null;
  },
  classOverrides: (value) => {
    if (typeof value !== "object" || value === null || Array.isArray(value))
      return "must be an object of source to class";
    for (const [source, cls] of Object.entries(value)) {
      if (!isDispatchSource(source)) return `unknown source "${source}"`;
      if (INTERACTIVE_ONLY_SOURCES.has(source))
        return `"${source}" is a person waiting on the line and stays interactive`;
      if (!isTrafficClass(cls))
        return `"${source}" must map to a traffic class`;
    }
    return null;
  },
  queueEnabled: (value) =>
    typeof value === "boolean" ? null : "must be true or false",
  queueMaxPerWorkspace: integerIn(1, 100_000),
  queueMaxTotal: integerIn(1, 1_000_000),
  queueMaxWaitMsAutomation: integerIn(MINUTE_MS, 24 * 60 * MINUTE_MS),
  queueMaxWaitMsBackground: integerIn(MINUTE_MS, 24 * 60 * MINUTE_MS),
  orgConcurrency: integerIn(1, 10_000),
  agentCallCreditReservationUsd: numberIn(0.000001, 100_000),
  queueAgingMs: integerIn(1_000, 3_600_000),
  orgAutomationOverrides: workspaceLimits(0.1, 100),
  orgConcurrencyOverrides: workspaceLimits(1, 10_000, true),
  surchargeBudgetUsd: numberIn(0, 10_000_000),
};

export const DISPATCH_SETTING_KEYS = Object.keys(
  VALIDATORS,
) as DispatchSettingKey[];

export function isDispatchSettingKey(key: string): key is DispatchSettingKey {
  return Object.prototype.hasOwnProperty.call(VALIDATORS, key);
}

export interface SettingsPatchResult {
  patch: Partial<DispatchSettings>;
  errors: string[];
}

/**
 * Checks an untrusted settings patch key by key. Unknown keys are errors, never
 * ignored: a typo in a safety setting must not look like it was applied.
 */
export function validateSettingsPatch(input: unknown): SettingsPatchResult {
  const patch: Record<string, unknown> = {};
  const errors: string[] = [];
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { patch: {}, errors: ["The settings must be an object."] };
  }
  for (const [key, value] of Object.entries(input)) {
    if (!isDispatchSettingKey(key)) {
      errors.push(`"${key}" is not a dispatch setting.`);
      continue;
    }
    const problem = VALIDATORS[key](value);
    if (problem) errors.push(`${key} ${problem}.`);
    else patch[key] = value;
  }
  return { patch: patch as Partial<DispatchSettings>, errors };
}

/**
 * The environment baseline with stored overrides on top. A stored value that no
 * longer validates (a limit tightened by a release) is skipped, so a bad row
 * can never loosen or break pacing.
 */
export function applySettingsOverrides(
  base: DispatchSettings,
  overrides: Record<string, unknown>,
): DispatchSettings {
  const { patch } = validateSettingsPatch(overrides);
  const merged = { ...base, ...patch } as DispatchSettings;
  // The cap shares and the margin only make sense together.
  return validateSettingsPatch({ classCapFractions: merged.classCapFractions })
    .errors.length
    ? { ...merged, classCapFractions: base.classCapFractions }
    : merged;
}

export interface DerivedLimits {
  /** `ceilingCps × (1 − safetyMargin)`: the rate the clocks actually allow. */
  effectiveCps: number;
  /** What each traffic level may use, in CPS. */
  levelCapsCps: [number, number, number, number];
  /** Minimum spacing between grants on each level's clock, in microseconds. */
  levelIntervalsMicros: [number, number, number, number];
  /** Minimum spacing between one workspace's automated grants. */
  orgIntervalMicros: number;
  /**
   * How long automation must leave the shared clock free before taking it,
   * so a person retrying at the instant it frees always wins (see `gcra.ts`).
   * A tenth of the spacing: small enough to cost automation almost nothing,
   * larger than the jitter of a retry timer.
   */
  automationGuardMicros: number;
  /**
   * How far an overage may push the shared clock past now: eight intervals,
   * two seconds at the defaults. People are never refused, but a flood of them
   * cannot stall automation for longer than this.
   */
  overageHorizonMicros: number;
  /**
   * The most the time between a grant and Telnyx receiving the request may
   * vary before a one-second window can hold more than the ceiling.
   *
   * Grants are at least `T = 1 / effectiveCps` apart. With arrivals spread by
   * at most `J`, a closed one-second window holds at most `floor((1 + J) / T) + 1`
   * of them, which stays within the ceiling `C` exactly when `J < C·T − 1`.
   */
  jitterToleranceMs: number;
  /** CPS that only interactive traffic can use: `levelCaps[0] − levelCaps[1]`. */
  interactiveReserveCps: number;
  warnings: string[];
}

const round6 = (value: number) => Math.round(value * 1e6) / 1e6;

export function deriveLimits(settings: DispatchSettings): DerivedLimits {
  const effectiveCps = round6(
    settings.ceilingCps * (1 - settings.safetyMargin),
  );
  const levelCapsCps = settings.classCapFractions.map((fraction) =>
    round6(effectiveCps * fraction),
  ) as DerivedLimits["levelCapsCps"];
  const levelIntervalsMicros = levelCapsCps.map((cap) =>
    Math.ceil(1_000_000 / cap),
  ) as DerivedLimits["levelIntervalsMicros"];
  const orgIntervalMicros = Math.ceil(1_000_000 / settings.orgAutomationCps);
  const automationGuardMicros = Math.round(levelIntervalsMicros[0] / 10);
  const overageHorizonMicros = levelIntervalsMicros[0] * 8;
  const jitterToleranceMs = Math.max(
    0,
    Math.floor(
      ((settings.ceilingCps * levelIntervalsMicros[0]) / 1_000_000 - 1) * 1000,
    ),
  );
  const interactiveReserveCps = round6(levelCapsCps[0] - levelCapsCps[1]);

  const warnings: string[] = [];
  if (jitterToleranceMs < 100) {
    warnings.push(
      `Only ${jitterToleranceMs} ms of dispatch-to-arrival jitter is tolerated before a one-second window can exceed ${settings.ceilingCps} CPS. Raise safetyMargin.`,
    );
  }
  if (interactiveReserveCps <= 0) {
    warnings.push(
      "No capacity is reserved for interactive calls: automation can keep a person waiting.",
    );
  }
  if (settings.ceilingCps > 5) {
    warnings.push(
      `The ceiling is ${settings.ceilingCps} CPS: it permits surcharge exposure when the measured monthly P95 exceeds 5.`,
    );
  }
  return {
    effectiveCps,
    levelCapsCps,
    levelIntervalsMicros,
    orgIntervalMicros,
    automationGuardMicros,
    overageHorizonMicros,
    jitterToleranceMs,
    interactiveReserveCps,
    warnings,
  };
}
