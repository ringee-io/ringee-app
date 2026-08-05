#!/usr/bin/env node
/**
 * `pnpm journey:analyze` — historical calibration for the Ringee Journey.
 *
 * READ-ONLY. This script issues nothing but `SELECT`s and refuses to run if it
 * is ever asked to do otherwise. It exists to answer the question the thresholds
 * in `journey.program.ts` cannot answer on their own: *what would this program
 * actually have cost, and does reaching a stage correlate with retention or
 * revenue?*
 *
 * It prints no PII — no phone number, e-mail, contact name or transcript. Every
 * output is a count, a percentile, a rate or a currency total.
 *
 *   pnpm journey:analyze --from 2026-01-01 --to 2026-08-01 \
 *     --workspace-type organization --format table
 *
 * Flags:
 *   --from <ISO date>          window start (default: 180 days ago)
 *   --to <ISO date>            window end (default: today)
 *   --workspace-type <t>       personal | organization | all (default: all)
 *   --cohort <YYYY-MM|YYYY-Qn> restrict to workspaces created in this cohort
 *   --rule-version <v>         program version to evaluate (default: active)
 *   --format <f>               table | json | csv (default: table)
 *   --dry-run                  parse and report the plan without querying
 *   --fixtures                 run against the bundled synthetic dataset
 *   --limit <n>                cap workspaces scanned (default: 5000)
 *
 * NOTE: the thresholds this script is meant to calibrate have NOT yet been
 * validated against production data. Until this has been run against a real
 * database, treat every number in `journey.program.ts` as provisional.
 */

import { PrismaClient } from "@prisma/client";

// ── Argument parsing ─────────────────────────────────────────────────────────

interface Options {
  from: Date;
  to: Date;
  workspaceType: "personal" | "organization" | "all";
  cohort: string | null;
  ruleVersion: string;
  format: "table" | "json" | "csv";
  dryRun: boolean;
  fixtures: boolean;
  limit: number;
}

function parseArgs(argv: string[]): Options {
  const get = (name: string): string | undefined => {
    const index = argv.indexOf(`--${name}`);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const has = (name: string) => argv.includes(`--${name}`);

  const to = get("to") ? new Date(get("to") as string) : new Date();
  const from = get("from")
    ? new Date(get("from") as string)
    : new Date(to.getTime() - 180 * 86_400_000);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new Error("--from/--to must be ISO dates, e.g. 2026-01-01");
  }
  if (from >= to) throw new Error("--from must be before --to");

  const workspaceType = (get("workspace-type") ??
    "all") as Options["workspaceType"];
  if (!["personal", "organization", "all"].includes(workspaceType)) {
    throw new Error("--workspace-type must be personal | organization | all");
  }

  const format = (get("format") ?? "table") as Options["format"];
  if (!["table", "json", "csv"].includes(format)) {
    throw new Error("--format must be table | json | csv");
  }

  return {
    from,
    to,
    workspaceType,
    cohort: get("cohort") ?? null,
    ruleVersion:
      get("rule-version") ?? process.env.JOURNEY_PROGRAM_VERSION ?? "2026.08",
    format,
    dryRun: has("dry-run"),
    fixtures: has("fixtures"),
    limit: Number(get("limit") ?? 5000),
  };
}

// ── Statistics ───────────────────────────────────────────────────────────────

/** Nearest-rank percentile. Deterministic and dependency-free. */
function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(Math.max(rank, 1), sorted.length) - 1];
}

interface Distribution {
  n: number;
  mean: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
}

function distribution(values: number[]): Distribution {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    n: sorted.length,
    mean: sorted.length
      ? Number((sorted.reduce((a, b) => a + b, 0) / sorted.length).toFixed(2))
      : 0,
    p25: percentile(sorted, 25),
    p50: percentile(sorted, 50),
    p75: percentile(sorted, 75),
    p90: percentile(sorted, 90),
    p95: percentile(sorted, 95),
  };
}

/**
 * Wilson score interval for a proportion.
 *
 * Reported alongside every rate so a "80 % retention" computed over five
 * workspaces is visibly not the same claim as one computed over five hundred.
 */
