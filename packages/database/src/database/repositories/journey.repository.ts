import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { OwnershipContext } from "@ringee/platform";

/**
 * Journey — the workspace metric bag behind `/dashboard/journey`.
 *
 * Read-only. This repository answers exactly one question: *what has this
 * workspace genuinely done?* It never classifies, never decides eligibility and
 * never reads a feature flag — that all lives in `@ringee/services`, which owns
 * the program definition.
 *
 * Two rules shape everything here:
 *
 * 1. **Usage, not configuration.** A CRM connection, an enabled AI pipeline or
 *    a caller-ID pool membership contributes nothing. A completed sync, a
 *    persisted AI result and two caller IDs actually on the wire do.
 * 2. **Provider-corroborated calls only.** The connected-call predicate is
 *    duplicated once, in `CONNECTED_CALL_SQL`, and every metric that speaks
 *    about calling is built on it. Its TypeScript twin lives in
 *    `journey.predicates.ts` and the two are pinned together by tests.
 *
 * Day and week bucketing is done in the workspace's own IANA timezone, not the
 * server's. See docs/journey-v2.md §4.
 */

/** Field-for-field the metric bag `@ringee/services` evaluates stages against. */
export interface JourneyRawMetrics {
  verifiedPhone: number;
  dialableNumbers: number;

  attemptedCalls: number;
  connectedCalls: number;
  meaningfulConversations: number;
  connectedMinutes: number;
  billableMinutes: number;
  uniqueDestinations: number;
  activeDays: number;
  activeWeeks: number;
  activeMembers: number;
  acceptedMembers: number;
  callSources: number;
  outcomesLogged: number;

  campaignConnectedCalls: number;
  campaignUniqueDestinations: number;
  campaignActiveDays: number;
  campaignsWithRealActivity: number;
  workedLeads: number;

  callbacksWorked: number;
  meetingsSynced: number;

  inboundCallsAnswered: number;
  inboundSipDeviceCalls: number;
  inboundMissedFollowedUp: number;

  crmSyncedCalls: number;
  customIntegrationDeliveries: number;
  enrichmentImports: number;
  integrationSuccesses: number;

  transcriptionsCompleted: number;
  aiResultsProduced: number;
  aiMembersCovered: number;

  mcpSessions: number;
  mcpCalls: number;
  rotationCallerIdsUsed: number;
  sipDeviceCalls: number;
  sdkCalls: number;
  extensionCalls: number;
  callSessionCalls: number;
}

export interface JourneyMetricsOptions {
  /** Start of the measurement window (inclusive). */
  start: Date;
  /** End of the measurement window (inclusive). */
  end: Date;
  /** Validated IANA timezone. Callers must pass a safe value; UTC is the default. */
  timeZone: string;
  /** A call must last at least this long to count as connected. */
  minConnectedSeconds: number;
  /** Duration above which a connected call is a conversation on its own. */
  meaningfulSeconds: number;
  /** Connected calls a campaign needs before it counts as genuinely operated. */
  campaignMinCalls: number;
  /** Normalised E.164 destinations excluded from every metric. */
  testDestinations: string[];
}

/** Extra facts the risk model needs. Counts only — never raw identifiers. */
export interface JourneyRiskFacts {
  failedCalls: number;
  veryShortCalls: number;
  topDestinationCalls: number;
  selfDialedCalls: number;
  premiumRateMinutes: number;
  burstConcentration: number;
  usersSharingPhone: number;
  workspacesSharingPaymentMethod: number;
  workspacesCreatedLast7Days: number;
  relatedRewardedWorkspaces: number;
  emailVerified: boolean;
  phoneVerified: boolean;
  userBlocked: boolean;
  userCreatedAt: Date | null;
  workspaceCreatedAt: Date | null;
}

/**
 * The normalised destination of a call, as a comparable key.
 *
 * Digits only with a leading `+`, leading zeros stripped. Mirrors
 * `normalizeDestination` in `journey.predicates.ts`; the two are pinned by a
 * shared-fixture test.
 */
const DESTINATION_SQL = Prisma.sql`
  CASE
    WHEN length(regexp_replace(c."toNumber", '[^0-9]', '', 'g')) >= 6
    THEN '+' || ltrim(regexp_replace(c."toNumber", '[^0-9]', '', 'g'), '0')
    ELSE NULL
  END`;

/**
 * The connected-call predicate, in one place.
 *
 * Each clause blocks a specific way to manufacture a connected call:
 * - `answeredAt`/`endedAt`/`status` — the leg actually completed;
 * - `providerCallId` (unique in the schema) — a replayed provider webhook
 *   cannot create a second row;
 * - the duration floor — answer-supervision blips and instant hangups;
 * - the outcome exclusion — machine pickups and misdials the user labelled;
 * - the destination joins — self-dialling and configured QA numbers.
 */
