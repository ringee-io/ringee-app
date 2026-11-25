import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { PrismaClient } from "@prisma/client";
import { AiVoiceAgentCallDispatchRepository } from "./ai-voice-agent-call-dispatch.repository";
import { ProviderDispatchHourRepository } from "./provider-dispatch-hour.repository";
import { ProviderDispatchSettingRepository } from "./provider-dispatch-setting.repository";

/**
 * The durable queue of agent calls waiting for provider capacity (CPS-006), on
 * real PostgreSQL. A stub cannot show what this design rests on: that a claim is
 * exclusive, that a commit and a cancel cannot both win, and that a workspace's
 * live-call cap holds against dispatchers racing for its last slot.
 *
 * Explicit opt-in, as the other database suites: never the application's
 * DATABASE_URL. Needs the 20261124150000_provider_dispatch tables, which
 * `prisma db push` of the current schema also creates.
 */
const url = process.env.RINGEE_AUTOMATION_TEST_DATABASE_URL;

describe("agent call dispatch queue on PostgreSQL", { skip: !url }, () => {
  const prisma = new PrismaClient({ datasourceUrl: url });
  const repo = new AiVoiceAgentCallDispatchRepository(prisma as never);
  const hours = new ProviderDispatchHourRepository(prisma as never);
  const settings = new ProviderDispatchSettingRepository(prisma as never);

  const userId = randomUUID();
  const otherUserId = randomUUID();
  const organizationId = randomUUID();
  const otherOrganizationId = randomUUID();
  const agentId = randomUUID();
  const otherAgentId = randomUUID();
  const ctx = { userId, organizationId };
  const otherCtx = { userId: otherUserId, organizationId: otherOrganizationId };
  const personalCtx = { userId, organizationId: null };
  const ws = `organization:${organizationId}`;
  const otherWs = `organization:${otherOrganizationId}`;
  const account = `telnyx-test-${randomUUID().slice(0, 8)}`;
  const t0 = new Date("2026-11-24T12:00:00.000Z");
  const later = (ms: number) => new Date(t0.getTime() + ms);
  const LEASE = 30_000;
  const limits = { perWorkspace: 1_000, total: 10_000 };

  before(async () => {
    await prisma.user.createMany({
      data: [{ id: userId }, { id: otherUserId }],
    });
    await prisma.organization.createMany({
      data: [
        {
          id: organizationId,
          clerkId: `dq-${organizationId}`,
          name: "Queue A",
        },
        {
          id: otherOrganizationId,
          clerkId: `dq-${otherOrganizationId}`,
          name: "Queue B",
        },
      ],
    });
    await prisma.aiVoiceAgent.createMany({
      data: [
        {
          id: agentId,
          userId,
          organizationId,
          name: "A",
          type: "reminders_notifications",
          status: "active",
        },
        {
          id: otherAgentId,
          userId: otherUserId,
          organizationId: otherOrganizationId,
          name: "B",
          type: "reminders_notifications",
          status: "active",
        },
      ],
    });
  });

  after(async () => {
    await prisma.organization.deleteMany({
      where: { id: { in: [organizationId, otherOrganizationId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [userId, otherUserId] } },
    });
    await prisma.providerDispatchHour.deleteMany({
      where: { providerAccountKey: account },
    });
    await prisma.providerDispatchSetting.deleteMany({
      where: { providerAccountKey: account },
    });
    await prisma.$disconnect();
  });

  /** A queued call in a workspace, with the least ceremony. */
  async function enqueue(
    workspace: "a" | "b" | "personal" = "a",
    options: {
      level?: number;
      queuedAt?: Date;
      expiresAt?: Date;
      limits?: { perWorkspace: number; total: number };
    } = {},
  ) {
    const owner =
      workspace === "a" ? ctx : workspace === "b" ? otherCtx : personalCtx;
    const key =
      workspace === "a"
        ? ws
        : workspace === "b"
          ? otherWs
          : `personal:${userId}`;
    const result = await repo.enqueue({
      call: {
        agentId: workspace === "b" ? otherAgentId : agentId,
        userId: owner.userId,
        organizationId: owner.organizationId,
        toNumber: `+1202555${Math.floor(1000 + Math.random() * 8999)}`,
        fromNumber: "+13055550001",
      },
      dispatch: {
        workspaceKey: key,
        providerAccountKey: account,
        trafficLevel: options.level ?? 3,
        source: "agent_api",
        queuedAt: options.queuedAt ?? t0,
        expiresAt: options.expiresAt ?? later(3_600_000),
      },
      limits: options.limits ?? limits,
    });
    assert.equal(result.queued, true);
    return result.queued ? result : (undefined as never);
  }

  const dispatchOf = (id: string) =>
    prisma.aiVoiceAgentCallDispatch.findUniqueOrThrow({
      where: { agentCallId: id },
    });
  const callOf = (id: string) =>
    prisma.aiVoiceAgentCall.findUniqueOrThrow({ where: { id } });

  async function reset() {
    await prisma.aiVoiceAgentCall.deleteMany({
      where: { agentId: { in: [agentId, otherAgentId] } },
    });
  }

  describe("enqueue", () => {
    it("creates the call and its dispatch row together, as queued", async () => {
      await reset();
      const { call, dispatch } = await enqueue();
      assert.equal(call.status, "queued");
      assert.equal(dispatch.state, "queued");
      assert.equal(dispatch.workspaceKey, ws);
      assert.equal(dispatch.attempts, 0);
      assert.equal((await callOf(call.id)).status, "queued");
    });

    it("refuses a workspace past its bound, and only that workspace", async () => {
      await reset();
      const tight = { perWorkspace: 2, total: 100 };
      await enqueue("a", { limits: tight });
      await enqueue("a", { limits: tight });
      const refused = await repo.enqueue({
        call: {
          agentId,
          userId,
          organizationId,
          toNumber: "+12025550199",
          fromNumber: "+13055550001",
        },
        dispatch: {
          workspaceKey: ws,
          providerAccountKey: account,
          trafficLevel: 3,
          source: "agent_api",
          queuedAt: t0,
          expiresAt: later(60_000),
        },
        limits: tight,
      });
      assert.deepEqual(refused, { queued: false, reason: "workspace_full" });
      // The other workspace is not affected by this one's backlog.
      assert.equal((await enqueue("b", { limits: tight })).queued, true);
      // Nothing was left behind by the refused request.
      assert.equal(
        await prisma.aiVoiceAgentCall.count({ where: { agentId } }),
        2,
      );
    });

    it("holds the bound under simultaneous requests: no more than it allows slip in", async () => {
      await reset();
      const tight = { perWorkspace: 5, total: 1_000 };
      const results = await Promise.all(
        Array.from({ length: 25 }, () =>
          repo.enqueue({
            call: {
              agentId,
              userId,
              organizationId,
              toNumber: `+1202555${Math.floor(1000 + Math.random() * 8999)}`,
              fromNumber: "+13055550001",
            },
            dispatch: {
              workspaceKey: ws,
              providerAccountKey: account,
              trafficLevel: 3,
              source: "agent_api",
              queuedAt: t0,
              expiresAt: later(60_000),
            },
            limits: tight,
          }),
        ),
      );
      assert.equal(results.filter((r) => r.queued).length, 5);
      assert.equal(
        await prisma.aiVoiceAgentCallDispatch.count({
          where: { workspaceKey: ws, state: "queued" },
        }),
        5,
      );
    });

    it("refuses once the whole queue is full", async () => {
      await reset();
      await enqueue("a", { limits: { perWorkspace: 100, total: 1 } });
      const refused = await repo.enqueue({
        call: {
          agentId: otherAgentId,
          userId: otherUserId,
          organizationId: otherOrganizationId,
          toNumber: "+12025550188",
          fromNumber: "+13055550001",
        },
        dispatch: {
          workspaceKey: otherWs,
          providerAccountKey: account,
          trafficLevel: 3,
          source: "agent_api",
          queuedAt: t0,
          expiresAt: later(60_000),
        },
        limits: { perWorkspace: 100, total: 1 },
      });
      assert.deepEqual(refused, { queued: false, reason: "queue_full" });
    });

    it("keeps a unique idempotency key unique, and leaves nothing half-created", async () => {
      await reset();
      const key = `client:test:${randomUUID()}`;
      const row = (to: string) => ({
        call: {
          agentId,
          userId,
          organizationId,
          toNumber: to,
          fromNumber: "+13055550001",
          idempotencyKey: key,
        },
        dispatch: {
          workspaceKey: ws,
          providerAccountKey: account,
          trafficLevel: 3,
          source: "agent_api",
          queuedAt: t0,
          expiresAt: later(60_000),
        },
        limits,
      });
      await repo.enqueue(row("+12025550111"));
      await assert.rejects(repo.enqueue(row("+12025550112")), /idempotencyKey/);
      assert.equal(
        await prisma.aiVoiceAgentCall.count({ where: { agentId } }),
        1,
      );
      assert.equal(
        await prisma.aiVoiceAgentCallDispatch.count({
          where: { workspaceKey: ws },
        }),
        1,
      );
    });
  });

  describe("choosing what to dispatch", () => {
    it("offers one call per workspace, so a big backlog cannot hide a small one", async () => {
      await reset();
      for (let i = 0; i < 30; i++) await enqueue("a", { queuedAt: later(i) });
      const single = await enqueue("b", { queuedAt: later(1_000) });
      const candidates = await repo.peekCandidates(later(5_000), LEASE, 10);
      const workspaces = candidates.map((c) => c.workspaceKey);
      assert.equal(new Set(workspaces).size, workspaces.length);
      assert.ok(workspaces.includes(otherWs));
      assert.ok(candidates.some((c) => c.agentCallId === single.call.id));
    });

    it("puts the more urgent level first, then the workspace served longest ago", async () => {
      await reset();
      const background = await enqueue("a", { level: 3, queuedAt: t0 });
      const scheduled = await enqueue("b", { level: 1, queuedAt: later(500) });
      let order = await repo.peekCandidates(later(1_000), LEASE, 10);
      assert.deepEqual(
        order.map((c) => c.agentCallId),
        [scheduled.call.id, background.call.id],
      );

      // Same level: the workspace that was dispatched most recently goes last.
      await reset();
      const first = await enqueue("a", { queuedAt: t0 });
      const second = await enqueue("b", { queuedAt: later(10) });
      // Workspace A was served a moment ago.
      const served = await enqueue("a", { queuedAt: later(20) });
      const token = randomUUID();
      assert.equal(
        await repo.claim(served.call.id, token, later(100), LEASE),
        true,
      );
      assert.equal(
        await repo.commit(served.call.id, token, {
          now: later(200),
          callbackTokenHash: "h",
          cap: null,
        }),
        "committed",
      );
      order = await repo.peekCandidates(later(1_000), LEASE, 10);
      assert.deepEqual(
        order.map((c) => c.agentCallId),
        [second.call.id, first.call.id],
      );
    });

    it("leaves out what is claimed, not yet due, or expired", async () => {
      await reset();
      const claimed = await enqueue("a");
      const waiting = await enqueue("b");
      const token = randomUUID();
      await repo.claim(claimed.call.id, token, later(100), LEASE);
      await repo.release(waiting.call.id, randomUUID(), {});
      await prisma.aiVoiceAgentCallDispatch.update({
        where: { agentCallId: waiting.call.id },
        data: { notBefore: later(60_000) },
      });
      const expiring = await enqueue("personal", { expiresAt: later(500) });

      const ids = (await repo.peekCandidates(later(1_000), LEASE, 10)).map(
        (c) => c.agentCallId,
      );
      assert.ok(!ids.includes(claimed.call.id));
      assert.ok(!ids.includes(waiting.call.id));
      assert.ok(!ids.includes(expiring.call.id));
      // Once the lease passes the claimed call is free again.
      const after = await repo.peekCandidates(
        later(100 + LEASE + 1),
        LEASE,
        10,
      );
      assert.ok(after.some((c) => c.agentCallId === claimed.call.id));
    });
  });

  describe("claiming", () => {
    it("is exclusive: of ten dispatchers racing, exactly one wins", async () => {
      await reset();
      const { call } = await enqueue();
      const wins = await Promise.all(
        Array.from({ length: 10 }, () =>
          repo.claim(call.id, randomUUID(), later(100), LEASE),
        ),
      );
      assert.equal(wins.filter(Boolean).length, 1);
      assert.equal((await dispatchOf(call.id)).attempts, 1);
    });

    it("is a lease: a dead dispatcher's claim frees itself, and its commit is then refused", async () => {
      await reset();
      const { call } = await enqueue();
      const dead = randomUUID();
      const live = randomUUID();
      assert.equal(await repo.claim(call.id, dead, later(100), LEASE), true);
      // Still held: nobody else may take it.
      assert.equal(await repo.claim(call.id, live, later(1_000), LEASE), false);
      // After the lease, another dispatcher takes over...
      assert.equal(
        await repo.claim(call.id, live, later(100 + LEASE + 1), LEASE),
        true,
      );
      // ...and the first, if it ever wakes up, can no longer commit.
      assert.equal(
        await repo.commit(call.id, dead, {
          now: later(100 + LEASE + 2),
          callbackTokenHash: "h",
          cap: null,
        }),
        "not_claimed",
      );
      assert.equal(
        await repo.commit(call.id, live, {
          now: later(100 + LEASE + 3),
          callbackTokenHash: "h2",
          cap: null,
        }),
        "committed",
      );
    });

    it("gives the claim back with a retry time and a reason", async () => {
      await reset();
      const { call } = await enqueue();
      const token = randomUUID();
      await repo.claim(call.id, token, later(100), LEASE);
      assert.equal(
        await repo.release(call.id, token, {
          notBefore: later(5_000),
          reason: "busy",
        }),
        true,
      );
      const row = await dispatchOf(call.id);
      assert.equal(row.claimToken, null);
      assert.equal(row.reason, "busy");
      assert.equal(
        await repo.claim(call.id, randomUUID(), later(1_000), LEASE),
        false,
      );
      assert.equal(
        await repo.claim(call.id, randomUUID(), later(5_000), LEASE),
        true,
      );
      // Only the holder can release.
      assert.equal(await repo.release(call.id, randomUUID(), {}), false);
    });
  });

  describe("committing: the point of no return", () => {
    it("moves both rows, once, and records the callback token", async () => {
      await reset();
      const { call } = await enqueue();
      const token = randomUUID();
      await repo.claim(call.id, token, later(100), LEASE);
      assert.equal(
        await repo.commit(call.id, token, {
          now: later(200),
          callbackTokenHash: "hash-1",
          cap: null,
        }),
        "committed",
      );
      const row = await callOf(call.id);
      assert.equal(row.status, "created");
      assert.equal(row.callbackTokenHash, "hash-1");
      const dispatch = await dispatchOf(call.id);
      assert.equal(dispatch.state, "dispatched");
      assert.equal(
        dispatch.dispatchedAt?.toISOString(),
        later(200).toISOString(),
      );
      // A second commit — a replayed dispatch — cannot move it again.
      assert.equal(
        await repo.commit(call.id, token, {
          now: later(300),
          callbackTokenHash: "hash-2",
          cap: null,
        }),
        "not_claimed",
      );
      assert.equal((await callOf(call.id)).callbackTokenHash, "hash-1");
    });

    it("refuses a call that expired while it was claimed", async () => {
      await reset();
      const { call } = await enqueue("a", { expiresAt: later(1_000) });
      const token = randomUUID();
      await repo.claim(call.id, token, later(100), LEASE);
      assert.equal(
        await repo.commit(call.id, token, {
          now: later(2_000),
          callbackTokenHash: "h",
          cap: null,
        }),
        "expired",
      );
      assert.equal((await callOf(call.id)).status, "queued");
    });

    it("cannot be won by both a commit and a cancel: one of them, every time", async () => {
      await reset();
      const outcomes = { committed: 0, cancelled: 0 };
      for (let i = 0; i < 25; i++) {
        const { call } = await enqueue();
        const token = randomUUID();
        await repo.claim(call.id, token, later(100), LEASE);
        const [commit, cancel] = await Promise.all([
          repo.commit(call.id, token, {
            now: later(200),
            callbackTokenHash: "h",
            cap: null,
          }),
          repo.cancel(ctx, call.id, later(200)),
        ]);
        const status = (await callOf(call.id)).status;
        if (commit === "committed") {
          assert.equal(cancel.result, "not_cancellable");
          assert.equal(status, "created");
          outcomes.committed++;
        } else {
          assert.equal(commit, "cancelled");
          assert.equal(cancel.result, "cancelled");
          assert.equal(status, "cancelled");
          outcomes.cancelled++;
        }
        // The two rows never disagree.
        const dispatch = await dispatchOf(call.id);
        assert.equal(
          dispatch.state,
          status === "created" ? "dispatched" : "cancelled",
        );
      }
      assert.equal(outcomes.committed + outcomes.cancelled, 25);
    });

    it("holds a workspace to its live-call cap against dispatchers racing for the last slots", async () => {
      await reset();
      const cap = 3;
      const calls = await Promise.all(
        Array.from({ length: 10 }, () => enqueue("a")),
      );
      const tokens = calls.map(() => randomUUID());
      await Promise.all(
        calls.map((c, i) =>
          repo.claim(c.call.id, tokens[i], later(100), LEASE),
        ),
      );
      const results = await Promise.all(
        calls.map((c, i) =>
          repo.commit(c.call.id, tokens[i], {
            now: later(200),
            callbackTokenHash: `h${i}`,
            cap: {
              ctx,
              workspaceKey: ws,
              max: cap,
              liveSince: later(-1_200_000),
            },
          }),
        ),
      );
      assert.equal(results.filter((r) => r === "committed").length, cap);
      assert.equal(results.filter((r) => r === "at_capacity").length, 10 - cap);
      // The ones refused stay queued, claimable again later.
      const stillQueued = await prisma.aiVoiceAgentCall.count({
        where: { agentId, status: "queued" },
      });
      assert.equal(stillQueued, 10 - cap);
    });

    it("counts calls already live in the workspace, and only this workspace's", async () => {
      await reset();
      // Two calls already dialing in workspace A, three in B.
      for (const [agent, owner, n] of [
        [agentId, ctx, 2],
        [otherAgentId, otherCtx, 3],
      ] as const) {
        for (let i = 0; i < n; i++) {
          await prisma.aiVoiceAgentCall.create({
            data: {
              agentId: agent,
              userId: owner.userId,
              organizationId: owner.organizationId,
              toNumber: `+1202555${5000 + i}`,
              fromNumber: "+13055550001",
              status: "in_progress",
              createdAt: later(0),
            },
          });
        }
      }
      assert.equal(await repo.countLiveInWorkspace(ctx, later(-60_000)), 2);
      assert.equal(
        await repo.countLiveInWorkspace(otherCtx, later(-60_000)),
        3,
      );
      // A personal workspace of the same user is its own workspace (WRK-001).
      assert.equal(
        await repo.countLiveInWorkspace(personalCtx, later(-60_000)),
        0,
      );

      const { call } = await enqueue("a");
      const token = randomUUID();
      await repo.claim(call.id, token, later(100), LEASE);
      // Cap 2 and two already live: no room.
      assert.equal(
        await repo.commit(call.id, token, {
          now: later(200),
          callbackTokenHash: "h",
          cap: { ctx, workspaceKey: ws, max: 2, liveSince: later(-60_000) },
        }),
        "at_capacity",
      );
      // Cap 3 leaves one: the same call goes through.
      assert.equal(
        await repo.commit(call.id, token, {
          now: later(300),
          callbackTokenHash: "h",
          cap: { ctx, workspaceKey: ws, max: 3, liveSince: later(-60_000) },
        }),
        "committed",
      );
    });

    it("ignores calls too old to still be live", async () => {
      await reset();
      await prisma.aiVoiceAgentCall.create({
        data: {
          agentId,
          userId,
          organizationId,
          toNumber: "+12025556000",
          fromNumber: "+13055550001",
          status: "initiating",
          createdAt: later(-3 * 3_600_000),
        },
      });
      assert.equal(await repo.countLiveInWorkspace(ctx, later(-1_200_000)), 0);
    });
  });

  describe("cancelling", () => {
    it("is checked against the workspace: another workspace cannot see or cancel it", async () => {
      await reset();
      const { call } = await enqueue("a");
      assert.deepEqual(await repo.cancel(otherCtx, call.id, later(10)), {
        result: "not_found",
      });
      assert.deepEqual(await repo.cancel(personalCtx, call.id, later(10)), {
        result: "not_found",
      });
      assert.equal((await callOf(call.id)).status, "queued");
      assert.deepEqual(await repo.cancel(ctx, call.id, later(10)), {
        result: "cancelled",
      });
      const dispatch = await dispatchOf(call.id);
      assert.equal(dispatch.state, "cancelled");
      assert.equal(dispatch.reason, "cancelled");
      assert.equal((await callOf(call.id)).status, "cancelled");
    });

    it("cannot cancel a call that was already dialed, and says what it is", async () => {
      await reset();
      const { call } = await enqueue();
      const token = randomUUID();
      await repo.claim(call.id, token, later(100), LEASE);
      await repo.commit(call.id, token, {
        now: later(200),
        callbackTokenHash: "h",
        cap: null,
      });
      assert.deepEqual(await repo.cancel(ctx, call.id, later(300)), {
        result: "not_cancellable",
        status: "created",
      });
    });

    it("is idempotent: a second cancel is answered, not applied twice", async () => {
      await reset();
      const { call } = await enqueue();
      await repo.cancel(ctx, call.id, later(10));
      assert.deepEqual(await repo.cancel(ctx, call.id, later(20)), {
        result: "not_cancellable",
        status: "cancelled",
      });
    });
  });

  describe("expiring and failing", () => {
    it("expires what waited too long, and only that", async () => {
      await reset();
      const old = await enqueue("a", { expiresAt: later(1_000) });
      const fresh = await enqueue("b", { expiresAt: later(3_600_000) });
      const claimed = await enqueue("personal", { expiresAt: later(1_000) });
      await repo.claim(claimed.call.id, randomUUID(), later(500), LEASE);

      const expired = await repo.expireDue(later(2_000), LEASE);
      assert.deepEqual(expired, [old.call.id]);
      assert.equal((await callOf(old.call.id)).status, "expired");
      assert.equal((await dispatchOf(old.call.id)).state, "expired");
      assert.equal((await callOf(fresh.call.id)).status, "queued");
      // Under a live claim: its dispatcher decides, and its commit will refuse.
      assert.equal((await callOf(claimed.call.id)).status, "queued");
      // Once the claim is stale it expires too.
      assert.deepEqual(await repo.expireDue(later(500 + LEASE + 1), LEASE), [
        claimed.call.id,
      ]);
      // Expiring twice is harmless.
      assert.deepEqual(await repo.expireDue(later(500 + LEASE + 2), LEASE), []);
    });

    it("never expires a call that was dialed in the meantime", async () => {
      await reset();
      const { call } = await enqueue("a", { expiresAt: later(1_000) });
      const token = randomUUID();
      await repo.claim(call.id, token, later(100), LEASE);
      await repo.commit(call.id, token, {
        now: later(200),
        callbackTokenHash: "h",
        cap: null,
      });
      assert.deepEqual(await repo.expireDue(later(5_000), LEASE), []);
      assert.equal((await callOf(call.id)).status, "created");
    });

    it("ends a call a rule refused, once, and only for the claim holder", async () => {
      await reset();
      const { call } = await enqueue();
      const token = randomUUID();
      await repo.claim(call.id, token, later(100), LEASE);
      assert.equal(
        await repo.fail(call.id, randomUUID(), "no", later(200)),
        false,
      );
      assert.equal(
        await repo.fail(
          call.id,
          token,
          "Destination is on the DNC list",
          later(200),
        ),
        true,
      );
      const row = await callOf(call.id);
      assert.equal(row.status, "failed");
      assert.equal(row.lastError, "Destination is on the DNC list");
      assert.equal((await dispatchOf(call.id)).state, "failed");
      assert.equal(await repo.fail(call.id, token, "again", later(300)), false);
    });
  });

  describe("looking at the queue", () => {
    it("reports depth per level, the busiest workspaces, and calls left in doubt", async () => {
      await reset();
      await enqueue("a", { level: 3, queuedAt: later(0) });
      await enqueue("a", { level: 3, queuedAt: later(50) });
      await enqueue("b", { level: 2, queuedAt: later(80) });
      const depth = await repo.depth(later(1_000));
      assert.deepEqual(
        depth.map((d) => [d.level, d.queued]),
        [
          [2, 1],
          [3, 2],
        ],
      );
      assert.equal(
        depth[1].oldestQueuedAt?.toISOString(),
        later(0).toISOString(),
      );
      const busiest = await repo.busiestWorkspaces();
      assert.deepEqual(busiest[0], { workspaceKey: ws, queued: 2 });
      assert.equal(await repo.hasBacklog(later(1_000)), true);
      assert.equal(await repo.hasBacklog(later(1_000), 1), false);

      // A call committed long ago with no provider handle is "in doubt".
      const { call } = await enqueue("personal");
      const token = randomUUID();
      await repo.claim(call.id, token, later(100), LEASE);
      await repo.commit(call.id, token, {
        now: later(200),
        callbackTokenHash: "h",
        cap: null,
      });
      assert.equal(await repo.countAmbiguous(later(10_000)), 1);
      await prisma.aiVoiceAgentCall.update({
        where: { id: call.id },
        data: { providerCallControlId: "cc-1", status: "initiating" },
      });
      assert.equal(await repo.countAmbiguous(later(10_000)), 0);
    });

    it("lists the queue for the admin view, paged", async () => {
      await reset();
      for (let i = 0; i < 5; i++) await enqueue("a", { queuedAt: later(i) });
      await enqueue("b", { queuedAt: later(10) });
      const page = await repo.listForAdmin({ limit: 2, offset: 0 });
      assert.equal(page.total, 6);
      assert.equal(page.rows.length, 2);
      const mine = await repo.listForAdmin({
        limit: 10,
        offset: 0,
        workspaceKey: otherWs,
      });
      assert.equal(mine.total, 1);
      assert.equal(mine.rows[0].agentCall.agentId, otherAgentId);
    });

    it("counts a queued call as one a person will be rung by (the overlap check)", async () => {
      await reset();
      const { call } = await enqueue();
      const { AiVoiceAgentCallRepository } = await import(
        "./ai-voice-agent-call.repository"
      );
      const calls = new AiVoiceAgentCallRepository(prisma as never);
      assert.equal(
        await calls.hasLiveCallToNumber(
          ctx,
          call.toNumber,
          new Date(Date.now() - 3_600_000),
        ),
        true,
      );
      // A window that starts after the call was queued does not see it.
      assert.equal(
        await calls.hasLiveCallToNumber(
          ctx,
          call.toNumber,
          new Date(Date.now() + 60_000),
        ),
        false,
      );
      // Nor does another workspace.
      assert.equal(
        await calls.hasLiveCallToNumber(
          otherCtx,
          call.toNumber,
          new Date(Date.now() - 3_600_000),
        ),
        false,
      );
    });
  });

  describe("hourly statistics", () => {
    const hour = new Date("2026-12-01T10:00:00.000Z");

    it("only ever raises what is stored, whatever order the flushes arrive in", async () => {
      await hours.merge(account, hour, {
        peakCps: 4,
        attempts: 30,
        counters: { l0: 5, l3: 25, overage: 1 },
      });
      // A flush after Redis lost its state: lower figures must not win.
      await hours.merge(account, hour, {
        peakCps: 2,
        attempts: 3,
        counters: { l0: 1, l3: 2, accepted: 3 },
      });
      const [stored] = await hours.listBetween(
        account,
        hour,
        new Date(hour.getTime() + 3_600_000),
      );
      assert.equal(stored.peakCps, 4);
      assert.equal(stored.attempts, 30);
      assert.deepEqual(stored.counters, {
        l0: 5,
        l3: 25,
        overage: 1,
        accepted: 3,
      });
      // A genuinely higher figure does raise it.
      await hours.merge(account, hour, {
        peakCps: 5,
        attempts: 31,
        counters: { l3: 26 },
      });
      const latest = await hours.latest(account);
      assert.equal(latest?.peakCps, 5);
      assert.equal((latest?.counters as Record<string, number>).l3, 26);
    });

    it("keeps one row per account and hour even when flushed at once", async () => {
      const other = new Date("2026-12-01T11:00:00.000Z");
      await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          hours
            .merge(account, other, { peakCps: i, attempts: i, counters: {} })
            .catch(() => undefined),
        ),
      );
      const rows = await hours.listBetween(
        account,
        other,
        new Date(other.getTime() + 1),
      );
      assert.equal(rows.length, 1);
    });
  });

  it("concurrent hourly rollups never lower a peak or counter", async () => {
    const hour = new Date("2026-11-24T18:00:00Z");
    await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        hours.merge(account, hour, {
          peakCps: 30 - i,
          attempts: 100 - i,
          counters: { accepted: 100 - i },
        }),
      ),
    );
    const [stored] = await hours.listBetween(
      account,
      hour,
      new Date(hour.getTime() + 3_600_000),
    );
    assert.equal(stored.peakCps, 30);
    assert.equal(stored.attempts, 100);
    assert.equal((stored.counters as { accepted: number }).accepted, 100);
  });

  it("does not let a claim whose lease expired commit even before takeover", async () => {
    await reset();
    const row = await enqueue();
    const token = randomUUID();
    assert.equal(await repo.claim(row.call.id, token, t0, 30_000), true);
    assert.equal(
      await repo.commit(row.call.id, token, {
        now: later(31_000),
        callbackTokenHash: "late",
        cap: null,
      }),
      "not_claimed",
    );
    assert.equal((await callOf(row.call.id)).status, "queued");
  });

  describe("settings", () => {
    it("stores overrides per account, replaces them and removes them", async () => {
      await settings.upsertMany(
        account,
        { mode: "enforce", pausedClasses: ["background"] },
        { userId: null, reason: "incident" },
      );
      assert.deepEqual(await settings.listForAccount(account), {
        mode: "enforce",
        pausedClasses: ["background"],
      });
      await settings.upsertMany(
        account,
        { mode: "observe" },
        { userId: null, reason: null },
      );
      assert.equal((await settings.listForAccount(account)).mode, "observe");
      assert.equal(
        await settings.deleteKeys(account, ["pausedClasses", "absent"]),
        1,
      );
      assert.deepEqual(await settings.listForAccount(account), {
        mode: "observe",
      });
      // Another account never sees them.
      assert.deepEqual(await settings.listForAccount("someone-else"), {});
    });
  });
});
