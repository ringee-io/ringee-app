/**
 * Reading v2 history into the v3 graph.
 *
 * Journey v2 (`2026.08`) was a linear ladder of 11 stages. Its achievements and
 * claims are **never migrated, mutated or deleted** — they stay exactly as they
 * were recorded, and this module is the read-only lens that answers two
 * questions about them:
 *
 * 1. Which v3 nodes should a workspace be credited with, given what it already
 *    earned under the ladder? (`achievementNodeIds`)
 * 2. Which single v3 node, if any, already had its money paid out under the
 *    ladder? (`rewardNodeId`)
 *
 * The second question is the one with teeth. A v2 stage often maps to several
 * v3 nodes — `foundation` became `core.setup` *and* `core.first_call` — and if
 * every mapped node inherited the paid state, or worse, none did, the program
 * would either pay twice or pay again for work already bought. So the mapping
 * is deliberately asymmetric:
 *
 * - **achievements fan out**: all mapped nodes inherit progress, which is what
 *   keeps dependency chains intact — crediting `ai.insights` without
 *   `ai.transcription` would leave it rendered as locked forever;
 * - **money does not**: at most one node per legacy stage inherits the paid
 *   state, and it is the node whose reward the v2 amount actually covered.
 *
 * The remaining fan-out nodes inherit progress *only*. If such a node happens
 * to carry a v3 reward of its own, that reward is reported as **already covered
 * by the legacy payment** rather than claimable — the workspace was paid once
 * for that rung of the ladder and must not be paid again because v3 split the
 * rung in two. `journey.legacy.spec.ts` proves no paid node escapes one of the
 * two buckets.
 */

export interface JourneyLegacySupersession {
  legacyProgramVersion: string;
  legacyStageId: string;
  /** Every v3 node this legacy stage should count as achieved. */
  achievementNodeIds: readonly string[];
  /**
   * The one v3 node whose reward the legacy stage already paid for. Absent when
   * the legacy stage carried no reward (the v2 entry rungs paid nothing).
   */
  rewardNodeId?: string;
}

/**
 * The `2026.08` → `2026.09` map.
 *
 * `rewardNodeId` is present exactly where the v2 stage had `rewardCents > 0`,
 * and points at the v3 node that inherited that stage's reward. Where a v2
 * stage split across several v3 nodes, the reward follows the node that kept
 * the *meaning* of the stage, and the others inherit progress only.
 */
export const JOURNEY_LEGACY_SUPERSESSIONS: readonly JourneyLegacySupersession[] =
  [
    // ── Personal ladder ──────────────────────────────────────────────────────
    {
      // Split: setup and the first call became separate nodes. Neither paid
      // under v2 and neither pays under v3, so there is no reward to inherit.
      legacyProgramVersion: "2026.08",
      legacyStageId: "foundation",
      achievementNodeIds: ["core.setup", "core.first_call"],
    },
    {
      legacyProgramVersion: "2026.08",
      legacyStageId: "consistent_caller",
      achievementNodeIds: ["core.rhythm"],
      rewardNodeId: "core.rhythm",
    },
    {
      // v2's "connected operator" bundled outcome discipline with CRM syncs.
      // v3 splits them; the reward follows the integration node, because that
      // is what the $5 was buying. `core.discipline` inherits progress only and
      // remains separately claimable on its own v3 terms.
      legacyProgramVersion: "2026.08",
      legacyStageId: "connected_operator",
      achievementNodeIds: ["core.discipline", "integrations.crm"],
      rewardNodeId: "integrations.crm",
    },
    {
      legacyProgramVersion: "2026.08",
      legacyStageId: "ai_closer",
      achievementNodeIds: ["ai.transcription", "ai.insights"],
      rewardNodeId: "ai.insights",
    },
    {
      legacyProgramVersion: "2026.08",
      legacyStageId: "agentic_operator",
      achievementNodeIds: ["automation.agents", "automation.breadth"],
      rewardNodeId: "automation.agents",
    },

    // ── Organization ladder ──────────────────────────────────────────────────
    {
      legacyProgramVersion: "2026.08",
      legacyStageId: "workspace_ready",
      achievementNodeIds: ["core.setup", "core.first_call"],
    },
    {
      legacyProgramVersion: "2026.08",
      legacyStageId: "team_activated",
      achievementNodeIds: ["team.joined", "team.calling"],
      rewardNodeId: "team.calling",
    },
    {
      legacyProgramVersion: "2026.08",
      legacyStageId: "campaign_operator",
      achievementNodeIds: ["campaigns.first", "campaigns.pipeline"],
      rewardNodeId: "campaigns.first",
    },
    {
      legacyProgramVersion: "2026.08",
      legacyStageId: "connected_sales_operation",
      achievementNodeIds: ["core.discipline", "integrations.connected"],
      rewardNodeId: "integrations.connected",
    },
    {
      legacyProgramVersion: "2026.08",
      legacyStageId: "ai_sales_team",
      achievementNodeIds: [
        "ai.transcription",
        "ai.insights",
        "ai.team_adoption",
      ],
      rewardNodeId: "ai.team_adoption",
    },
    {
      legacyProgramVersion: "2026.08",
      legacyStageId: "advanced_operation",
      achievementNodeIds: ["core.scale", "automation.breadth"],
      rewardNodeId: "automation.breadth",
    },
  ];

/** One legacy achievement, as the service reads it out of the database. */
export interface JourneyLegacyAchievementRecord {
  programVersion: string;
  stageId: string;
  achievedAt: Date;
}