function connectedCallSql(minSeconds: number): Prisma.Sql {
  return Prisma.sql`
    c."startedAt" IS NOT NULL
    AND (c."direction" IS NULL OR c."direction" = 'outbound')
    AND c."status" IN ('completed', 'recording', 'answered')
    AND c."answeredAt" IS NOT NULL
    AND c."endedAt" IS NOT NULL
    AND c."providerCallId" IS NOT NULL
    AND COALESCE(c."durationSeconds", 0) >= ${minSeconds}
    AND (
      c."outcome" IS NULL
      OR c."outcome"::text NOT IN ('no_answer', 'voicemail', 'wrong_number')
    )`;
}

/** A legitimately dialled external destination — the denominator, not the win. */
function attemptedCallSql(): Prisma.Sql {
  return Prisma.sql`
    c."startedAt" IS NOT NULL
    AND (c."direction" IS NULL OR c."direction" = 'outbound')
    AND c."status" <> 'pending'`;
}

/**
 * The external party of an INBOUND call, normalised.
 *
 * Inbound inverts the geometry: `toNumber` is one of our own DIDs and
 * `fromNumber` is the caller. Reusing `DESTINATION_SQL` here would normalise
 * our own number and make every inbound call look self-dialled.
 */
const ORIGIN_SQL = Prisma.sql`
  CASE
    WHEN length(regexp_replace(c."fromNumber", '[^0-9]', '', 'g')) >= 6
    THEN '+' || ltrim(regexp_replace(c."fromNumber", '[^0-9]', '', 'g'), '0')
    ELSE NULL
  END`;

/**
 * The answered-inbound predicate — the mirror of `connectedCallSql`.
 *
 * Same evidence standard as outbound, clause for clause: the leg completed, a
 * provider corroborated it, it lasted long enough to be a conversation, and the
 * user did not label it a machine pickup. The only differences are the
 * direction and that `answeredAt` is what separates a handled inbound call from
 * a missed one.
 */
function answeredInboundSql(minSeconds: number): Prisma.Sql {
  return Prisma.sql`
    c."startedAt" IS NOT NULL
    AND c."direction" = 'inbound'
    AND c."status" IN ('completed', 'recording', 'answered')
    AND c."answeredAt" IS NOT NULL
    AND c."endedAt" IS NOT NULL
    AND c."providerCallId" IS NOT NULL
    AND COALESCE(c."durationSeconds", 0) >= ${minSeconds}
    AND (
      c."outcome" IS NULL
      OR c."outcome"::text NOT IN ('no_answer', 'voicemail', 'wrong_number')
    )`;
}

/**
 * A missed inbound call: it arrived and was never answered.
 *
 * `providerCallId` is still required — an un-corroborated row is not evidence
 * that anyone actually called. `status = 'pending'` is excluded because those
 * rows are in-flight, not missed.
 */
function missedInboundSql(): Prisma.Sql {
  return Prisma.sql`
    c."startedAt" IS NOT NULL
    AND c."direction" = 'inbound'
    AND c."answeredAt" IS NULL
    AND c."providerCallId" IS NOT NULL
    AND c."status" <> 'pending'`;
}

@Injectable()
export class JourneyRepository {
  private readonly logger = new Logger(JourneyRepository.name);

  constructor(private prisma: PrismaService) {}

  /**
   * The complete metric bag for one workspace over one window.
   *
   * Deliberately a handful of wide aggregate queries rather than dozens of
   * counts: the previous implementation issued ~40 round-trips on the
   * post-login landing page.
   */
  async getMetrics(
    ctx: OwnershipContext,
    options: JourneyMetricsOptions,
  ): Promise<JourneyRawMetrics> {
    const [
      foundation,
      calls,
      campaigns,
      followThrough,
      inbound,
      integrations,
      intelligence,
      channels,
    ] = await Promise.all([
      this.getFoundation(ctx),
      this.getCallMetrics(ctx, options),
      this.getCampaignMetrics(ctx, options),
      this.getFollowThrough(ctx, options),
      this.getInboundMetrics(ctx, options),
      this.getIntegrationMetrics(ctx, options),
      this.getIntelligenceMetrics(ctx, options),
      this.getChannelMetrics(ctx, options),
    ]);

    const integrationSuccesses =
      integrations.crmSyncedCalls +
      integrations.customIntegrationDeliveries +
      followThrough.meetingsSynced;

    return {
      ...foundation,
      ...calls,
      ...campaigns,
      ...followThrough,
      ...inbound,
      ...integrations,
      ...intelligence,
      ...channels,
      integrationSuccesses,
    };
  }

  // ── Ownership ──────────────────────────────────────────────────────────────

  /**
   * The workspace filter, as SQL.
   *
   * A personal workspace is `userId = … AND organizationId IS NULL`; leaving
   * the null check out would leak the user's organization activity into their
   * personal ladder.
   */
  private ownerSql(ctx: OwnershipContext, alias = "c"): Prisma.Sql {
    const column = Prisma.raw(`"${alias}"`);
    return ctx.organizationId
      ? Prisma.sql`${column}."organizationId" = ${ctx.organizationId}::uuid`
      : Prisma.sql`${column}."userId" = ${ctx.userId}::uuid AND ${column}."organizationId" IS NULL`;
  }

