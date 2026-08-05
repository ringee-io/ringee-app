import { JourneyMetricKey } from "./journey.metrics";

/**
 * The Ringee Journey program — the ONE place stages, requirements and reward
 * amounts are defined.
 *
 * This module is pure data plus pure helpers. It is imported by the evaluator,
 * by the claim service, by the analysis script and (as a serialised DTO) by the
 * frontend. There is no second copy of a threshold anywhere in the codebase:
 * the API sends every requirement with its target and the workspace's current
 * value, and the frontend only maps requirement ids to labels and deep links.
 *
 * Program versions are immutable once released. Changing a threshold means
 * publishing a new version, so achievements and claims stamped with the old one
 * keep their exact meaning.
 */

export type JourneyWorkspaceType = "personal" | "organization";

export type JourneyStageId =
  // Personal ladder.
  | "foundation"
  | "consistent_caller"
  | "connected_operator"
  | "ai_closer"
  | "agentic_operator"
  // Organization ladder.
  | "workspace_ready"
  | "team_activated"
  | "campaign_operator"
  | "connected_sales_operation"
  | "ai_sales_team"
  | "advanced_operation";

/**
 * One checkable thing. `id` is stable and is what the frontend translates and
 * links; `metric` and `target` are what the evaluator compares. `actionKey`
 * names the recommended next action so the UI can route without knowing why.
 */
export interface JourneyRequirementDef {
  id: string;
  metric: JourneyMetricKey;
  target: number;
  actionKey: JourneyActionKey;
}

export type JourneyActionKey =
  | "verify_phone"
  | "get_number"
  | "make_call"
  | "call_more_contacts"
  | "import_contacts"
  | "log_outcomes"
  | "invite_team"
  | "create_campaign"
  | "work_campaign"
  | "connect_crm"
  | "connect_calendar"
  | "connect_custom_integration"
  | "enable_transcription"
  | "enable_ai_pipeline"
  | "connect_mcp"
  | "explore_capabilities";

export interface JourneyStageDef {
  id: JourneyStageId;
  /** 1-based position on the ladder. Sequence is enforced on this. */
  order: number;
  /** USD cents credited to the workspace wallet. 0 = no reward by design. */
  rewardCents: number;
  requirements: readonly JourneyRequirementDef[];
}

