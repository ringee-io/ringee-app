import {
  FOLLOW_UP_SUITE_TIMEOUT_MS,
  isolateFollowUpWorkerFixtures,
} from "../../../test/postgres-worker-fixture";
import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { BadRequestException } from "@nestjs/common";
import {
  AiVoiceAgentCallDispatchRepository,
  AiVoiceAgentCallRepository,
  CallRepository,
  CreditRepository,
  OrganizationRepository,
  Prisma,
  PrismaClient,
} from "@ringee/database";
import {
  DispatchRuntime,
  ProviderDispatchService,
  ProviderDispatchDeferredError,
  RedisService,
  RingeeManagedAccountResolver,
  VoiceAgentCallRefusedError,
  baselineSettings,
  connectRedisClient,
  type DispatchSettings,
  type OwnershipContext,
} from "@ringee/platform";
import { DispatchQueueService } from "../dispatch/dispatch-queue.service";
import {
  VoiceAgentCallService,
  VoiceAgentCallStartError,
  VoiceAgentCallStartOutcome,
  clientIdempotencyKey,
} from "./voice-agent-call.service";

/**
 * The agent-call queue, end to end (CPS-006): the real service, the real
 * repositories on PostgreSQL, the real pacing clocks on Redis. Only the
 * telephony provider is replaced — and every dial it is asked for is counted,
 * because "no duplicate provider attempts" is the property that matters.
 *
 * Opt in with a disposable database and a disposable Redis:
 *   RINGEE_FOLLOWUP_TEST_DATABASE_URL, RINGEE_CPS_TEST_REDIS_URL
 */
const dbUrl = process.env.RINGEE_FOLLOWUP_TEST_DATABASE_URL;
const redisUrl = process.env.RINGEE_CPS_TEST_REDIS_URL;

