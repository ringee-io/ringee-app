import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import type { BackofficeAccountFilter } from "./backoffice.repository";

/**
 * Cross-tenant scheduling and AI voice agent activity for the internal
 * super-admin (backoffice) area. Like BackofficeRepository it deliberately
 * ignores OwnershipContext — access is gated by the SuperAdminGuard at the
 * controller.
 *
 * What is counted, and against which timestamp:
 * - Meetings and callbacks are counted when they were BOOKED (`createdAt`), not
 *   when they are due — "how many were scheduled in this range".
 * - An AI voice agent call is counted when it was placed (`createdAt`).
 * - A meeting or callback is "by an AI agent" when an agent call produced it:
 *   the booking tool writes `meetingId` onto the agent call and the agent call's
 *   `callId` onto the meeting; the callback tool writes the same `callId`.
 *
 * An agent call's cost is billed in two halves (see VoiceAgentBillingService):
 * the voice leg lands on `Call.totalCost`, the conversation engine on
 * `AiVoiceAgentCall.aiChargedCredits`. Both are what Ringee charged, margin
 * included; `aiCostUsd` is what the provider charged Ringee for the AI half.
 */

export type VoiceAgentTypeFilter =
  | "appointment_booking"
  | "reminders_notifications";

export interface ActivityAccountRow {
  userId: string;
  userName: string;
  userEmail: string | null;
  organizationId: string | null;
  organizationName: string | null;
  organizationSlug: string | null;
  meetings: number;
  meetingsByAgents: number;
  meetingsCancelled: number;
  callbacks: number;
  callbacksByAgents: number;
  agentCalls: number;
  agentCallsConnected: number;
  bookingCalls: number;
  reminderCalls: number;
  agentMeetingsBooked: number;
  agentCallbacksScheduled: number;
  remindersConfirmed: number;
  agentDurationSec: number;
  agentVoiceCost: number;
  agentAiCost: number;
  agentTotalCost: number;
  agentAiProviderCostUsd: number;
  /** Agent calls whose AI half has not been priced yet — cost is still growing. */
  agentCostPending: number;
  lastActivityAt: Date | null;
}

export type ActivityTotals = Omit<
  ActivityAccountRow,
  | "userId"
  | "userName"
  | "userEmail"
  | "organizationId"
  | "organizationName"
  | "organizationSlug"
  | "lastActivityAt"
> & { users: number; organizations: number };

export interface BackofficeActivity {
  range: { start: string; end: string };
  totals: ActivityTotals;
  accounts: ActivityAccountRow[];
}

export interface VoiceAgentCallFilters extends BackofficeAccountFilter {
  start: Date;
  end: Date;
  type?: VoiceAgentTypeFilter;
  skip: number;
  take: number;
}

export interface VoiceAgentCallRow {
  id: string;
  createdAt: Date;
  agentId: string;
  agentName: string;
  agentType: string;
  status: string;
  outcome: string | null;
  toNumber: string;
  durationSec: number | null;
  meetingId: string | null;
  meetingScheduledAt: Date | null;
  userId: string;
  userName: string;
  userEmail: string | null;
  organizationId: string | null;
  organizationName: string | null;
  voiceCost: number | null;
  aiCost: number | null;
  totalCost: number;
  aiProviderCostUsd: number | null;
  costPending: boolean;
}

export interface VoiceAgentCallsResult {
  items: VoiceAgentCallRow[];
  total: number;
}

