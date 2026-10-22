/// <reference types="node" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  VOICEMAIL_DROP_STATE_PREFIX,
  answeredCallWhere,
  isAnsweredCallSql,
  isConnectedAttemptSql,
} from "./answered-call.sql";
import { DashboardRepository } from "./dashboard.repository";
import { OutboundAnalyticsRepository } from "./outbound-analytics.repository";

const encode = (state: unknown) =>
  Buffer.from(
    typeof state === "string" ? state : JSON.stringify(state),
  ).toString("base64");

const range = {
  start: new Date("2026-10-01T00:00:00Z"),
  end: new Date("2026-10-21T23:59:59Z"),
};

// Explicit opt-in: never inherit a developer's application DATABASE_URL. The
// SQL test below writes only to a temporary table that its transaction drops.
const sqlTestUrl = process.env.RINGEE_ANALYTICS_TEST_DATABASE_URL;

describe("answered calls (CALL-012)", () => {
  it("recognises a voicemail drop's leg by the client state it was dialed with", () => {
    // Built exactly as VoicemailDropService.sendVoicemail stamps it.
    const drops = [
      { action: "voicemail_drop_send", assetId: "a1" },
      { action: "voicemail_drop_send", assetId: "a1", callId: "c1" },
    ];
    for (const drop of drops) {
      assert.ok(encode(drop).startsWith(VOICEMAIL_DROP_STATE_PREFIX));
    }

    // A dialed call, a campaign leg and a desk-phone leg are not drops.
    for (const other of [
      "initiate_call",
      { callAttemptId: "attempt-1" },
      { sipDeviceId: "device-1", source: "sip_device" },
      { action: "initiate_call" },
    ]) {
      assert.ok(!encode(other).startsWith(VOICEMAIL_DROP_STATE_PREFIX));
    }
  });

  it("keeps the calls nobody dispositioned and the legs without a client state", () => {
    const [answered, outcome, notDrop] = answeredCallWhere();
    assert.deepEqual(answered, { answeredAt: { not: null } });
    assert.deepEqual(outcome, {
      OR: [
        { outcome: null },
        { outcome: { notIn: ["no_answer", "voicemail"] } },
      ],
    });
    assert.deepEqual(notDrop, {
      OR: [
        { clientState: null },
        { NOT: { clientState: { startsWith: VOICEMAIL_DROP_STATE_PREFIX } } },
      ],
    });
    assert.deepEqual(
      answeredCallWhere(["no_answer", "voicemail", "wrong_number"])[1],
      {
        OR: [
          { outcome: null },
          { outcome: { notIn: ["no_answer", "voicemail", "wrong_number"] } },
        ],
      },
    );
  });

  it("reads a campaign attempt on its canonical outcome, null-safe", () => {
    const sql = isConnectedAttemptSql("ca");
    assert.match(sql, /ca\."answeredAt" IS NOT NULL/);
    assert.match(
      sql,
      /COALESCE\(ca\."dispositionOutcome"::text, ca\."dispositionCode"\) IS NULL OR COALESCE\(ca\."dispositionOutcome"::text, ca\."dispositionCode"\) NOT IN \('no_answer','voicemail'\)/,
    );
    assert.match(isConnectedAttemptSql(), /^\("answeredAt" IS NOT NULL/);
  });

  it("does not count a voicemail drop as an answered call in SQL", () => {
    const sql = isAnsweredCallSql("c");
    assert.ok(
      sql.includes(
        `c."clientState" IS NULL OR c."clientState" NOT LIKE '${VOICEMAIL_DROP_STATE_PREFIX}%'`,
      ),
    );
    assert.ok(
      sql.includes(
        `c.outcome IS NULL OR c.outcome NOT IN ('no_answer','voicemail')`,
      ),
    );
  });

  it("counts the dashboard's answered calls with the shared rule, beside an outcome filter", async () => {
    const counts: any[] = [];
    const repo = new DashboardRepository({
      call: {
        count: async (q: unknown) => {
          counts.push(q);
          return 0;
        },
        aggregate: async () => ({ _avg: { durationSeconds: null } }),
      },
      meeting: { count: async () => 0 },
      callbackTask: { count: async () => 0 },
    } as never);

    await repo.getKpis({
      userId: "u1",
      organizationId: "o1",
      isOrgAdmin: true,
      scope: "organization",
      dateRange: range,
      campaignId: null,
      outcome: "interested",
    });

    const answered = counts.find((q) => q.where.AND);
    assert.ok(answered, "the answered count is issued");
    assert.deepEqual(answered.where.AND, answeredCallWhere());
    assert.equal(answered.where.outcome, "interested");
    assert.equal(answered.where.organizationId, "o1");
  });

  it("counts an agent's answered calls with the shared rule", async () => {
    let sql = "";
    const repo = new DashboardRepository({
      $queryRaw: async (
        strings: TemplateStringsArray,
        ...values: unknown[]
      ) => {
        sql = Prisma.sql(strings, ...values).sql;
        return [];
      },
    } as never);

    await repo.getAgentPerformance({
      userId: "u1",
      organizationId: "o1",
      isOrgAdmin: true,
      scope: "organization",
      dateRange: range,
    });

    assert.ok(sql.includes(isAnsweredCallSql("c")));
  });

  it("counts a campaign's connected attempts and their talk time without voicemails", async () => {
    let sql = "";
    const repo = new OutboundAnalyticsRepository({
      $queryRawUnsafe: async (query: string) => {
        sql = query;
        return [{}];
      },
    } as never);

    await repo.getCampaignSummary("campaign-1");

    const connected = isConnectedAttemptSql();
    assert.ok(
      sql.includes(`COUNT(*) FILTER (WHERE ${connected}) as connected`),
    );
    assert.ok(sql.includes(`AVG("durationSec") FILTER (WHERE ${connected})`));
    assert.ok(!sql.includes(`FILTER (WHERE "answeredAt" IS NOT NULL)`));
  });

  it(
    "classifies voicemail, no-answer and connected attempts in a campaign summary (PostgreSQL)",
    { skip: !sqlTestUrl },
    async () => {
      const prisma = new PrismaClient({ datasourceUrl: sqlTestUrl });
      const campaignId = "00000000-0000-0000-0000-0000000000c1";
      const otherCampaignId = "00000000-0000-0000-0000-0000000000c2";
      try {
        const summary = await prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            `CREATE TEMP TABLE "CallAttempt" (id serial PRIMARY KEY, "campaignId" uuid, "campaignLeadId" uuid,
            "answeredAt" timestamp, "dispositionOutcome" text, "dispositionCode" text, "durationSec" int) ON COMMIT DROP`,
          );
          const attempt = async (
            campaign: string,
            answered: boolean,
            outcome: string | null,
            code: string | null,
            durationSec: number,
          ) => {
            await tx.$executeRaw`INSERT INTO "CallAttempt"
              ("campaignId", "campaignLeadId", "answeredAt", "dispositionOutcome", "dispositionCode", "durationSec")
              VALUES (${campaign}::uuid, gen_random_uuid(),
                ${answered ? new Date("2026-10-20T15:00:00Z") : null}::timestamp,
                ${outcome}, ${code}, ${durationSec})`;
          };
          // Connected: a person answered, whatever came of it.
          await attempt(campaignId, true, "interested", "interested", 60);
          await attempt(campaignId, true, "meeting_booked", "demo_booked", 120);
          await attempt(campaignId, true, null, null, 90);
          // Not connected: the machine answered, or nobody did.
          await attempt(campaignId, true, "voicemail", "voicemail", 30);
          await attempt(campaignId, true, null, "voicemail", 20);
          await attempt(campaignId, false, "no_answer", "no_answer", 0);
          // Another campaign's attempt is not counted at all.
          await attempt(otherCampaignId, true, "interested", "interested", 600);

          return new OutboundAnalyticsRepository(
            tx as never,
          ).getCampaignSummary(campaignId);
        });

        assert.equal(summary.totalAttempts, 6);
        assert.equal(summary.connected, 3);
        assert.equal(summary.contactRate, 50);
        assert.equal(Number(summary.avgHandleTimeSec), 90);
        assert.equal(summary.conversions, 1);
      } finally {
        await prisma.$disconnect();
      }
    },
  );
});