describe(
  "agent call dispatch queue (services, PostgreSQL + Redis)",
  { skip: !dbUrl || !redisUrl, timeout: FOLLOW_UP_SUITE_TIMEOUT_MS },
  () => {
    const prisma = new PrismaClient({ datasourceUrl: dbUrl });
    const db = prisma as never;
    const agentCalls = new AiVoiceAgentCallRepository(db);
    const calls = new CallRepository(db);
    const dispatches = new AiVoiceAgentCallDispatchRepository(db);
    const creditRepo = new CreditRepository(db);
    const organizationRepo = new OrganizationRepository(db);

    const userId = randomUUID();
    const otherUserId = randomUUID();
    const organizationId = randomUUID();
    const otherOrganizationId = randomUUID();
    const ctx: OwnershipContext = { userId, organizationId };
    const otherCtx: OwnershipContext = {
      userId: otherUserId,
      organizationId: otherOrganizationId,
    };
    const FROM = "+13055550001";
    let agent: { id: string } & Record<string, unknown>;
    let otherAgent: { id: string } & Record<string, unknown>;
    let releaseFixture: (() => Promise<void>) | undefined;
    const closers: Array<() => void> = [];

    /** What the fake provider does on the next dial(s). */
    const provider = {
      dials: [] as string[],
      latencyMs: 0,
      behavior: (() => "ok") as () => "ok" | "refuse" | "timeout" | "hang",
    };
    const world = {
      balance: 100,
      dnc: new Set<string>(),
      numberFailures: 0,
      kicks: 0,
    };

    const settings = (overrides: Partial<DispatchSettings> = {}) => ({
      ...baselineSettings({
        mode: "enforce",
        ceilingCps: 5,
        safetyMargin: 0.2,
        orgAutomationCps: 2,
        queueEnabled: true,
        orgConcurrency: 25,
        queueMaxPerWorkspace: 1000,
        queueMaxTotal: 5000,
        queueMaxWaitMinutes: 120,
        surchargeBudgetUsd: 0,
      }),
      ...overrides,
    });

    /** Plenty of capacity: tests about what the queue DOES, not how slowly. */
    const roomy = (overrides: Partial<DispatchSettings> = {}) =>
      settings({
        ceilingCps: 400,
        safetyMargin: 0,
        orgAutomationCps: 400,
        orgConcurrency: 10_000,
        queueMaxPerWorkspace: 10_000,
        ...overrides,
      });

    async function build(overrides: Partial<DispatchSettings> = {}) {
      const client = await connectRedisClient(redisUrl);
      closers.push(() => client.destroy());
      const redis = new RedisService(client as never);
      const dispatch = new ProviderDispatchService(
        redis,
        new DispatchRuntime(),
        {
          baseline: settings(overrides),
          resolver: new RingeeManagedAccountResolver(`q-${accountRef}`),
        },
      );
      const service = new VoiceAgentCallService(
        {
          require: async (_ctx: OwnershipContext, id: string) =>
            id === otherAgent.id ? otherAgent : agent,
          assertReadyForCalls: () => {},
          ensureCallingApp: async () => {},
          ensureInsightGroup: async () => {},
          ensureToolEndpoints: async () => true,
        } as never,
        { require: () => ({ variables: [] }) } as never,
        agentCalls,
        calls,
        {
          startCall: async (input: { to: string }) => {
            const egress = await dispatch.beginEgress(
              "POST",
              "/texml/ai_calls/test",
            );
            const behavior = provider.behavior();
            provider.dials.push(input.to);
            if (provider.latencyMs) {
              await new Promise((r) => setTimeout(r, provider.latencyMs));
            }
            if (behavior === "refuse") {
              throw new VoiceAgentCallRefusedError(
                new BadRequestException("The number was refused"),
              );
            }
            if (behavior === "timeout") throw new Error("socket hang up");
            if (behavior === "hang") {
              await new Promise((r) => setTimeout(r, 500));
              throw new Error("simulated lost provider response");
            }
            egress?.accepted();
            return {
              providerCallId: `prov-${randomUUID()}`,
              callControlId: `cc-${randomUUID()}`,
              callSessionId: `sess-${randomUUID()}`,
            };
          },
        } as never,
        { findOrCreateByPhone: async () => null } as never,
        {
          findOnDNC: async (_c: unknown, to: string) =>
            world.dnc.has(to) ? { reason: "asked not to be called" } : null,
        } as never,
        {
          getBalance: async () => world.balance,
          reserveCredits: (
            scope: OwnershipContext,
            parts: Array<{ idempotencyKey: string; amount: number }>,
            expiresAt: Date,
          ) => creditRepo.reserveOnce(scope, parts, expiresAt),
          releaseReservations: (scope: OwnershipContext, keys: string[]) =>
            creditRepo.releaseReservations(scope, keys),
        } as never,
        {
          listOutboundCallerIds: async () => {
            if (world.numberFailures > 0) {
              world.numberFailures--;
              throw new Error("the database blinked");
            }
            return [{ id: randomUUID(), phoneNumber: FROM }];
          },
        } as never,
        {
          getCachedUserById: async () => ({
            canCall: true,
            freeCallTrial: false,
          }),
          getUserById: (id: string) =>
            prisma.user.findUnique({ where: { id } }),
        } as never,
        dispatch,
        dispatches,
        {
          kick: async () => {
            world.kicks++;
          },
        } as never,
        organizationRepo,
      );
      const queue = new DispatchQueueService(
        dispatch,
        dispatches,
        service,
        agentCalls,
      );
      return { service, queue, dispatch };
    }

    let accountRef = randomUUID().slice(0, 8);
    let phoneSequence = 0;
    const phone = () =>
      `+1202555${String(100 + (phoneSequence++ % 100)).padStart(4, "0")}`;

    const start = (
      svc: VoiceAgentCallService,
      to: string,
      options: {
        key?: string;
        context?: OwnershipContext;
        agentId?: string;
      } = {},
    ) =>
      svc.startCallForClient(
        options.context ?? ctx,
        options.agentId ?? agent.id,
        { to },
        { scope: "integration-a", idempotencyKey: options.key },
      );

    async function startPlaced(
      svc: VoiceAgentCallService,
      to: string,
      options = {},
    ) {
      const accepted = await start(svc, to, options);
      if (accepted.status === "queued") {
        const outcome = await svc.dispatchQueued(accepted.id, {
          maxWaitMs: 2_500,
        });
        assert.equal(outcome.outcome, "placed");
      }
      return {
        ...accepted,
        status: (
          await prisma.aiVoiceAgentCall.findUniqueOrThrow({
            where: { id: accepted.id },
          })
        ).status,
      };
    }

    const rowFor = (id: string) =>
      prisma.aiVoiceAgentCall.findUniqueOrThrow({ where: { id } });
    const dispatchFor = (id: string) =>
      prisma.aiVoiceAgentCallDispatch.findUniqueOrThrow({
        where: { agentCallId: id },
      });

    /** Runs passes until nothing is waiting or the time is up. */
    async function drain(queue: DispatchQueueService, seconds = 25) {
      const stopAt = Date.now() + seconds * 1000;
      for (;;) {
        const summary = await queue.runPass({ budgetMs: 3_000 });
        if (summary.remaining === 0 || Date.now() > stopAt) return summary;
        if (summary.nextDueInMs) {
          await new Promise((r) =>
            setTimeout(r, Math.min(summary.nextDueInMs!, 500)),
          );
        }
      }
    }

    /** Every test starts from an empty workspace: leftovers would count toward its bounds. */
    async function reset() {
      const owners = { in: [userId, otherUserId] };
      await prisma.aiVoiceAgentCall.deleteMany({ where: { userId: owners } });
      await prisma.call.deleteMany({ where: { userId: owners } });
      await prisma.creditReservation.deleteMany({
        where: {
          credit: {
            organizationId: { in: [organizationId, otherOrganizationId] },
          },
        },
      });
      await prisma.credit.updateMany({
        where: {
          organizationId: { in: [organizationId, otherOrganizationId] },
        },
        data: { amount: 100 },
      });
      accountRef = randomUUID().slice(0, 8);
      provider.dials = [];
      provider.latencyMs = 0;
      provider.behavior = () => "ok";
      world.balance = 100;
      world.dnc.clear();
      world.numberFailures = 0;
      world.kicks = 0;
    }

    before(async () => {
      assert.ok(["127.0.0.1", "localhost"].includes(new URL(dbUrl!).hostname));
      assert.ok(
        ["127.0.0.1", "localhost"].includes(new URL(redisUrl!).hostname),
      );
      releaseFixture = await isolateFollowUpWorkerFixtures(prisma);
      await prisma.user.createMany({
        data: [
          { id: userId, canCall: true, firstName: "Owner" },
          { id: otherUserId, canCall: true, firstName: "Other" },
        ],
      });
      await prisma.organization.createMany({
        data: [
          { id: organizationId, clerkId: organizationId, name: "Team A" },
          {
            id: otherOrganizationId,
            clerkId: otherOrganizationId,
            name: "Team B",
          },
        ],
      });
      await prisma.organizationMembership.createMany({
        data: [
          { userId, organizationId, clerkUserId: userId, role: "org:admin" },
          {
            userId: otherUserId,
            organizationId: otherOrganizationId,
            clerkUserId: otherUserId,
            role: "org:admin",
          },
        ],
      });
      await prisma.credit.createMany({
        data: [
          { organizationId, amount: 100 },
          { organizationId: otherOrganizationId, amount: 100 },
        ],
      });
      const make = (owner: OwnershipContext, name: string) =>
        prisma.aiVoiceAgent.create({
          data: {
            userId: owner.userId,
            organizationId: owner.organizationId,
            name,
            type: "reminders_notifications",
            status: "active",
            providerAssistantId: `fixture-${randomUUID()}`,
            providerTexmlAppId: `app-${randomUUID()}`,
            toolSecretHash: "fixture",
          },
        });
      agent = (await make(ctx, "Sofia")) as never;
      otherAgent = (await make(otherCtx, "Pedro")) as never;
    });

    after(async () => {
      closers.forEach((close) => {
        try {
          close();
        } catch {
          // already closed
        }
      });
      try {
        const users = { in: [userId, otherUserId] };
        await prisma.aiVoiceAgentCall.deleteMany({ where: { userId: users } });
        await prisma.call.deleteMany({ where: { userId: users } });
        await prisma.aiVoiceAgent.deleteMany({ where: { userId: users } });
        await prisma.organization.deleteMany({
          where: { id: { in: [organizationId, otherOrganizationId] } },
        });
        await prisma.user.deleteMany({ where: { id: users } });
      } finally {
        await releaseFixture?.();
        await prisma.$disconnect();
      }
    });

    describe("an idle system answers exactly as it always did", () => {
      it("returns a durable queued identifier before any provider I/O, even when idle", async () => {
        await reset();
        const { service, queue } = await build();
        const to = phone();
        provider.latencyMs = 300;
        const started = await start(service, to, { key: randomUUID() });
        assert.equal(started.status, "queued");
        assert.equal(started.replayed, false);
        assert.deepEqual(provider.dials, []);
        assert.equal((await dispatchFor(started.id)).state, "queued");
        await drain(queue);
        const row = await rowFor(started.id);
        assert.equal(row.status, "initiating");
        assert.ok(row.providerCallControlId);
        assert.ok(row.callId);
        assert.ok(row.callbackTokenHash);
      });

      it("works the same with the queue off: placed inline, no queue rows", async () => {
        await reset();
        const { service } = await build({ queueEnabled: false });
        const to = phone();
        const started = await start(service, to);
        assert.equal(started.status, "initiating");
        assert.deepEqual(provider.dials, [to]);
        assert.equal(
          await prisma.aiVoiceAgentCallDispatch.count({
            where: { agentCallId: started.id },
          }),
          0,
        );
      });
    });

    describe("inline capacity retries", () => {
      it("retries a proven-unsent inline CPS denial with the same key, placing one leg", async () => {
        await reset();
        const { service, dispatch } = await build(
          roomy({ queueEnabled: false }),
        );
        const to = phone();
        const key = randomUUID();
        const beginEgress = dispatch.beginEgress.bind(dispatch);
        dispatch.beginEgress = async () => {
          throw new ProviderDispatchDeferredError("busy", 250);
        };
        await assert.rejects(
          start(service, to, { key }),
          (error: unknown) =>
            error instanceof VoiceAgentCallStartError &&
            error.outcome ===
              VoiceAgentCallStartOutcome.retryable_before_placement &&
            error.getStatus() === 429,
        );
        const failed = await prisma.aiVoiceAgentCall.findFirstOrThrow({
          where: { agentId: agent.id, toNumber: to },
        });
        assert.equal(failed.status, "failed");
        assert.equal(failed.idempotencyKey, null);
        assert.deepEqual(provider.dials, []);
        assert.equal(
          await prisma.creditReservation.count({
            where: { credit: { organizationId }, state: "held" },
          }),
          0,
        );

        dispatch.beginEgress = beginEgress;
        const retried = await Promise.all(
          Array.from({ length: 10 }, () => start(service, to, { key })),
        );
        assert.equal(new Set(retried.map((call) => call.id)).size, 1);
        assert.notEqual(retried[0].id, failed.id);
        assert.deepEqual(provider.dials, [to]);
        const placed = await rowFor(retried[0].id);
        // Even an incorrect failed status must never free a key with handles.
        await agentCalls.update(placed.id, { status: "failed" });
        assert.equal(
          await agentCalls.releaseUnsentIdempotencyKey(
            ctx,
            placed.id,
            clientIdempotencyKey("integration-a", key),
          ),
          false,
        );
        assert.equal(
          (await rowFor(placed.id)).idempotencyKey,
          clientIdempotencyKey("integration-a", key),
        );
      });
    });

    describe("when capacity is short", () => {
      it("reports database admission pressure as temporary and resolves an uncertain commit by the same key", async () => {
        for (const code of ["P2024", "P2028"]) {
          await reset();
          const { service, queue } = await build(roomy());
          const to = phone();
          const key = randomUUID();
          const enqueue = dispatches.enqueue.bind(dispatches);
          dispatches.enqueue = async (input) => {
            if (code === "P2028") await enqueue(input);
            throw new Prisma.PrismaClientKnownRequestError(
              "temporary admission failure",
              {
                code,
                clientVersion: "test",
              },
            );
          };
          try {
            await assert.rejects(
              start(service, to, { key }),
              (error: unknown) =>
                error instanceof VoiceAgentCallStartError &&
                error.getStatus() === 503 &&
                error.outcome ===
                  VoiceAgentCallStartOutcome.placed_pending_reconciliation,
            );
          } finally {
            dispatches.enqueue = enqueue;
          }
          assert.deepEqual(provider.dials, []);
          const recovered = await start(service, to, { key });
          assert.equal(recovered.status, "queued");
          assert.equal(recovered.replayed, code === "P2028");
          assert.equal(
            await prisma.aiVoiceAgentCallDispatch.count({
              where: { organizationId },
            }),
            1,
          );
          await drain(queue);
          assert.deepEqual(provider.dials, [to]);
        }
      });

      it("queues the call, says so, and dials nothing", async () => {
        await reset();
        const { service } = await build();
        await startPlaced(service, phone());
        const second = await start(service, phone(), { key: randomUUID() });
        assert.equal(second.status, "queued");
        assert.equal(provider.dials.length, 1);
        const row = await rowFor(second.id);
        assert.equal(row.status, "queued");
        assert.equal(
          row.callId,
          null,
          "no telephony row exists for a call that has not been dialed",
        );
        assert.equal(row.callbackTokenHash, null);
        const waiting = await dispatchFor(second.id);
        assert.equal(waiting.state, "queued");
        assert.ok(waiting.expiresAt.getTime() > Date.now());
        assert.ok(world.kicks >= 1, "the pump was woken");
      });

      it("places it once capacity returns, exactly one dial per call", async () => {
        await reset();
        const { service, queue } = await build();
        const first = phone();
        const second = phone();
        await start(service, first);
        const waiting = await start(service, second, { key: randomUUID() });
        assert.equal(waiting.status, "queued");

        const summary = await drain(queue, 10);
        assert.equal(summary.remaining, 0);
        assert.deepEqual(provider.dials.sort(), [first, second].sort());
        const row = await rowFor(waiting.id);
        assert.equal(row.status, "initiating");
        assert.ok(row.callId);
        assert.equal((await dispatchFor(waiting.id)).state, "dispatched");
      });

      it("answers a repeat of a queued request with the same queued call", async () => {
        await reset();
        const { service } = await build();
        await startPlaced(service, phone());
        const key = randomUUID();
        const to = phone();
        const first = await start(service, to, { key });
        const again = await start(service, to, { key });
        assert.equal(first.status, "queued");
        assert.equal(again.id, first.id);
        assert.equal(again.replayed, true);
        assert.equal(again.status, "queued");
        assert.deepEqual(again.queue, first.queue);
        assert.equal(
          await prisma.aiVoiceAgentCallDispatch.count({
            where: {
              workspaceKey: `organization:${organizationId}`,
              state: "queued",
            },
          }),
          1,
        );
      });
    });

    describe("simultaneous requests", () => {
      it(
        "100 simultaneous requests are all queued or placed, and each is dialed exactly once",
        { timeout: 120_000 },
        async () => {
          await reset();
          const { service, queue } = await build(roomy());
          const numbers = Array.from({ length: 100 }, phone);
          const settled = await Promise.allSettled(
            numbers.map((to) => start(service, to, { key: randomUUID() })),
          );
          assert.equal(
            settled.filter((r) => r.status === "rejected").length,
            0,
            settled
              .filter((r) => r.status === "rejected")
              .map((r) => String(r.reason))
              .slice(0, 3)
              .join("\n"),
          );
          const results = settled.flatMap((r) =>
            r.status === "fulfilled" ? [r.value] : [],
          );
          assert.equal(new Set(results.map((r) => r.id)).size, 100);
          await drain(queue, 30);
          assert.equal(provider.dials.length, 100);
          assert.equal(
            new Set(provider.dials).size,
            100,
            "no number was dialed twice",
          );
          assert.deepEqual([...provider.dials].sort(), [...numbers].sort());
          for (const result of results) {
            const row = await rowFor(result.id);
            assert.equal(row.status, "initiating", `call ${result.id}`);
            assert.equal((await dispatchFor(result.id)).state, "dispatched");
          }
        },
      );

      it(
        "accepts 1,000 concurrent integration requests durably without reserving credits while queued",
        { timeout: 120_000 },
        async () => {
          await reset();
          const replicas = await Promise.all(
            Array.from({ length: 4 }, () => build(roomy())),
          );
          const settled = await Promise.allSettled(
            Array.from({ length: 1000 }, (_, i) =>
              start(replicas[i % 4].service, phone(), {
                key: `batch-${randomUUID()}`,
              }),
            ),
          );
          assert.equal(
            settled.filter((r) => r.status === "rejected").length,
            0,
            settled
              .filter((r) => r.status === "rejected")
              .map((r) => String(r.reason))
              .slice(0, 3)
              .join("\n"),
          );
          const results = settled.flatMap((r) =>
            r.status === "fulfilled" ? [r.value] : [],
          );
          assert.equal(new Set(results.map((r) => r.id)).size, 1000);
          assert.ok(results.every((r) => r.status === "queued"));
          assert.equal(provider.dials.length, 0);
          assert.equal(
            await prisma.creditReservation.count({
              where: { credit: { organizationId }, state: "held" },
            }),
            0,
          );
          await prisma.aiVoiceAgentCallDispatch.updateMany({
            where: {
              workspaceKey: `organization:${organizationId}`,
              state: "queued",
            },
            data: { expiresAt: new Date(Date.now() - 1) },
          });
          await dispatches.expireDue(new Date(), 30_000, 1000);
          assert.equal(
            await prisma.aiVoiceAgentCall.count({
              where: { agentId: agent.id, status: "expired" },
            }),
            1000,
          );
        },
      );

      it("the same request sent twenty times at once is one call, dialed once", async () => {
        await reset();
        provider.latencyMs = 30;
        const { service, queue } = await build(roomy());
        const key = randomUUID();
        const to = phone();
        const results = await Promise.allSettled(
          Array.from({ length: 20 }, () => start(service, to, { key })),
        );
        await drain(queue, 15);
        const ids = new Set(
          results.flatMap((r) =>
            r.status === "fulfilled" ? [r.value.id] : [],
          ),
        );
        assert.equal(ids.size, 1);
        await drain(queue);
        assert.equal(provider.dials.length, 1);
        assert.equal(
          await prisma.aiVoiceAgentCall.count({
            where: {
              idempotencyKey: clientIdempotencyKey("integration-a", key),
            },
          }),
          1,
        );
      });

      it("two backend replicas racing for the same queued call dial it once", async () => {
        await reset();
        const a = await build();
        const b = await build();
        await startPlaced(a.service, phone());
        const waiting = await start(a.service, phone(), { key: randomUUID() });
        assert.equal(waiting.status, "queued");
        await new Promise((r) => setTimeout(r, 700));
        const [first, second] = await Promise.all([
          a.service.dispatchQueued(waiting.id, { maxWaitMs: 0 }),
          b.service.dispatchQueued(waiting.id, { maxWaitMs: 0 }),
        ]);
        const outcomes = [first.outcome, second.outcome].sort();
        assert.deepEqual(outcomes, ["placed", "skipped"]);
        assert.equal(provider.dials.length, 2);
      });
    });

    describe("fairness and backpressure", () => {
      it(
        "a small workspace is not made to wait behind a large one's backlog",
        { timeout: 60_000 },
        async () => {
          await reset();
          // Capacity for a few a second: enough to see the order.
          const { service, queue, dispatch } = await build(
            settings({ ceilingCps: 20, safetyMargin: 0, orgAutomationCps: 20 }),
          );
          void dispatch;
          // The big workspace queues thirty; the small one then queues three.
          await startPlaced(service, phone());
          const bigNumbers = Array.from({ length: 30 }, phone);
          for (const to of bigNumbers)
            await start(service, to, { key: randomUUID() });
          const smallNumbers = Array.from({ length: 3 }, phone);
          for (const to of smallNumbers) {
            await start(service, to, {
              key: randomUUID(),
              context: otherCtx,
              agentId: otherAgent.id,
            });
          }
          const dialedBefore = provider.dials.length;
          // One short pass: it can place only a handful.
          await queue.runPass({ budgetMs: 1_200 });
          const firstWave = provider.dials.slice(dialedBefore);
          assert.ok(firstWave.length >= 2 && firstWave.length < 30);
          const smallServed = firstWave.filter((to) =>
            smallNumbers.includes(to),
          );
          assert.ok(
            smallServed.length >= 1,
            "the small workspace got a turn in the first wave, not after thirty others",
          );
        },
      );

      it("refuses a workspace past its queue bound, with a time to come back", async () => {
        await reset();
        const { service } = await build(
          settings({ queueMaxPerWorkspace: 2, ceilingCps: 5 }),
        );
        await startPlaced(service, phone());
        await start(service, phone(), { key: randomUUID() });
        await start(service, phone(), { key: randomUUID() });
        await assert.rejects(
          start(service, phone(), { key: randomUUID() }),
          (error: unknown) => {
            assert.ok(error instanceof VoiceAgentCallStartError);
            assert.equal(error.getStatus(), 429);
            assert.equal(
              (error.getResponse() as { code: string }).code,
              "dispatch_queue_full",
            );
            assert.equal(
              error.outcome,
              VoiceAgentCallStartOutcome.retryable_before_placement,
            );
            return true;
          },
        );
        // The refused request left nothing behind.
        assert.equal(
          await prisma.aiVoiceAgentCall.count({
            where: { agentId: agent.id, status: "queued" },
          }),
          2,
        );
      });
    });

    describe("a call that waits is checked again before it is dialed", () => {
      it("fails it, undialed, when the balance ran out while it waited", async () => {
        await reset();
        const { service, queue } = await build();
        await startPlaced(service, phone());
        const key = randomUUID();
        const to = phone();
        const waiting = await start(service, to, { key });
        assert.equal(waiting.status, "queued");
        world.balance = 0;
        await new Promise((r) => setTimeout(r, 700));
        const summary = await queue.runPass({ budgetMs: 2_000 });
        assert.equal(summary.failed, 1);
        const row = await rowFor(waiting.id);
        assert.equal(row.status, "failed");
        assert.match(row.lastError ?? "", /Insufficient credits/);
        assert.equal(
          provider.dials.length,
          1,
          "only the first call was ever dialed",
        );
        assert.equal((await dispatchFor(waiting.id)).state, "failed");
        // A repeat under the same key reports the failure; it does not dial.
        world.balance = 100;
        await assert.rejects(
          start(service, to, { key }),
          (error: unknown) =>
            (error as { getResponse?: () => { code?: string } }).getResponse?.()
              .code === "idempotency_key_failed",
        );
        assert.equal(provider.dials.includes(to), false);
      });

      it("fails it when the person was added to the DNC list while it waited", async () => {
        await reset();
        const { service, queue } = await build();
        await startPlaced(service, phone());
        const to = phone();
        const waiting = await start(service, to, { key: randomUUID() });
        world.dnc.add(to);
        await new Promise((r) => setTimeout(r, 700));
        await queue.runPass({ budgetMs: 2_000 });
        const row = await rowFor(waiting.id);
        assert.equal(row.status, "failed");
        assert.match(row.lastError ?? "", /DNC/);
        assert.equal(provider.dials.includes(to), false);
      });

      it(
        "retries a transient preparation failure, then places it once",
        { timeout: 60_000 },
        async () => {
          await reset();
          const { service, queue } = await build();
          await startPlaced(service, phone());
          const to = phone();
          const waiting = await start(service, to, { key: randomUUID() });
          world.numberFailures = 1;
          await new Promise((r) => setTimeout(r, 700));
          const first = await queue.runPass({ budgetMs: 1_500 });
          assert.equal(first.placed, 0);
          assert.equal((await rowFor(waiting.id)).status, "queued");
          const dispatch = await dispatchFor(waiting.id);
          assert.match(dispatch.reason ?? "", /^retry:/);
          // The retry waits out its backoff (2 s), then goes through.
          await prisma.aiVoiceAgentCallDispatch.update({
            where: { agentCallId: waiting.id },
            data: { notBefore: new Date(Date.now() - 1) },
          });
          const second = await queue.runPass({ budgetMs: 3_000 });
          assert.equal(second.placed, 1);
          assert.equal(provider.dials.filter((d) => d === to).length, 1);
        },
      );
    });

    describe("cancelling and expiring", () => {
      it("never dials a call that was cancelled while it waited", async () => {
        await reset();
        const { service, queue } = await build();
        await startPlaced(service, phone());
        const to = phone();
        const waiting = await start(service, to, { key: randomUUID() });
        const cancelled = await service.cancelQueued(ctx, waiting.id);
        assert.equal(cancelled.status, "cancelled");
        await new Promise((r) => setTimeout(r, 700));
        await queue.runPass({ budgetMs: 2_000 });
        assert.equal(provider.dials.includes(to), false);
        assert.equal((await rowFor(waiting.id)).status, "cancelled");
      });

      it("cannot cancel what is already dialing, and keeps another workspace out", async () => {
        await reset();
        const { service } = await build();
        const placed = await startPlaced(service, phone());
        await assert.rejects(
          service.cancelQueued(ctx, placed.id),
          (error: unknown) =>
            (error as { getStatus?: () => number }).getStatus?.() === 409,
        );
        const waiting = await start(service, phone(), { key: randomUUID() });
        await assert.rejects(
          service.cancelQueued(otherCtx, waiting.id),
          (error: unknown) =>
            (error as { getStatus?: () => number }).getStatus?.() === 404,
        );
        assert.equal((await rowFor(waiting.id)).status, "queued");
      });

      it("a repeat of a cancelled request does not quietly dial it", async () => {
        await reset();
        const { service } = await build();
        await startPlaced(service, phone());
        const key = randomUUID();
        const to = phone();
        const waiting = await start(service, to, { key });
        await service.cancelQueued(ctx, waiting.id);
        await assert.rejects(
          start(service, to, { key }),
          (error: unknown) =>
            (error as { getResponse?: () => { code?: string } }).getResponse?.()
              .code === "idempotency_key_cancelled",
        );
        assert.equal(provider.dials.includes(to), false);
      });

      it("concurrent owner status reads expire an overdue operation without a worker", async () => {
        await reset();
        const { service } = await build(roomy());
        const waiting = await start(service, phone(), { key: randomUUID() });
        await prisma.aiVoiceAgentCallDispatch.update({
          where: { agentCallId: waiting.id },
          data: { expiresAt: new Date(Date.now() - 1_000) },
        });
        await assert.rejects(
          service.requireCall(otherCtx, waiting.id),
          (error: unknown) =>
            (error as { getStatus?: () => number }).getStatus?.() === 404,
        );
        assert.equal((await rowFor(waiting.id)).status, "queued");
        const expire = dispatches.expireForOwner.bind(dispatches);
        let arrived = 0;
        let releaseReaders!: () => void;
        const allReadQueued = new Promise<void>((resolve) => {
          releaseReaders = resolve;
        });
        dispatches.expireForOwner = async (scope, id, now) => {
          if (++arrived === 20) releaseReaders();
          await allReadQueued;
          return expire(scope, id, now);
        };
        let polled: Awaited<ReturnType<typeof service.requireCall>>[];
        try {
          polled = await Promise.all(
            Array.from({ length: 20 }, () =>
              service.requireCall(ctx, waiting.id),
            ),
          );
        } finally {
          dispatches.expireForOwner = expire;
        }
        assert.ok(polled.every((call) => call.status === "expired"));
        assert.equal((await dispatchFor(waiting.id)).state, "expired");
        assert.deepEqual(provider.dials, []);
      });

      it("expires what waited too long and never dials it, even once capacity returns", async () => {
        await reset();
        const { service, queue } = await build();
        await startPlaced(service, phone());
        const key = randomUUID();
        const to = phone();
        const waiting = await start(service, to, { key });
        await prisma.aiVoiceAgentCallDispatch.update({
          where: { agentCallId: waiting.id },
          data: { expiresAt: new Date(Date.now() - 1_000) },
        });
        await new Promise((r) => setTimeout(r, 700));
        const summary = await queue.runPass({ budgetMs: 2_000 });
        assert.equal(summary.expired, 1);
        assert.equal(summary.placed, 0);
        assert.equal((await rowFor(waiting.id)).status, "expired");
        assert.equal(provider.dials.includes(to), false);
        // A repeat under the same key says so; a new key is a new call.
        await assert.rejects(
          start(service, to, { key }),
          (error: unknown) =>
            (error as { getResponse?: () => { code?: string } }).getResponse?.()
              .code === "idempotency_key_expired",
        );
        assert.equal(provider.dials.includes(to), false);
      });
    });

    describe("the workspace's live-call cap", () => {
      it(
        "places no more than the cap at once and the rest when a slot frees",
        { timeout: 60_000 },
        async () => {
          await reset();
          const { service, queue } = await build(roomy({ orgConcurrency: 2 }));
          const numbers = Array.from({ length: 5 }, phone);
          const started = [];
          for (const to of numbers)
            started.push(await start(service, to, { key: randomUUID() }));
          await drain(queue, 6);
          const live = () =>
            prisma.aiVoiceAgentCall.count({
              where: {
                agentId: agent.id,
                status: { in: ["created", "initiating"] },
              },
            });
          assert.equal(provider.dials.length, 2, "only two slots");
          assert.equal(await live(), 2);
          assert.equal(
            await prisma.aiVoiceAgentCall.count({
              where: { agentId: agent.id, status: "queued" },
            }),
            3,
          );
          // One call ends: exactly one more goes out.
          const finished = await prisma.aiVoiceAgentCall.findFirstOrThrow({
            where: { agentId: agent.id, status: "initiating" },
          });
          await prisma.aiVoiceAgentCall.update({
            where: { id: finished.id },
            data: { status: "completed" },
          });
          await prisma.aiVoiceAgentCallDispatch.updateMany({
            where: { state: "queued" },
            data: { notBefore: new Date(Date.now() - 1) },
          });
          await drain(queue, 6);
          assert.equal(provider.dials.length, 3);
        },
      );

      it("does not let one workspace's calls count against another's cap", async () => {
        await reset();
        const { service, queue } = await build(roomy({ orgConcurrency: 1 }));
        const a = await start(service, phone(), { key: randomUUID() });
        const b = await start(service, phone(), {
          key: randomUUID(),
          context: otherCtx,
          agentId: otherAgent.id,
        });
        await drain(queue, 6);
        assert.equal((await rowFor(a.id)).status, "initiating");
        assert.equal((await rowFor(b.id)).status, "initiating");
      });
    });

    describe("when the provider does not answer cleanly", () => {
      it("keeps a call whose answer was lost, and never dials it again", async () => {
        await reset();
        provider.behavior = () => "timeout";
        const { service, queue } = await build();
        const to = phone();
        const accepted = await start(service, to, { key: randomUUID() });
        assert.equal(accepted.status, "queued");
        assert.equal(
          (await service.dispatchQueued(accepted.id, { maxWaitMs: 2500 }))
            .outcome,
          "in_doubt",
        );
        provider.behavior = () => "ok";
        await queue.runPass({ budgetMs: 1_500 });
        await queue.runPass({ budgetMs: 1_500 });
        // A leg may be live: it is left for the provider's callbacks.
        assert.equal(provider.dials.filter((d) => d === to).length, 1);
        const row = await prisma.aiVoiceAgentCall.findFirstOrThrow({
          where: { agentId: agent.id, toNumber: to },
        });
        assert.equal(row.status, "created");
        assert.equal(row.providerCallControlId, null);
        assert.equal((await dispatchFor(row.id)).state, "dispatched");
        assert.ok(
          (await dispatches.countAmbiguous(new Date(Date.now() + 60_000))) >= 1,
          "it is listed as in doubt for a person",
        );
      });

      it("ends a call the provider refused, once, without trying again", async () => {
        await reset();
        provider.behavior = () => "refuse";
        const { service, queue } = await build();
        const to = phone();
        const accepted = await start(service, to, { key: randomUUID() });
        assert.equal(
          (await service.dispatchQueued(accepted.id, { maxWaitMs: 2500 }))
            .outcome,
          "failed",
        );
        await queue.runPass({ budgetMs: 1_500 });
        assert.equal(provider.dials.filter((d) => d === to).length, 1);
        const row = await prisma.aiVoiceAgentCall.findFirstOrThrow({
          where: { agentId: agent.id, toNumber: to },
        });
        assert.equal(row.status, "failed");
      });

      it(
        "a provider that never answers leaves the call committed, not queued twice",
        { timeout: 30_000 },
        async () => {
          await reset();
          provider.behavior = () => "hang";
          const { service, queue } = await build();
          const to = phone();
          await start(service, to, { key: randomUUID() });
          await queue.runPass({ budgetMs: 1_000 });
          assert.equal(provider.dials.filter((d) => d === to).length, 1);
        },
      );
    });

    describe("a dispatcher that dies", () => {
      it(
        "frees its claim after the lease and another places the call once",
        { timeout: 60_000 },
        async () => {
          await reset();
          const { service, queue } = await build();
          await startPlaced(service, phone());
          const to = phone();
          const waiting = await start(service, to, { key: randomUUID() });
          assert.equal(waiting.status, "queued");

          // The immediate attempt was deferred for capacity; once that retry time
          // passes, a dispatcher claims it and dies before doing anything else.
          await new Promise((r) => setTimeout(r, 700));
          const deadToken = randomUUID();
          assert.equal(
            await dispatches.claim(waiting.id, deadToken, new Date(), 30_000),
            true,
          );
          // While the lease holds, nobody else takes it.
          const during = await queue.runPass({ budgetMs: 1_000 });
          assert.equal(during.placed, 0);
          assert.equal(provider.dials.includes(to), false);

          // The lease lapses.
          await prisma.aiVoiceAgentCallDispatch.update({
            where: { agentCallId: waiting.id },
            data: { claimedAt: new Date(Date.now() - 31_000) },
          });
          const after = await queue.runPass({ budgetMs: 3_000 });
          assert.equal(after.placed, 1);
          assert.equal(provider.dials.filter((d) => d === to).length, 1);

          // The dead dispatcher wakes up and tries to finish: it cannot.
          assert.equal(
            await dispatches.commit(waiting.id, deadToken, {
              now: new Date(),
              callbackTokenHash: "late",
              cap: null,
            }),
            "not_claimed",
          );
        },
      );
    });
  },
);