  private ownerFilter(ctx: OwnershipContext) {
    return ctx.organizationId
      ? { organizationId: ctx.organizationId }
      : { userId: ctx.userId, organizationId: null };
  }

  /**
   * Numbers the workspace owns, normalised. Excluded from every call metric so
   * dialling your own DIDs never counts as outbound activity.
   */
  private ownedNumbersSql(ctx: OwnershipContext): Prisma.Sql {
    const owner = ctx.organizationId
      ? Prisma.sql`n."organizationId" = ${ctx.organizationId}::uuid`
      : Prisma.sql`n."userId" = ${ctx.userId}::uuid AND n."organizationId" IS NULL`;
    return Prisma.sql`
      SELECT '+' || ltrim(regexp_replace(n."phoneNumber", '[^0-9]', '', 'g'), '0') AS num
      FROM "NumberPurchased" n
      WHERE ${owner} AND n."deletedAt" IS NULL`;
  }

  private testDestinationsSql(destinations: string[]): Prisma.Sql {
    return destinations.length
      ? Prisma.sql`${Prisma.join(destinations.map((d) => Prisma.sql`${d}`))}`
      : Prisma.sql`''`;
  }

  /**
   * The reusable "connected calls of this workspace in this window" CTE.
   *
   * `${Prisma.raw(timeZone)}` is safe because callers pass a value already
   * validated by `resolveWorkspaceTimezone`, which rejects anything outside the
   * IANA character set. It cannot be a bind parameter — `AT TIME ZONE` needs a
   * literal.
   */
  private connectedCte(
    ctx: OwnershipContext,
    options: JourneyMetricsOptions,
  ): Prisma.Sql {
    return Prisma.sql`
      owned AS (${this.ownedNumbersSql(ctx)}),
      base AS (
        SELECT c.*, ${DESTINATION_SQL} AS destination
        FROM "Call" c
        WHERE ${this.ownerSql(ctx)}
          AND c."startedAt" BETWEEN ${options.start} AND ${options.end}
      ),
      attempted AS (
        SELECT b.* FROM base b
        JOIN "Call" c ON c."id" = b."id"
        WHERE ${attemptedCallSql()}
          AND b.destination IS NOT NULL
          AND b.destination NOT IN (SELECT num FROM owned)
          AND b.destination NOT IN (${this.testDestinationsSql(options.testDestinations)})
      ),
      connected AS (
        SELECT a.* FROM attempted a
        JOIN "Call" c ON c."id" = a."id"
        WHERE ${connectedCallSql(options.minConnectedSeconds)}
      )`;
  }

  // ── Foundation ─────────────────────────────────────────────────────────────

  private async getFoundation(
    ctx: OwnershipContext,
  ): Promise<
    Pick<
      JourneyRawMetrics,
      "verifiedPhone" | "dialableNumbers" | "acceptedMembers"
    >
  > {
    const owner = this.ownerFilter(ctx);

    const [dialableNumbers, acceptedMembers, user] = await Promise.all([
      this.prisma.numberPurchased.count({
        where: {
          ...owner,
          deletedAt: null,
          OR: [
            { kind: "purchased" },
            { kind: "verified_caller_id", verified: true },
          ],
        },
      }),
      ctx.organizationId
        ? // Pending invitations carry a clerkUserId but no userId. Counting them
          // is how v1 let two unanswered invites unlock the team stage.
          this.prisma.organizationMembership.count({
            where: {
              organizationId: ctx.organizationId,
              userId: { not: null },
            },
          })
        : Promise.resolve(1),
      this.prisma.user.findUnique({
        where: { id: ctx.userId },
        select: { phoneVerified: true },
      }),
    ]);

    return {
      dialableNumbers,
      acceptedMembers,
      verifiedPhone: user?.phoneVerified ? 1 : 0,
    };
  }

  // ── Calling ────────────────────────────────────────────────────────────────

