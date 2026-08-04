/**
 * The payload behind `/dashboard/journey` — a complete, honest picture of a
 * workspace: what has been set up, how much calling happens, what it produces,
 * how intelligent the operation is, and which parts of the stack are connected.
 *
 * The API deliberately reports *facts only*. Placing the workspace on its growth
 * path (and deciding what to recommend next) happens client-side, so the model
 * can be tuned without a deploy of the API.
 */

export type JourneyScope = "organization" | "personal";

export interface JourneyWindowDto {
  start: string;
  end: string;
  days: number;
}

export interface JourneyFoundationDto {
  phoneNumbers: number;
  verifiedCallerIds: number;
  sipDevices: number;
  /** 0 in a personal workspace — there is no team to count. */
  teamMembers: number;
  /** Numbers actively participating in caller-ID rotation. */
  rotationPoolNumbers: number;
  contacts: number;
}

export interface JourneySourceBreakdownDto {
  source: string;
  calls: number;
}

export interface JourneyActivityDto {
  calls: number;
  connectedCalls: number;
  /** 0-100. Share of calls that reached a human, by disposition. */
  connectRate: number;
  minutes: number;
  /** Calls in the equally-long window right before this one. */
  previousCalls: number;
  /** Percentage change vs. the previous window; null when there is no baseline. */
  callsTrendPct: number | null;
  /** Distinct days with at least one call — calling as a habit, not a burst. */
  activeDays: number;
  activeCallers: number;
  firstCallAt: string | null;
  bySource: JourneySourceBreakdownDto[];
}

export interface JourneyOutcomesDto {
  meetingsBooked: number;
  sales: number;
  interested: number;
  followUps: number;
  callbacksScheduled: number;
  meetingsCreated: number;
}

export interface JourneyCampaignsDto {
  total: number;
  active: number;
  leads: number;
  callsFromCampaigns: number;
}

export interface JourneyIntelligenceDto {
  recordingEnabled: boolean;
  transcriptionEnabled: boolean;
  transcriptions: number;
  aiEnabled: boolean;
  aiPipelinesEnabled: number;
}

export interface JourneyIntegrationBaseDto {
  connected: boolean;
  count: number;
  /** Provider slugs (or integration names for custom integrations). */
  providers: string[];
  lastActivityAt: string | null;
}

export interface JourneyIntegrationsDto {
  /** Native CRM connections (Attio, HubSpot, Salesforce, Odoo…). */
  crm: JourneyIntegrationBaseDto & { syncedCalls: number };
  /** Bring-your-own CRM through the Custom Integration API + webhooks. */
  customCrm: JourneyIntegrationBaseDto & {
    inboundEvents: number;
    deliveries: number;
  };
  /** Google / Microsoft calendars used to push booked meetings. */
  meetings: JourneyIntegrationBaseDto & { syncedMeetings: number };
  /** Apollo / Prospeo lead sourcing and enrichment. */
  enrichment: JourneyIntegrationBaseDto & {
    searches: number;
    enrichedContacts: number;
  };
  /** Agentic access: MCP-created call sessions and the calls they drove. */
  mcp: JourneyIntegrationBaseDto & {
    sessions: number;
    sessionsInWindow: number;
    callsInWindow: number;
  };
}

/** The measured facts — everything except the reward states derived from them. */
export interface JourneyOverviewFactsDto {
  scope: JourneyScope;
  /**
   * Campaigns require an organization, so a freelancer workspace can neither
   * run nor measure them. The client uses this to swap the whole campaign
   * dimension out of the journey instead of showing empty campaign metrics.
   */
  campaignsAvailable: boolean;
  /** True when the caller is a plain org member and only sees their own activity. */
  scopedToMember: boolean;
  window: JourneyWindowDto;
  foundation: JourneyFoundationDto;
  activity: JourneyActivityDto;
  outcomes: JourneyOutcomesDto;
  /** Null in a personal workspace. */
  campaigns: JourneyCampaignsDto | null;
  intelligence: JourneyIntelligenceDto;
  integrations: JourneyIntegrationsDto;
}

export type JourneyRewardStatus = "locked" | "claimable" | "claimed";

/** One stage reward on this workspace's ladder, in ladder order. */
export interface JourneyRewardDto {
  stageId: string;
  /** USD credited to the workspace wallet when redeemed. */
  amount: number;
  status: JourneyRewardStatus;
  claimedAt: string | null;
}

export interface JourneyRewardsDto {
  currency: "USD";
  /** The ladder stage the reward states were evaluated against. */
  stageId: string;
  items: JourneyRewardDto[];
  /** Unlocked but not yet redeemed. */
  claimableTotal: number;
  /** Already redeemed into the wallet. */
  claimedTotal: number;
  /** Everything the full ladder can pay. */
  totalPossible: number;
}

export interface JourneyOverviewDto extends JourneyOverviewFactsDto {
  rewards: JourneyRewardsDto;
}

/** Result of redeeming one stage reward. */
export interface JourneyClaimResultDto {
  /** False when the reward had already been redeemed (nothing was paid). */
  claimed: boolean;
  stageId: string;
  amount: number;
  /** Wallet balance after the call. */
  balance: number;
  rewards: JourneyRewardsDto;
}
