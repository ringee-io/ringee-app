import { JourneyCapabilityId } from "./program/journey.capabilities";
import { JourneyMetricKey } from "./program/journey.metrics";
import { JourneyStageStatus } from "./journey.evaluator";
import { JourneyWorkspaceType } from "./program/journey.program";

/**
 * The `/journey` API contract.
 *
 * The frontend renders exactly this and computes nothing: every threshold,
 * every status and every amount is decided here. There is no classification,
 * no requirement list and no reward rule anywhere in `apps/frontend` — that
 * duplication is the bug this rewrite exists to remove.
 *
 * Requirement and stage ids are stable and are what the frontend translates.
 */

export type JourneyRewardStatus =
  /** Earned, program healthy, not yet redeemed. */
  | "claimable"
  /** Earned but the program cannot pay right now (flag, budget, holdout). */
  | "unavailable"
  /** Submitted and waiting for a human decision. */
  | "pending_review"
  /** Paid. */
  | "claimed"
  /** Declined. The client is never told why in detail. */
  | "rejected"
  /** The stage has not been earned yet. */
  | "locked";

export interface JourneyRequirementDto {
  id: string;
  metric: JourneyMetricKey;
  target: number;
  current: number;
  done: boolean;
  progressPct: number;
  /** Names the recommended action; the client maps it to copy and a route. */
  actionKey: string;
}

export interface JourneyStageDto {
  id: string;
  order: number;
  status: JourneyStageStatus;
  requirements: JourneyRequirementDto[];
  completed: number;
  total: number;
  progressPct: number;
  /** Null when the stage pays nothing by design (the first rung). */
  reward: JourneyStageRewardDto | null;
  /** When this workspace earned it. Null while unearned. */
  achievedAt: string | null;
  /** True the first time the client sees it, so the celebration fires once. */
  celebrationPending: boolean;
}

export interface JourneyStageRewardDto {
  amountCents: number;
  currency: "USD";
  status: JourneyRewardStatus;
  claimedAt: string | null;
}

export interface JourneyProgramStateDto {
  version: string;
  /** False when JOURNEY_V2_ENABLED is off or the workspace is out of rollout. */
  active: boolean;
  /** False when rewards are paused, out of budget, or the workspace is a holdout. */
  rewardsAvailable: boolean;
  /**
   * Why rewards are unavailable, as a stable code the client turns into a
   * neutral message: `disabled` | `budget` | `holdout` | `paused`.
   */
  rewardsBlockedReason: string | null;
}

export interface JourneyWindowDto {
  start: string;
  end: string;
  days: number;
  /** The IANA zone days and weeks were bucketed in. */
  timeZone: string;
}

export interface JourneyCapabilityDto {
  id: JourneyCapabilityId;
  used: boolean;
}

export interface JourneyOverviewDto {
  workspaceType: JourneyWorkspaceType;
  program: JourneyProgramStateDto;
  window: JourneyWindowDto;
  stages: JourneyStageDto[];
  /** The stage being worked on. Null when the ladder is finished. */
  currentStageId: string | null;
  /** The single highest-leverage thing to do next. */
  nextRequirement: JourneyRequirementDto | null;
  completed: boolean;
  capabilities: JourneyCapabilityDto[];
  /**
   * The measured metric bag. Exposed so the UI can show live numbers without a
   * second endpoint; counts and durations only, never PII.
   */
  metrics: Record<string, number>;
  totals: {
    earnedCents: number;
    claimableCents: number;
    claimedCents: number;
    pendingReviewCents: number;
    possibleCents: number;
    currency: "USD";
  };
  /** Current wallet balance in USD, for the "credit available" line. */
  balance: number;
}

export type JourneyClaimOutcomeCode =
  | "claimed"
  | "already_claimed"
  | "pending_review"
  | "rejected"
  | "not_eligible"
  | "unavailable"
  | "rate_limited";

export interface JourneyClaimResultDto {
  outcome: JourneyClaimOutcomeCode;
  stageId: string;
  amountCents: number;
  currency: "USD";
  /** Wallet balance after the operation. Unchanged unless `outcome=claimed`. */
  balance: number;
  /** A stable message code — never an anti-fraud detail. */
  messageCode: string;
  claimedAt: string | null;
  /** Present only when rate limited. */
  retryAfterSeconds?: number;
}

export interface JourneyClaimAllResultDto {
  results: JourneyClaimResultDto[];
  claimedCents: number;
  balance: number;
}

/** One pending claim as the backoffice review queue sees it. */
export interface JourneyReviewItemDto {
  id: string;
  workspaceType: JourneyWorkspaceType;
  workspaceId: string;
  programVersion: string;
  stageId: string;
  amountCents: number;
  riskScore: number;
  riskBand: string;
  riskReasons: string[];
  claimedByUserId: string | null;
  createdAt: string;
}
