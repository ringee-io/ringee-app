/**
 * The `/journey` API contract, as the client sees it.
 *
 * TYPES ONLY. There is deliberately no threshold, no node classification, no
 * dependency rule, no completion rule and no reward rule in this feature — the
 * backend decides all of it and sends every requirement with its target and the
 * workspace's current value. If you are about to add a number to this folder,
 * it belongs in `packages/services/src/services/journey/program/` instead.
 */

export type JourneyWorkspaceType = 'personal' | 'organization';

export type JourneyTrackId =
  | 'core'
  | 'team'
  | 'campaigns'
  | 'integrations'
  | 'ai'
  | 'automation'
  | 'inbound';

export type JourneyTrackMode = 'required' | 'elective';

export type JourneyNodeStatus =
  | 'achieved'
  | 'in_progress'
  | 'available'
  | 'locked';

export type JourneyRewardStatus =
  | 'claimable'
  | 'unavailable'
  | 'pending_review'
  | 'claimed'
  /** Paid under a previous program version. Never claimable again. */
  | 'legacy_claimed'
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

export interface JourneyNodeReward {
  amountCents: number;
  currency: 'USD';
  status: JourneyRewardStatus;
  claimedAt: string | null;
  legacyProgramVersion?: string;
}

export interface JourneyNode {
  id: string;
  track: JourneyTrackId;
  status: JourneyNodeStatus;
  /** A bonus node inside its track: never required to complete anything. */
  optional: boolean;
  /** Graph row. The column comes from the node's track order. */
  depth: number;
  requirements: JourneyRequirement[];
  completed: number;
  total: number;
  progressPct: number;
  dependsOn: string[];
  unlocks: string[];
  /** The subset of `dependsOn` actually holding this node back right now. */
  blockedBy: string[];
  reward: JourneyNodeReward | null;
  achievedAt: string | null;
  celebrationPending: boolean;
}

export interface JourneyTrack {
  id: JourneyTrackId;
  order: number;
  mode: JourneyTrackMode;
  complete: boolean;
  /** Progress toward the track's own completion rule, not a raw node count. */
  satisfied: number;
  needed: number;
  nodeIds: string[];
  achievedNodes: number;
  totalNodes: number;
}

export interface JourneyCompletion {
  requiredComplete: number;
  requiredTotal: number;
  electiveComplete: number;
  electiveRequired: number;
  electiveAvailable: number;
  complete: boolean;
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
  tracks: JourneyTrack[];
  nodes: JourneyNode[];
  completion: JourneyCompletion;
  recommendedNodeId: string | null;
  recommendedRequirement: JourneyRequirement | null;
  capabilities: JourneyCapability[];
  metrics: Record<string, number>;
  totals: {
    earnedCents: number;
    claimableCents: number;
    claimedCents: number;
    pendingReviewCents: number;
    legacyClaimedCents: number;
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
  nodeId: string;
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
  retryAfterSeconds?: number;
}
