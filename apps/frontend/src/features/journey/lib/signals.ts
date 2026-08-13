import type { JourneyOverview } from '../types';

/**
 * The hard signals every judgement on this page is made from — stage
 * classification and the reward requirements both read this exact shape, so
 * the two can never disagree about what the workspace has done.
 */
export interface StageSignals {
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

export function signalsFrom(data: JourneyOverview): StageSignals {
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
      data.intelligence.aiEnabled
  };
}