function wilson(successes: number, total: number): [number, number] {
  if (total === 0) return [0, 0];
  const z = 1.96;
  const p = successes / total;
  const denom = 1 + (z * z) / total;
  const centre = p + (z * z) / (2 * total);
  const spread =
    z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total));
  return [
    Number(Math.max(0, (centre - spread) / denom).toFixed(4)),
    Number(Math.min(1, (centre + spread) / denom).toFixed(4)),
  ];
}

// ── Data model ───────────────────────────────────────────────────────────────

interface WorkspaceRow {
  workspaceType: "personal" | "organization";
  workspaceId: string;
  createdAt: Date;
  connectedCalls: number;
  connectedMinutes: number;
  activeDays: number;
  uniqueDestinations: number;
  activeMembers: number;
  campaignCalls: number;
  integrationSuccesses: number;
  transcriptions: number;
  aiResults: number;
  mcpCalls: number;
  /** Retention: a connected call in the D7 / D30 / D60 window after signup. */
  retainedD7: boolean;
  retainedD30: boolean;
  retainedD60: boolean;
  /** Commercial: any completed credit top-up after signup. */
  purchased: boolean;
  repurchased: boolean;
  revenueUsd: number;
}

/**
 * One wide query per workspace type.
 *
 * Mirrors the live predicates in `journey.repository.ts`; if one changes the
 * other must too, which is why both spell the predicate out rather than sharing
 * a clever abstraction across the package boundary.
 */