  private async getCallMetrics(
    ctx: OwnershipContext,
    options: JourneyMetricsOptions,
  ): Promise<
    Pick<
      JourneyRawMetrics,
      | "attemptedCalls"
      | "connectedCalls"
      | "meaningfulConversations"
      | "connectedMinutes"
      | "billableMinutes"
      | "uniqueDestinations"
      | "activeDays"
      | "activeWeeks"
      | "activeMembers"
      | "callSources"
      | "outcomesLogged"
      | "rotationCallerIdsUsed"
    >
  > {
    const tz = Prisma.raw(`'${options.timeZone}'`);

    const rows = await this.prisma.$queryRaw<
      Array<Record<string, number | bigint | null>>
    >(Prisma.sql`
      WITH ${this.connectedCte(ctx, options)},
      evidence AS (
        SELECT
          n."id",
          n."durationSeconds",
          (
            EXISTS (
              SELECT 1 FROM "CallTranscription" t
              WHERE t."callId" = n."id"
                AND t."status" = 'completed'
                AND COALESCE(t."text", '') <> ''
            )
            OR EXISTS (SELECT 1 FROM "Meeting" m WHERE m."callId" = n."id")
            OR EXISTS (SELECT 1 FROM "CallbackTask" k WHERE k."callId" = n."id")
            OR EXISTS (
              SELECT 1 FROM "CrmCallSync" s
              WHERE s."callId" = n."id" AND s."status" = 'done'
            )
          ) AS has_evidence
        FROM connected n
      )
      SELECT
        (SELECT COUNT(*) FROM attempted)                            AS "attemptedCalls",
        (SELECT COUNT(*) FROM connected)                            AS "connectedCalls",
        (
          SELECT COUNT(*) FROM evidence e
          WHERE COALESCE(e."durationSeconds", 0) >= ${options.meaningfulSeconds}
             OR e.has_evidence
        )                                                           AS "meaningfulConversations",
        (SELECT FLOOR(COALESCE(SUM("durationSeconds"), 0) / 60.0) FROM connected)
                                                                    AS "connectedMinutes",
        (
          SELECT FLOOR(COALESCE(SUM("durationSeconds"), 0) / 60.0)
          FROM connected WHERE COALESCE("totalCost", 0) > 0
        )                                                           AS "billableMinutes",
        (SELECT COUNT(DISTINCT destination) FROM connected)          AS "uniqueDestinations",
        (
          SELECT COUNT(DISTINCT date_trunc('day', "startedAt" AT TIME ZONE ${tz}))
          FROM connected
        )                                                           AS "activeDays",
        (
          SELECT COUNT(DISTINCT date_trunc('week', "startedAt" AT TIME ZONE ${tz}))
          FROM connected
        )                                                           AS "activeWeeks",
        (SELECT COUNT(DISTINCT "userId") FROM connected WHERE "userId" IS NOT NULL)
                                                                    AS "activeMembers",
        (SELECT COUNT(DISTINCT COALESCE("source", 'web')) FROM connected)
                                                                    AS "callSources",
        (SELECT COUNT(*) FROM connected WHERE "outcome" IS NOT NULL) AS "outcomesLogged",
        (SELECT COUNT(DISTINCT "callerIdId") FROM connected WHERE "callerIdId" IS NOT NULL)
                                                                    AS "rotationCallerIdsUsed"
    `);

    return this.readRow(rows[0], [
      "attemptedCalls",
      "connectedCalls",
      "meaningfulConversations",
      "connectedMinutes",
      "billableMinutes",
      "uniqueDestinations",
      "activeDays",
      "activeWeeks",
      "activeMembers",
      "callSources",
      "outcomesLogged",
      "rotationCallerIdsUsed",
    ]);
  }

  // ── Campaigns ──────────────────────────────────────────────────────────────

  private async getCampaignMetrics(
    ctx: OwnershipContext,
    options: JourneyMetricsOptions,
  ): Promise<
    Pick<
      JourneyRawMetrics,
      | "campaignConnectedCalls"
      | "campaignUniqueDestinations"
      | "campaignActiveDays"
      | "campaignsWithRealActivity"
      | "workedLeads"
    >
  > {
    const tz = Prisma.raw(`'${options.timeZone}'`);

    const rows = await this.prisma.$queryRaw<
      Array<Record<string, number | bigint | null>>
    >(Prisma.sql`
      WITH ${this.connectedCte(ctx, options)},
      campaign_calls AS (
        SELECT DISTINCT ON (n."id", att."campaignId")
               n."id", n.destination, n."startedAt",
               att."campaignId", att."campaignLeadId"
        FROM connected n
        JOIN "CallAttempt" att ON att."callId" = n."id"
      )
      SELECT
        (SELECT COUNT(DISTINCT "id") FROM campaign_calls)              AS "campaignConnectedCalls",
        (SELECT COUNT(DISTINCT destination) FROM campaign_calls)        AS "campaignUniqueDestinations",
        (
          SELECT COUNT(DISTINCT date_trunc('day', "startedAt" AT TIME ZONE ${tz}))
          FROM campaign_calls
        )                                                               AS "campaignActiveDays",
        (SELECT COUNT(DISTINCT "campaignLeadId") FROM campaign_calls)   AS "workedLeads",
        -- A campaign counts only with volume AND spread AND distribution: one
        -- burst against one number is not "running a campaign".
        (
          SELECT COUNT(*) FROM (
            SELECT "campaignId"
            FROM campaign_calls
            GROUP BY "campaignId"
            HAVING COUNT(DISTINCT "id") >= ${options.campaignMinCalls}
               AND COUNT(DISTINCT destination) >= 2
               AND COUNT(DISTINCT date_trunc('day', "startedAt" AT TIME ZONE ${tz})) >= 2
          ) real_campaigns
        )                                                               AS "campaignsWithRealActivity"
    `);

    return this.readRow(rows[0], [
      "campaignConnectedCalls",
      "campaignUniqueDestinations",
      "campaignActiveDays",
      "campaignsWithRealActivity",
      "workedLeads",
    ]);
  }

