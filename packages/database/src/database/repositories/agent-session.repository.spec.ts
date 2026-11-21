/// <reference types="node" />
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { userInfo } from "node:os";
import { describe, it } from "node:test";
import { AgentSession, PrismaClient } from "@prisma/client";
import { AgentSessionRepository } from "./agent-session.repository";

describe("dialer lifecycle persistence", () => {
  it("fences lifecycle writes on the incarnation, heartbeat, state and lead", async () => {
    let filter: Record<string, unknown> = {};
    const repo = new AgentSessionRepository({
      $transaction: async (run: (tx: unknown) => unknown) =>
        run({
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

  it("only reclaims old progressive reservations, preserving preview and live calls", async () => {
    let filter: Record<string, unknown> = {};
    const repo = new AgentSessionRepository({
      agentSession: {
        findMany: async ({ where }: { where: typeof filter }) => {
          filter = where;
          return [];
        },
      },
    } as never);
    const cutoff = new Date();
    await repo.findStalledReservations(cutoff);
    assert.equal(filter.status, "reserved");
    assert.deepEqual(filter.updatedAt, { lt: cutoff });
    assert.deepEqual(filter.campaign, { dialerMode: "progressive" });
    assert.deepEqual(filter.callAttempts, {
      none: { call: { endedAt: null } },
    });
  });
});

// Optional integration case, following the rotation repository convention.
// The isolated PostgreSQL server must be local; this never uses DATABASE_URL.
const socket = process.env.RINGEE_DIALER_TEST_PG_SOCKET;
it(
  "atomically restarts and stops sessions with real PostgreSQL contention",
  { skip: !socket },
  async () => {
    assert.ok(
      socket!.startsWith("/private/tmp/") || socket!.startsWith("/tmp/"),
    );
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
        `CREATE TABLE "${schema}"."AgentSession" (id uuid PRIMARY KEY, "campaignId" uuid NOT NULL, "userId" uuid NOT NULL, "organizationId" uuid NOT NULL,
        status "${schema}"."AgentSessionStatus" NOT NULL, "currentLeadId" uuid, "lastHeartbeat" timestamp NOT NULL DEFAULT now(), "startedAt" timestamp NOT NULL DEFAULT now(), "endedAt" timestamp,
        "callsAttempted" integer NOT NULL DEFAULT 0, "callsConnected" integer NOT NULL DEFAULT 0, "totalTalkSec" integer NOT NULL DEFAULT 0,
        "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now(), UNIQUE ("campaignId","userId"))`,
        `CREATE TABLE "${schema}"."Call" (id uuid PRIMARY KEY, "endedAt" timestamp)`,
        `CREATE TABLE "${schema}"."CampaignLead" (id uuid PRIMARY KEY, status "${schema}"."CampaignLeadStatus" NOT NULL, "lockedBy" uuid, "lockedAt" timestamp, "updatedAt" timestamp NOT NULL DEFAULT now())`,
        `CREATE TABLE "${schema}"."CallAttempt" (id uuid PRIMARY KEY, "agentSessionId" uuid, "campaignLeadId" uuid, "callId" uuid, status "${schema}"."CallAttemptStatus" NOT NULL)`,
      ])
        await prisma.$executeRawUnsafe(sql);

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
    } finally {
      await prisma.$executeRawUnsafe(
        `DROP SCHEMA IF EXISTS "${schema}" CASCADE`,
      );
      await prisma.$disconnect();
    }
  },
);