function num(v: unknown): number {
  return typeof v === "bigint" ? Number(v) : Number(v ?? 0);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Provider AI costs are fractions of a cent per call — keep more precision. */
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function fullName(u: {
  firstName: string | null;
  lastName: string | null;
}): string {
  return [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
}

const COUNTER_KEYS = [
  "meetings",
  "meetingsByAgents",
  "meetingsCancelled",
  "callbacks",
  "callbacksByAgents",
  "agentCalls",
  "agentCallsConnected",
  "bookingCalls",
  "reminderCalls",
  "agentMeetingsBooked",
  "agentCallbacksScheduled",
  "remindersConfirmed",
  "agentDurationSec",
  "agentCostPending",
] as const;

@Injectable()
export class BackofficeActivityRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── Overview ───────────────────────────────────────────────

  /**
   * One row per (user, organization) pair with any meeting, callback or agent
   * call in range. The pair — not the user or the org alone — is the unit,
   * because it answers "who, and for which organization": the same person
   * working personally and inside an org shows up twice.
   */
  async getActivity(
    start: Date,
    end: Date,
    filter: BackofficeAccountFilter = {},
  ): Promise<BackofficeActivity> {
    const inRange = (alias: string) =>
      Prisma.join(
        [
          Prisma.sql`${Prisma.raw(`${alias}."createdAt"`)} BETWEEN ${start} AND ${end}`,
          ...this.accountConditions(filter, alias),
        ],
        " AND ",
      );

    const rows = await this.prisma.$queryRaw<
      {
        user_id: string;
        organization_id: string | null;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
        org_name: string | null;
        org_slug: string | null;
        meetings: bigint | null;
        meetings_by_agents: bigint | null;
        meetings_cancelled: bigint | null;
        callbacks: bigint | null;
        callbacks_by_agents: bigint | null;
        agent_calls: bigint | null;
        agent_calls_connected: bigint | null;
        booking_calls: bigint | null;
        reminder_calls: bigint | null;
        agent_meetings_booked: bigint | null;
        agent_callbacks_scheduled: bigint | null;
        reminders_confirmed: bigint | null;
        agent_duration_sec: bigint | null;
        agent_voice_cost: number | null;
        agent_ai_cost: number | null;
        agent_ai_provider_cost: number | null;
        agent_cost_pending: bigint | null;
        last_activity_at: Date | null;
      }[]
    >(Prisma.sql`
      WITH meetings AS (
        SELECT
          m."userId"         AS user_id,
          m."organizationId" AS organization_id,
          COUNT(*)           AS meetings,
          COUNT(*) FILTER (
            WHERE EXISTS (
              SELECT 1 FROM "AiVoiceAgentCall" a
              WHERE a."meetingId" = m.id
                 OR (m."callId" IS NOT NULL AND a."callId" = m."callId")
            )
          )                  AS meetings_by_agents,
          COUNT(*) FILTER (WHERE m.status = 'cancelled') AS meetings_cancelled,
          MAX(m."createdAt") AS last_at
        FROM "Meeting" m
        WHERE ${inRange("m")}
        GROUP BY m."userId", m."organizationId"
      ),
      callbacks AS (
        SELECT
          cb."userId"         AS user_id,
          cb."organizationId" AS organization_id,
          COUNT(*)            AS callbacks,
          COUNT(*) FILTER (
            WHERE cb."callId" IS NOT NULL AND EXISTS (
              SELECT 1 FROM "AiVoiceAgentCall" a WHERE a."callId" = cb."callId"
            )
          )                   AS callbacks_by_agents,
          MAX(cb."createdAt") AS last_at
        FROM "CallbackTask" cb
        WHERE ${inRange("cb")}
        GROUP BY cb."userId", cb."organizationId"
      ),
      agent_calls AS (
        SELECT
          a."userId"         AS user_id,
          a."organizationId" AS organization_id,
          COUNT(*)           AS agent_calls,
          COUNT(*) FILTER (WHERE a.status = 'completed') AS agent_calls_connected,
          COUNT(*) FILTER (WHERE ag.type = 'appointment_booking') AS booking_calls,
          COUNT(*) FILTER (WHERE ag.type = 'reminders_notifications') AS reminder_calls,
          COUNT(*) FILTER (
            WHERE a."meetingId" IS NOT NULL
               OR a.outcome IN ('meeting_booked', 'appointment_booked')
          )                  AS agent_meetings_booked,
          COUNT(*) FILTER (WHERE a.outcome = 'callback_scheduled') AS agent_callbacks_scheduled,
          COUNT(*) FILTER (
            WHERE ag.type = 'reminders_notifications' AND a.outcome = 'confirmed'
          )                  AS reminders_confirmed,
          COALESCE(SUM(cl."durationSeconds"), 0) AS agent_duration_sec,
          COALESCE(SUM(cl."totalCost"), 0)       AS agent_voice_cost,
          COALESCE(SUM(a."aiChargedCredits"), 0) AS agent_ai_cost,
          COALESCE(SUM(a."aiCostUsd"), 0)        AS agent_ai_provider_cost,
          COUNT(*) FILTER (
            WHERE a."callId" IS NOT NULL AND a."costSettledAt" IS NULL
          )                  AS agent_cost_pending,
          MAX(a."createdAt") AS last_at
        FROM "AiVoiceAgentCall" a
        JOIN "AiVoiceAgent" ag ON ag.id = a."agentId"
        LEFT JOIN "Call" cl    ON cl.id = a."callId"
        WHERE ${inRange("a")}
        GROUP BY a."userId", a."organizationId"
      ),
      account_keys AS (
        SELECT user_id, organization_id FROM meetings
        UNION
        SELECT user_id, organization_id FROM callbacks
        UNION
        SELECT user_id, organization_id FROM agent_calls
      )
      SELECT
        k.user_id,
        k.organization_id,
        u."firstName" AS first_name,
        u."lastName"  AS last_name,
        em.email      AS email,
        o.name        AS org_name,
        o.slug        AS org_slug,
        m.meetings,
        m.meetings_by_agents,
        m.meetings_cancelled,
        cb.callbacks,
        cb.callbacks_by_agents,
        ac.agent_calls,
        ac.agent_calls_connected,
        ac.booking_calls,
        ac.reminder_calls,
        ac.agent_meetings_booked,
        ac.agent_callbacks_scheduled,
        ac.reminders_confirmed,
        ac.agent_duration_sec,
        ac.agent_voice_cost,
        ac.agent_ai_cost,
        ac.agent_ai_provider_cost,
        ac.agent_cost_pending,
        GREATEST(m.last_at, cb.last_at, ac.last_at) AS last_activity_at
      FROM account_keys k
      LEFT JOIN meetings m
        ON m.user_id = k.user_id
       AND m.organization_id IS NOT DISTINCT FROM k.organization_id
      LEFT JOIN callbacks cb
        ON cb.user_id = k.user_id
       AND cb.organization_id IS NOT DISTINCT FROM k.organization_id
      LEFT JOIN agent_calls ac
        ON ac.user_id = k.user_id
       AND ac.organization_id IS NOT DISTINCT FROM k.organization_id
      LEFT JOIN "User" u ON u.id = k.user_id
      LEFT JOIN LATERAL (
        SELECT e.email FROM "UserEmail" e
        WHERE e."userId" = k.user_id
        ORDER BY e."isPrimary" DESC, e."createdAt" ASC
        LIMIT 1
      ) em ON TRUE
      LEFT JOIN "Organization" o ON o.id = k.organization_id
      ORDER BY
        COALESCE(ac.agent_calls, 0) DESC,
        COALESCE(m.meetings, 0) DESC,
        COALESCE(cb.callbacks, 0) DESC,
        last_activity_at DESC NULLS LAST
    `);

    const accounts: ActivityAccountRow[] = rows.map((r) => {
      const voice = num(r.agent_voice_cost);
      const ai = num(r.agent_ai_cost);
      return {
        userId: r.user_id,
        userName:
          fullName({ firstName: r.first_name, lastName: r.last_name }) ||
          r.email ||
          r.user_id,
        userEmail: r.email,
        organizationId: r.organization_id,
        organizationName: r.organization_id
          ? (r.org_name ?? r.organization_id)
          : null,
        organizationSlug: r.org_slug,
        meetings: num(r.meetings),
        meetingsByAgents: num(r.meetings_by_agents),
        meetingsCancelled: num(r.meetings_cancelled),
        callbacks: num(r.callbacks),
        callbacksByAgents: num(r.callbacks_by_agents),
        agentCalls: num(r.agent_calls),
        agentCallsConnected: num(r.agent_calls_connected),
        bookingCalls: num(r.booking_calls),
        reminderCalls: num(r.reminder_calls),
        agentMeetingsBooked: num(r.agent_meetings_booked),
        agentCallbacksScheduled: num(r.agent_callbacks_scheduled),
        remindersConfirmed: num(r.reminders_confirmed),
        agentDurationSec: num(r.agent_duration_sec),
        agentVoiceCost: round2(voice),
        agentAiCost: round2(ai),
        agentTotalCost: round2(voice + ai),
        agentAiProviderCostUsd: round4(num(r.agent_ai_provider_cost)),
        agentCostPending: num(r.agent_cost_pending),
        lastActivityAt: r.last_activity_at,
      };
    });

    return {
      range: { start: start.toISOString(), end: end.toISOString() },
      totals: this.sumTotals(accounts),
      accounts,
    };
  }

  /**
   * Every meeting, callback and agent call belongs to exactly one account row,
   * so the totals are the sum of the rows — no second query to drift from them.
   */
  private sumTotals(accounts: ActivityAccountRow[]): ActivityTotals {
    const totals = Object.fromEntries(COUNTER_KEYS.map((k) => [k, 0])) as {
      [K in (typeof COUNTER_KEYS)[number]]: number;
    };
    let voice = 0;
    let ai = 0;
    let provider = 0;
    const users = new Set<string>();
    const orgs = new Set<string>();

    for (const row of accounts) {
      for (const key of COUNTER_KEYS) totals[key] += row[key];
      voice += row.agentVoiceCost;
      ai += row.agentAiCost;
      provider += row.agentAiProviderCostUsd;
      users.add(row.userId);
      if (row.organizationId) orgs.add(row.organizationId);
    }

    return {
      ...totals,
      agentVoiceCost: round2(voice),
      agentAiCost: round2(ai),
      agentTotalCost: round2(voice + ai),
      agentAiProviderCostUsd: round4(provider),
      users: users.size,
      organizations: orgs.size,
    };
  }

  // ── AI voice agent call log ────────────────────────────────

  async listVoiceAgentCalls(
    filters: VoiceAgentCallFilters,
  ): Promise<VoiceAgentCallsResult> {
    const where = this.voiceAgentCallWhere(filters);

    const [rows, [countRow]] = await Promise.all([
      this.prisma.$queryRaw<
        {
          id: string;
          created_at: Date;
          agent_id: string;
          agent_name: string;
          agent_type: string;
          status: string;
          outcome: string | null;
          to_number: string;
          duration_sec: number | null;
          meeting_id: string | null;
          meeting_scheduled_at: Date | null;
          user_id: string;
          first_name: string | null;
          last_name: string | null;
          email: string | null;
          organization_id: string | null;
          org_name: string | null;
          voice_cost: number | null;
          ai_cost: number | null;
          ai_provider_cost: number | null;
          call_id: string | null;
          cost_settled_at: Date | null;
        }[]
      >(Prisma.sql`
        SELECT
          a.id,
          a."createdAt"        AS created_at,
          ag.id                AS agent_id,
          ag.name              AS agent_name,
          ag.type::text        AS agent_type,
          a.status::text       AS status,
          a.outcome::text      AS outcome,
          a."toNumber"         AS to_number,
          cl."durationSeconds" AS duration_sec,
          a."meetingId"        AS meeting_id,
          mt."scheduledAt"     AS meeting_scheduled_at,
          a."userId"           AS user_id,
          u."firstName"        AS first_name,
          u."lastName"         AS last_name,
          em.email             AS email,
          a."organizationId"   AS organization_id,
          o.name               AS org_name,
          cl."totalCost"       AS voice_cost,
          a."aiChargedCredits" AS ai_cost,
          a."aiCostUsd"        AS ai_provider_cost,
          a."callId"           AS call_id,
          a."costSettledAt"    AS cost_settled_at
        FROM "AiVoiceAgentCall" a
        JOIN "AiVoiceAgent" ag   ON ag.id = a."agentId"
        LEFT JOIN "Call" cl      ON cl.id = a."callId"
        LEFT JOIN "Meeting" mt   ON mt.id = a."meetingId"
        LEFT JOIN "User" u       ON u.id = a."userId"
        LEFT JOIN LATERAL (
          SELECT e.email FROM "UserEmail" e
          WHERE e."userId" = a."userId"
          ORDER BY e."isPrimary" DESC, e."createdAt" ASC
          LIMIT 1
        ) em ON TRUE
        LEFT JOIN "Organization" o ON o.id = a."organizationId"
        ${where}
        ORDER BY a."createdAt" DESC
        LIMIT ${filters.take} OFFSET ${filters.skip}
      `),
      this.prisma.$queryRaw<{ total: bigint }[]>(Prisma.sql`
        SELECT COUNT(*) AS total
        FROM "AiVoiceAgentCall" a
        JOIN "AiVoiceAgent" ag ON ag.id = a."agentId"
        ${where}
      `),
    ]);

    const items: VoiceAgentCallRow[] = rows.map((r) => {
      const voice = r.voice_cost == null ? null : num(r.voice_cost);
      const ai = r.ai_cost == null ? null : num(r.ai_cost);
      return {
        id: r.id,
        createdAt: r.created_at,
        agentId: r.agent_id,
        agentName: r.agent_name,
        agentType: r.agent_type,
        status: r.status,
        outcome: r.outcome,
        toNumber: r.to_number,
        durationSec: r.duration_sec,
        meetingId: r.meeting_id,
        meetingScheduledAt: r.meeting_scheduled_at,
        userId: r.user_id,
        userName:
          fullName({ firstName: r.first_name, lastName: r.last_name }) ||
          r.email ||
          r.user_id,
        userEmail: r.email,
        organizationId: r.organization_id,
        organizationName: r.organization_id
          ? (r.org_name ?? r.organization_id)
          : null,
        voiceCost: voice == null ? null : round2(voice),
        aiCost: ai == null ? null : round2(ai),
        totalCost: round2((voice ?? 0) + (ai ?? 0)),
        aiProviderCostUsd:
          r.ai_provider_cost == null ? null : round4(num(r.ai_provider_cost)),
        costPending: !!r.call_id && !r.cost_settled_at,
      };
    });

    return { items, total: num(countRow?.total) };
  }

  private voiceAgentCallWhere(filters: VoiceAgentCallFilters): Prisma.Sql {
    const conditions: Prisma.Sql[] = [
      Prisma.sql`a."createdAt" BETWEEN ${filters.start} AND ${filters.end}`,
      ...this.accountConditions(filters, "a"),
    ];
    if (filters.type) {
      conditions.push(Prisma.sql`ag.type::text = ${filters.type}`);
    }
    return Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;
  }

  /**
   * Client / organization narrowing on a table alias. `alias` is always a
   * literal from this file, never request input; the ids are bound parameters.
   */
  private accountConditions(
    filter: BackofficeAccountFilter,
    alias: string,
  ): Prisma.Sql[] {
    const conditions: Prisma.Sql[] = [];
    if (filter.userId) {
      conditions.push(
        Prisma.sql`${Prisma.raw(`${alias}."userId"`)} = ${filter.userId}::uuid`,
      );
    }
    if (filter.organizationId === "none") {
      conditions.push(
        Prisma.sql`${Prisma.raw(`${alias}."organizationId"`)} IS NULL`,
      );
    } else if (filter.organizationId) {
      conditions.push(
        Prisma.sql`${Prisma.raw(`${alias}."organizationId"`)} = ${filter.organizationId}::uuid`,
      );
    }
    return conditions;
  }
}