  // ── Follow-through ─────────────────────────────────────────────────────────

  private async getFollowThrough(
    ctx: OwnershipContext,
    options: JourneyMetricsOptions,
  ): Promise<Pick<JourneyRawMetrics, "callbacksWorked" | "meetingsSynced">> {
    const rows = await this.prisma.$queryRaw<
      Array<Record<string, number | bigint | null>>
    >(Prisma.sql`
      WITH ${this.connectedCte(ctx, options)}
      SELECT
        -- A callback counts once it was actually acted on: a later connected
        -- call to the same contact. Creating callbacks is free; working them
        -- is the behaviour worth rewarding.
        (
          SELECT COUNT(*) FROM "CallbackTask" k
          WHERE ${this.ownerSql(ctx, "k")}
            AND k."createdAt" BETWEEN ${options.start} AND ${options.end}
            AND EXISTS (
              SELECT 1 FROM connected n
              WHERE n."contactId" = k."contactId"
                AND n."startedAt" > k."createdAt"
            )
        )                                                       AS "callbacksWorked",
        (
          SELECT COUNT(*) FROM "Meeting" m
          WHERE ${this.ownerSql(ctx, "m")}
            AND m."externalEventId" IS NOT NULL
            AND m."createdAt" BETWEEN ${options.start} AND ${options.end}
        )                                                       AS "meetingsSynced"
    `);

    return this.readRow(rows[0], ["callbacksWorked", "meetingsSynced"]);
  }

  // ── Inbound ────────────────────────────────────────────────────────────────

  /**
   * Calls arriving, not leaving.
   *
   * Three metrics, all held to the same standard as the outbound ones: a
   * configured inbound route proves nothing, an answered inbound call does.
   *
   * `inboundMissedFollowedUp` is the interesting one. It counts a missed
   * inbound call only when someone actually called that person back and got
   * through, within 48 hours. The matching is deliberately **one-to-one**:
   * `DISTINCT ON (missed.id)` picks the earliest eligible callback per missed
   * call, and the `NOT IN` on already-consumed callbacks stops a single return
   * call from redeeming a whole afternoon of missed ones. Without that, ten
   * missed calls from the same number plus one callback would score ten.
   */
  private async getInboundMetrics(
    ctx: OwnershipContext,
    options: JourneyMetricsOptions,
  ): Promise<
    Pick<
      JourneyRawMetrics,
      | "inboundCallsAnswered"
      | "inboundSipDeviceCalls"
      | "inboundMissedFollowedUp"
    >
  > {
    const rows = await this.prisma.$queryRaw<
      Array<Record<string, number | bigint | null>>
    >(Prisma.sql`
      WITH owned AS (${this.ownedNumbersSql(ctx)}),
      inbound_base AS (
        SELECT c.*, ${ORIGIN_SQL} AS origin
        FROM "Call" c
        WHERE ${this.ownerSql(ctx)}
          AND c."startedAt" BETWEEN ${options.start} AND ${options.end}
          AND c."direction" = 'inbound'
      ),
      -- External callers only: a call from one of our own numbers to another
      -- of our own numbers is a loop test, and configured QA numbers never
      -- count on any metric.
      inbound_external AS (
        SELECT b.* FROM inbound_base b
        WHERE b.origin IS NOT NULL
          AND b.origin NOT IN (SELECT num FROM owned)
          AND b.origin NOT IN (${this.testDestinationsSql(options.testDestinations)})
      ),
      answered_inbound AS (
        SELECT e.* FROM inbound_external e
        JOIN "Call" c ON c."id" = e."id"
        WHERE ${answeredInboundSql(options.minConnectedSeconds)}
      ),
      missed_inbound AS (
        SELECT e.* FROM inbound_external e
        JOIN "Call" c ON c."id" = e."id"
        WHERE ${missedInboundSql()}
      ),
      -- Outbound calls that genuinely connected, keyed by who was reached, so
      -- a callback can be matched to the missed call it answers.
      outbound_connected AS (
        SELECT c."id", c."startedAt", ${DESTINATION_SQL} AS destination
        FROM "Call" c
        WHERE ${this.ownerSql(ctx)}
          AND c."startedAt" BETWEEN ${options.start} AND ${options.end}
          AND ${connectedCallSql(options.minConnectedSeconds)}
      ),
      -- Every (missed call, eligible callback) pair, earliest callback first.
      candidate_pairs AS (
        SELECT m."id" AS missed_id,
               o."id" AS callback_id,
               o."startedAt" AS callback_at
        FROM missed_inbound m
        JOIN outbound_connected o
          ON o.destination = m.origin
         AND o."startedAt" > m."startedAt"
         AND o."startedAt" <= m."startedAt" + INTERVAL '48 hours'
      ),
      -- One callback may redeem at most one missed call, and each missed call
      -- is redeemed at most once. Greedy by callback time, which is both stable
      -- and the most conservative reading of "we called them back".
      matched AS (
        SELECT DISTINCT ON (missed_id) missed_id, callback_id
        FROM candidate_pairs
        ORDER BY missed_id, callback_at ASC
      ),
      deduped AS (
        SELECT DISTINCT ON (callback_id) missed_id, callback_id
        FROM matched
        ORDER BY callback_id, missed_id
      )
      SELECT
        (SELECT COUNT(*) FROM answered_inbound)                  AS "inboundCallsAnswered",
        -- Deliberately NOT the generic sipDeviceCalls metric, which counts
        -- outbound legs placed from a desk phone.
        (
          SELECT COUNT(*) FROM answered_inbound
          WHERE "sipDeviceId" IS NOT NULL
        )                                                        AS "inboundSipDeviceCalls",
        (SELECT COUNT(*) FROM deduped)                           AS "inboundMissedFollowedUp"
    `);

    return this.readRow(rows[0], [
      "inboundCallsAnswered",
      "inboundSipDeviceCalls",
      "inboundMissedFollowedUp",
    ]);
  }