export interface JourneyProgramDef {
  version: string;
  ladders: Record<JourneyWorkspaceType, readonly JourneyStageDef[]>;
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PROVISIONAL THRESHOLDS
 *
 * Every `target` below is a conservative first guess chosen so that a workspace
 * genuinely using Ringee clears it and a workspace farming credit does not.
 * NONE of them have been validated against production history. Run
 * `pnpm journey:analyze` and re-tune before treating them as settled; when they
 * change, publish a NEW version rather than editing this one.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const JOURNEY_PROGRAM_2026_08: JourneyProgramDef = {
  version: "2026.08",
  ladders: {
    personal: [
      {
        // First value: a real conversation with a real person. Deliberately
        // unpaid — the first call should never be something you buy.
        id: "foundation",
        order: 1,
        rewardCents: 0,
        requirements: [
          {
            id: "verified_phone",
            metric: "verifiedPhone",
            target: 1,
            actionKey: "verify_phone",
          },
          {
            id: "dialable_number",
            metric: "dialableNumbers",
            target: 1,
            actionKey: "get_number",
          },
          {
            id: "first_connected_call",
            metric: "connectedCalls",
            target: 1,
            actionKey: "make_call",
          },
        ],
      },
      {
        // Habit, not a burst: spread across days and across people.
        id: "consistent_caller",
        order: 2,
        rewardCents: 300,
        requirements: [
          {
            id: "connected_calls",
            metric: "connectedCalls",
            target: 15,
            actionKey: "make_call",
          },
          {
            id: "active_days",
            metric: "activeDays",
            target: 4,
            actionKey: "make_call",
          },
          {
            id: "unique_destinations",
            metric: "uniqueDestinations",
            target: 10,
            actionKey: "import_contacts",
          },
          {
            id: "connected_minutes",
            metric: "connectedMinutes",
            target: 20,
            actionKey: "call_more_contacts",
          },
        ],
      },
      {
        // The stack is wired and data is flowing — successes, not connections.
        id: "connected_operator",
        order: 3,
        rewardCents: 500,
        requirements: [
          {
            id: "integration_successes",
            metric: "integrationSuccesses",
            target: 5,
            actionKey: "connect_crm",
          },
          {
            id: "connected_calls",
            metric: "connectedCalls",
            target: 25,
            actionKey: "make_call",
          },
          {
            id: "outcomes_logged",
            metric: "outcomesLogged",
            target: 10,
            actionKey: "log_outcomes",
          },
        ],
      },
      {
        // AI has actually read the calls and produced something actionable.
        id: "ai_closer",
        order: 4,
        rewardCents: 500,
        requirements: [
          {
            id: "transcriptions",
            metric: "transcriptionsCompleted",
            target: 10,
            actionKey: "enable_transcription",
          },
          {
            id: "ai_results",
            metric: "aiResultsProduced",
            target: 1,
            actionKey: "enable_ai_pipeline",
          },
          {
            id: "connected_calls",
            metric: "connectedCalls",
            target: 40,
            actionKey: "make_call",
          },
          {
            id: "active_weeks",
            metric: "activeWeeks",
            target: 2,
            actionKey: "make_call",
          },
        ],
      },
      {
        // Agents doing the legwork, on top of a broad, real stack.
        id: "agentic_operator",
        order: 5,
        rewardCents: 700,
        requirements: [
          {
            id: "mcp_calls",
            metric: "mcpCalls",
            target: 5,
            actionKey: "connect_mcp",
          },
          {
            id: "active_weeks",
            metric: "activeWeeks",
            target: 3,
            actionKey: "make_call",
          },
          {
            id: "capabilities",
            metric: "advancedCapabilitiesUsed",
            target: 3,
            actionKey: "explore_capabilities",
          },
          {
            id: "meaningful_conversations",
            metric: "meaningfulConversations",
            target: 25,
            actionKey: "call_more_contacts",
          },
        ],
      },
    ],
    organization: [
      {
        id: "workspace_ready",
        order: 1,
        rewardCents: 0,
        requirements: [
          {
            id: "verified_phone",
            metric: "verifiedPhone",
            target: 1,
            actionKey: "verify_phone",
          },
          {
            id: "dialable_number",
            metric: "dialableNumbers",
            target: 1,
            actionKey: "get_number",
          },
          {
            id: "first_connected_call",
            metric: "connectedCalls",
            target: 1,
            actionKey: "make_call",
          },
        ],
      },
      {
        // A team is people who accepted AND who call — not a list of invites.
        id: "team_activated",
        order: 2,
        rewardCents: 300,
        requirements: [
          {
            id: "accepted_members",
            metric: "acceptedMembers",
            target: 2,
            actionKey: "invite_team",
          },
          {
            id: "active_members",
            metric: "activeMembers",
            target: 2,
            actionKey: "invite_team",
          },
          {
            id: "connected_calls",
            metric: "connectedCalls",
            target: 25,
            actionKey: "make_call",
          },
          {
            id: "active_days",
            metric: "activeDays",
            target: 5,
            actionKey: "make_call",
          },
        ],
      },
      {
        // A campaign that was actually operated: volume, spread and follow-up.
        id: "campaign_operator",
        order: 3,
        rewardCents: 500,
        requirements: [
          {
            id: "campaign_calls",
            metric: "campaignConnectedCalls",
            target: 25,
            actionKey: "work_campaign",
          },
          {
            id: "campaign_destinations",
            metric: "campaignUniqueDestinations",
            target: 15,
            actionKey: "create_campaign",
          },
          {
            id: "campaign_days",
            metric: "campaignActiveDays",
            target: 3,
            actionKey: "work_campaign",
          },
          {
            id: "worked_leads",
            metric: "workedLeads",
            target: 20,
            actionKey: "work_campaign",
          },
          {
            id: "outcomes_logged",
            metric: "outcomesLogged",
            target: 15,
            actionKey: "log_outcomes",
          },
        ],
      },
      {
        id: "connected_sales_operation",
        order: 4,
        rewardCents: 700,
        requirements: [
          {
            id: "integration_successes",
            metric: "integrationSuccesses",
            target: 15,
            actionKey: "connect_crm",
          },
          {
            id: "connected_calls",
            metric: "connectedCalls",
            target: 60,
            actionKey: "make_call",
          },
          {
            id: "meaningful_conversations",
            metric: "meaningfulConversations",
            target: 20,
            actionKey: "call_more_contacts",
          },
        ],
      },
      {
        // AI adopted by the team, not by one power user.
        id: "ai_sales_team",
        order: 5,
        rewardCents: 1000,
        requirements: [
          {
            id: "transcriptions",
            metric: "transcriptionsCompleted",
            target: 25,
            actionKey: "enable_transcription",
          },
          {
            id: "ai_results",
            metric: "aiResultsProduced",
            target: 2,
            actionKey: "enable_ai_pipeline",
          },
          {
            id: "ai_members",
            metric: "aiMembersCovered",
            target: 2,
            actionKey: "enable_ai_pipeline",
          },
          {
            id: "connected_calls",
            metric: "connectedCalls",
            target: 100,
            actionKey: "make_call",
          },
        ],
      },
      {
        id: "advanced_operation",
        order: 6,
        rewardCents: 1200,
        requirements: [
          {
            id: "active_weeks",
            metric: "activeWeeks",
            target: 4,
            actionKey: "make_call",
          },
          {
            id: "active_members",
            metric: "activeMembers",
            target: 3,
            actionKey: "invite_team",
          },
          {
            id: "repeat_campaigns",
            metric: "campaignsWithRealActivity",
            target: 2,
            actionKey: "create_campaign",
          },
          {
            id: "meaningful_conversations",
            metric: "meaningfulConversations",
            target: 100,
            actionKey: "call_more_contacts",
          },
          {
            id: "capabilities",
            metric: "advancedCapabilitiesUsed",
            target: 3,
            actionKey: "explore_capabilities",
          },
        ],
      },
    ],
  },
};

const PROGRAMS: Record<string, JourneyProgramDef> = {
  [JOURNEY_PROGRAM_2026_08.version]: JOURNEY_PROGRAM_2026_08,
};

/**
 * Resolves a program by version. An unknown version is a configuration error,
 * not a runtime fallback: silently serving a different ladder than the one
 * stamped on a workspace's achievements would corrupt the audit trail.
 */
export function getJourneyProgram(version: string): JourneyProgramDef {
  const program = PROGRAMS[version];
  if (!program) {
    throw new Error(
      `Unknown Journey program version "${version}". Known: ${Object.keys(PROGRAMS).join(", ")}`,
    );
  }
  return program;
}

export function journeyLadder(
  program: JourneyProgramDef,
  workspaceType: JourneyWorkspaceType,
): readonly JourneyStageDef[] {
  return program.ladders[workspaceType];
}

/** Total cents a workspace of this type can earn across the whole ladder. */
export function ladderTotalCents(
  program: JourneyProgramDef,
  workspaceType: JourneyWorkspaceType,
): number {
  return journeyLadder(program, workspaceType).reduce(
    (sum, stage) => sum + stage.rewardCents,
    0,
  );
}
