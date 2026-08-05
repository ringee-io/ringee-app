import { JourneyMetricKey } from "./journey.metrics";
import {
  JourneyCompletionPolicy,
  JourneyTrackDef,
  JourneyTrackId,
  completionRuleNodeIds,
} from "./journey.tracks";
import { JourneyWorkspaceType } from "./journey.workspace";

export type { JourneyWorkspaceType } from "./journey.workspace";

/**
 * The Ringee Journey program — the ONE place nodes, dependencies, requirements
 * and reward amounts are defined.
 *
 * This module is pure data plus pure helpers. It is imported by the evaluator,
 * by the claim service, by the analysis script and (as a serialised DTO) by the
 * frontend. There is no second copy of a threshold anywhere in the codebase:
 * the API sends every requirement with its target and the workspace's current
 * value, and the frontend only maps node ids to labels and deep links.
 *
 * v3 replaces the linear ladder with a dependency graph. The rules that make
 * that safe rather than merely prettier:
 *
 * 1. A node unlocks when **every** id in `dependsOn` is achieved. There is no
 *    global order, so the v2 bug class "stage N+1 unlocked because a setting
 *    was flipped" cannot come back through a side door.
 * 2. Only the `core` track is required. Everything else is elective, and the
 *    Journey is finished by completing Core plus N elective tracks of the
 *    workspace's own choosing (see `journey.tracks.ts`).
 * 3. `optional: true` marks a *bonus node inside a track*. A non-optional node
 *    may never depend on one, so bonus work can never become mandatory work.
 * 4. Nothing outside the `inbound` track may depend on an inbound node.
 *
 * All four are enforced by `journey.program.spec.ts`, not by convention.
 *
 * Program versions are immutable once released. Changing a threshold means
 * publishing a new version, so achievements and claims stamped with the old one
 * keep their exact meaning.
 */

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
  | "enrich_leads"
  | "enable_transcription"
  | "enable_ai_pipeline"
  | "connect_mcp"
  | "work_callbacks"
  | "enable_rotation"
  | "create_call_session"
  | "configure_inbound"
  | "setup_desk_phone"
  | "explore_capabilities";

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

export interface JourneyNodeDef {
  id: string;
  track: JourneyTrackId;
  /** Workspace types this node exists for at all. */
  appliesTo: readonly JourneyWorkspaceType[];
  /** Every one of these must be achieved before the node unlocks. */
  dependsOn: readonly string[];
  /**
   * A bonus node inside its track. Never a dependency of a non-optional node,
   * and never on its own the thing that completes a track.
   */
  optional: boolean;
  /** USD cents credited to the workspace wallet, per workspace type. */
  rewardCents: Record<JourneyWorkspaceType, number>;
  requirements: readonly JourneyRequirementDef[];
}

export interface JourneyProgramDef {
  version: string;
  tracks: readonly JourneyTrackDef[];
  nodes: readonly JourneyNodeDef[];
  policy: JourneyCompletionPolicy;
}

const BOTH = ["personal", "organization"] as const;
const ORG_ONLY = ["organization"] as const;

/** No monetary reward. v3 ships bonus capability nodes at zero by design. */
const NO_REWARD = { personal: 0, organization: 0 } as const;