  // ── Integrations ───────────────────────────────────────────────────────────

  private async getIntegrationMetrics(
    ctx: OwnershipContext,
    options: JourneyMetricsOptions,
  ): Promise<
    Pick<
      JourneyRawMetrics,
      "crmSyncedCalls" | "customIntegrationDeliveries" | "enrichmentImports"
    >
  > {
    const owner = this.ownerFilter(ctx);
    const window = { gte: options.start, lte: options.end };

    const [crmSyncedCalls, customIntegrationDeliveries, enrichmentImports] =
      await Promise.all([
        // Only syncs of calls that really connected — a synced no-answer proves
        // the pipe works but says nothing about the operation.
        this.prisma.crmCallSync.count({
          where: {
            connection: owner,
            status: "done",
            createdAt: window,
            call: {
              ...owner,
              answeredAt: { not: null },
              endedAt: { not: null },
              providerCallId: { not: null },
              durationSeconds: { gte: options.minConnectedSeconds },
              status: { in: ["completed", "recording", "answered"] },
            },
          },
        }),
        this.prisma.customIntegrationDelivery.count({
          where: { integration: owner, status: "sent", createdAt: window },
        }),
        // An enrichment job that produced a contact — a search that resolved to
        // nothing is not adoption.
        this.prisma.enrichmentJob.count({
          where: {
            ...owner,
            status: "done",
            contactId: { not: null },
            createdAt: window,
          },
        }),
      ]);

    return { crmSyncedCalls, customIntegrationDeliveries, enrichmentImports };
  }

  // ── Intelligence ───────────────────────────────────────────────────────────

  private async getIntelligenceMetrics(
    ctx: OwnershipContext,
    options: JourneyMetricsOptions,
  ): Promise<
    Pick<
      JourneyRawMetrics,
      "transcriptionsCompleted" | "aiResultsProduced" | "aiMembersCovered"
    >
  > {
    const rows = await this.prisma.$queryRaw<
      Array<Record<string, number | bigint | null>>
    >(Prisma.sql`
      WITH ${this.connectedCte(ctx, options)},
      activations AS (
        SELECT a."contextKey" FROM "AiPipelineActivation" a
        WHERE ${this.ownerSql(ctx, "a")}
      )
      SELECT
        (
          SELECT COUNT(*) FROM "CallTranscription" t
          JOIN connected n ON n."id" = t."callId"
          WHERE t."status" = 'completed' AND COALESCE(t."text", '') <> ''
        )                                                        AS "transcriptionsCompleted",
        -- A run only counts when it finished AND left something the user can
        -- act on. "Pipeline enabled" is not an AI result.
        (
          SELECT COUNT(*) FROM "AiPipelineRun" r
          WHERE r."status" = 'completed'
            AND r."resultJson" IS NOT NULL
            AND r."contextKey" IN (SELECT "contextKey" FROM activations)
            AND (
              EXISTS (SELECT 1 FROM "PendingAction" p WHERE p."contextKey" = r."contextKey")
              OR EXISTS (SELECT 1 FROM "ObjectionInsight" o WHERE o."contextKey" = r."contextKey")
            )
        )                                                        AS "aiResultsProduced",
        (
          SELECT COUNT(DISTINCT p."userId") FROM "PendingAction" p
          WHERE ${this.ownerSql(ctx, "p")}
        )                                                        AS "aiMembersCovered"
    `);

    return this.readRow(rows[0], [
      "transcriptionsCompleted",
      "aiResultsProduced",
      "aiMembersCovered",
    ]);
  }

  // ── Channels ───────────────────────────────────────────────────────────────