async function loadWorkspaces(
  prisma: PrismaClient,
  options: Options,
): Promise<WorkspaceRow[]> {
  const minSeconds = Number(process.env.JOURNEY_MIN_CONNECTED_SECONDS ?? 20);

  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `
    WITH connected AS (
      SELECT c."id", c."userId", c."organizationId", c."toNumber",
             c."startedAt", c."durationSeconds", c."source", c."outcome"
      FROM "Call" c
      WHERE c."startedAt" BETWEEN $1 AND $2
        AND (c."direction" IS NULL OR c."direction" = 'outbound')
        AND c."status" IN ('completed','recording','answered')
        AND c."answeredAt" IS NOT NULL
        AND c."endedAt" IS NOT NULL
        AND c."providerCallId" IS NOT NULL
        AND COALESCE(c."durationSeconds",0) >= $3
        AND (c."outcome" IS NULL OR c."outcome"::text NOT IN ('no_answer','voicemail','wrong_number'))
    ),
    workspaces AS (
      SELECT 'organization'::text AS "workspaceType", o."id" AS "workspaceId", o."createdAt"
      FROM "Organization" o
      UNION ALL
      SELECT 'personal'::text, u."id", u."createdAt" FROM "User" u
    )
    SELECT w."workspaceType", w."workspaceId", w."createdAt",
      (SELECT COUNT(*) FROM connected n
        WHERE (w."workspaceType" = 'organization' AND n."organizationId" = w."workspaceId"::uuid)
           OR (w."workspaceType" = 'personal' AND n."userId" = w."workspaceId"::uuid AND n."organizationId" IS NULL)
      )::int AS "connectedCalls",
      (SELECT FLOOR(COALESCE(SUM(n."durationSeconds"),0)/60.0) FROM connected n
        WHERE (w."workspaceType" = 'organization' AND n."organizationId" = w."workspaceId"::uuid)
           OR (w."workspaceType" = 'personal' AND n."userId" = w."workspaceId"::uuid AND n."organizationId" IS NULL)
      )::int AS "connectedMinutes",
      (SELECT COUNT(DISTINCT date_trunc('day', n."startedAt")) FROM connected n
        WHERE (w."workspaceType" = 'organization' AND n."organizationId" = w."workspaceId"::uuid)
           OR (w."workspaceType" = 'personal' AND n."userId" = w."workspaceId"::uuid AND n."organizationId" IS NULL)
      )::int AS "activeDays",
      (SELECT COUNT(DISTINCT n."toNumber") FROM connected n
        WHERE (w."workspaceType" = 'organization' AND n."organizationId" = w."workspaceId"::uuid)
           OR (w."workspaceType" = 'personal' AND n."userId" = w."workspaceId"::uuid AND n."organizationId" IS NULL)
      )::int AS "uniqueDestinations",
      (SELECT COUNT(DISTINCT n."userId") FROM connected n
        WHERE (w."workspaceType" = 'organization' AND n."organizationId" = w."workspaceId"::uuid)
           OR (w."workspaceType" = 'personal' AND n."userId" = w."workspaceId"::uuid AND n."organizationId" IS NULL)
      )::int AS "activeMembers",
      (SELECT COUNT(DISTINCT n."id") FROM connected n
        JOIN "CallAttempt" a ON a."callId" = n."id"
        WHERE (w."workspaceType" = 'organization' AND n."organizationId" = w."workspaceId"::uuid)
           OR (w."workspaceType" = 'personal' AND n."userId" = w."workspaceId"::uuid AND n."organizationId" IS NULL)
      )::int AS "campaignCalls",
      (SELECT COUNT(*) FROM "CrmCallSync" s JOIN connected n ON n."id" = s."callId"
        WHERE s."status" = 'done'
          AND ((w."workspaceType" = 'organization' AND n."organizationId" = w."workspaceId"::uuid)
            OR (w."workspaceType" = 'personal' AND n."userId" = w."workspaceId"::uuid AND n."organizationId" IS NULL))
      )::int AS "integrationSuccesses",
      (SELECT COUNT(*) FROM "CallTranscription" t JOIN connected n ON n."id" = t."callId"
        WHERE t."status" = 'completed' AND COALESCE(t."text",'') <> ''
          AND ((w."workspaceType" = 'organization' AND n."organizationId" = w."workspaceId"::uuid)
            OR (w."workspaceType" = 'personal' AND n."userId" = w."workspaceId"::uuid AND n."organizationId" IS NULL))
      )::int AS "transcriptions",
      (SELECT COUNT(*) FROM "AiPipelineRun" r
        WHERE r."status" = 'completed' AND r."resultJson" IS NOT NULL
          AND r."contextKey" IN (
            SELECT a."contextKey" FROM "AiPipelineActivation" a
            WHERE (w."workspaceType" = 'organization' AND a."organizationId" = w."workspaceId"::uuid)
               OR (w."workspaceType" = 'personal' AND a."userId" = w."workspaceId"::uuid)
          )
      )::int AS "aiResults",
      (SELECT COUNT(DISTINCT n."id") FROM connected n
        JOIN "CallSessionItem" i ON i."callId" = n."id"
        JOIN "CallSession" s ON s."id" = i."callSessionId"
        WHERE s."source" = 'mcp'
          AND ((w."workspaceType" = 'organization' AND n."organizationId" = w."workspaceId"::uuid)
            OR (w."workspaceType" = 'personal' AND n."userId" = w."workspaceId"::uuid AND n."organizationId" IS NULL))
      )::int AS "mcpCalls",
      (SELECT COUNT(*) FROM "CreditTopup" p
        WHERE p."status" = 'completed' AND p."source" IS DISTINCT FROM 'journey_reward'
          AND ((w."workspaceType" = 'organization' AND p."organizationId" = w."workspaceId"::uuid)
            OR (w."workspaceType" = 'personal' AND p."userId" = w."workspaceId"::uuid AND p."organizationId" IS NULL))
      )::int AS "purchases",
      (SELECT COALESCE(SUM(p."amount"),0) FROM "CreditTopup" p
        WHERE p."status" = 'completed' AND p."source" IS DISTINCT FROM 'journey_reward'
          AND ((w."workspaceType" = 'organization' AND p."organizationId" = w."workspaceId"::uuid)
            OR (w."workspaceType" = 'personal' AND p."userId" = w."workspaceId"::uuid AND p."organizationId" IS NULL))
      )::float AS "revenueUsd",
      (SELECT COUNT(*) FROM connected n
        WHERE n."startedAt" <= w."createdAt" + INTERVAL '7 days'
          AND n."startedAt" >= w."createdAt"
          AND ((w."workspaceType" = 'organization' AND n."organizationId" = w."workspaceId"::uuid)
            OR (w."workspaceType" = 'personal' AND n."userId" = w."workspaceId"::uuid AND n."organizationId" IS NULL))
      )::int AS "d7Calls",
      (SELECT COUNT(*) FROM connected n
        WHERE n."startedAt" BETWEEN w."createdAt" + INTERVAL '23 days' AND w."createdAt" + INTERVAL '30 days'
          AND ((w."workspaceType" = 'organization' AND n."organizationId" = w."workspaceId"::uuid)
            OR (w."workspaceType" = 'personal' AND n."userId" = w."workspaceId"::uuid AND n."organizationId" IS NULL))
      )::int AS "d30Calls",
      (SELECT COUNT(*) FROM connected n
        WHERE n."startedAt" BETWEEN w."createdAt" + INTERVAL '53 days' AND w."createdAt" + INTERVAL '60 days'
          AND ((w."workspaceType" = 'organization' AND n."organizationId" = w."workspaceId"::uuid)
            OR (w."workspaceType" = 'personal' AND n."userId" = w."workspaceId"::uuid AND n."organizationId" IS NULL))
      )::int AS "d60Calls"
    FROM workspaces w
    WHERE w."createdAt" <= $2
      AND ($4::text = 'all' OR w."workspaceType" = $4::text)
    ORDER BY w."createdAt" DESC
    LIMIT $5
    `,
    options.from,
    options.to,
    minSeconds,
    options.workspaceType,
    options.limit,
  );

  return rows.map((row) => ({
    workspaceType: row.workspaceType as "personal" | "organization",
    workspaceId: String(row.workspaceId),
    createdAt: new Date(row.createdAt as string),
    connectedCalls: Number(row.connectedCalls ?? 0),
    connectedMinutes: Number(row.connectedMinutes ?? 0),
    activeDays: Number(row.activeDays ?? 0),
    uniqueDestinations: Number(row.uniqueDestinations ?? 0),
    activeMembers: Number(row.activeMembers ?? 0),
    campaignCalls: Number(row.campaignCalls ?? 0),
    integrationSuccesses: Number(row.integrationSuccesses ?? 0),
    transcriptions: Number(row.transcriptions ?? 0),
    aiResults: Number(row.aiResults ?? 0),
    mcpCalls: Number(row.mcpCalls ?? 0),
    retainedD7: Number(row.d7Calls ?? 0) > 0,
    retainedD30: Number(row.d30Calls ?? 0) > 0,
    retainedD60: Number(row.d60Calls ?? 0) > 0,
    purchased: Number(row.purchases ?? 0) > 0,
    repurchased: Number(row.purchases ?? 0) > 1,
    revenueUsd: Number(row.revenueUsd ?? 0),
  }));
}

