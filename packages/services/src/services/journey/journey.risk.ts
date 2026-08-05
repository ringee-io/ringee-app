/**
 * Journey anti-fraud rules — pure, ordered, and independent of the rate limiter.
 *
 * A rate limit answers "is this person clicking too fast". Fraud is a different
 * question: "does this workspace look like a business, or like a way to harvest
 * credit". Both exist; neither substitutes for the other.
 *
 * Every rule is a pure function of a snapshot so the whole model can be unit
 * tested without a database, and so a claim's `riskReasons` can be replayed
 * against a later rule version to audit a decision.
 *
 * Reason codes are STABLE STRINGS. They are stored on claims and read by the
 * backoffice; renaming one silently rewrites history.
 */

export const JOURNEY_RISK_VERSION = "2026.08.1";

export type JourneyRiskBand = "low" | "medium" | "high";

export type JourneyRiskReason =
  | "account_too_new"
  | "workspace_too_new"
  | "email_unverified"
  | "phone_unverified"
  | "user_blocked"
  | "shared_phone"
  | "shared_payment_method"
  | "related_workspaces"
  | "workspace_burst"
  | "claim_too_fast"
  | "high_failure_rate"
  | "short_call_flood"
  | "destination_repetition"
  | "self_dialing"
  | "expensive_destinations"
  | "time_compression"
  | "locked_stage_probing"
  | "payment_failures";

/**
 * Everything the risk model is allowed to look at. Free of PII by construction:
 * identifiers arrive pre-hashed or as counts.
 */
export interface JourneyRiskSnapshot {
  accountAgeHours: number;
  workspaceAgeHours: number;
  emailVerified: boolean;
  phoneVerified: boolean;
  userBlocked: boolean;
  /** Other users sharing this user's phone number hash. */
  usersSharingPhone: number;
  /** Other workspaces backed by the same Stripe customer. */
  workspacesSharingPaymentMethod: number;
  /** Rewarded workspaces this person is an accepted admin of. */
  relatedRewardedWorkspaces: number;
  /** Organizations this person created in the last 7 days. */
  workspacesCreatedLast7Days: number;
  /** Hours between signup and this claim. */
  hoursSinceSignupAtClaim: number;
  attemptedCalls: number;
  failedCalls: number;
  /** Attempted calls shorter than 10 seconds. */
  veryShortCalls: number;
  connectedCalls: number;
  /** Connected calls to the single most-dialled destination. */
  topDestinationCalls: number;
  /** Connected calls placed to a number the workspace itself owns. */
  selfDialedCalls: number;
  connectedMinutes: number;
  /** Connected minutes spent on the most expensive rate decile. */
  premiumRateMinutes: number;
  /** Largest share of connected calls falling inside one 30-minute span, 0-1. */
  burstConcentration: number;
  /** Claims rejected in the last 24 h for a stage that was not reached. */
  lockedStageAttempts24h: number;
  /** An active Stripe abuse block exists for this user. */
  hasActivePaymentBlock: boolean;
}

export interface JourneyRiskThresholds {
  minAccountAgeHours: number;
  maxRewardedWorkspacesPerUser: number;
  mediumThreshold: number;
  highThreshold: number;
}

export interface JourneyRiskVerdict {
  score: number;
  band: JourneyRiskBand;
  reasons: JourneyRiskReason[];
  version: string;
}

interface Rule {
  code: JourneyRiskReason;
  points: number;
  when: (s: JourneyRiskSnapshot, t: JourneyRiskThresholds) => boolean;
}

/**
 * Minimum sample sizes before a *ratio* rule may fire. Without these, a
 * workspace with two calls — one of them short — reads as a 50 % short-call
 * flood, which is how a legitimate first-day user gets flagged.
 */
const MIN_CALLS_FOR_RATIO = 20;
const MIN_CONNECTED_FOR_REPETITION = 10;

export const JOURNEY_RISK_RULES: readonly Rule[] = [
  {
    code: "user_blocked",
    points: 100,
    when: (s) => s.userBlocked,
  },
  {
    code: "account_too_new",
    points: 30,
    when: (s, t) => s.accountAgeHours < t.minAccountAgeHours,
  },
  {
    code: "workspace_too_new",
    points: 20,
    when: (s, t) =>
      s.workspaceAgeHours > 0 && s.workspaceAgeHours < t.minAccountAgeHours,
  },
  { code: "email_unverified", points: 20, when: (s) => !s.emailVerified },
  { code: "phone_unverified", points: 25, when: (s) => !s.phoneVerified },
  { code: "shared_phone", points: 35, when: (s) => s.usersSharingPhone > 1 },
  {
    code: "shared_payment_method",
    points: 30,
    when: (s) => s.workspacesSharingPaymentMethod > 1,
  },
  {
    code: "related_workspaces",
    points: 25,
    when: (s, t) =>
      s.relatedRewardedWorkspaces > t.maxRewardedWorkspacesPerUser,
  },
  {
    code: "workspace_burst",
    points: 25,
    when: (s) => s.workspacesCreatedLast7Days > 3,
  },
  {
    code: "claim_too_fast",
    points: 20,
    when: (s, t) => s.hoursSinceSignupAtClaim < t.minAccountAgeHours,
  },
  {
    code: "high_failure_rate",
    points: 20,
    when: (s) =>
      s.attemptedCalls >= MIN_CALLS_FOR_RATIO &&
      s.failedCalls / s.attemptedCalls > 0.6,
  },
  {
    code: "short_call_flood",
    points: 25,
    when: (s) =>
      s.attemptedCalls >= MIN_CALLS_FOR_RATIO &&
      s.veryShortCalls / s.attemptedCalls > 0.7,
  },
  {
    code: "destination_repetition",
    points: 25,
    when: (s) =>
      s.connectedCalls >= MIN_CONNECTED_FOR_REPETITION &&
      s.topDestinationCalls / s.connectedCalls > 0.5,
  },
  {
    // These calls are already excluded from every metric. Their *existence* is
    // what the rule reads: nobody dials their own numbers by accident at scale.
    code: "self_dialing",
    points: 30,
    when: (s) => s.selfDialedCalls > 0,
  },
  {
    code: "expensive_destinations",
    points: 20,
    when: (s) =>
      s.connectedMinutes >= 10 &&
      s.premiumRateMinutes / s.connectedMinutes > 0.4,
  },
  {
    code: "time_compression",
    points: 25,
    when: (s) => s.connectedCalls >= 10 && s.burstConcentration >= 0.8,
  },
  {
    code: "locked_stage_probing",
    points: 15,
    when: (s) => s.lockedStageAttempts24h >= 5,
  },
  {
    code: "payment_failures",
    points: 15,
    when: (s) => s.hasActivePaymentBlock,
  },
] as const;

/**
 * Scores a snapshot. The score is capped at 100 so a pile-up of minor signals
 * cannot make a merely-suspicious workspace indistinguishable from a blocked
 * one in the backoffice.
 */
export function evaluateJourneyRisk(
  snapshot: JourneyRiskSnapshot,
  thresholds: JourneyRiskThresholds,
): JourneyRiskVerdict {
  const fired = JOURNEY_RISK_RULES.filter((rule) =>
    rule.when(snapshot, thresholds),
  );
  const score = Math.min(
    100,
    fired.reduce((sum, rule) => sum + rule.points, 0),
  );

  const band: JourneyRiskBand =
    score >= thresholds.highThreshold
      ? "high"
      : score >= thresholds.mediumThreshold
        ? "medium"
        : "low";

  return {
    score,
    band,
    reasons: fired.map((rule) => rule.code),
    version: JOURNEY_RISK_VERSION,
  };
}