  private async getChannelMetrics(
    ctx: OwnershipContext,
    options: JourneyMetricsOptions,
  ): Promise<
    Pick<
      JourneyRawMetrics,
      | "mcpSessions"
      | "mcpCalls"
      | "sipDeviceCalls"
      | "sdkCalls"
      | "extensionCalls"
      | "callSessionCalls"
    >
  > {
    const rows = await this.prisma.$queryRaw<
      Array<Record<string, number | bigint | null>>
    >(Prisma.sql`
      WITH ${this.connectedCte(ctx, options)}
      SELECT
        (
          SELECT COUNT(*) FROM "CallSession" s
          WHERE ${this.ownerSql(ctx, "s")}
            AND s."source" = 'mcp' AND s."deletedAt" IS NULL
        )                                                        AS "mcpSessions",
        -- The agent's real fingerprint: connected calls that came out of a
        -- session an agent created, not the existence of the session.
        (
          SELECT COUNT(DISTINCT n."id") FROM connected n
          JOIN "CallSessionItem" i ON i."callId" = n."id"
          JOIN "CallSession" s ON s."id" = i."callSessionId"
          WHERE s."source" = 'mcp' AND s."deletedAt" IS NULL
        )                                                        AS "mcpCalls",
        (SELECT COUNT(*) FROM connected WHERE "source" = 'sip_device')     AS "sipDeviceCalls",
        (SELECT COUNT(*) FROM connected WHERE "source" = 'sdk')            AS "sdkCalls",
        (SELECT COUNT(*) FROM connected WHERE "source" = 'chrome_extension') AS "extensionCalls",
        (SELECT COUNT(*) FROM connected WHERE "source" = 'session')        AS "callSessionCalls"
    `);

    return this.readRow(rows[0], [
      "mcpSessions",
      "mcpCalls",
      "sipDeviceCalls",
      "sdkCalls",
      "extensionCalls",
      "callSessionCalls",
    ]);
  }

  // ── Risk facts ─────────────────────────────────────────────────────────────

  /**
   * The behavioural half of the risk snapshot.
   *
   * Everything here is a count or a ratio; no phone number, e-mail or contact
   * name crosses this boundary, because the result is persisted on the claim.
   */
  async getRiskFacts(
    ctx: OwnershipContext,
    options: JourneyMetricsOptions,
  ): Promise<JourneyRiskFacts> {
    const [behaviour, identity] = await Promise.all([
      this.getBehaviouralRisk(ctx, options),
      this.getIdentityRisk(ctx),
    ]);
    return { ...behaviour, ...identity };
  }

  private async getBehaviouralRisk(
    ctx: OwnershipContext,
    options: JourneyMetricsOptions,
  ): Promise<
    Pick<
      JourneyRiskFacts,
      | "failedCalls"
      | "veryShortCalls"
      | "topDestinationCalls"
      | "selfDialedCalls"
      | "premiumRateMinutes"
      | "burstConcentration"
    >
  > {
    const rows = await this.prisma.$queryRaw<
      Array<Record<string, number | bigint | null>>
    >(Prisma.sql`
      WITH ${this.connectedCte(ctx, options)},
      all_calls AS (
        SELECT c.*, ${DESTINATION_SQL} AS destination
        FROM "Call" c
        WHERE ${this.ownerSql(ctx)}
          AND c."startedAt" BETWEEN ${options.start} AND ${options.end}
      ),
      ranked AS (
        SELECT n."startedAt",
               ROW_NUMBER() OVER (ORDER BY n."startedAt") AS rn
        FROM connected n
      )
      SELECT
        (SELECT COUNT(*) FROM all_calls WHERE "status" = 'failed')  AS "failedCalls",
        (
          SELECT COUNT(*) FROM all_calls
          WHERE COALESCE("durationSeconds", 0) < 10 AND "startedAt" IS NOT NULL
        )                                                            AS "veryShortCalls",
        (
          SELECT COALESCE(MAX(cnt), 0) FROM (
            SELECT COUNT(*) AS cnt FROM connected GROUP BY destination
          ) per_destination
        )                                                            AS "topDestinationCalls",
        -- Excluded from every metric; their presence is the signal.
        (
          SELECT COUNT(*) FROM all_calls a
          WHERE a.destination IN (SELECT num FROM owned)
        )                                                            AS "selfDialedCalls",
        (
          SELECT FLOOR(COALESCE(SUM(n."durationSeconds"), 0) / 60.0)
          FROM connected n
          WHERE COALESCE(n."totalCost", 0) / GREATEST(COALESCE(n."durationSeconds", 1), 1) * 60
                >= (
                  SELECT COALESCE(PERCENTILE_CONT(0.9) WITHIN GROUP (
                    ORDER BY COALESCE(r."interval_1", 0)
                  ), 0)
                  FROM "TelnyxRatePerMinute" r
                )
        )                                                            AS "premiumRateMinutes",
        -- Largest share of connected calls inside any 30-minute span. A real
        -- operation spreads out; a credit farm does not.
        (
          SELECT COALESCE(MAX(window_count)::float / NULLIF((SELECT COUNT(*) FROM connected), 0), 0)
          FROM (
            SELECT COUNT(*) AS window_count
            FROM ranked a
            JOIN ranked b ON b."startedAt" BETWEEN a."startedAt"
                         AND a."startedAt" + INTERVAL '30 minutes'
            GROUP BY a.rn
          ) windows
        )                                                            AS "burstConcentration"
    `);

    const row = rows[0] ?? {};
    return {
      failedCalls: this.toNumber(row.failedCalls),
      veryShortCalls: this.toNumber(row.veryShortCalls),
      topDestinationCalls: this.toNumber(row.topDestinationCalls),
      selfDialedCalls: this.toNumber(row.selfDialedCalls),
      premiumRateMinutes: this.toNumber(row.premiumRateMinutes),
      burstConcentration: Number(row.burstConcentration ?? 0),
    };
  }

