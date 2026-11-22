/// <reference types="node" />
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { userInfo } from "node:os";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { AgentSession, PrismaClient } from "@prisma/client";
import { AgentSessionRepository } from "./agent-session.repository";
import { CallAttemptRepository } from "./call-attempt.repository";
import { CampaignLeadRepository } from "./campaign-lead.repository";

describe("dialer lifecycle persistence", () => {
  it("fences lifecycle writes on the incarnation, heartbeat, state and lead", async () => {
    let filter: Record<string, unknown> = {};
    const repo = new AgentSessionRepository({
      $transaction: async (run: (tx: unknown) => unknown) =>
        run({
          $queryRaw: async () => [],
          agentSession: {
            updateMany: async ({ where }: { where: typeof filter }) => {
              filter = where;
              return { count: 0 };
            },
          },
        }),
    } as never);
    const previous = {
      id: "session",
      status: "ready",
      currentLeadId: null,
      startedAt: new Date(1),
      lastHeartbeat: new Date(2),
    } as AgentSession;
    assert.equal(await repo.endIfUnchanged(previous), null);
    assert.equal(filter.startedAt, previous.startedAt);
    assert.equal(filter.lastHeartbeat, previous.lastHeartbeat);
    assert.equal(filter.status, "ready");
    assert.equal(filter.currentLeadId, null);
    assert.deepEqual(filter.callAttempts, {
      none: { call: { endedAt: null } },
    });
  });
});

// Optional integration case, following the rotation repository convention.
// The isolated PostgreSQL server must be local; this never uses DATABASE_URL.
const socket = process.env.RINGEE_DIALER_TEST_PG_SOCKET;
async function withDatabase(
  run: (
    prisma: PrismaClient,
    repo: AgentSessionRepository,
    input: { campaignId: string; userId: string; organizationId: string },
    schema: string,
  ) => Promise<void>,
) {
  assert.ok(socket!.startsWith("/private/tmp/") || socket!.startsWith("/tmp/"));
  const schema = `dialer_${randomUUID().replace(/-/g, "")}`;
  const prisma = new PrismaClient({
    datasourceUrl: `postgresql://${userInfo().username}@localhost:55445/postgres?host=${encodeURIComponent(socket!)}&schema=${schema}`,
  });
  const repo = new AgentSessionRepository(prisma as never);
  const input = {
    campaignId: randomUUID(),
    userId: randomUUID(),
    organizationId: randomUUID(),
  };
  try {
    await prisma.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    for (const sql of [
      `CREATE TYPE "${schema}"."AgentSessionStatus" AS ENUM ('ready','reserved','dialing','in_call','wrap_up','paused','offline')`,
      `CREATE TYPE "${schema}"."CampaignLeadStatus" AS ENUM ('queued','locked','dialing','in_call','wrap_up','completed','dnc','exhausted')`,
      `CREATE TYPE "${schema}"."CallAttemptStatus" AS ENUM ('created','dialing','ringing','answered','in_call','ended','dispositioned')`,
      `CREATE TYPE "${schema}"."CallOutcome" AS ENUM ('other')`,
      `CREATE TYPE "${schema}"."DialerMode" AS ENUM ('progressive','preview')`,
      `CREATE TABLE "${schema}"."User" (id uuid PRIMARY KEY, "canCall" boolean NOT NULL DEFAULT true)`,
      `CREATE TABLE "${schema}"."Campaign" (id uuid PRIMARY KEY, "dialerMode" "${schema}"."DialerMode" NOT NULL)`,
      `CREATE TABLE "${schema}"."AgentSession" (id uuid PRIMARY KEY, "campaignId" uuid NOT NULL, "userId" uuid NOT NULL, "organizationId" uuid NOT NULL,
        status "${schema}"."AgentSessionStatus" NOT NULL, "currentLeadId" uuid, "lastHeartbeat" timestamp(3) NOT NULL DEFAULT now(), "startedAt" timestamp(3) NOT NULL DEFAULT now(), "endedAt" timestamp(3), "reservedAt" timestamp(3),
        "callsAttempted" integer NOT NULL DEFAULT 0, "callsConnected" integer NOT NULL DEFAULT 0, "totalTalkSec" integer NOT NULL DEFAULT 0,
        "createdAt" timestamp(3) NOT NULL DEFAULT now(), "updatedAt" timestamp(3) NOT NULL DEFAULT now(), UNIQUE ("campaignId","userId"))`,
      `CREATE TABLE "${schema}"."Call" (id uuid PRIMARY KEY, "endedAt" timestamp(3))`,
      `CREATE TABLE "${schema}"."CampaignLead" (id uuid PRIMARY KEY, status "${schema}"."CampaignLeadStatus" NOT NULL, "lockedBy" uuid, "lockedAt" timestamp(3), "updatedAt" timestamp(3) NOT NULL DEFAULT now())`,
      `CREATE TABLE "${schema}"."CallAttempt" (id uuid PRIMARY KEY, "campaignId" uuid, "agentSessionId" uuid, "sessionStartedAt" timestamp(3), "agentUserId" uuid, "campaignLeadId" uuid, "callId" uuid, status "${schema}"."CallAttemptStatus" NOT NULL,
        "attemptNumber" integer NOT NULL DEFAULT 1, "initiatedAt" timestamp(3) NOT NULL DEFAULT now(), "ringStartedAt" timestamp(3), "answeredAt" timestamp(3), "endedAt" timestamp(3), "dispositionedAt" timestamp(3), "hangupCause" text, "durationSec" integer,
        "dispositionId" uuid, "dispositionCode" text, "dispositionNote" text, "dispositionOutcome" "${schema}"."CallOutcome", "createdAt" timestamp(3) NOT NULL DEFAULT now(), "updatedAt" timestamp(3) NOT NULL DEFAULT now())`,
    ])
      await prisma.$executeRawUnsafe(sql);
    await prisma.$executeRaw`INSERT INTO "User" (id) VALUES (${input.userId}::uuid)`;
    await prisma.$executeRaw`INSERT INTO "Campaign" (id,"dialerMode") VALUES (${input.campaignId}::uuid,'progressive')`;
    await run(prisma, repo, input, schema);
  } finally {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await prisma.$disconnect();
  }
}