// ── Stage simulation ─────────────────────────────────────────────────────────

/**
 * Ladder thresholds, mirrored from `journey.program.ts`.
 *
 * Duplicated here on purpose: this package cannot import `@ringee/services`
 * (that would be a dependency cycle), and the script must be able to evaluate
 * an *older* rule version than the one currently deployed.
 */
const LADDERS: Record<
  string,
  Array<{ id: string; rewardCents: number; test: (w: WorkspaceRow) => boolean }>
> = {
  personal: [
    { id: "foundation", rewardCents: 0, test: (w) => w.connectedCalls >= 1 },
    {
      id: "consistent_caller",
      rewardCents: 300,
      test: (w) =>
        w.connectedCalls >= 15 &&
        w.activeDays >= 4 &&
        w.uniqueDestinations >= 10 &&
        w.connectedMinutes >= 20,
    },
    {
      id: "connected_operator",
      rewardCents: 500,
      test: (w) => w.integrationSuccesses >= 5 && w.connectedCalls >= 25,
    },
    {
      id: "ai_closer",
      rewardCents: 500,
      test: (w) =>
        w.transcriptions >= 10 && w.aiResults >= 1 && w.connectedCalls >= 40,
    },
    {
      id: "agentic_operator",
      rewardCents: 700,
      test: (w) => w.mcpCalls >= 5 && w.connectedCalls >= 40,
    },
  ],
  organization: [
    {
      id: "workspace_ready",
      rewardCents: 0,
      test: (w) => w.connectedCalls >= 1,
    },
    {
      id: "team_activated",
      rewardCents: 300,
      test: (w) =>
        w.activeMembers >= 2 && w.connectedCalls >= 25 && w.activeDays >= 5,
    },
    {
      id: "campaign_operator",
      rewardCents: 500,
      test: (w) => w.campaignCalls >= 25,
    },
    {
      id: "connected_sales_operation",
      rewardCents: 700,
      test: (w) => w.integrationSuccesses >= 15 && w.connectedCalls >= 60,
    },
    {
      id: "ai_sales_team",
      rewardCents: 1000,
      test: (w) =>
        w.transcriptions >= 25 && w.aiResults >= 2 && w.connectedCalls >= 100,
    },
    {
      id: "advanced_operation",
      rewardCents: 1200,
      test: (w) => w.activeMembers >= 3 && w.connectedCalls >= 200,
    },
  ],
};

