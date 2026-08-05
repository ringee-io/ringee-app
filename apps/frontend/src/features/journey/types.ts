/**
 * The `/journey` API contract, as the client sees it.
 *
 * TYPES ONLY. There is deliberately no threshold, no stage classification and
 * no reward rule in this feature — the backend decides all of it and sends
 * every requirement with its target and the workspace's current value. If you
 * are about to add a number to this folder, it belongs in
 * `packages/services/src/services/journey/program/` instead.
 */

export type JourneyWorkspaceType = 'personal' | 'organization';

export type JourneyStageStatus = 'achieved' | 'in_progress' | 'locked';

export type JourneyRewardStatus =
  | 'claimable'
  | 'unavailable'
  | 'pending_review'
  | 'claimed'
  | 'rejected'
  | 'locked';

export interface JourneyRequirement {
  id: string;
  metric: string;
  target: number;
  current: number;
  done: boolean;
  progressPct: number;
  actionKey: string;
}

export interface JourneyStageReward {
  amountCents: number;
  currency: 'USD';
  status: JourneyRewardStatus;
  claimedAt: string | null;
}

export interface JourneyStage {
  id: string;
  order: number;
  status: JourneyStageStatus;
  requirements: JourneyRequirement[];
  completed: number;
  total: number;
  progressPct: number;
  reward: JourneyStageReward | null;
  achievedAt: string | null;
  celebrationPending: boolean;
}

export interface JourneyProgramState {
  version: string;
  active: boolean;
  rewardsAvailable: boolean;
  /** `disabled` | `budget` | `holdout` | `paused` */
  rewardsBlockedReason: string | null;
}

export interface JourneyWindow {
  start: string;
  end: string;
  days: number;
  timeZone: string;
}

export interface JourneyCapability {
  id: string;
  used: boolean;
}

export interface JourneyOverview {
  workspaceType: JourneyWorkspaceType;
  program: JourneyProgramState;
  window: JourneyWindow;
  stages: JourneyStage[];
  currentStageId: string | null;
  nextRequirement: JourneyRequirement | null;
  completed: boolean;
  capabilities: JourneyCapability[];
  metrics: Record<string, number>;
  totals: {
    earnedCents: number;
    claimableCents: number;
    claimedCents: number;
    pendingReviewCents: number;
    possibleCents: number;
    currency: 'USD';
  };
  balance: number;
}

export type JourneyClaimOutcome =
  | 'claimed'
  | 'already_claimed'
  | 'pending_review'
  | 'rejected'
  | 'not_eligible'
  | 'unavailable'
  | 'rate_limited';

export interface JourneyClaimResult {
  outcome: JourneyClaimOutcome;
  stageId: string;
  amountCents: number;
  currency: 'USD';
  balance: number;
  /** A stable code the client turns into copy. Never an anti-fraud detail. */
  messageCode: string;
  claimedAt: string | null;
  retryAfterSeconds?: number;
}

export interface JourneyClaimAllResult {
  results: JourneyClaimResult[];
  claimedCents: number;
  balance: number;
}