it(
  "backfills assignment fences without using a historical attempt's mutable dispatch time",
  { skip: !socket },
  () =>
    withDatabase(async (prisma, repo, input) => {
      const session = (await repo.restartIfUnchanged(input, null, "ready"))!;
      await repo.transitionIf(session.id, { from: ["ready"] }, "reserved", {
        currentLeadId: randomUUID(),
      });
      const oldId = randomUUID();
      const currentId = randomUUID();
      const older = new Date(session.startedAt.getTime() - 1_000);
      const newer = new Date(session.startedAt.getTime() + 1_000);
      await prisma.$executeRaw`INSERT INTO "CallAttempt" (id,"agentSessionId",status,"createdAt","initiatedAt") VALUES
    (${oldId}::uuid,${session.id}::uuid,'ended',${older}::timestamptz AT TIME ZONE 'UTC',${newer}::timestamptz AT TIME ZONE 'UTC'),
    (${currentId}::uuid,${session.id}::uuid,'created',${newer}::timestamptz AT TIME ZONE 'UTC',${newer}::timestamptz AT TIME ZONE 'UTC')`;
      await prisma.$executeRaw`ALTER TABLE "AgentSession" DROP COLUMN "reservedAt"`;
      await prisma.$executeRaw`ALTER TABLE "CallAttempt" DROP COLUMN "sessionStartedAt"`;
      const migration = readFileSync(
        resolve(
          __dirname,
          "../../../prisma/migrations-pending/20261121120000_dialer_assignment_fences/migration.sql",
        ),
        "utf8",
      );
      for (const statement of migration.split(";").filter((s) => s.trim()))
        await prisma.$executeRawUnsafe(statement);
      const rows = await prisma.$queryRaw<
        Array<{ id: string; sessionStartedAt: Date | null }>
      >`SELECT id,"sessionStartedAt" FROM "CallAttempt"`;
      assert.equal(
        rows.find((row) => row.id === oldId)!.sessionStartedAt,
        null,
      );
      assert.equal(
        rows.find((row) => row.id === currentId)!.sessionStartedAt?.getTime(),
        session.startedAt.getTime(),
      );
      assert.ok((await repo.findById(session.id))!.reservedAt);
    }),
);