const reward = (personal: number, organization: number) => ({
  personal,
  organization,
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PROVISIONAL THRESHOLDS
 *
 * Every `target` below is a conservative first guess chosen so that a workspace
 * genuinely using Ringee clears it and a workspace farming credit does not.
 * NONE of them have been validated against production history. Run
 * `pnpm journey:analyze` and re-tune before treating them as settled; when they
 * change, publish a NEW version rather than editing this one.
 *
 * REWARD EXPOSURE IS FROZEN AT THE v2 TOTALS: $20.00 personal, $37.00
 * organization. Every node introduced by v3 as a bonus capability pays zero.
 * `journey.program.spec.ts` fails the build if that stops being true.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const NODES: readonly JourneyNodeDef[] = [
  // ── Core Calling ──────────────────────────────────────────────────────────
  // The only required track. Everything else in the graph hangs off it.
  {
    // First value: a real conversation with a real person. Deliberately
    // unpaid — the first call should never be something you buy.
    id: "core.setup",
    track: "core",
    appliesTo: BOTH,
    dependsOn: [],
    optional: false,
    rewardCents: NO_REWARD,
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
    ],
  },
  {
    id: "core.first_call",
    track: "core",
    appliesTo: BOTH,
    dependsOn: ["core.setup"],
    optional: false,
    rewardCents: NO_REWARD,
    requirements: [
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
    id: "core.rhythm",
    track: "core",
    appliesTo: BOTH,
    dependsOn: ["core.first_call"],
    optional: false,
    rewardCents: reward(300, 200),
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
    id: "core.discipline",
    track: "core",
    appliesTo: BOTH,
    dependsOn: ["core.rhythm"],
    optional: false,
    rewardCents: reward(200, 150),
    requirements: [
      {
        id: "outcomes_logged",
        metric: "outcomesLogged",
        target: 10,
        actionKey: "log_outcomes",
      },
      {
        id: "meaningful_conversations",
        metric: "meaningfulConversations",
        target: 10,
        actionKey: "call_more_contacts",
      },
    ],
  },
  {
    id: "core.scale",
    track: "core",
    appliesTo: BOTH,
    dependsOn: ["core.discipline"],
    optional: false,
    rewardCents: reward(250, 150),
    requirements: [
      {
        id: "connected_calls",
        metric: "connectedCalls",
        target: 60,
        actionKey: "make_call",
      },
      {
        id: "active_weeks",
        metric: "activeWeeks",
        target: 3,
        actionKey: "make_call",
      },
      {
        id: "meaningful_conversations",
        metric: "meaningfulConversations",
        target: 25,
        actionKey: "call_more_contacts",
      },
    ],
  },

  // ── Team (organization only) ──────────────────────────────────────────────
  {
    // A team is people who accepted AND who call — not a list of invites.
    id: "team.joined",
    track: "team",
    appliesTo: ORG_ONLY,
    dependsOn: ["core.first_call"],
    optional: false,
    rewardCents: reward(0, 200),
    requirements: [
      {
        id: "accepted_members",
        metric: "acceptedMembers",
        target: 2,
        actionKey: "invite_team",
      },
    ],
  },
  {
    id: "team.calling",
    track: "team",
    appliesTo: ORG_ONLY,
    dependsOn: ["team.joined"],
    optional: false,
    rewardCents: reward(0, 300),
    requirements: [
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
    id: "team.coverage",
    track: "team",
    appliesTo: ORG_ONLY,
    dependsOn: ["team.calling"],
    optional: false,
    rewardCents: reward(0, 200),
    requirements: [
      {
        id: "active_members",
        metric: "activeMembers",
        target: 3,
        actionKey: "invite_team",
      },
      {
        id: "active_weeks",
        metric: "activeWeeks",
        target: 4,
        actionKey: "make_call",
      },
    ],
  },

  // ── Campaigns (organization only) ─────────────────────────────────────────
  // May depend on Team — it is an organization-level outbound-team workflow —
  // but nothing outside Campaigns depends on Campaigns.
  {
    // A campaign that was actually operated: volume, spread and follow-up.
    id: "campaigns.first",
    track: "campaigns",
    appliesTo: ORG_ONLY,
    dependsOn: ["core.rhythm", "team.calling"],
    optional: false,
    rewardCents: reward(0, 300),
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
    ],
  },
  {
    id: "campaigns.pipeline",
    track: "campaigns",
    appliesTo: ORG_ONLY,
    dependsOn: ["campaigns.first"],
    optional: false,
    rewardCents: reward(0, 150),
    requirements: [
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
    id: "campaigns.repeatable",
    track: "campaigns",
    appliesTo: ORG_ONLY,
    dependsOn: ["campaigns.pipeline"],
    optional: false,
    rewardCents: reward(0, 300),
    requirements: [
      {
        id: "repeat_campaigns",
        metric: "campaignsWithRealActivity",
        target: 2,
        actionKey: "create_campaign",
      },
    ],
  },

  // ── Integrations ──────────────────────────────────────────────────────────
  // CRM is one valid path, not the path. Every capability node hangs directly
  // off Core, and the roll-up node counts successes from whichever mix the
  // workspace actually uses.
  {
    id: "integrations.crm",
    track: "integrations",
    appliesTo: BOTH,
    dependsOn: ["core.discipline"],
    optional: false,
    rewardCents: reward(150, 150),
    requirements: [
      {
        id: "crm_synced_calls",
        metric: "crmSyncedCalls",
        target: 5,
        actionKey: "connect_crm",
      },
    ],
  },
  {
    id: "integrations.calendar",
    track: "integrations",
    appliesTo: BOTH,
    dependsOn: ["core.discipline"],
    optional: false,
    rewardCents: NO_REWARD,
    requirements: [
      {
        id: "meetings_synced",
        metric: "meetingsSynced",
        target: 2,
        actionKey: "connect_calendar",
      },
    ],
  },
  {
    id: "integrations.enrichment",
    track: "integrations",
    appliesTo: BOTH,
    dependsOn: ["core.rhythm"],
    optional: false,
    rewardCents: NO_REWARD,
    requirements: [
      {
        id: "enrichment_imports",
        metric: "enrichmentImports",
        target: 10,
        actionKey: "enrich_leads",
      },
    ],
  },
  {
    id: "integrations.custom",
    track: "integrations",
    appliesTo: BOTH,
    dependsOn: ["core.discipline"],
    optional: false,
    rewardCents: NO_REWARD,
    requirements: [
      {
        id: "custom_deliveries",
        metric: "customIntegrationDeliveries",
        target: 5,
        actionKey: "connect_custom_integration",
      },
    ],
  },
  {
    // The roll-up: successes from CRM, custom integrations and calendar
    // together. Deliberately not tied to any one of them.
    id: "integrations.connected",
    track: "integrations",
    appliesTo: BOTH,
    dependsOn: ["core.discipline"],
    optional: false,
    rewardCents: reward(200, 200),
    requirements: [
      {
        id: "integration_successes",
        metric: "integrationSuccesses",
        target: 15,
        actionKey: "connect_crm",
      },
    ],
  },

  // ── AI ────────────────────────────────────────────────────────────────────
  {
    id: "ai.transcription",
    track: "ai",
    appliesTo: BOTH,
    dependsOn: ["core.discipline"],
    optional: false,
    rewardCents: reward(150, 100),
    requirements: [
      {
        id: "transcriptions",
        metric: "transcriptionsCompleted",
        target: 10,
        actionKey: "enable_transcription",
      },
    ],
  },
  {
    // AI has actually read the calls and produced something actionable.
    id: "ai.insights",
    track: "ai",
    appliesTo: BOTH,
    dependsOn: ["ai.transcription"],
    optional: false,
    rewardCents: reward(250, 250),
    requirements: [
      {
        id: "ai_results",
        metric: "aiResultsProduced",
        target: 1,
        actionKey: "enable_ai_pipeline",
      },
    ],
  },
  {
    // Advanced, organization-only, and explicitly NOT needed to finish the AI
    // track: a two-person team should not be blocked on team-wide coverage.
    id: "ai.team_adoption",
    track: "ai",
    appliesTo: ORG_ONLY,
    dependsOn: ["ai.insights"],
    optional: true,
    rewardCents: reward(0, 300),
    requirements: [
      {
        id: "ai_members",
        metric: "aiMembersCovered",
        target: 2,
        actionKey: "enable_ai_pipeline",
      },
      {
        id: "ai_results",
        metric: "aiResultsProduced",
        target: 2,
        actionKey: "enable_ai_pipeline",
      },
      {
        id: "transcriptions",
        metric: "transcriptionsCompleted",
        target: 25,
        actionKey: "enable_transcription",
      },
    ],
  },

  // ── Automation ────────────────────────────────────────────────────────────
  // Agents are one automation path among several. `automation.breadth` hangs
  // off Core, not off agents, so a workspace that automates with callbacks,
  // rotation and sessions finishes the track without ever touching MCP.
  {
    id: "automation.callbacks",
    track: "automation",
    appliesTo: BOTH,
    dependsOn: ["core.discipline"],
    // Bonus inside the track: it feeds `advancedCapabilitiesUsed` but the track
    // is finished by `automation.breadth`, whichever capabilities got it there.
    optional: true,
    rewardCents: reward(100, 100),
    requirements: [
      {
        id: "callbacks_worked",
        metric: "callbacksWorked",
        target: 5,
        actionKey: "work_callbacks",
      },
    ],
  },
  {
    id: "automation.rotation",
    track: "automation",
    appliesTo: BOTH,
    dependsOn: ["core.rhythm"],
    optional: true,
    rewardCents: NO_REWARD,
    requirements: [
      {
        id: "rotation_caller_ids",
        metric: "rotationCallerIdsUsed",
        target: 2,
        actionKey: "enable_rotation",
      },
    ],
  },
  {
    id: "automation.sessions",
    track: "automation",
    appliesTo: BOTH,
    dependsOn: ["core.rhythm"],
    optional: true,
    rewardCents: NO_REWARD,
    requirements: [
      {
        id: "call_session_calls",
        metric: "callSessionCalls",
        target: 5,
        actionKey: "create_call_session",
      },
    ],
  },
  {
    // Agents doing the legwork. Nothing else depends on this node, and the
    // Automation track can be finished without ever connecting an agent.
    id: "automation.agents",
    track: "automation",
    appliesTo: BOTH,
    dependsOn: ["core.discipline"],
    optional: true,
    rewardCents: reward(200, 300),
    requirements: [
      {
        id: "mcp_calls",
        metric: "mcpCalls",
        target: 5,
        actionKey: "connect_mcp",
      },
      {
        id: "mcp_sessions",
        metric: "mcpSessions",
        target: 1,
        actionKey: "connect_mcp",
      },
    ],
  },
  {
    // Breadth, not a specific feature: a digital call centre has no reason to
    // buy a desk phone, and forcing SIP on them would teach them nothing.
    id: "automation.breadth",
    track: "automation",
    appliesTo: BOTH,
    dependsOn: ["core.scale"],
    optional: false,
    rewardCents: reward(200, 350),
    requirements: [
      {
        id: "capabilities",
        metric: "advancedCapabilitiesUsed",
        target: 3,
        actionKey: "explore_capabilities",
      },
    ],
  },

  // ── Inbound (elective, fully non-blocking) ────────────────────────────────
  // No node outside this track may name an inbound node in `dependsOn`.
  {
    id: "inbound.routing",
    track: "inbound",
    appliesTo: BOTH,
    dependsOn: ["core.setup"],
    optional: false,
    rewardCents: NO_REWARD,
    requirements: [
      {
        id: "inbound_answered",
        metric: "inboundCallsAnswered",
        target: 1,
        actionKey: "configure_inbound",
      },
    ],
  },
  {
    id: "inbound.desk_phones",
    track: "inbound",
    appliesTo: BOTH,
    dependsOn: ["inbound.routing"],
    optional: false,
    rewardCents: NO_REWARD,
    requirements: [
      {
        id: "inbound_sip_calls",
        metric: "inboundSipDeviceCalls",
        target: 5,
        actionKey: "setup_desk_phone",
      },
    ],
  },
  {
    id: "inbound.recovery",
    track: "inbound",
    appliesTo: BOTH,
    dependsOn: ["inbound.routing"],
    optional: false,
    rewardCents: NO_REWARD,
    requirements: [
      {
        id: "inbound_recovered",
        metric: "inboundMissedFollowedUp",
        target: 5,
        actionKey: "work_callbacks",
      },
    ],
  },
];

const TRACKS: readonly JourneyTrackDef[] = [
  {
    id: "core",
    order: 1,
    appliesTo: BOTH,
    mode: "required",
    completion: { type: "capstone", nodeId: "core.scale" },
  },
  {
    id: "team",
    order: 2,
    appliesTo: ORG_ONLY,
    mode: "elective",
    completion: { type: "capstone", nodeId: "team.coverage" },
  },
  {
    id: "campaigns",
    order: 3,
    appliesTo: ORG_ONLY,
    mode: "elective",
    completion: { type: "capstone", nodeId: "campaigns.repeatable" },
  },
  {
    // The roll-up node, plus any two capabilities. This is what lets a
    // workspace finish Integrations with calendar + custom and no CRM at all.
    id: "integrations",
    order: 4,
    appliesTo: BOTH,
    mode: "elective",
    completion: {
      type: "combined",
      allOf: ["integrations.connected"],
      anyOf: [
        "integrations.crm",
        "integrations.calendar",
        "integrations.enrichment",
        "integrations.custom",
      ],
      minimumAnyOf: 2,
    },
  },
  {
    // `ai.team_adoption` is a bonus node and is deliberately absent here.
    id: "ai",
    order: 5,
    appliesTo: BOTH,
    mode: "elective",
    completion: { type: "capstone", nodeId: "ai.insights" },
  },
  {
    id: "automation",
    order: 6,
    appliesTo: BOTH,
    mode: "elective",
    completion: { type: "capstone", nodeId: "automation.breadth" },
  },
  {
    id: "inbound",
    order: 7,
    appliesTo: BOTH,
    mode: "elective",
    completion: {
      type: "combined",
      allOf: ["inbound.routing"],
      anyOf: ["inbound.desk_phones", "inbound.recovery"],
      minimumAnyOf: 1,
    },
  },
];

/**
 * Core, plus two (personal) or three (organization) elective tracks.
 *
 * An organization has more tracks on offer and more people to spread the work
 * across, so asking for one more is proportionate rather than punitive.
 */
const POLICY: JourneyCompletionPolicy = {
  requiredTrackIds: {
    personal: ["core"],
    organization: ["core"],
  },
  minimumElectiveTracks: {
    personal: 2,
    organization: 3,
  },
};

export const JOURNEY_PROGRAM_2026_09: JourneyProgramDef = {
  version: "2026.09",
  tracks: TRACKS,
  nodes: NODES,
  policy: POLICY,
};

const PROGRAMS: Record<string, JourneyProgramDef> = {
  [JOURNEY_PROGRAM_2026_09.version]: JOURNEY_PROGRAM_2026_09,
};

/**
 * Program versions that existed but can no longer be evaluated.
 *
 * `2026.08` was a linear ladder; its achievements and claims are preserved and
 * are read through `journey.legacy.ts`, but the graph evaluator cannot run it.
 * Naming it here turns a misconfigured `JOURNEY_PROGRAM_VERSION` into an
 * actionable message instead of "unknown version".
 */
export const JOURNEY_LEGACY_PROGRAM_VERSIONS = ["2026.08"] as const;

/**
 * Resolves a program by version. An unknown version is a configuration error,
 * not a runtime fallback: silently serving a different graph than the one
 * stamped on a workspace's achievements would corrupt the audit trail.
 */
export function getJourneyProgram(version: string): JourneyProgramDef {
  const program = PROGRAMS[version];
  if (program) return program;

  if (
    (JOURNEY_LEGACY_PROGRAM_VERSIONS as readonly string[]).includes(version)
  ) {
    throw new Error(
      `Journey program "${version}" is a legacy ladder program and can no longer be evaluated. ` +
        `Set JOURNEY_PROGRAM_VERSION=${JOURNEY_PROGRAM_2026_09.version}; existing ${version} ` +
        `achievements and claims are honoured through the supersession map.`,
    );
  }

  throw new Error(
    `Unknown Journey program version "${version}". Known: ${Object.keys(PROGRAMS).join(", ")}`,
  );
}

// ── Queries over the graph ──────────────────────────────────────────────────

/** The nodes a workspace of this type can see at all. */
export function journeyNodes(
  program: JourneyProgramDef,
  workspaceType: JourneyWorkspaceType,
): readonly JourneyNodeDef[] {
  return program.nodes.filter((node) => node.appliesTo.includes(workspaceType));
}

/** The tracks a workspace of this type can see at all, in column order. */
export function journeyTracks(
  program: JourneyProgramDef,
  workspaceType: JourneyWorkspaceType,
): readonly JourneyTrackDef[] {
  return [...program.tracks]
    .filter((track) => track.appliesTo.includes(workspaceType))
    .sort((a, b) => a.order - b.order);
}

export function findNode(
  program: JourneyProgramDef,
  nodeId: string,
): JourneyNodeDef | undefined {
  return program.nodes.find((node) => node.id === nodeId);
}

export function findTrack(
  program: JourneyProgramDef,
  trackId: JourneyTrackId,
): JourneyTrackDef | undefined {
  return program.tracks.find((track) => track.id === trackId);
}

/** What this node unlocks: the visible nodes that name it as a dependency. */
export function nodeUnlocks(
  program: JourneyProgramDef,
  workspaceType: JourneyWorkspaceType,
  nodeId: string,
): string[] {
  return journeyNodes(program, workspaceType)
    .filter((node) => node.dependsOn.includes(nodeId))
    .map((node) => node.id);
}

/**
 * Dependency depth: the longest path from any root to this node.
 *
 * The graph row coordinate. Longest rather than shortest so a node always
 * renders *below* everything it depends on, however many ways there are to
 * reach it. Memoised per call because the graph is walked once per request.
 */
export function nodeDepths(
  program: JourneyProgramDef,
  workspaceType: JourneyWorkspaceType,
): Map<string, number> {
  const nodes = journeyNodes(program, workspaceType);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const depths = new Map<string, number>();

  const resolve = (id: string, seen: ReadonlySet<string>): number => {
    const cached = depths.get(id);
    if (cached !== undefined) return cached;

    const node = byId.get(id);
    // A dependency outside this workspace's node set contributes no depth: the
    // invariant tests guarantee it is not a *blocking* dependency either.
    if (!node) return -1;
    // Defensive only — `journey.program.spec.ts` proves the graph is acyclic.
    if (seen.has(id)) return 0;

    const nextSeen = new Set(seen).add(id);
    const depth = node.dependsOn.length
      ? Math.max(0, ...node.dependsOn.map((dep) => resolve(dep, nextSeen) + 1))
      : 0;

    depths.set(id, depth);
    return depth;
  };

  for (const node of nodes) resolve(node.id, new Set());
  return depths;
}

// ── Reward totals ───────────────────────────────────────────────────────────

/**
 * Total cents a workspace of this type can earn across the whole graph.
 *
 * Frozen at the v2 ladder totals ($20 personal, $37 organization) and asserted
 * by `journey.program.spec.ts`. Journey *completion* is a separate concept: a
 * workspace can finish the Journey without earning every cent, and can earn
 * every cent of a track it completes without finishing the Journey.
 */
export function programTotalCents(
  program: JourneyProgramDef,
  workspaceType: JourneyWorkspaceType,
): number {
  return journeyNodes(program, workspaceType).reduce(
    (sum, node) => sum + node.rewardCents[workspaceType],
    0,
  );
}

/** Node ids named by any track's completion rule, for the invariant tests. */
export function programCompletionNodeIds(
  program: JourneyProgramDef,
): readonly string[] {
  return program.tracks.flatMap((track) =>
    completionRuleNodeIds(track.completion),
  );
}

/**
 * The nodes of a track that can contribute to completing it: the ids its
 * completion rule names, plus their dependencies *within the same track*.
 *
 * This is the definition of "not a bonus node", and `journey.program.spec.ts`
 * asserts every node's `optional` flag against it. Deriving the answer rather
 * than trusting the flag is what stops the two drifting apart the first time
 * someone adds a node and forgets which it is.
 *
 * Cross-track dependencies are excluded on purpose: `automation.breadth`
 * depending on `core.scale` does not make `core.scale` part of the Automation
 * track.
 */
export function trackCompletionPath(
  program: JourneyProgramDef,
  trackId: JourneyTrackId,
): ReadonlySet<string> {
  const track = findTrack(program, trackId);
  if (!track) return new Set();

  const inTrack = new Map(
    program.nodes
      .filter((node) => node.track === trackId)
      .map((node) => [node.id, node]),
  );

  const path = new Set<string>();
  const walk = (nodeId: string) => {
    if (path.has(nodeId)) return;
    const node = inTrack.get(nodeId);
    if (!node) return;
    path.add(nodeId);
    for (const dependency of node.dependsOn) walk(dependency);
  };

  for (const nodeId of completionRuleNodeIds(track.completion)) walk(nodeId);
  return path;
}
