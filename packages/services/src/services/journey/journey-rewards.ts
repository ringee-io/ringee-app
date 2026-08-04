import { JourneyOverviewFactsDto } from "./journey.types";

/**
 * Journey stage rewards — real call credit paid once per stage reached.
 *
 * The amounts and the stage classification live here, server-side, because a
 * claim moves money: the frontend renders whatever this module decides, and
 * `JourneyService.claimReward` re-derives the stage from a fresh snapshot
 * before paying, so a hand-crafted request can never redeem a stage the
 * workspace has not genuinely reached.
 *
 * The classification is a deliberate line-for-line port of the frontend model
 * (`apps/frontend/src/features/journey/lib/journey.ts`) — same signals, same
 * thresholds, most-mature-first. If a threshold changes, change BOTH files.
 */

export type JourneyStageId =
  // Shared entry point.
  | "solo_caller"
  // Freelancer / personal-workspace ladder.
  | "consistent_caller"
  | "connected_operator"
  | "ai_closer"
  | "agentic_operator"
  // Organization ladder.
  | "small_team"
  | "campaign_operator"
  | "ai_sales_team"
  | "call_center";

export const PERSONAL_LADDER: JourneyStageId[] = [
  "solo_caller",
  "consistent_caller",
  "connected_operator",
  "ai_closer",
  "agentic_operator",
];

export const ORGANIZATION_LADDER: JourneyStageId[] = [
  "solo_caller",
  "small_team",
  "campaign_operator",
  "ai_sales_team",
  "call_center",
];

/** USD credited to the workspace wallet when the stage is redeemed. Stages
 * absent here (the entry points) pay nothing. */
export const JOURNEY_STAGE_REWARDS: Partial<Record<JourneyStageId, number>> = {
  // Organization ladder.
  campaign_operator: 3,
  ai_sales_team: 10,
  call_center: 12,
  // Freelancer ladder.
  consistent_caller: 3,
  connected_operator: 5,
  ai_closer: 5,
  agentic_operator: 7,
};

interface StageSignals {
  numbers: number;
  sipDevices: number;
  teamMembers: number;
  rotation: boolean;
  calls: number;
  activeDays: number;
  activeCampaigns: number;
  campaigns: number;
  crmConnected: boolean;
  calendarConnected: boolean;
  enrichmentConnected: boolean;
  agentConnected: boolean;
  agentDriving: boolean;
  aiSurface: boolean;
}

function signalsFrom(data: JourneyOverviewFactsDto): StageSignals {
  const i = data.integrations;

  return {
    numbers: data.foundation.phoneNumbers + data.foundation.verifiedCallerIds,
    sipDevices: data.foundation.sipDevices,
    teamMembers: data.foundation.teamMembers,
    rotation: data.foundation.rotationPoolNumbers >= 2,
    calls: data.activity.calls,
    activeDays: data.activity.activeDays,
    activeCampaigns: data.campaigns?.active ?? 0,
    campaigns: data.campaigns?.total ?? 0,
    crmConnected: i.crm.connected || i.customCrm.connected,
    calendarConnected: i.meetings.connected,
    enrichmentConnected: i.enrichment.connected,
    agentConnected: i.mcp.connected,
    agentDriving: i.mcp.sessionsInWindow > 0 || i.mcp.callsInWindow > 0,
    aiSurface:
      data.intelligence.recordingEnabled ||
      data.intelligence.transcriptionEnabled ||
      data.intelligence.transcriptions > 0 ||
      data.intelligence.aiEnabled,
  };
}

function classifyOrganization(s: StageSignals): JourneyStageId {
  if (
    s.teamMembers >= 3 &&
    s.activeCampaigns >= 2 &&
    (s.numbers >= 3 || s.rotation) &&
    s.sipDevices >= 1 &&
    s.calls >= 100
  ) {
    return "call_center";
  }

  if (s.aiSurface && s.calls >= 20) return "ai_sales_team";

  if (
    s.activeCampaigns >= 1 &&
    s.numbers >= 1 &&
    (s.calls >= 20 || s.activeCampaigns >= 2 || s.rotation)
  ) {
    return "campaign_operator";
  }

  if (s.teamMembers >= 2 && (s.campaigns >= 1 || s.numbers >= 1)) {
    return "small_team";
  }

  return "solo_caller";
}

function classifyPersonal(s: StageSignals): JourneyStageId {
  if (
    s.agentConnected &&
    s.agentDriving &&
    s.aiSurface &&
    s.calls >= 20 &&
    (s.crmConnected || s.calendarConnected)
  ) {
    return "agentic_operator";
  }

  if (s.aiSurface && s.calls >= 20) return "ai_closer";

  if (
    (s.crmConnected || s.calendarConnected || s.enrichmentConnected) &&
    s.calls >= 10
  ) {
    return "connected_operator";
  }

  if (s.calls >= 20 || (s.calls >= 10 && s.activeDays >= 5)) {
    return "consistent_caller";
  }

  return "solo_caller";
}

/** The highest ladder stage this snapshot genuinely qualifies for. */
export function classifyStage(data: JourneyOverviewFactsDto): JourneyStageId {
  const signals = signalsFrom(data);
  return data.scope === "organization"
    ? classifyOrganization(signals)
    : classifyPersonal(signals);
}

export function journeyLadderFor(
  scope: JourneyOverviewFactsDto["scope"],
): JourneyStageId[] {
  return scope === "organization" ? ORGANIZATION_LADDER : PERSONAL_LADDER;
}