it(
  "atomically restarts and stops sessions with real PostgreSQL contention",
  { skip: !socket },
  () =>
    withDatabase(async (prisma, repo, input, schema) => {
      const starts = await Promise.all(
        Array.from({ length: 5 }, () =>
          repo.restartIfUnchanged(input, null, "offline"),
        ),
      );
      assert.equal(
        starts.filter(Boolean).length,
        1,
        "the unique campaign/user key admits one initial start",
      );
      let session = starts.find(Boolean)!;
      const old = session;
      const lead = randomUUID();
      const orphan = randomUUID();
      const terminal = randomUUID();
      const attempt = randomUUID();
      await prisma.$executeRawUnsafe(
        `INSERT INTO "${schema}"."CampaignLead" (id,status,"lockedBy","lockedAt") VALUES ($1::uuid,'locked',$2::uuid,now()),($3::uuid,'locked',$2::uuid,now()),($4::uuid,'dnc',$2::uuid,now())`,
        lead,
        session.id,
        orphan,
        terminal,
      );
      await prisma.$executeRawUnsafe(
        `INSERT INTO "${schema}"."CallAttempt" (id,"agentSessionId","campaignLeadId",status) VALUES ($1::uuid,$2::uuid,$3::uuid,'created')`,
        attempt,
        session.id,
        lead,
      );
      const broken = new AgentSessionRepository({
        $transaction: (run: (tx: unknown) => unknown) =>
          prisma.$transaction(async (tx) =>
            run({
              $queryRaw: tx.$queryRaw.bind(tx),
              agentSession: tx.agentSession,
              callAttempt: tx.callAttempt,
              campaignLead: {
                updateMany: async () => {
                  throw new Error("release failed");
                },
              },
            }),
          ),
      } as never);
      await assert.rejects(
        broken.restartIfUnchanged(input, old, "ready"),
        /release failed/,
      );
      assert.equal(
        (await repo.findById(old.id))!.startedAt.getTime(),
        old.startedAt.getTime(),
        "a failed release rolls back the session replacement too",
      );
      const preserved = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT count(*) AS count FROM "${schema}"."CallAttempt" WHERE id=$1::uuid`,
        attempt,
      );
      assert.equal(
        Number(preserved[0].count),
        1,
        "the undialed attempt deletion rolls back too",
      );
      const replacements = await Promise.all(
        Array.from({ length: 5 }, () =>
          repo.restartIfUnchanged(input, old, "ready"),
        ),
      );
      assert.equal(replacements.filter(Boolean).length, 1);
      session = replacements.find(Boolean)!;
      assert.ok(session.startedAt > old.startedAt);
      assert.equal(
        await repo.endIfUnchanged(old),
        null,
        "a delayed old stop cannot terminate the new session",
      );
      const locks = await prisma.$queryRawUnsafe<
        Array<{ id: string; status: string; lockedBy: string | null }>
      >(`SELECT id,status,"lockedBy" FROM "${schema}"."CampaignLead"`);
      assert.equal(locks.find((l) => l.id === lead)!.lockedBy, null);
      assert.equal(
        locks.find((l) => l.id === orphan)!.lockedBy,
        null,
        "recovers locks missing from currentLeadId",
      );
      assert.equal(locks.find((l) => l.id === terminal)!.status, "dnc");

      // Repeated stop calls are safe, and a completed stop can be started again.
      const stopped = await repo.endIfUnchanged(session);
      assert.equal(stopped?.status, "offline");
      session = (await repo.restartIfUnchanged(input, stopped!, "ready"))!;
      await repo.heartbeat(session.id, session.startedAt);
      // Ensure a different persisted heartbeat even at millisecond clock precision.
      await prisma.$executeRawUnsafe(
        `UPDATE "${schema}"."AgentSession" SET "lastHeartbeat" = "lastHeartbeat" + interval '1 second' WHERE id=$1::uuid`,
        session.id,
      );
      assert.equal(
        await repo.endIfUnchanged(session),
        null,
        "a stale sweep loses to a new heartbeat",
      );
      session = (await repo.findById(session.id))!;

      const call = randomUUID();
      await prisma.$executeRawUnsafe(
        `INSERT INTO "${schema}"."Call" VALUES ($1::uuid,NULL)`,
        call,
      );
      await prisma.$executeRawUnsafe(
        `INSERT INTO "${schema}"."CallAttempt" (id,"agentSessionId","campaignLeadId","callId",status) VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,'in_call')`,
        randomUUID(),
        session.id,
        lead,
        call,
      );
      assert.equal(
        await repo.restartIfUnchanged(input, session, "ready"),
        null,
      );
      assert.equal(
        await repo.endIfUnchanged(session),
        null,
        "live calls retain their reservation",
      );
      await prisma.$executeRawUnsafe(
        `UPDATE "${schema}"."Call" SET "endedAt"=now() WHERE id=$1::uuid`,
        call,
      );
      assert.ok(await repo.endIfUnchanged(session));
    }),
);

it(
  "only reclaims old progressive reservations, preserving preview and live calls despite heartbeats",
  { skip: !socket },
  () =>
    withDatabase(async (prisma, repo, input) => {
      const old = (await repo.restartIfUnchanged(input, null, "ready"))!;
      const previewCampaignId = randomUUID();
      const liveCampaignId = randomUUID();
      await prisma.$executeRaw`INSERT INTO "Campaign" (id,"dialerMode") VALUES (${previewCampaignId}::uuid,'preview'),(${liveCampaignId}::uuid,'progressive')`;
      const preview = (await repo.restartIfUnchanged(
        { ...input, campaignId: previewCampaignId },
        null,
        "ready",
      ))!;
      const live = (await repo.restartIfUnchanged(
        { ...input, campaignId: liveCampaignId },
        null,
        "ready",
      ))!;
      for (const session of [old, preview, live]) {
        assert.ok(
          await repo.transitionIf(
            session.id,
            { from: ["ready"], startedAt: session.startedAt },
            "reserved",
            { currentLeadId: randomUUID() },
          ),
        );
        await prisma.$executeRaw`UPDATE "AgentSession" SET "reservedAt" = (NOW() AT TIME ZONE 'UTC') - interval '2 minutes' WHERE id=${session.id}::uuid`;
        await repo.heartbeat(session.id, session.startedAt);
      }
      const callId = randomUUID();
      await prisma.$executeRaw`INSERT INTO "Call" (id) VALUES (${callId}::uuid)`;
      await prisma.$executeRaw`INSERT INTO "CallAttempt" (id,"agentSessionId","callId",status) VALUES (${randomUUID()}::uuid,${live.id}::uuid,${callId}::uuid,'in_call')`;
      const cutoff = new Date(Date.now() - 90_000);
      const stalled = await repo.findStalledReservations(cutoff);
      assert.deepEqual(
        stalled.map((s) => s.id),
        [old.id],
      );
      assert.ok(stalled[0].lastHeartbeat > cutoff);
      assert.ok(stalled[0].updatedAt > cutoff);
    }),
);

it(
  "serializes replacement with a provider link committed after the service snapshot",
  { skip: !socket },
  () =>
    withDatabase(async (prisma, repo, input) => {
      const session = (await repo.restartIfUnchanged(input, null, "ready"))!;
      const attemptId = randomUUID();
      const callId = randomUUID();
      await prisma.$executeRaw`INSERT INTO "Call" (id) VALUES (${callId}::uuid)`;
      await prisma.$executeRaw`INSERT INTO "CallAttempt" (id,"agentSessionId","sessionStartedAt",status) VALUES (${attemptId}::uuid,${session.id}::uuid,${session.startedAt}::timestamptz AT TIME ZONE 'UTC','dialing')`;
      let linked!: () => void;
      let release!: () => void;
      const written = new Promise<void>((resolve) => {
        linked = resolve;
      });
      const commit = new Promise<void>((resolve) => {
        release = resolve;
      });
      const attempts = new CallAttemptRepository({
        $transaction: (run: (tx: unknown) => unknown) =>
          prisma.$transaction(async (tx) =>
            run({
              $queryRaw: tx.$queryRaw.bind(tx),
              callAttempt: {
                findUnique: tx.callAttempt.findUnique.bind(tx.callAttempt),
                updateMany: async (
                  args: Parameters<typeof tx.callAttempt.updateMany>[0],
                ) => {
                  const result = await tx.callAttempt.updateMany(args);
                  linked();
                  await commit;
                  return result;
                },
              },
            }),
          ),
      } as never);
      const linking = attempts.linkCallIfUnlinked(attemptId, callId);
      let replacement: Promise<AgentSession | null> | undefined;
      try {
        await Promise.race([written, linking]);
        replacement = repo.restartIfUnchanged(input, session, "ready");
        const deadline = Date.now() + 2_000;
        while (true) {
          const [waiting] = await prisma.$queryRaw<Array<{ count: bigint }>>`
            SELECT count(*) AS count FROM pg_stat_activity
            WHERE datname = current_database() AND wait_event_type = 'Lock'
              AND pid <> pg_backend_pid()`;
          if (Number(waiting.count) > 0) break;
          assert.ok(
            Date.now() < deadline,
            "replacement must wait for the in-flight provider link",
          );
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
        release();
        assert.equal(await linking, true);
        assert.equal(await replacement, null);
        assert.equal(
          (await repo.findById(session.id))!.startedAt.getTime(),
          session.startedAt.getTime(),
        );
      } finally {
        release();
        await Promise.allSettled([linking, replacement]);
      }
    }),
);

it(
  "fences reservation recovery on its claim timestamp and account cleanup independently of heartbeats",
  { skip: !socket },
  () =>
    withDatabase(async (prisma, repo, input) => {
      const started = (await repo.restartIfUnchanged(input, null, "ready"))!;
      const leadId = randomUUID();
      await repo.transitionIf(started.id, { from: ["ready"] }, "reserved", {
        currentLeadId: leadId,
      });
      const old = (await repo.findById(started.id))!;
      await repo.transitionIf(started.id, { from: ["reserved"] }, "ready", {
        currentLeadId: null,
      });
      await repo.transitionIf(started.id, { from: ["ready"] }, "reserved", {
        currentLeadId: leadId,
      });
      const current = (await repo.findById(started.id))!;
      assert.ok(current.reservedAt! > old.reservedAt!);
      assert.equal(
        await repo.transitionIf(
          started.id,
          {
            from: ["reserved"],
            currentLeadId: leadId,
            startedAt: started.startedAt,
            reservedAt: old.reservedAt,
          },
          "paused",
          { currentLeadId: null },
        ),
        false,
      );
      await prisma.$executeRaw`UPDATE "AgentSession" SET "lastHeartbeat" = "lastHeartbeat" + interval '1 second' WHERE id=${started.id}::uuid`;
      assert.equal(await repo.endIfUnchanged(current), null);
      assert.equal(
        (await repo.endForAccountDisable(current, false))!.status,
        "offline",
      );
    }),
);

it(
  "keeps pending activation behind the persisted account disable fence",
  { skip: !socket },
  () =>
    withDatabase(async (prisma, repo, input) => {
      const session = (await repo.restartIfUnchanged(input, null, "offline"))!;
      let updated!: () => void;
      let release!: () => void;
      const disabled = new Promise<void>((resolve) => {
        updated = resolve;
      });
      const commit = new Promise<void>((resolve) => {
        release = resolve;
      });
      const disable = prisma.$transaction(async (tx) => {
        await tx.$executeRaw`UPDATE "User" SET "canCall"=false WHERE id=${input.userId}::uuid`;
        updated();
        await commit;
      });
      try {
        await disabled;
        const activating = repo.transitionIf(
          session.id,
          { from: ["offline"], endedAt: null, startedAt: session.startedAt },
          "ready",
        );
        release();
        await disable;
        assert.equal(await activating, false);
        assert.deepEqual(
          (await repo.findActiveByUser(input.userId)).map((s) => s.id),
          [session.id],
        );
        const ended = await repo.endForAccountDisable(session, false);
        assert.ok(ended?.endedAt);
        assert.equal(
          await repo.transitionIf(
            session.id,
            { from: ["offline"], endedAt: null, startedAt: session.startedAt },
            "ready",
          ),
          false,
        );
      } finally {
        release();
        await disable;
      }
    }),
);

it(
  "recovers historical lock owners while protecting current assignments, unconfirmed dials and live calls",
  { skip: !socket },
  () =>
    withDatabase(async (prisma, repo, input) => {
      const session = (await repo.restartIfUnchanged(input, null, "ready"))!;
      const leads = Array.from({ length: 6 }, () => randomUUID());
      for (let i = 0; i < leads.length; i++) {
        const sessionId = randomUUID();
        const callId = i === 3 ? randomUUID() : null;
        await prisma.$executeRaw`INSERT INTO "AgentSession" (id,"campaignId","userId","organizationId",status,"currentLeadId") VALUES (${sessionId}::uuid,${input.campaignId}::uuid,${randomUUID()}::uuid,${input.organizationId}::uuid,${i === 2 || i === 3 || i === 4 ? "offline" : "reserved"}::"AgentSessionStatus",${i === 0 ? randomUUID() : leads[i]}::uuid)`;
        await prisma.$executeRaw`INSERT INTO "CampaignLead" (id,status,"lockedBy","lockedAt") VALUES (${leads[i]}::uuid,'locked',${i === 5 ? session.id : sessionId}::uuid,(NOW() AT TIME ZONE 'UTC') - interval '10 minutes')`;
        if (callId)
          await prisma.$executeRaw`INSERT INTO "Call" (id) VALUES (${callId}::uuid)`;
        await prisma.$executeRaw`INSERT INTO "CallAttempt" (id,"agentSessionId","campaignLeadId","callId",status,"initiatedAt") VALUES (${randomUUID()}::uuid,${sessionId}::uuid,${leads[i]}::uuid,${callId}::uuid,${i === 2 || i === 4 ? "dialing" : "created"}::"CallAttemptStatus", (NOW() AT TIME ZONE 'UTC') - ${i === 4 ? "2 minutes" : "1 second"}::interval)`;
        if (i === 2 || i === 4)
          assert.equal(
            !!(await new CallAttemptRepository(
              prisma as never,
            ).findUnconfirmedDialForSession(sessionId)),
            i === 2,
          );
      }
      assert.equal(
        await new CampaignLeadRepository(prisma as never).requeueStaleLocked(
          5 * 60_000,
        ),
        3,
      );
      const rows = await prisma.$queryRaw<
        Array<{ id: string; status: string }>
      >`SELECT id,status FROM "CampaignLead"`;
      assert.deepEqual(
        rows
          .filter((r) => r.status === "queued")
          .map((r) => r.id)
          .sort(),
        [leads[0], leads[4], leads[5]].sort(),
      );
    }),
);