/** Sequential, exactly like the live evaluator: stop at the first unmet stage. */
function reachedStages(workspace: WorkspaceRow): string[] {
  const ladder = LADDERS[workspace.workspaceType];
  const reached: string[] = [];
  for (const stage of ladder) {
    if (!stage.test(workspace)) break;
    reached.push(stage.id);
  }
  return reached;
}

// ── Report ───────────────────────────────────────────────────────────────────

interface StageReport {
  stageId: string;
  workspaceType: string;
  reached: number;
  reachedPct: number;
  reachedPctCi: [number, number];
  rewardCents: number;
  totalGrantedCents: number;
  dropOffFromPreviousPct: number;
  retentionD30Reached: number;
  retentionD30NotReached: number;
  retentionD30Ci: [number, number];
  purchaseRateReached: number;
  purchaseRateNotReached: number;
  revenueReachedUsd: number;
}

function buildReport(workspaces: WorkspaceRow[], options: Options) {
  const byType = ["personal", "organization"].filter(
    (type) => options.workspaceType === "all" || options.workspaceType === type,
  );

  const stages: StageReport[] = [];
  const metricDistributions: Record<string, Distribution> = {};
  let totalGrantedCents = 0;

  for (const type of byType) {
    const cohort = workspaces.filter((w) => w.workspaceType === type);
    if (!cohort.length) continue;

    for (const metric of [
      "connectedCalls",
      "connectedMinutes",
      "activeDays",
      "uniqueDestinations",
      "activeMembers",
      "campaignCalls",
      "integrationSuccesses",
      "transcriptions",
      "aiResults",
      "mcpCalls",
    ] as const) {
      metricDistributions[`${type}.${metric}`] = distribution(
        cohort.map((w) => w[metric]),
      );
    }

    const reachedSets = cohort.map(reachedStages);
    let previousReached = cohort.length;

    for (const stage of LADDERS[type]) {
      const reachedWorkspaces = cohort.filter((_, index) =>
        reachedSets[index].includes(stage.id),
      );
      const notReached = cohort.filter(
        (_, index) => !reachedSets[index].includes(stage.id),
      );
      const reached = reachedWorkspaces.length;
      const granted = reached * stage.rewardCents;
      totalGrantedCents += granted;

      const rate = (
        rows: WorkspaceRow[],
        pick: (w: WorkspaceRow) => boolean,
      ) =>
        rows.length
          ? Number((rows.filter(pick).length / rows.length).toFixed(4))
          : 0;

      stages.push({
        stageId: stage.id,
        workspaceType: type,
        reached,
        reachedPct: Number((reached / cohort.length).toFixed(4)),
        reachedPctCi: wilson(reached, cohort.length),
        rewardCents: stage.rewardCents,
        totalGrantedCents: granted,
        dropOffFromPreviousPct: previousReached
          ? Number((1 - reached / previousReached).toFixed(4))
          : 0,
        retentionD30Reached: rate(reachedWorkspaces, (w) => w.retainedD30),
        retentionD30NotReached: rate(notReached, (w) => w.retainedD30),
        retentionD30Ci: wilson(
          reachedWorkspaces.filter((w) => w.retainedD30).length,
          reachedWorkspaces.length,
        ),
        purchaseRateReached: rate(reachedWorkspaces, (w) => w.purchased),
        purchaseRateNotReached: rate(notReached, (w) => w.purchased),
        revenueReachedUsd: Number(
          reachedWorkspaces
            .reduce((sum, w) => sum + w.revenueUsd, 0)
            .toFixed(2),
        ),
      });

      previousReached = reached;
    }
  }

  const revenue = workspaces.reduce((sum, w) => sum + w.revenueUsd, 0);
  // Reward credit is spent on calls, so its cost to Ringee is the wholesale
  // carrier cost, not the face value. CALL_PROFIT_MARGIN is the retail markup.
  const margin = Number(process.env.CALL_PROFIT_MARGIN ?? 1.5);
  const wholesaleCostUsd = totalGrantedCents / 100 / Math.max(margin, 1);

  return {
    meta: {
      from: options.from.toISOString().slice(0, 10),
      to: options.to.toISOString().slice(0, 10),
      workspaceType: options.workspaceType,
      cohort: options.cohort,
      ruleVersion: options.ruleVersion,
      workspacesScanned: workspaces.length,
      generatedAt: new Date().toISOString(),
      thresholdsValidated: false,
    },
    metricDistributions,
    stages,
    economics: {
      totalGrantedCents,
      totalGrantedUsd: Number((totalGrantedCents / 100).toFixed(2)),
      estimatedWholesaleCostUsd: Number(wholesaleCostUsd.toFixed(2)),
      revenueFromScannedWorkspacesUsd: Number(revenue.toFixed(2)),
      rewardToRevenueRatio:
        revenue > 0
          ? Number((totalGrantedCents / 100 / revenue).toFixed(4))
          : null,
    },
    retention: {
      d7: rateWithCi(workspaces, (w) => w.retainedD7),
      d30: rateWithCi(workspaces, (w) => w.retainedD30),
      d60: rateWithCi(workspaces, (w) => w.retainedD60),
      firstPurchase: rateWithCi(workspaces, (w) => w.purchased),
      repurchase: rateWithCi(workspaces, (w) => w.repurchased),
    },
    abuseSignals: {
      // Cheap heuristics on the aggregate — the real model runs per claim.
      workspacesWithSingleDestination: workspaces.filter(
        (w) => w.connectedCalls >= 10 && w.uniqueDestinations <= 1,
      ).length,
      workspacesWithBurstOnly: workspaces.filter(
        (w) => w.connectedCalls >= 15 && w.activeDays <= 1,
      ).length,
    },
  };
}

