import { JourneyCapabilityId } from "./program/journey.capabilities";
import { JourneyMetricKey } from "./program/journey.metrics";
import { JourneyNodeStatus } from "./journey.evaluator";
import { JourneyTrackId, JourneyTrackMode } from "./program/journey.tracks";
import { JourneyWorkspaceType } from "./program/journey.workspace";

/**
 * The `/journey` API contract.
 *
 * The frontend renders exactly this and computes nothing: every threshold,
 * every status, every dependency verdict and every amount is decided here. There
 * is no classification, no requirement list, no completion rule and no reward
 * rule anywhere in `apps/frontend` — that duplication is the bug this design
 * exists to remove.
 *
 * Node, track and requirement ids are stable and are what the frontend
 * translates and deep-links.
 */

export type JourneyRewardStatus =
  /** Earned, program healthy, not yet redeemed. */
  | "claimable"
  /** Earned but the program cannot pay right now (flag, budget, holdout). */
  | "unavailable"
  /** Submitted and waiting for a human decision. */
  | "pending_review"
  /** Paid under the current program. */
  | "claimed"
  /**
   * Paid under a previous program version, or covered by a payment that was.
   * Never claimable again — this is what stops v3 paying for v2 work twice.
   */
  | "legacy_claimed"
  /** Declined. The client is never told why in detail. */
  | "rejected"
  /** The node has not been earned yet. */
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

export interface JourneyNodeRewardDto {
  amountCents: number;
  currency: "USD";
  status: JourneyRewardStatus;
  claimedAt: string | null;
  /**
   * Set only for `legacy_claimed`: which previous program version already paid
   * for this work. Lets the UI say "redeemed under the previous program" rather
   * than showing a claimable button that would always fail.
   */
  legacyProgramVersion?: string;
}

export interface JourneyNodeDto {
  id: string;
  track: JourneyTrackId;
  status: JourneyNodeStatus;
  /** A bonus node inside its track: never required to complete anything. */
  optional: boolean;
  /** Graph row. Column comes from the node's track order. */
  depth: number;
  requirements: JourneyRequirementDto[];
  completed: number;
  total: number;
  progressPct: number;
  /** Visible nodes this one needs. */
  dependsOn: string[];
  /** Visible nodes that need this one. */
  unlocks: string[];
  /** The subset of `dependsOn` actually holding this node back right now. */
  blockedBy: string[];
  /** Null when the node pays nothing by design. */
  reward: JourneyNodeRewardDto | null;
  /** When this workspace earned it. Null while unearned. */
  achievedAt: string | null;
  /** True the first time the client sees it, so the celebration fires once. */
  celebrationPending: boolean;
}

export interface JourneyTrackDto {
  id: JourneyTrackId;
  order: number;
  /** `required` tracks must be finished; `elective` ones are the workspace's choice. */
  mode: JourneyTrackMode;
  complete: boolean;
  /** Progress toward the track's own completion rule, not a raw node count. */
  satisfied: number;
  needed: number;
  nodeIds: string[];
  achievedNodes: number;
  totalNodes: number;
}

/**
 * Journey completion — deliberately separate from money.
 *
 * A workspace can be complete with credit unclaimed, and can have claimed every
 * cent of two tracks without being complete.
 */
export interface JourneyCompletionDto {
  requiredComplete: number;
  requiredTotal: number;
  electiveComplete: number;
  electiveRequired: number;
  electiveAvailable: number;
  complete: boolean;
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
  tracks: JourneyTrackDto[];
  nodes: JourneyNodeDto[];
  completion: JourneyCompletionDto;
  /** The node the server recommends working on next. Null when nothing is left. */
  recommendedNodeId: string | null;
  /** The single highest-leverage requirement inside that node. */
  recommendedRequirement: JourneyRequirementDto | null;
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
    /** Paid under a previous program version. Counted, never claimable. */
    legacyClaimedCents: number;
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
  /** The v3 node id. Named `nodeId` because there are no stages any more. */
  nodeId: string;
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
  /** Set when the whole batch was refused before any node was attempted. */
  retryAfterSeconds?: number;
}

/** One pending claim as the backoffice review queue sees it. */
export interface JourneyReviewItemDto {
  id: string;
  workspaceType: JourneyWorkspaceType;
  workspaceId: string;
  programVersion: string;
  /** The stored column is still `stageId`; for 2026.09 rows it holds a node id. */
  stageId: string;
  amountCents: number;
  riskScore: number;
  riskBand: string;
  riskReasons: string[];
  claimedByUserId: string | null;
  createdAt: string;
}