  private async getIdentityRisk(
    ctx: OwnershipContext,
  ): Promise<
    Pick<
      JourneyRiskFacts,
      | "usersSharingPhone"
      | "workspacesSharingPaymentMethod"
      | "workspacesCreatedLast7Days"
      | "relatedRewardedWorkspaces"
      | "emailVerified"
      | "phoneVerified"
      | "userBlocked"
      | "userCreatedAt"
      | "workspaceCreatedAt"
    >
  > {
    const user = await this.prisma.user.findUnique({
      where: { id: ctx.userId },
      select: {
        createdAt: true,
        phoneNumber: true,
        phoneVerified: true,
        blockedAt: true,
        customerId: true,
      },
    });

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      verifiedEmail,
      usersSharingPhone,
      workspacesSharingPaymentMethod,
      workspacesCreatedLast7Days,
      relatedRewardedWorkspaces,
      organization,
    ] = await Promise.all([
      this.prisma.userEmail.count({
        where: { userId: ctx.userId, status: "verified" },
      }),
      user?.phoneNumber
        ? this.prisma.user.count({ where: { phoneNumber: user.phoneNumber } })
        : Promise.resolve(0),
      user?.customerId
        ? this.prisma.user.count({ where: { customerId: user.customerId } })
        : Promise.resolve(0),
      this.prisma.organization.count({
        where: { createdBy: ctx.userId, createdAt: { gte: sevenDaysAgo } },
      }),
      // Workspaces this person is an accepted admin of that already took money
      // out of the program. The multi-org farm signal.
      this.prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
        SELECT COUNT(DISTINCT COALESCE(j."organizationId"::text, j."userId"::text)) AS count
        FROM "JourneyRewardClaim" j
        WHERE j."status" = 'claimed'
          AND (
            j."userId" = ${ctx.userId}::uuid
            OR j."organizationId" IN (
              SELECT m."organizationId" FROM "OrganizationMembership" m
              WHERE m."userId" = ${ctx.userId}::uuid AND m."role" = 'org:admin'
            )
          )`),
      ctx.organizationId
        ? this.prisma.organization.findUnique({
            where: { id: ctx.organizationId },
            select: { createdAt: true },
          })
        : Promise.resolve(null),
    ]);

    return {
      usersSharingPhone,
      workspacesSharingPaymentMethod,
      workspacesCreatedLast7Days,
      relatedRewardedWorkspaces: this.toNumber(
        relatedRewardedWorkspaces[0]?.count,
      ),
      emailVerified: verifiedEmail > 0,
      phoneVerified: user?.phoneVerified ?? false,
      userBlocked: Boolean(user?.blockedAt),
      userCreatedAt: user?.createdAt ?? null,
      workspaceCreatedAt: organization?.createdAt ?? user?.createdAt ?? null,
    };
  }

  /** The workspace's IANA timezone, unvalidated — the service normalises it. */
  async getWorkspaceTimezone(ctx: OwnershipContext): Promise<string | null> {
    if (ctx.organizationId) {
      const org = await this.prisma.organization.findUnique({
        where: { id: ctx.organizationId },
        select: { timezone: true },
      });
      return org?.timezone ?? null;
    }
    const user = await this.prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { timezone: true },
    });
    return user?.timezone ?? null;
  }

  /** When the workspace itself came into existence — the window's lower bound. */
  async getWorkspaceCreatedAt(ctx: OwnershipContext): Promise<Date | null> {
    if (ctx.organizationId) {
      const org = await this.prisma.organization.findUnique({
        where: { id: ctx.organizationId },
        select: { createdAt: true },
      });
      return org?.createdAt ?? null;
    }
    const user = await this.prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { createdAt: true },
    });
    return user?.createdAt ?? null;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** PostgreSQL COUNT returns BigInt; JSON does not carry it. */
  private toNumber(value: unknown): number {
    if (value === null || value === undefined) return 0;
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
  }

  private readRow<K extends string>(
    row: Record<string, unknown> | undefined,
    keys: readonly K[],
  ): Record<K, number> {
    if (!row) {
      this.logger.warn(
        "Journey aggregate returned no row; defaulting to zeros",
      );
    }
    return keys.reduce(
      (acc, key) => {
        acc[key] = this.toNumber(row?.[key]);
        return acc;
      },
      {} as Record<K, number>,
    );
  }
}