/** One legacy claim, as the service reads it out of the database. */
export interface JourneyLegacyClaimRecord {
  programVersion: string;
  stageId: string;
  /** `claimed` is the only status that means money actually moved. */
  status: string;
  amountCents: number;
  claimedAt: Date | null;
}

export interface JourneyLegacyNodeCredit {
  /** Nodes to treat as achieved, with the real timestamp of the legacy row. */
  achievedAt: Map<string, Date>;
  /**
   * Nodes whose reward was already settled under a previous program version.
   * These can never be claimed again — not "claimable", not "locked", but
   * explicitly already redeemed, with the original date.
   */
  alreadyPaid: Map<string, JourneyLegacyPayment>;
  /**
   * The other nodes a *paid* legacy stage fanned out to.
   *
   * They are achieved, but their v3 reward is already covered by the legacy
   * payment recorded against their sibling. Without this bucket, splitting one
   * v2 rung into two v3 nodes would quietly pay for the same work twice.
   */
  rewardCoveredByLegacy: Map<string, JourneyLegacyPayment>;
}

export interface JourneyLegacyPayment {
  legacyProgramVersion: string;
  legacyStageId: string;
  amountCents: number;
  /** The original settlement date. Never synthesised. */
  claimedAt: Date | null;
}

/**
 * Projects legacy achievements and claims onto v3 nodes.
 *
 * Rules, in the order they matter:
 *
 * 1. A legacy achievement credits **every** node in `achievementNodeIds`.
 * 2. The earliest legacy timestamp wins when two stages map to the same node,
 *    because that is when the workspace actually did the work.
 * 3. Only a legacy claim with status `claimed` blocks a v3 payout. A pending,
 *    rejected or revoked legacy claim never moved money and so never blocks
 *    anything — the workspace can still earn the v3 reward normally.
 * 4. A paid legacy stage blocks `rewardNodeId` directly (`alreadyPaid`) and
 *    every other node it fanned out to indirectly (`rewardCoveredByLegacy`).
 * 5. Nothing here writes. The caller decides what to persist, and legacy rows
 *    are never touched.
 */
export function projectLegacyCredit(
  achievements: readonly JourneyLegacyAchievementRecord[],
  claims: readonly JourneyLegacyClaimRecord[],
  currentProgramVersion: string,
  supersessions: readonly JourneyLegacySupersession[] = JOURNEY_LEGACY_SUPERSESSIONS,
): JourneyLegacyNodeCredit {
  const achievedAt = new Map<string, Date>();
  const alreadyPaid = new Map<string, JourneyLegacyPayment>();
  const rewardCoveredByLegacy = new Map<string, JourneyLegacyPayment>();

  const lookup = new Map<string, JourneyLegacySupersession>();
  for (const entry of supersessions) {
    // Guard against a map that supersedes the running program into itself,
    // which would let a v3 claim mark its own node as already paid.
    if (entry.legacyProgramVersion === currentProgramVersion) continue;
    lookup.set(`${entry.legacyProgramVersion}:${entry.legacyStageId}`, entry);
  }

  for (const achievement of achievements) {
    if (achievement.programVersion === currentProgramVersion) continue;
    const entry = lookup.get(
      `${achievement.programVersion}:${achievement.stageId}`,
    );
    if (!entry) continue;

    for (const nodeId of entry.achievementNodeIds) {
      const existing = achievedAt.get(nodeId);
      // Earliest real timestamp wins. Never `new Date()` — a synthesised
      // "achieved today" would misdate history that already happened.
      if (!existing || achievement.achievedAt < existing) {
        achievedAt.set(nodeId, achievement.achievedAt);
      }
    }
  }

  for (const claim of claims) {
    if (claim.programVersion === currentProgramVersion) continue;
    if (claim.status !== "claimed") continue;

    const entry = lookup.get(`${claim.programVersion}:${claim.stageId}`);
    if (!entry?.rewardNodeId) continue;

    const payment: JourneyLegacyPayment = {
      legacyProgramVersion: claim.programVersion,
      legacyStageId: claim.stageId,
      amountCents: claim.amountCents,
      claimedAt: claim.claimedAt,
    };

    // Two legacy stages mapping their reward onto one node would be a program
    // bug (the spec forbids it); if it ever happened, the first payment wins so
    // the amount reported is never inflated.
    if (!alreadyPaid.has(entry.rewardNodeId)) {
      alreadyPaid.set(entry.rewardNodeId, payment);
    }

    // The rest of the fan-out: achieved, but their money is spent.
    for (const nodeId of entry.achievementNodeIds) {
      if (nodeId === entry.rewardNodeId) continue;
      if (!rewardCoveredByLegacy.has(nodeId)) {
        rewardCoveredByLegacy.set(nodeId, payment);
      }
    }
  }

  // A node that is a reward target in its own right is never also "covered":
  // the direct record carries the amount and the date, which is the more
  // specific truth.
  for (const nodeId of alreadyPaid.keys()) {
    rewardCoveredByLegacy.delete(nodeId);
  }

  return { achievedAt, alreadyPaid, rewardCoveredByLegacy };
}

/** Every legacy program version this map can read. */
export function legacyProgramVersions(
  supersessions: readonly JourneyLegacySupersession[] = JOURNEY_LEGACY_SUPERSESSIONS,
): string[] {
  return [...new Set(supersessions.map((entry) => entry.legacyProgramVersion))];
}
