/**
 * Mirror of the backend `JourneyOverviewDto` (`packages/services/src/services/journey`).
 * The API reports facts; every judgement about where the workspace stands lives
 * in `lib/journey.ts`.
 */

export type JourneyScope = 'organization' | 'personal';

export interface JourneyWindow {
  start: string;
  end: string;
  days: number;
}

export interface JourneyFoundation {
  phoneNumbers: number;
  verifiedCallerIds: number;
  sipDevices: number;
  teamMembers: number;
  rotationPoolNumbers: number;
  contacts: number;
}

export interface JourneySourceBreakdown {
  source: string;
  calls: number;
}

export interface JourneyActivity {
  calls: number;
  connectedCalls: number;
  connectRate: number;
  minutes: number;
  previousCalls: number;
  callsTrendPct: number | null;
  activeDays: number;
  activeCallers: number;
  firstCallAt: string | null;
  bySource: JourneySourceBreakdown[];
}

export interface JourneyOutcomes {
  meetingsBooked: number;
  sales: number;
  interested: number;
  followUps: number;
  callbacksScheduled: number;
  meetingsCreated: number;
}

export interface JourneyCampaigns {
  total: number;
  active: number;
  leads: number;
  callsFromCampaigns: number;
}

export interface JourneyIntelligence {
  recordingEnabled: boolean;
  transcriptionEnabled: boolean;
  transcriptions: number;
  aiEnabled: boolean;
  aiPipelinesEnabled: number;
}

export interface JourneyIntegrationBase {
  connected: boolean;
  count: number;
  providers: string[];
  lastActivityAt: string | null;
}

export interface JourneyIntegrations {
  crm: JourneyIntegrationBase & { syncedCalls: number };
  customCrm: JourneyIntegrationBase & {
    inboundEvents: number;
    deliveries: number;
  };
  meetings: JourneyIntegrationBase & { syncedMeetings: number };
  enrichment: JourneyIntegrationBase & {
    searches: number;
    enrichedContacts: number;
  };
  mcp: JourneyIntegrationBase & {
    sessions: number;
    sessionsInWindow: number;
    callsInWindow: number;
  };
}

export type JourneyRewardStatus = 'locked' | 'claimable' | 'claimed';

/** One stage reward on this workspace's ladder, in ladder order. */
export interface JourneyReward {
  stageId: string;
  /** USD credited to the workspace wallet when redeemed. */
  amount: number;
  status: JourneyRewardStatus;
  claimedAt: string | null;
}

export interface JourneyRewards {
  currency: 'USD';
  /** The ladder stage the backend evaluated the reward states against. */
  stageId: string;
  items: JourneyReward[];
  claimableTotal: number;
  claimedTotal: number;
  totalPossible: number;
}

/** Result of `POST /journey/rewards/claim`. */
export interface JourneyClaimResult {
  claimed: boolean;
  stageId: string;
  amount: number;
  balance: number;
  rewards: JourneyRewards;
}

export interface JourneyOverview {
  scope: JourneyScope;
  campaignsAvailable: boolean;
  scopedToMember: boolean;
  window: JourneyWindow;
  foundation: JourneyFoundation;
  activity: JourneyActivity;
  outcomes: JourneyOutcomes;
  campaigns: JourneyCampaigns | null;
  intelligence: JourneyIntelligence;
  integrations: JourneyIntegrations;
  rewards: JourneyRewards;
}