function rateWithCi(
  rows: WorkspaceRow[],
  pick: (w: WorkspaceRow) => boolean,
): { rate: number; n: number; ci: [number, number] } {
  const successes = rows.filter(pick).length;
  return {
    rate: rows.length ? Number((successes / rows.length).toFixed(4)) : 0,
    n: rows.length,
    ci: wilson(successes, rows.length),
  };
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

/**
 * A synthetic cohort so the whole pipeline runs in CI without a database.
 * Deterministic — no randomness, so the output is a stable regression target.
 */
function fixtureWorkspaces(): WorkspaceRow[] {
  const base = new Date("2026-01-01T00:00:00Z");
  const make = (
    index: number,
    type: "personal" | "organization",
    overrides: Partial<WorkspaceRow>,
  ): WorkspaceRow => ({
    workspaceType: type,
    workspaceId: `${type}-${index}`,
    createdAt: new Date(base.getTime() + index * 86_400_000),
    connectedCalls: 0,
    connectedMinutes: 0,
    activeDays: 0,
    uniqueDestinations: 0,
    activeMembers: 0,
    campaignCalls: 0,
    integrationSuccesses: 0,
    transcriptions: 0,
    aiResults: 0,
    mcpCalls: 0,
    retainedD7: false,
    retainedD30: false,
    retainedD60: false,
    purchased: false,
    repurchased: false,
    revenueUsd: 0,
    ...overrides,
  });

  return [
    make(1, "personal", {}),
    make(2, "personal", {
      connectedCalls: 3,
      activeDays: 2,
      uniqueDestinations: 3,
      retainedD7: true,
    }),
    make(3, "personal", {
      connectedCalls: 30,
      connectedMinutes: 60,
      activeDays: 8,
      uniqueDestinations: 22,
      retainedD7: true,
      retainedD30: true,
      purchased: true,
      revenueUsd: 25,
    }),
    make(4, "personal", {
      connectedCalls: 60,
      connectedMinutes: 140,
      activeDays: 14,
      uniqueDestinations: 40,
      integrationSuccesses: 12,
      transcriptions: 20,
      aiResults: 3,
      retainedD7: true,
      retainedD30: true,
      retainedD60: true,
      purchased: true,
      repurchased: true,
      revenueUsd: 120,
    }),
    // The shape the anti-fraud model exists for: volume, one destination, one day.
    make(5, "personal", {
      connectedCalls: 40,
      connectedMinutes: 45,
      activeDays: 1,
      uniqueDestinations: 1,
    }),
    make(1, "organization", { connectedCalls: 2, activeMembers: 1 }),
    make(2, "organization", {
      connectedCalls: 45,
      connectedMinutes: 90,
      activeDays: 9,
      uniqueDestinations: 33,
      activeMembers: 3,
      campaignCalls: 30,
      retainedD7: true,
      retainedD30: true,
      purchased: true,
      revenueUsd: 200,
    }),
    make(3, "organization", {
      connectedCalls: 250,
      connectedMinutes: 700,
      activeDays: 30,
      uniqueDestinations: 180,
      activeMembers: 5,
      campaignCalls: 190,
      integrationSuccesses: 60,
      transcriptions: 90,
      aiResults: 8,
      mcpCalls: 12,
      retainedD7: true,
      retainedD30: true,
      retainedD60: true,
      purchased: true,
      repurchased: true,
      revenueUsd: 900,
    }),
  ];
}

// ── Output ───────────────────────────────────────────────────────────────────

function render(
  report: ReturnType<typeof buildReport>,
  format: Options["format"],
) {
  if (format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }

  if (format === "csv") {
    const header = [
      "workspaceType",
      "stageId",
      "reached",
      "reachedPct",
      "ciLow",
      "ciHigh",
      "rewardCents",
      "totalGrantedCents",
      "dropOffPct",
      "retentionD30Reached",
      "retentionD30NotReached",
      "purchaseRateReached",
      "purchaseRateNotReached",
      "revenueReachedUsd",
    ].join(",");
    const rows = report.stages.map((s) =>
      [
        s.workspaceType,
        s.stageId,
        s.reached,
        s.reachedPct,
        s.reachedPctCi[0],
        s.reachedPctCi[1],
        s.rewardCents,
        s.totalGrantedCents,
        s.dropOffFromPreviousPct,
        s.retentionD30Reached,
        s.retentionD30NotReached,
        s.purchaseRateReached,
        s.purchaseRateNotReached,
        s.revenueReachedUsd,
      ].join(","),
    );
    process.stdout.write(`${[header, ...rows].join("\n")}\n`);
    return;
  }

  const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
  const out: string[] = [];

  out.push("");
  out.push("Ringee Journey — historical calibration");
  out.push("=".repeat(72));
  out.push(
    `window ${report.meta.from} → ${report.meta.to} | type ${report.meta.workspaceType} | rules ${report.meta.ruleVersion}`,
  );
  out.push(`workspaces scanned: ${report.meta.workspacesScanned}`);
  out.push("");

  out.push("Stage funnel");
  out.push("-".repeat(72));
  out.push(
    [
      "type",
      "stage",
      "reached",
      "%",
      "95% CI",
      "drop",
      "D30 (y/n)",
      "buy (y/n)",
    ]
      .map((h, i) => h.padEnd([14, 26, 8, 7, 16, 7, 14, 14][i]))
      .join(""),
  );
  for (const stage of report.stages) {
    out.push(
      [
        stage.workspaceType.padEnd(14),
        stage.stageId.padEnd(26),
        String(stage.reached).padEnd(8),
        pct(stage.reachedPct).padEnd(7),
        `${pct(stage.reachedPctCi[0])}–${pct(stage.reachedPctCi[1])}`.padEnd(
          16,
        ),
        pct(stage.dropOffFromPreviousPct).padEnd(7),
        `${pct(stage.retentionD30Reached)}/${pct(stage.retentionD30NotReached)}`.padEnd(
          14,
        ),
        `${pct(stage.purchaseRateReached)}/${pct(stage.purchaseRateNotReached)}`.padEnd(
          14,
        ),
      ].join(""),
    );
  }

  out.push("");
  out.push("Metric distributions (p25 / p50 / p75 / p90 / p95)");
  out.push("-".repeat(72));
  for (const [key, dist] of Object.entries(report.metricDistributions)) {
    out.push(
      `${key.padEnd(40)} n=${String(dist.n).padEnd(6)} ${[dist.p25, dist.p50, dist.p75, dist.p90, dist.p95].join(" / ")}`,
    );
  }

  out.push("");
  out.push("Economics");
  out.push("-".repeat(72));
  out.push(
    `credit that would be granted   $${report.economics.totalGrantedUsd}`,
  );
  out.push(
    `estimated wholesale cost       $${report.economics.estimatedWholesaleCostUsd}`,
  );
  out.push(
    `revenue from these workspaces  $${report.economics.revenueFromScannedWorkspacesUsd}`,
  );
  out.push(
    `reward : revenue                ${report.economics.rewardToRevenueRatio ?? "n/a (no revenue in window)"}`,
  );

  out.push("");
  out.push("Retention (rate, n, 95% CI)");
  out.push("-".repeat(72));
  for (const [key, value] of Object.entries(report.retention)) {
    out.push(
      `${key.padEnd(16)} ${pct(value.rate).padEnd(8)} n=${String(value.n).padEnd(7)} ${pct(value.ci[0])}–${pct(value.ci[1])}`,
    );
  }

  out.push("");
  out.push("Possible abuse patterns");
  out.push("-".repeat(72));
  out.push(
    `≥10 connected calls to ≤1 destination : ${report.abuseSignals.workspacesWithSingleDestination}`,
  );
  out.push(
    `≥15 connected calls on ≤1 day         : ${report.abuseSignals.workspacesWithBurstOnly}`,
  );

  out.push("");
  out.push(
    "NOTE: correlation is not causation. Workspaces that reach a stage differ",
  );
  out.push(
    "from those that do not in ways this report does not control for. Use the",
  );
  out.push("holdout group to measure incremental effect.");
  out.push("");

  process.stdout.write(`${out.join("\n")}\n`);
}

// ── Entry point ──────────────────────────────────────────────────────────────

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.dryRun) {
    process.stdout.write(
      `${JSON.stringify(
        {
          plan: "read-only analysis",
          ...options,
          from: options.from.toISOString(),
          to: options.to.toISOString(),
          queriesIssued: 0,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  if (options.fixtures) {
    render(buildReport(fixtureWorkspaces(), options), options.format);
    return;
  }

  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set. Use --fixtures to run against the synthetic dataset.",
    );
  }

  const prisma = new PrismaClient();
  try {
    const workspaces = await loadWorkspaces(prisma, options);
    const filtered = options.cohort
      ? workspaces.filter((w) =>
          matchesCohort(w.createdAt, options.cohort as string),
        )
      : workspaces;
    render(buildReport(filtered, options), options.format);
  } finally {
    await prisma.$disconnect();
  }
}

/** `2026-03` or `2026-Q1`. */
function matchesCohort(createdAt: Date, cohort: string): boolean {
  const year = createdAt.getUTCFullYear();
  const month = createdAt.getUTCMonth() + 1;
  if (/^\d{4}-Q[1-4]$/.test(cohort)) {
    const [y, q] = cohort.split("-Q");
    return year === Number(y) && Math.ceil(month / 3) === Number(q);
  }
  if (/^\d{4}-\d{2}$/.test(cohort)) {
    const [y, m] = cohort.split("-");
    return year === Number(y) && month === Number(m);
  }
  throw new Error(`--cohort must be YYYY-MM or YYYY-Qn, got "${cohort}"`);
}

main().catch((error) => {
  process.stderr.write(
    `journey:analyze failed — ${(error as Error).message}\n`,
  );
  process.exit(1);
});
