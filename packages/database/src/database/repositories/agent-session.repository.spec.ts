/// <reference types="node" />
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { userInfo } from "node:os";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { AgentSession, PrismaClient, Prisma } from "@prisma/client";
import { AgentSessionRepository } from "./agent-session.repository";
import {
  CallAttemptRepository,
  CampaignAssignmentChangedError,
} from "./call-attempt.repository";
import { CallbackTaskRepository } from "./callback-task.repository";
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

function observeTransactions(
  prisma: PrismaClient,
  onBegin: (pid: number) => void,
  decorate: (tx: Prisma.TransactionClient) => unknown = (tx) => tx,
) {
  return {
    $transaction: (run: (tx: unknown) => Promise<unknown>) =>
      prisma.$transaction(async (tx) => {
        const [backend] = await tx.$queryRaw<
          Array<{ pid: number }>
        >`SELECT pg_backend_pid() AS pid`;
        onBegin(backend.pid);
        return run(decorate(tx));
      }),
  };
}

async function waitForBlocker(
  prisma: PrismaClient,
  waiter: number,
  blocker: number,
) {
  const deadline = Date.now() + 2_000;
  while (true) {
    const [state] = await prisma.$queryRaw<Array<{ blocked: boolean }>>`
      SELECT ${blocker}::int = ANY(pg_blocking_pids(${waiter}::int)) AS blocked`;
    if (state.blocked) return;
    assert.ok(
      Date.now() < deadline,
      `backend ${waiter} must be blocked by ${blocker}`,
    );
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

async function contenderBackend(
  captured: Promise<number>,
  contender: Promise<unknown>,
): Promise<number> {
  let timer!: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      captured,
      contender.then(() => {
        throw new Error(
          "Contender settled before its backend PID was captured",
        );
      }),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () =>
            reject(new Error("Timed out waiting for contender backend PID")),
          2_000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
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
      `CREATE TYPE "${schema}"."CampaignLeadStatus" AS ENUM ('pending','queued','locked','dialing','in_call','wrap_up','dispositioned','scheduled','completed','dnc','exhausted')`,
      `CREATE TYPE "${schema}"."CallAttemptStatus" AS ENUM ('created','dialing','ringing','answered','in_call','ended','dispositioned')`,
      `CREATE TYPE "${schema}"."CallOutcome" AS ENUM ('other')`,
      `CREATE TYPE "${schema}"."DialerMode" AS ENUM ('progressive','preview')`,
      `CREATE TABLE "${schema}"."User" (id uuid PRIMARY KEY, "canCall" boolean NOT NULL DEFAULT true)`,
      `CREATE TABLE "${schema}"."Contact" (id uuid PRIMARY KEY)`,
      `CREATE TABLE "${schema}"."Campaign" (id uuid PRIMARY KEY, "dialerMode" "${schema}"."DialerMode" NOT NULL)`,
      `CREATE TABLE "${schema}"."AgentSession" (id uuid PRIMARY KEY, "campaignId" uuid NOT NULL, "userId" uuid NOT NULL, "organizationId" uuid NOT NULL,
        status "${schema}"."AgentSessionStatus" NOT NULL, "currentLeadId" uuid, "lastHeartbeat" timestamp(3) NOT NULL DEFAULT now(), "startedAt" timestamp(3) NOT NULL DEFAULT now(), "endedAt" timestamp(3), "reservedAt" timestamp(3),
        "eventStreamId" uuid, "callsAttempted" integer NOT NULL DEFAULT 0, "callsConnected" integer NOT NULL DEFAULT 0, "totalTalkSec" integer NOT NULL DEFAULT 0,
        "createdAt" timestamp(3) NOT NULL DEFAULT now(), "updatedAt" timestamp(3) NOT NULL DEFAULT now(), UNIQUE ("campaignId","userId"))`,
      `CREATE TABLE "${schema}"."Call" (id uuid PRIMARY KEY, "endedAt" timestamp(3), "outcomeRevision" integer NOT NULL DEFAULT 0, "dispositionId" uuid)`,
      `CREATE TABLE "${schema}"."CampaignLead" (id uuid PRIMARY KEY, "campaignId" uuid, "contactId" uuid, "listId" uuid, "userId" uuid, priority integer NOT NULL DEFAULT 0, metadata jsonb, status "${schema}"."CampaignLeadStatus" NOT NULL, "lockedBy" uuid, "lockedAt" timestamp(3), attempts integer NOT NULL DEFAULT 0, "lastCallAt" timestamp(3), "nextCallAt" timestamp(3), "deadAt" timestamp(3), "createdAt" timestamp(3) NOT NULL DEFAULT now(), "updatedAt" timestamp(3) NOT NULL DEFAULT now())`,
      `CREATE TABLE "${schema}"."CallAttempt" (id uuid PRIMARY KEY, "campaignId" uuid, "agentSessionId" uuid, "sessionStartedAt" timestamp(3), "sessionReservedAt" timestamp(3), "agentUserId" uuid, "campaignLeadId" uuid, "callId" uuid, status "${schema}"."CallAttemptStatus" NOT NULL,
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

for (const change of ["status", "lead"] as const) {
  it(
    `does not stop a session after its ${change} changes`,
    { skip: !socket },
    () =>
      withDatabase(async (prisma, repo, input) => {
        const previous = (await repo.restartIfUnchanged(input, null, "ready"))!;
        if (change === "status")
          await prisma.agentSession.update({
            where: { id: previous.id },
            data: { status: "paused" },
          });
        else
          await prisma.agentSession.update({
            where: { id: previous.id },
            data: { currentLeadId: randomUUID() },
          });
        const current = await repo.findById(previous.id);
        assert.equal(await repo.endIfUnchanged(previous), null);
        assert.deepEqual(await repo.findById(previous.id), current);
      }),
  );
}

it(
  "fences an expired stream attachment behind the successor's persisted token",
  { skip: !socket },
  () =>
    withDatabase(async (_prisma, repo, input) => {
      const session = (await repo.restartIfUnchanged(input, null, "ready"))!;
      const successor = randomUUID();
      assert.ok(
        await repo.heartbeat(session.id, session.startedAt, {
          id: successor,
          previousId: null,
        }),
      );
      assert.equal(
        await repo.heartbeat(session.id, session.startedAt, {
          id: randomUUID(),
          previousId: null,
        }),
        null,
      );
      const beat = (await repo.heartbeat(session.id, session.startedAt))!;
      assert.equal(beat.eventStreamId, successor);
    }),
);

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
      const beforeBackfill = await prisma.$queryRaw<
        Array<{ sessionStartedAt: Date | null }>
      >`SELECT "sessionStartedAt" FROM "CallAttempt"`;
      assert.ok(
        beforeBackfill.every((row) => row.sessionStartedAt === null),
        "column migration commits separately from backfill",
      );
      const backfill = readFileSync(
        resolve(
          __dirname,
          "../../../prisma/migrations-pending/20261121121000_backfill_dialer_assignment_fences/migration.sql",
        ),
        "utf8",
      );
      await prisma.$executeRawUnsafe(backfill);
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
      await prisma.$executeRaw`INSERT INTO "CallAttempt" (id,"agentSessionId","sessionStartedAt","campaignLeadId",status) VALUES (${attemptId}::uuid,${session.id}::uuid,${session.startedAt}::timestamptz AT TIME ZONE 'UTC',${randomUUID()}::uuid,'dialing')`;
      let linked!: () => void;
      let release!: () => void;
      const written = new Promise<void>((resolve) => {
        linked = resolve;
      });
      const commit = new Promise<void>((resolve) => {
        release = resolve;
      });
      let linkingPid = 0;
      let replacementStarted!: (pid: number) => void;
      const replacementBackend = new Promise<number>((resolve) => {
        replacementStarted = resolve;
      });
      const replacingRepo = new AgentSessionRepository(
        observeTransactions(prisma, replacementStarted) as never,
      );
      const attempts = new CallAttemptRepository({
        $transaction: (run: (tx: unknown) => unknown) =>
          prisma.$transaction(async (tx) => {
            const [backend] = await tx.$queryRaw<
              Array<{ pid: number }>
            >`SELECT pg_backend_pid() AS pid`;
            linkingPid = backend.pid;
            return run({
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
            });
          }),
      } as never);
      const linking = attempts.linkCallIfUnlinked(attemptId, callId);
      let replacement: Promise<AgentSession | null> | undefined;
      try {
        await Promise.race([written, linking]);
        replacement = replacingRepo.restartIfUnchanged(input, session, "ready");
        await waitForBlocker(
          prisma,
          await contenderBackend(replacementBackend, replacement),
          linkingPid,
        );
        release();
        assert.equal(await linking, true);
        assert.equal(await replacement, null);
        assert.equal(
          await repo.endIfUnchanged(session, true, { rejectLiveCalls: true }),
          null,
          "explicit stop rejects a newly linked leg even when preserving a dispatch",
        );
        assert.ok(
          await repo.endIfUnchanged(session, true),
          "stale cleanup may retain a live leg while ending its session",
        );
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
      await prisma.$executeRaw`UPDATE "User" SET "canCall"=false WHERE id=${input.userId}::uuid`;
      const ended = await repo.endForAccountDisable(current, false);
      assert.equal(
        ended.outcome === "ended" && ended.session.status,
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
      let disablingPid = 0;
      let activationStarted!: (pid: number) => void;
      const activationBackend = new Promise<number>((resolve) => {
        activationStarted = resolve;
      });
      const activatingRepo = new AgentSessionRepository(
        observeTransactions(prisma, activationStarted) as never,
      );
      const disable = prisma.$transaction(async (tx) => {
        const [backend] = await tx.$queryRaw<
          Array<{ pid: number }>
        >`SELECT pg_backend_pid() AS pid`;
        disablingPid = backend.pid;
        await tx.$executeRaw`UPDATE "User" SET "canCall"=false WHERE id=${input.userId}::uuid`;
        updated();
        await commit;
      });
      let activating: Promise<boolean> | undefined;
      try {
        await Promise.race([disabled, disable]);
        activating = activatingRepo.transitionIf(
          session.id,
          { from: ["offline"], endedAt: null, startedAt: session.startedAt },
          "ready",
        );
        await waitForBlocker(
          prisma,
          await contenderBackend(activationBackend, activating),
          disablingPid,
        );
        release();
        await disable;
        assert.equal(await activating, false);
        assert.deepEqual(
          (await repo.findActiveByUser(input.userId)).map((s) => s.id),
          [session.id],
        );
        const ended = await repo.endForAccountDisable(session, false);
        assert.ok(ended.outcome === "ended" && ended.session.endedAt);
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
        await Promise.allSettled([disable, activating]);
      }
    }),
);

it(
  "recovers historical lock owners while protecting current assignments, unconfirmed dials and live calls",
  { skip: !socket },
  () =>
    withDatabase(async (prisma, repo, input) => {
      const session = (await repo.restartIfUnchanged(input, null, "ready"))!;
      const leads = Array.from({ length: 9 }, () => randomUUID());
      for (let i = 0; i < leads.length; i++) {
        const sessionId = randomUUID();
        const callId = i === 3 || i >= 6 ? randomUUID() : null;
        await prisma.$executeRaw`INSERT INTO "AgentSession" (id,"campaignId","userId","organizationId",status,"currentLeadId") VALUES (${sessionId}::uuid,${input.campaignId}::uuid,${randomUUID()}::uuid,${input.organizationId}::uuid,${i === 2 || i === 3 || i === 4 || i >= 6 ? "offline" : "reserved"}::"AgentSessionStatus",${i === 0 ? randomUUID() : leads[i]}::uuid)`;
        await prisma.$executeRaw`INSERT INTO "CampaignLead" (id,status,"lockedBy","lockedAt") VALUES (${leads[i]}::uuid,'locked',${i === 5 ? session.id : sessionId}::uuid,(NOW() AT TIME ZONE 'UTC') - interval '10 minutes')`;
        if (callId)
          await prisma.$executeRaw`INSERT INTO "Call" (id,"endedAt") VALUES (${callId}::uuid,${i >= 6 ? new Date() : null}::timestamptz AT TIME ZONE 'UTC')`;
        await prisma.$executeRaw`INSERT INTO "CallAttempt" (id,"agentSessionId","campaignLeadId","callId",status,"initiatedAt") VALUES (${randomUUID()}::uuid,${sessionId}::uuid,${leads[i]}::uuid,${callId}::uuid,${i === 7 ? "ringing" : i === 8 ? "answered" : i === 2 || i === 4 || i === 6 ? "dialing" : "created"}::"CallAttemptStatus", (NOW() AT TIME ZONE 'UTC') - ${i === 4 ? "2 minutes" : "1 second"}::interval)`;
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
      assert.equal(
        await prisma.callAttempt.count(),
        6,
        "recovered undialed attempts do not count as campaign calls",
      );
    }),
);

it(
  "refuses account cleanup after a concurrent restore commits",
  { skip: !socket },
  () =>
    withDatabase(async (prisma, repo, input) => {
      const session = (await repo.restartIfUnchanged(input, null, "offline"))!;
      await prisma.$executeRaw`UPDATE "User" SET "canCall"=false WHERE id=${input.userId}::uuid`;
      let restored!: () => void;
      let release!: () => void;
      const written = new Promise<void>((resolve) => {
        restored = resolve;
      });
      const commit = new Promise<void>((resolve) => {
        release = resolve;
      });
      let restorePid = 0;
      let cleanupStarted!: (pid: number) => void;
      const cleanupBackend = new Promise<number>((resolve) => {
        cleanupStarted = resolve;
      });
      const cleanup = new AgentSessionRepository(
        observeTransactions(prisma, cleanupStarted) as never,
      );
      const restoring = prisma.$transaction(async (tx) => {
        const [backend] = await tx.$queryRaw<
          Array<{ pid: number }>
        >`SELECT pg_backend_pid() AS pid`;
        restorePid = backend.pid;
        await tx.$executeRaw`UPDATE "User" SET "canCall"=true WHERE id=${input.userId}::uuid`;
        restored();
        await commit;
      });
      let ending:
        | ReturnType<AgentSessionRepository["endForAccountDisable"]>
        | undefined;
      try {
        await Promise.race([written, restoring]);
        ending = cleanup.endForAccountDisable(session, false);
        await waitForBlocker(
          prisma,
          await contenderBackend(cleanupBackend, ending),
          restorePid,
        );
        release();
        await restoring;
        assert.deepEqual(await ending, { outcome: "calling_enabled" });
        assert.equal((await repo.findById(session.id))!.endedAt, null);
      } finally {
        release();
        await Promise.allSettled([restoring, ending]);
      }
    }),
);

it(
  "serializes expired dial recovery and provider linking in either order",
  { skip: !socket },
  async () => {
    for (const linkingWins of [true, false])
      await withDatabase(async (prisma, repo, input) => {
        const session = (await repo.restartIfUnchanged(
          input,
          null,
          "offline",
        ))!;
        const leadId = randomUUID();
        const attemptId = randomUUID();
        const callId = randomUUID();
        await prisma.$executeRaw`UPDATE "AgentSession" SET "currentLeadId"=${leadId}::uuid, "endedAt"=NOW() AT TIME ZONE 'UTC' WHERE id=${session.id}::uuid`;
        await prisma.$executeRaw`INSERT INTO "CampaignLead" (id,status,"lockedBy","lockedAt") VALUES (${leadId}::uuid,'locked',${session.id}::uuid,(NOW() AT TIME ZONE 'UTC') - interval '10 minutes')`;
        await prisma.$executeRaw`INSERT INTO "Call" (id) VALUES (${callId}::uuid)`;
        await prisma.$executeRaw`INSERT INTO "CallAttempt" (id,"agentSessionId","sessionStartedAt","campaignLeadId",status,"initiatedAt") VALUES (${attemptId}::uuid,${session.id}::uuid,${session.startedAt}::timestamptz AT TIME ZONE 'UTC',${leadId}::uuid,'dialing',(NOW() AT TIME ZONE 'UTC') - interval '2 minutes')`;
        let firstPid = 0;
        let secondStarted!: (pid: number) => void;
        const secondBackend = new Promise<number>((resolve) => {
          secondStarted = resolve;
        });
        let reached!: () => void;
        let release!: () => void;
        const written = new Promise<void>((resolve) => {
          reached = resolve;
        });
        const commit = new Promise<void>((resolve) => {
          release = resolve;
        });
        const held = observeTransactions(
          prisma,
          (pid) => {
            firstPid = pid;
          },
          (tx) => ({
            $queryRaw: tx.$queryRaw.bind(tx),
            agentSession: tx.agentSession,
            campaignLead: tx.campaignLead,
            callAttempt: {
              findUnique: tx.callAttempt.findUnique.bind(tx.callAttempt),
              updateMany: async (
                args: Parameters<typeof tx.callAttempt.updateMany>[0],
              ) => {
                const changed = await tx.callAttempt.updateMany(args);
                reached();
                await commit;
                return changed;
              },
              deleteMany: async (
                args: Parameters<typeof tx.callAttempt.deleteMany>[0],
              ) => {
                const changed = await tx.callAttempt.deleteMany(args);
                reached();
                await commit;
                return changed;
              },
            },
          }),
        );
        const waiting = observeTransactions(prisma, secondStarted);
        const first = linkingWins
          ? new CallAttemptRepository(held as never).linkCallIfUnlinked(
              attemptId,
              callId,
            )
          : new CampaignLeadRepository({
              ...held,
              $queryRaw: prisma.$queryRaw.bind(prisma),
            } as never).requeueStaleLocked(5 * 60_000);
        let second: Promise<number | boolean> | undefined;
        try {
          await Promise.race([written, first]);
          second = linkingWins
            ? new CampaignLeadRepository({
                ...waiting,
                $queryRaw: prisma.$queryRaw.bind(prisma),
              } as never).requeueStaleLocked(5 * 60_000)
            : new CallAttemptRepository(waiting as never).linkCallIfUnlinked(
                attemptId,
                callId,
              );
          await waitForBlocker(
            prisma,
            await contenderBackend(secondBackend, second),
            firstPid,
          );
          release();
          assert.equal(await first, linkingWins ? true : 1);
          assert.equal(await second, linkingWins ? 0 : false);
          const [lead] = await prisma.$queryRaw<
            Array<{ status: string; lockedBy: string | null }>
          >`SELECT status,"lockedBy" FROM "CampaignLead" WHERE id=${leadId}::uuid`;
          const [attempt] = await prisma.$queryRaw<
            Array<{ status: string; callId: string | null }>
          >`SELECT status,"callId" FROM "CallAttempt" WHERE id=${attemptId}::uuid`;
          assert.equal(lead.status, linkingWins ? "locked" : "queued");
          assert.equal(lead.lockedBy, linkingWins ? session.id : null);
          assert.equal(attempt?.callId ?? null, linkingWins ? callId : null);
          if (!linkingWins) {
            assert.equal(attempt, undefined);
            assert.equal(
              await new CallAttemptRepository(prisma as never).markDialing(
                attemptId,
              ),
              false,
            );
            assert.equal(
              (await repo.findById(session.id))!.currentLeadId,
              null,
            );
          }
        } finally {
          release();
          await Promise.allSettled([first, second]);
        }
      });
  },
);

it(
  "serializes undialed cancellation and provider linking in either order",
  { skip: !socket },
  async () => {
    for (const linkingWins of [true, false])
      await withDatabase(async (prisma, repo, input) => {
        const session = (await repo.restartIfUnchanged(input, null, "ready"))!;
        const leadId = randomUUID();
        const attemptId = randomUUID();
        const callId = randomUUID();
        await repo.transitionIf(session.id, { from: ["ready"] }, "reserved", {
          currentLeadId: leadId,
        });
        await repo.transitionIf(session.id, { from: ["reserved"] }, "dialing");
        await prisma.$executeRaw`INSERT INTO "CampaignLead" (id,status,"lockedBy","lockedAt") VALUES (${leadId}::uuid,'locked',${session.id}::uuid,NOW() AT TIME ZONE 'UTC')`;
        await prisma.$executeRaw`INSERT INTO "Call" (id) VALUES (${callId}::uuid)`;
        await prisma.$executeRaw`INSERT INTO "CallAttempt" (id,"campaignId","agentUserId","agentSessionId","sessionStartedAt","campaignLeadId",status) VALUES (${attemptId}::uuid,${input.campaignId}::uuid,${input.userId}::uuid,${session.id}::uuid,${session.startedAt}::timestamptz AT TIME ZONE 'UTC',${leadId}::uuid,'dialing')`;
        assert.equal(
          await repo.transitionIf(
            session.id,
            {
              from: ["dialing"],
              currentLeadId: leadId,
              startedAt: session.startedAt,
              undialedAttemptId: null,
            },
            "paused",
            { currentLeadId: null },
          ),
          false,
          "an attempt created after an empty sweep read keeps its reservation",
        );
        let firstPid = 0;
        let captured!: (pid: number) => void;
        let written!: () => void;
        let release!: () => void;
        const backend = new Promise<number>((resolve) => {
          captured = resolve;
        });
        const changed = new Promise<void>((resolve) => {
          written = resolve;
        });
        const gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        const held = observeTransactions(
          prisma,
          (pid) => {
            firstPid = pid;
          },
          (tx) => ({
            $queryRaw: tx.$queryRaw.bind(tx),
            agentSession: tx.agentSession,
            campaignLead: tx.campaignLead,
            callAttempt: {
              findUnique: tx.callAttempt.findUnique.bind(tx.callAttempt),
              updateMany: async (
                args: Parameters<typeof tx.callAttempt.updateMany>[0],
              ) => {
                const result = await tx.callAttempt.updateMany(args);
                written();
                await gate;
                return result;
              },
              deleteMany: async (
                args: Parameters<typeof tx.callAttempt.deleteMany>[0],
              ) => {
                const result = await tx.callAttempt.deleteMany(args);
                written();
                await gate;
                return result;
              },
            },
          }),
        );
        const waiting = observeTransactions(prisma, captured);
        const cancel = (store: unknown) =>
          new AgentSessionRepository(store as never).transitionIf(
            session.id,
            {
              from: ["dialing"],
              currentLeadId: leadId,
              startedAt: session.startedAt,
              undialedAttemptId: attemptId,
            },
            "paused",
            { currentLeadId: null },
          );
        const link = (store: unknown) =>
          new CallAttemptRepository(store as never).linkCallIfUnlinked(
            attemptId,
            callId,
          );
        const first = linkingWins ? link(held) : cancel(held);
        let second: Promise<boolean> | undefined;
        try {
          await Promise.race([changed, first]);
          second = linkingWins ? cancel(waiting) : link(waiting);
          await waitForBlocker(
            prisma,
            await contenderBackend(backend, second),
            firstPid,
          );
          release();
          assert.equal(await first, true);
          assert.equal(await second, false);
          const current = (await repo.findById(session.id))!;
          const attempt = await new CallAttemptRepository(
            prisma as never,
          ).findById(attemptId);
          assert.equal(current.status, linkingWins ? "dialing" : "paused");
          assert.equal(current.currentLeadId, linkingWins ? leadId : null);
          assert.equal(attempt?.callId ?? null, linkingWins ? callId : null);
          if (!linkingWins) assert.equal(attempt, null);
        } finally {
          release();
          await Promise.allSettled([first, second]);
        }
      });
  },
);

it(
  "gives a late provider leg an owner when its assignment is still held by a paused session",
  { skip: !socket },
  () =>
    withDatabase(async (prisma, repo, input) => {
      const session = (await repo.restartIfUnchanged(input, null, "paused"))!;
      const leadId = randomUUID();
      const attemptId = randomUUID();
      const callId = randomUUID();
      await prisma.$executeRaw`INSERT INTO "CampaignLead" (id,status,"lockedBy","lockedAt") VALUES (${leadId}::uuid,'locked',${session.id}::uuid,NOW() AT TIME ZONE 'UTC')`;
      await prisma.$executeRaw`INSERT INTO "Call" (id) VALUES (${callId}::uuid)`;
      await prisma.$executeRaw`INSERT INTO "CallAttempt" (id,"agentSessionId","sessionStartedAt","campaignLeadId",status) VALUES (${attemptId}::uuid,${session.id}::uuid,${session.startedAt}::timestamptz AT TIME ZONE 'UTC',${leadId}::uuid,'dialing')`;
      assert.equal(
        await new CallAttemptRepository(prisma as never).linkCallIfUnlinked(
          attemptId,
          callId,
        ),
        true,
      );
      const current = (await repo.findById(session.id))!;
      assert.equal(current.status, "dialing");
      assert.equal(current.currentLeadId, leadId);
      const [lead] = await prisma.$queryRaw<
        Array<{ lockedBy: string }>
      >`SELECT "lockedBy" FROM "CampaignLead" WHERE id=${leadId}::uuid`;
      assert.equal(lead.lockedBy, session.id);
    }),
);

it(
  "releases only the observed instance of a lead lock, including without a restart",
  { skip: !socket },
  () =>
    withDatabase(async (prisma, repo, input) => {
      const session = (await repo.restartIfUnchanged(input, null, "ready"))!;
      const leadId = randomUUID();
      const original = new Date(Date.now() - 1000);
      const replacement = new Date(original.getTime() + 1);
      await prisma.$executeRaw`INSERT INTO "CampaignLead" (id,status,"lockedBy","lockedAt") VALUES (${leadId}::uuid,'locked',${session.id}::uuid,${replacement}::timestamptz AT TIME ZONE 'UTC')`;
      const leads = new CampaignLeadRepository(prisma as never);
      assert.equal(
        await leads.releaseLock(leadId, {
          lockedBy: session.id,
          lockedAt: original,
        }),
        0,
      );
      assert.equal(
        await leads.releaseLock(leadId, {
          lockedBy: session.id,
          lockedAt: replacement,
        }),
        1,
      );
    }),
);

it(
  "applies disconnected retry policy only against the persisted and fully counted lead",
  { skip: !socket },
  async () => {
    for (const attempts of [1, 3])
      await withDatabase(async (prisma, repo, input) => {
        const session = (await repo.restartIfUnchanged(
          input,
          null,
          "offline",
        ))!;
        const leadId = randomUUID();
        const attemptId = randomUUID();
        const callId = randomUUID();
        await prisma.$executeRaw`UPDATE "AgentSession" SET "currentLeadId"=${leadId}::uuid,"endedAt"=NOW() AT TIME ZONE 'UTC' WHERE id=${session.id}::uuid`;
        await prisma.$executeRaw`INSERT INTO "CampaignLead" (id,status,"lockedBy","lockedAt",attempts) VALUES (${leadId}::uuid,'locked',${session.id}::uuid,NOW() AT TIME ZONE 'UTC',${attempts - 1})`;
        await prisma.$executeRaw`INSERT INTO "Call" (id,"endedAt") VALUES (${callId}::uuid,NOW() AT TIME ZONE 'UTC')`;
        await prisma.$executeRaw`INSERT INTO "CallAttempt" (id,"agentSessionId","campaignLeadId","callId",status,"attemptNumber") VALUES (${attemptId}::uuid,${session.id}::uuid,${leadId}::uuid,${callId}::uuid,'dialing',${attempts})`;
        await prisma.$executeRaw`UPDATE "AgentSession" SET "lastHeartbeat"=(NOW() AT TIME ZONE 'UTC') - interval '1 minute' WHERE id=${session.id}::uuid`;
        const current = (await repo.findById(session.id))!;
        assert.ok(
          (await repo.findStale(30_000)).some((row) => row.id === session.id),
        );
        assert.equal(
          await repo.restartIfUnchanged(input, current, "ready"),
          null,
        );
        const nextCallAt = new Date(Date.now() + 60_000);
        const uncounted = {
          leadId,
          attempts: attempts - 1,
          status: "queued" as const,
          nextCallAt,
        };
        assert.equal(
          await repo.endIfUnchanged(current, false, {
            assignmentRetry: uncounted,
          }),
          null,
        );
        assert.ok(
          await new CallAttemptRepository(prisma as never).markEndedIf(
            attemptId,
            { callId },
          ),
        );
        assert.equal(
          await repo.endIfUnchanged(current, false, {
            assignmentRetry: uncounted,
          }),
          null,
        );
        const status = attempts >= 3 ? "exhausted" : "queued";
        assert.ok(
          await repo.endIfUnchanged(current, false, {
            assignmentRetry: {
              leadId,
              attempts,
              status,
              nextCallAt,
              nextCallAtAfterCompletedCall: true,
            },
          }),
        );
        const [lead] = await prisma.$queryRaw<
          Array<{ status: string; lockedBy: string | null; nextCallAt: Date }>
        >`SELECT status,"lockedBy","nextCallAt" FROM "CampaignLead" WHERE id=${leadId}::uuid`;
        assert.equal(lead.status, status);
        assert.equal(lead.lockedBy, null);
        assert.equal(lead.nextCallAt.getTime(), nextCallAt.getTime());
        assert.equal((await repo.findById(session.id))!.currentLeadId, null);
      });
  },
);

it(
  "recovers a bounded batch of stale locks in lockedAt then id order",
  { skip: !socket },
  () =>
    withDatabase(async (prisma, repo, input) => {
      const session = (await repo.restartIfUnchanged(input, null, "ready"))!;
      const fixtureTime = Date.now();
      const leads = Array.from({ length: 102 }, (_, index) => ({
        id: randomUUID(),
        lockedAt: new Date(fixtureTime - 10 * 60_000 + (index % 2)),
      })).sort(
        (a, b) =>
          a.lockedAt.getTime() - b.lockedAt.getTime() ||
          a.id.localeCompare(b.id),
      );
      await prisma.$executeRaw`INSERT INTO "CampaignLead" (id,status,"lockedBy","lockedAt") VALUES ${Prisma.join(leads.map((lead) => Prisma.sql`(${lead.id}::uuid,'locked',${session.id}::uuid,${lead.lockedAt}::timestamptz AT TIME ZONE 'UTC')`))}`;
      const repository = new CampaignLeadRepository(prisma as never);
      assert.equal(await repository.requeueStaleLocked(5 * 60_000), 100);
      const remaining = await prisma.$queryRaw<
        Array<{ id: string }>
      >`SELECT id FROM "CampaignLead" WHERE status='locked' ORDER BY "lockedAt",id`;
      assert.deepEqual(
        remaining.map((lead) => lead.id),
        leads.slice(100).map((lead) => lead.id),
      );
      assert.equal(await repository.requeueStaleLocked(5 * 60_000), 2);
    }),
);

it(
  "commits attempt finalization and counting together and retries a failed count once",
  { skip: !socket },
  () =>
    withDatabase(async (prisma, repo, input) => {
      const session = (await repo.restartIfUnchanged(input, null, "ready"))!;
      const leadId = randomUUID();
      const attemptId = randomUUID();
      const callId = randomUUID();
      await prisma.$executeRaw`INSERT INTO "CampaignLead" (id,status,"lockedBy","lockedAt") VALUES (${leadId}::uuid,'locked',${session.id}::uuid,NOW() AT TIME ZONE 'UTC')`;
      await prisma.$executeRaw`INSERT INTO "Call" (id,"endedAt") VALUES (${callId}::uuid,NOW() AT TIME ZONE 'UTC')`;
      await prisma.$executeRaw`INSERT INTO "CallAttempt" (id,"agentSessionId","campaignLeadId","callId",status) VALUES (${attemptId}::uuid,${session.id}::uuid,${leadId}::uuid,${callId}::uuid,'dialing')`;
      const failing = new CallAttemptRepository(
        observeTransactions(
          prisma,
          () => {},
          (tx) => ({
            $queryRaw: tx.$queryRaw.bind(tx),
            callAttempt: tx.callAttempt,
            campaignLead: {
              updateMany: async () => {
                throw new Error("counter write failed");
              },
            },
          }),
        ) as never,
      );
      await assert.rejects(
        failing.markEndedIf(attemptId, { callId }),
        /counter write failed/,
      );
      const [before] = await prisma.$queryRaw<
        Array<{ status: string; attempts: number }>
      >`
    SELECT attempt.status, lead.attempts FROM "CallAttempt" attempt JOIN "CampaignLead" lead ON lead.id=attempt."campaignLeadId" WHERE attempt.id=${attemptId}::uuid`;
      assert.deepEqual(before, { status: "dialing", attempts: 0 });
      const attempts = new CallAttemptRepository(prisma as never);
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          attempts.markEndedIf(attemptId, { callId }),
        ),
      );
      assert.equal(results.filter(Boolean).length, 1);
      const [after] = await prisma.$queryRaw<
        Array<{ status: string; attempts: number }>
      >`
    SELECT attempt.status, lead.attempts FROM "CallAttempt" attempt JOIN "CampaignLead" lead ON lead.id=attempt."campaignLeadId" WHERE attempt.id=${attemptId}::uuid`;
      assert.deepEqual(after, { status: "ended", attempts: 1 });
    }),
);

it(
  "advances stream attachment heartbeats monotonically before disconnect compensation",
  { skip: !socket },
  () =>
    withDatabase(async (prisma, repo, input) => {
      const session = (await repo.restartIfUnchanged(input, null, "ready"))!;
      const ahead = new Date(Date.now() + 60_000);
      await prisma.$executeRaw`UPDATE "AgentSession" SET "lastHeartbeat" = (${ahead}::timestamptz AT TIME ZONE 'UTC') WHERE id = ${session.id}::uuid`;
      const attached = (await repo.heartbeat(session.id, session.startedAt))!;
      assert.ok(attached.lastHeartbeat > ahead);
      const successors = await Promise.all(
        Array.from({ length: 5 }, () =>
          repo.heartbeat(session.id, session.startedAt),
        ),
      );
      const values = successors.map((row) => row!.lastHeartbeat.getTime());
      assert.equal(new Set(values).size, 5);
      assert.ok(
        values.every((value) => value > attached.lastHeartbeat.getTime()),
      );
      assert.equal(await repo.endIfUnchanged(attached), null);
      assert.equal((await repo.findById(session.id))!.status, "ready");
    }),
);

it(
  "creates attempts only for the reservation that won the session lock",
  { skip: !socket, timeout: 10_000 },
  () =>
    withDatabase(async (prisma, repo, input) => {
      await prisma.$executeRaw`ALTER TABLE "CallAttempt" DROP COLUMN "sessionReservedAt"`;
      await prisma.$executeRawUnsafe(
        readFileSync(
          resolve(
            __dirname,
            "../../../prisma/migrations-pending/20261123043000_call_attempt_reservation_identity/migration.sql",
          ),
          "utf8",
        ),
      );
      const session = (await repo.restartIfUnchanged(input, null, "ready"))!;
      const leadId = randomUUID();
      const leadLockedAt = new Date();
      await prisma.$executeRaw`INSERT INTO "CampaignLead" (id,"campaignId","contactId",status,"lockedBy","lockedAt") VALUES (${leadId}::uuid,${input.campaignId}::uuid,${randomUUID()}::uuid,'locked',${session.id}::uuid,${leadLockedAt}::timestamptz AT TIME ZONE 'UTC')`;
      const claimed = (await repo.reserveForLead(
        session.id,
        leadId,
        session.startedAt,
      ))!;
      const replacementAt = new Date(claimed.reservedAt!.getTime() + 1);
      const data = {
        campaignId: input.campaignId,
        campaignLeadId: leadId,
        agentSessionId: session.id,
        agentUserId: input.userId,
        sessionStartedAt: session.startedAt,
        reservedAt: claimed.reservedAt,
        leadLockedAt,
        attemptNumber: 1,
      };
      let written!: () => void;
      let release!: () => void;
      let began!: (pid: number) => void;
      let blocker = 0;
      const changed = new Promise<void>((resolve) => {
        written = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const backend = new Promise<number>((resolve) => {
        began = resolve;
      });
      const replacing = prisma.$transaction(async (tx) => {
        const [row] = await tx.$queryRaw<
          Array<{ pid: number }>
        >`SELECT pg_backend_pid() AS pid`;
        blocker = row.pid;
        await tx.$executeRaw`UPDATE "AgentSession" SET "reservedAt" = (${replacementAt}::timestamptz AT TIME ZONE 'UTC') WHERE id = ${session.id}::uuid`;
        written();
        await gate;
      });
      let creating: ReturnType<CallAttemptRepository["create"]> | undefined;
      try {
        await Promise.race([changed, replacing]);
        creating = new CallAttemptRepository(
          observeTransactions(prisma, began) as never,
        ).create(data);
        await waitForBlocker(
          prisma,
          await contenderBackend(backend, creating),
          blocker,
        );
        release();
        await replacing;
        assert.equal(await creating, null);
        const replacementLock = new Date(leadLockedAt.getTime() + 1);
        await prisma.campaignLead.update({
          where: { id: leadId },
          data: { lockedAt: replacementLock },
        });
        const attempts = new CallAttemptRepository(prisma as never);
        for (const missingOrStale of [null, leadLockedAt])
          assert.equal(
            await attempts.create({
              ...data,
              reservedAt: replacementAt,
              leadLockedAt: missingOrStale,
            }),
            null,
          );
        const valid = await new CallAttemptRepository(prisma as never).create({
          ...data,
          reservedAt: replacementAt,
          leadLockedAt: replacementLock,
        });
        assert.ok(valid);
        assert.deepEqual(valid.sessionReservedAt, replacementAt);
        assert.equal(
          await prisma.callAttempt.count({
            where: { agentSessionId: session.id },
          }),
          1,
        );
        const current = (await repo.findById(session.id))!;
        assert.equal(
          await repo.transitionIf(
            session.id,
            {
              from: ["reserved"],
              currentLeadId: leadId,
              startedAt: session.startedAt,
              reservedAt: claimed.reservedAt,
            },
            "dialing",
          ),
          false,
        );
        assert.equal((await repo.findById(session.id))!.status, "reserved");
        assert.equal(
          await repo.transitionIf(
            session.id,
            {
              from: ["reserved"],
              currentLeadId: leadId,
              startedAt: session.startedAt,
              reservedAt: current.reservedAt,
            },
            "dialing",
          ),
          true,
        );
      } finally {
        release();
        await Promise.allSettled([replacing, creating]);
      }
    }),
);

async function endedAssignment(
  prisma: PrismaClient,
  repo: AgentSessionRepository,
  input: { campaignId: string; userId: string; organizationId: string },
) {
  const session = (await repo.restartIfUnchanged(input, null, "ready"))!;
  const leadId = randomUUID();
  const contactId = randomUUID();
  const callId = randomUUID();
  const lockedAt = new Date();
  await prisma.$executeRaw`INSERT INTO "Contact" (id) VALUES (${contactId}::uuid)`;
  await prisma.$executeRaw`INSERT INTO "CampaignLead" (id,"campaignId","contactId",status,"lockedBy","lockedAt") VALUES (${leadId}::uuid,${input.campaignId}::uuid,${contactId}::uuid,'locked',${session.id}::uuid,${lockedAt}::timestamptz AT TIME ZONE 'UTC')`;
  const claimed = (await repo.reserveForLead(
    session.id,
    leadId,
    session.startedAt,
  ))!;
  const attempts = new CallAttemptRepository(prisma as never);
  const attempt = (await attempts.create({
    campaignId: input.campaignId,
    campaignLeadId: leadId,
    agentSessionId: session.id,
    agentUserId: input.userId,
    sessionStartedAt: session.startedAt,
    reservedAt: claimed.reservedAt,
    leadLockedAt: lockedAt,
    attemptNumber: 1,
  }))!;
  assert.ok(attempt);
  await prisma.$executeRaw`INSERT INTO "Call" (id,"endedAt") VALUES (${callId}::uuid,NOW() AT TIME ZONE 'UTC')`;
  assert.ok(await attempts.linkCallIfUnlinked(attempt.id, callId));
  assert.ok(await attempts.markEndedIf(attempt.id, { callId }));
  assert.ok(
    await repo.transitionIf(session.id, { from: ["reserved"] }, "wrap_up"),
  );
  await new CampaignLeadRepository(prisma as never).advanceIfHeldBy(
    leadId,
    session.id,
    "wrap_up",
  );
  return {
    session: (await repo.findById(session.id))!,
    leadId,
    contactId,
    attempt,
    fence: {
      attemptId: attempt.id,
      lockedBy: session.id,
      lockedAt,
      reservedAt: claimed.reservedAt,
    },
  };
}

it(
  "rolls back an undialed release when its fenced lead unlock fails",
  { skip: !socket },
  () =>
    withDatabase(async (prisma, repo, input) => {
      const f = await endedAssignment(prisma, repo, input);
      await prisma.callAttempt.update({
        where: { id: f.attempt.id },
        data: { callId: null, status: "created" },
      });
      await prisma.agentSession.update({
        where: { id: f.session.id },
        data: { status: "reserved" },
      });
      const before = (await repo.findById(f.session.id))!;
      const failing = new AgentSessionRepository(
        observeTransactions(
          prisma,
          () => {},
          (tx) => ({
            ...tx,
            campaignLead: {
              ...tx.campaignLead,
              updateMany: async () => {
                throw new Error("unlock unavailable");
              },
            },
          }),
        ) as never,
      );
      const expected = {
        from: ["reserved" as const],
        currentLeadId: f.leadId,
        startedAt: before.startedAt,
        reservedAt: before.reservedAt,
        undialedAttemptId: f.attempt.id,
        undialedLead: { lockedAt: f.fence.lockedAt },
      };
      await assert.rejects(
        failing.transitionIf(before.id, expected, "paused", {
          currentLeadId: null,
        }),
        /unlock unavailable/,
      );
      assert.deepEqual(await repo.findById(before.id), before);
      assert.ok(
        await prisma.callAttempt.findUnique({ where: { id: f.attempt.id } }),
      );
      await assert.rejects(
        repo.transitionIf(
          before.id,
          {
            ...expected,
            undialedLead: {
              lockedAt: new Date(f.fence.lockedAt.getTime() + 1),
            },
          },
          "paused",
          { currentLeadId: null },
        ),
        CampaignAssignmentChangedError,
      );
      assert.deepEqual(await repo.findById(before.id), before);
      assert.ok(
        await prisma.callAttempt.findUnique({ where: { id: f.attempt.id } }),
      );
      assert.equal(
        await repo.transitionIf(before.id, expected, "paused", {
          currentLeadId: null,
        }),
        true,
      );
      assert.equal((await repo.findById(before.id))!.currentLeadId, null);
      assert.equal(
        await prisma.callAttempt.findUnique({ where: { id: f.attempt.id } }),
        null,
      );
      assert.equal(
        (
          await prisma.campaignLead.findUniqueOrThrow({
            where: { id: f.leadId },
          })
        ).lockedBy,
        null,
      );
    }),
);

for (const reassigned of [false, true]) {
  it(
    `clears a stale preview session after its lead is ${reassigned ? "reassigned" : "unlocked"}`,
    { skip: !socket },
    () =>
      withDatabase(async (prisma, repo, input) => {
        const f = await endedAssignment(prisma, repo, input);
        await prisma.callAttempt.update({
          where: { id: f.attempt.id },
          data: { callId: null, status: "created" },
        });
        await prisma.agentSession.update({
          where: { id: f.session.id },
          data: { status: "reserved" },
        });
        const owner = reassigned ? randomUUID() : null;
        const lockedAt = reassigned
          ? new Date(f.fence.lockedAt.getTime() + 1)
          : null;
        await prisma.campaignLead.update({
          where: { id: f.leadId },
          data: { lockedBy: owner, lockedAt },
        });
        const replacement = reassigned
          ? await prisma.callAttempt.create({
              data: {
                campaignId: input.campaignId,
                campaignLeadId: f.leadId,
                agentUserId: randomUUID(),
                agentSessionId: owner,
                attemptNumber: 2,
              },
            })
          : null;
        const lead = await prisma.campaignLead.findUniqueOrThrow({
          where: { id: f.leadId },
        });
        assert.equal(
          await repo.transitionIf(
            f.session.id,
            {
              from: ["reserved"],
              currentLeadId: f.leadId,
              startedAt: f.session.startedAt,
              reservedAt: f.session.reservedAt,
              undialedAttemptId: f.attempt.id,
              undialedLead: { lockedAt: f.fence.lockedAt },
            },
            "ready",
            { currentLeadId: null },
          ),
          true,
        );
        assert.equal((await repo.findById(f.session.id))!.status, "ready");
        assert.equal((await repo.findById(f.session.id))!.currentLeadId, null);
        assert.deepEqual(
          await prisma.campaignLead.findUniqueOrThrow({
            where: { id: f.leadId },
          }),
          lead,
        );
        if (replacement)
          assert.deepEqual(
            await prisma.callAttempt.findUnique({
              where: { id: replacement.id },
            }),
            replacement,
          );
      }),
  );
}

it(
  "defers assignment cleanup until an ended call's attempt finalizes",
  { skip: !socket },
  () =>
    withDatabase(async (prisma, repo, input) => {
      const f = await endedAssignment(prisma, repo, input);
      await prisma.callAttempt.update({
        where: { id: f.attempt.id },
        data: { status: "answered" },
      });
      const stopped = (await repo.endIfUnchanged(f.session, true))!;
      const retry = {
        leadId: f.leadId,
        attempts: 1,
        status: "queued" as const,
      };
      assert.deepEqual(await repo.endAssignmentIfUnchanged(stopped, retry), {
        outcome: "awaiting_finalization",
      });
      assert.deepEqual(await repo.findById(stopped.id), stopped);
      await prisma.callAttempt.update({
        where: { id: f.attempt.id },
        data: { status: "ended" },
      });
      assert.equal(
        (await repo.endAssignmentIfUnchanged(stopped, retry)).outcome,
        "ended",
      );
      assert.equal((await repo.findById(stopped.id))!.currentLeadId, null);
    }),
);

it(
  "replays campaign callbacks by attempt and disposition revision without rewinding their lead",
  { skip: !socket },
  () =>
    withDatabase(async (prisma, repo, input, schema) => {
      await prisma.$executeRawUnsafe(
        `CREATE TYPE "${schema}"."CallbackStatus" AS ENUM ('scheduled','due','in_progress','completed','cancelled')`,
      );
      await prisma.$executeRawUnsafe(
        `CREATE TYPE "${schema}"."CallbackAgentKind" AS ENUM ('agreed','recovery')`,
      );
      await prisma.$executeRawUnsafe(`CREATE TABLE "CallbackTask" (
      id uuid PRIMARY KEY, "creationKey" text UNIQUE, "userId" uuid NOT NULL, "organizationId" uuid, "contactId" uuid NOT NULL, "callId" uuid, "campaignLeadId" uuid,
      "scheduledAt" timestamp(3) NOT NULL, note text, status "${schema}"."CallbackStatus" NOT NULL DEFAULT 'scheduled', "completedAt" timestamp(3), "attemptCount" integer NOT NULL DEFAULT 0,
      "followUpId" uuid, "sourceRevision" integer, "objectiveAttempt" integer, "dispatchCommittedAt" timestamp(3), "agentCallbackKind" "${schema}"."CallbackAgentKind", "agentId" uuid, "handoffId" uuid, "agentCallbackKey" text,
      "notBefore" timestamp(3), "claimToken" uuid, "leaseExpiresAt" timestamp(3), "dialTries" integer NOT NULL DEFAULT 0, "dialReservedAt" timestamp(3), "agentCallId" uuid, reason text, "lastError" text,
      "createdAt" timestamp(3) NOT NULL DEFAULT now(), "updatedAt" timestamp(3) NOT NULL DEFAULT now())`);
      const f = await endedAssignment(prisma, repo, input);
      const revision = new Date();
      await prisma.callAttempt.update({
        where: { id: f.attempt.id },
        data: { status: "dispositioned", dispositionedAt: revision },
      });
      const callbacks = new CallbackTaskRepository(prisma as never);
      const data = {
        userId: input.userId,
        organizationId: input.organizationId,
        contactId: f.contactId,
        campaignLeadId: f.leadId,
        scheduledAt: new Date(Date.now() + 60_000),
        note: "agreed time",
      };
      const source = {
        leadId: f.leadId,
        assignment: { ...f.fence, dispositionedAt: revision },
      };
      const first = await callbacks.create(data, source);
      await prisma.campaignLead.update({
        where: { id: f.leadId },
        data: { status: "queued" },
      });
      const beforeReplay = await prisma.campaignLead.findUniqueOrThrow({
        where: { id: f.leadId },
      });
      assert.equal(
        (await callbacks.create({ ...data, note: "replayed request" }, source))
          .id,
        first.id,
      );
      assert.deepEqual(
        await prisma.campaignLead.findUniqueOrThrow({
          where: { id: f.leadId },
        }),
        beforeReplay,
      );
      const nextRevision = new Date(revision.getTime() + 1);
      await prisma.callAttempt.update({
        where: { id: f.attempt.id },
        data: { dispositionedAt: nextRevision },
      });
      const second = await callbacks.create(data, {
        ...source,
        assignment: { ...source.assignment, dispositionedAt: nextRevision },
      });
      assert.notEqual(second.id, first.id);
      const nextAttempt = randomUUID();
      await prisma.$executeRaw`INSERT INTO "CallAttempt" (id,"campaignId","agentUserId","campaignLeadId",status,"attemptNumber","dispositionedAt") VALUES (${nextAttempt}::uuid,${input.campaignId}::uuid,${input.userId}::uuid,${f.leadId}::uuid,'dispositioned',2,${nextRevision}::timestamptz AT TIME ZONE 'UTC')`;
      const third = await callbacks.create(data, {
        ...source,
        assignment: {
          ...source.assignment,
          attemptId: nextAttempt,
          dispositionedAt: nextRevision,
        },
      });
      assert.notEqual(third.id, second.id);
      assert.equal(await prisma.callbackTask.count(), 3);
    }),
);

it(
  "rejects disposition writes after a competing reassignment commits",
  { skip: !socket, timeout: 15_000 },
  async () => {
    for (const newAttempt of [false, true])
      await withDatabase(async (prisma, repo, input) => {
        const f = await endedAssignment(prisma, repo, input);
        const replacementAt = new Date(f.session.reservedAt!.getTime() + 1);
        const replacementLock = new Date(f.fence.lockedAt.getTime() + 1);
        let written!: () => void;
        let release!: () => void;
        let began!: (pid: number) => void;
        let blocker = 0;
        const changed = new Promise<void>((resolve) => {
          written = resolve;
        });
        const gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        const backend = new Promise<number>((resolve) => {
          began = resolve;
        });
        const reassigning = prisma.$transaction(async (tx) => {
          const [row] = await tx.$queryRaw<
            Array<{ pid: number }>
          >`SELECT pg_backend_pid() AS pid`;
          blocker = row.pid;
          await tx.$executeRaw`UPDATE "AgentSession" SET status = 'reserved', "reservedAt" = (${replacementAt}::timestamptz AT TIME ZONE 'UTC') WHERE id = ${f.session.id}::uuid`;
          await tx.$executeRaw`UPDATE "CampaignLead" SET status = 'locked', "lockedAt" = (${replacementLock}::timestamptz AT TIME ZONE 'UTC') WHERE id = ${f.leadId}::uuid`;
          if (newAttempt)
            await tx.callAttempt.create({
              data: {
                campaignId: input.campaignId,
                campaignLeadId: f.leadId,
                agentSessionId: f.session.id,
                agentUserId: input.userId,
                sessionStartedAt: f.session.startedAt,
                sessionReservedAt: replacementAt,
                status: "created",
                attemptNumber: 2,
              },
            });
          written();
          await gate;
        });
        let writing: Promise<unknown> | undefined;
        try {
          await Promise.race([changed, reassigning]);
          writing = new CampaignLeadRepository(
            observeTransactions(prisma, began) as never,
          ).updateStatus(f.leadId, "completed", undefined, f.fence);
          const rejected = assert.rejects(
            writing,
            CampaignAssignmentChangedError,
          );
          await waitForBlocker(
            prisma,
            await contenderBackend(backend, writing),
            blocker,
          );
          release();
          await reassigning;
          await rejected;
          const [lead] = await prisma.$queryRaw<
            Array<{ status: string; lockedAt: Date; lockedBy: string }>
          >`SELECT status,"lockedAt","lockedBy" FROM "CampaignLead" WHERE id=${f.leadId}::uuid`;
          assert.deepEqual(lead, {
            status: "locked",
            lockedAt: replacementLock,
            lockedBy: f.session.id,
          });
          await assert.rejects(
            new CallAttemptRepository(prisma as never).setDisposition(
              f.attempt.id,
              { dispositionId: randomUUID(), dispositionCode: "old" },
              undefined,
              f.fence,
            ),
            CampaignAssignmentChangedError,
          );
          await assert.rejects(
            new CallbackTaskRepository(prisma as never).create(
              {
                userId: input.userId,
                contactId: f.contactId,
                campaignLeadId: f.leadId,
                scheduledAt: new Date(),
              },
              { leadId: f.leadId, assignment: f.fence },
            ),
            CampaignAssignmentChangedError,
          );
          assert.equal(
            (await new CallAttemptRepository(prisma as never).findById(
              f.attempt.id,
            ))!.status,
            "ended",
          );
        } finally {
          release();
          await Promise.allSettled([reassigning, writing]);
        }
      });
  },
);

it(
  "rejects an old ended attempt even when a disposition first observes the replacement reservation",
  { skip: !socket, timeout: 10_000 },
  async () => {
    for (const legacy of [false, true])
      await withDatabase(async (prisma, repo, input) => {
        const f = await endedAssignment(prisma, repo, input);
        await prisma.callAttempt.update({
          where: { id: f.attempt.id },
          data: {
            callId: null,
            ...(legacy
              ? { sessionReservedAt: null, sessionStartedAt: null }
              : {}),
          },
        });
        const reservedAt = new Date(f.session.reservedAt!.getTime() + 1);
        const lockedAt = new Date(f.fence.lockedAt.getTime() + 1);
        await prisma.agentSession.update({
          where: { id: f.session.id },
          data: { status: "reserved", reservedAt },
        });
        await prisma.campaignLead.update({
          where: { id: f.leadId },
          data: { status: "locked", lockedAt },
        });
        await assert.rejects(
          new CampaignLeadRepository(prisma as never).updateStatus(
            f.leadId,
            "completed",
            { lockedBy: null, lockedAt: null },
            { ...f.fence, reservedAt, lockedAt },
          ),
          CampaignAssignmentChangedError,
        );
        const lead = await prisma.campaignLead.findUniqueOrThrow({
          where: { id: f.leadId },
        });
        assert.equal(lead.status, "locked");
        assert.equal(lead.lockedBy, f.session.id);
        assert.deepEqual(lead.lockedAt, lockedAt);
      });
  },
);

it(
  "accepts a disposition while its assignment is unchanged or released without replacement",
  { skip: !socket },
  async () => {
    for (const released of [false, true])
      await withDatabase(async (prisma, repo, input) => {
        const f = await endedAssignment(prisma, repo, input);
        // Older deployments left both fences empty. The wrap-up ownership is
        // still valid and can be adopted without guessing from wall clocks.
        await prisma.callAttempt.update({
          where: { id: f.attempt.id },
          data: { sessionReservedAt: null, sessionStartedAt: null },
        });
        if (released) assert.ok(await repo.endIfUnchanged(f.session, false));
        await new CampaignLeadRepository(prisma as never).updateStatus(
          f.leadId,
          "completed",
          { lockedBy: null, lockedAt: null },
          f.fence,
        );
        const [lead] = await prisma.$queryRaw<
          Array<{ status: string; lockedBy: string | null }>
        >`SELECT status,"lockedBy" FROM "CampaignLead" WHERE id=${f.leadId}::uuid`;
        assert.deepEqual(lead, { status: "completed", lockedBy: null });
        if (!released)
          assert.deepEqual(
            (
              await prisma.callAttempt.findUniqueOrThrow({
                where: { id: f.attempt.id },
              })
            ).sessionReservedAt,
            f.session.reservedAt,
          );
      });
  },
);

it(
  "keeps lead, callback and session writes on the saved disposition revision",
  { skip: !socket, timeout: 10_000 },
  () =>
    withDatabase(async (prisma, repo, input) => {
      const f = await endedAssignment(prisma, repo, input);
      const attempts = new CallAttemptRepository(prisma as never);
      const future = new Date(Date.now() + 60_000);
      await prisma.callAttempt.update({
        where: { id: f.attempt.id },
        data: { dispositionedAt: future },
      });
      const first = (await attempts.setDisposition(
        f.attempt.id,
        { dispositionId: randomUUID(), dispositionCode: "older" },
        undefined,
        { ...f.fence, dispositionedAt: future },
      ))!;
      assert.ok(first.dispositionedAt! > future);
      const old = { ...f.fence, dispositionedAt: first.dispositionedAt };
      const newerId = randomUUID();
      await prisma.$executeRaw`UPDATE "Call" SET "outcomeRevision" = 1, "dispositionId" = ${newerId}::uuid WHERE id = ${first.callId!}::uuid`;
      const newer = (await attempts.setDisposition(
        f.attempt.id,
        { dispositionId: newerId, dispositionCode: "newer" },
        { callId: first.callId!, revision: 1 },
        old,
      ))!;
      assert.ok(newer.dispositionedAt! > first.dispositionedAt!);
      const leads = new CampaignLeadRepository(prisma as never);
      await assert.rejects(
        leads.updateStatus(f.leadId, "completed", undefined, old),
        CampaignAssignmentChangedError,
      );
      await assert.rejects(
        attempts.markEndedIf(f.attempt.id, { assignment: old }),
        CampaignAssignmentChangedError,
      );
      await assert.rejects(
        new CallbackTaskRepository(prisma as never).create(
          {
            userId: input.userId,
            contactId: f.contactId,
            campaignLeadId: f.leadId,
            scheduledAt: new Date(),
          },
          { leadId: f.leadId, assignment: old },
        ),
        CampaignAssignmentChangedError,
      );
      const nextCallAt = new Date(Date.now() + 60_000);
      await leads.updateStatus(
        f.leadId,
        "queued",
        { lockedBy: null, lockedAt: null, nextCallAt },
        { ...f.fence, dispositionedAt: newer.dispositionedAt },
      );
      const expected = {
        from: ["wrap_up" as const],
        currentLeadId: f.leadId,
        startedAt: f.session.startedAt,
        reservedAt: f.session.reservedAt,
      };
      assert.equal(
        await repo.transitionIf(
          f.session.id,
          {
            ...expected,
            disposition: {
              attemptId: f.attempt.id,
              dispositionedAt: first.dispositionedAt!,
            },
          },
          "ready",
          { currentLeadId: null },
        ),
        false,
      );
      assert.equal(
        await repo.transitionIf(
          f.session.id,
          {
            ...expected,
            disposition: {
              attemptId: f.attempt.id,
              dispositionedAt: newer.dispositionedAt!,
            },
          },
          "ready",
          { currentLeadId: null },
        ),
        true,
      );
      assert.deepEqual(
        (await attempts.findById(f.attempt.id))!.dispositionedAt,
        newer.dispositionedAt,
      );
      const lead = await prisma.campaignLead.findUniqueOrThrow({
        where: { id: f.leadId },
      });
      assert.equal(lead.status, "queued");
      assert.deepEqual(lead.nextCallAt, nextCallAt);
    }),
);
