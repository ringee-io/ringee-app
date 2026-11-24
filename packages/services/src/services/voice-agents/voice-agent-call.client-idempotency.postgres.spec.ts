import {
  FOLLOW_UP_SUITE_TIMEOUT_MS,
  isolateFollowUpWorkerFixtures,
} from "../../../test/postgres-worker-fixture";
import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import {
  BadRequestException,
  ConflictException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  AiVoiceAgentCallRepository,
  CallRepository,
  PrismaClient,
} from "@ringee/database";
import { VoiceAgentCallRefusedError } from "@ringee/platform";
import type { OwnershipContext } from "@ringee/platform";
import {
  VoiceAgentCallService,
  VoiceAgentCallStartError,
  VoiceAgentCallStartOutcome,
  clientIdempotencyKey,
} from "./voice-agent-call.service";

/**
 * HOOK-008 on real PostgreSQL.
 *
 * The unit specs stub the repository, so they cannot show what the whole design
 * rests on: that the unique index on `AiVoiceAgentCall.idempotencyKey` lets
 * exactly one of several simultaneous requests place a call. These tests run
 * the real repositories and the real constraint; only what must never be
 * reached from a test — the telephony provider — is replaced, and every dial it
 * is asked for is counted.
 *
 * Opt in with a disposable database (the same variable the follow-up suites
 * use); without it the suite is skipped.
 */
const url = process.env.RINGEE_FOLLOWUP_TEST_DATABASE_URL;

describe(
  "client idempotency keys on PostgreSQL (HOOK-008)",
  { skip: !url, timeout: FOLLOW_UP_SUITE_TIMEOUT_MS },
  () => {
    const prisma = new PrismaClient({ datasourceUrl: url });
    const db = prisma as never;
    const agentCalls = new AiVoiceAgentCallRepository(db);
    const calls = new CallRepository(db);

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

    /** What the fake provider does on the next dial(s). */
    const provider = {
      dials: [] as string[],
      latencyMs: 0,
      behavior: (() => "ok") as () => "ok" | "refuse" | "timeout" | "hang",
    };

    const service = (balance = 100) =>
      new VoiceAgentCallService(
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
            if (behavior === "hang") return new Promise<never>(() => {});
            return {
              providerCallId: `prov-${randomUUID()}`,
              callControlId: `cc-${randomUUID()}`,
              callSessionId: `sess-${randomUUID()}`,
            };
          },
        } as never,
        // A contact is a convenience for history, never a precondition.
        { findOrCreateByPhone: async () => null } as never,
        { findOnDNC: async () => null } as never,
        { getBalance: async () => balance } as never,
        {
          listOutboundCallerIds: async () => [
            { id: randomUUID(), phoneNumber: FROM },
          ],
        } as never,
        {
          getCachedUserById: async () => ({
            canCall: true,
            freeCallTrial: false,
          }),
        } as never,
      );

    const phone = () =>
      `+1202${Math.floor(Math.random() * 1e7)
        .toString()
        .padStart(7, "0")}`;

    const start = (
      svc: VoiceAgentCallService,
      key: string | undefined,
      to: string,
      options: {
        scope?: string;
        context?: OwnershipContext;
        agentId?: string;
        variables?: Record<string, string>;
      } = {},
    ) =>
      svc.startCallForClient(
        options.context ?? ctx,
        options.agentId ?? agent.id,
        { to, variables: options.variables },
        { scope: options.scope ?? "integration-a", idempotencyKey: key },
      );

    const rowsForKey = (scope: string, key: string) =>
      prisma.aiVoiceAgentCall.findMany({
        where: { idempotencyKey: clientIdempotencyKey(scope, key) },
      });

    before(async () => {
      assert.ok(["127.0.0.1", "localhost"].includes(new URL(url!).hostname));
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

    const reset = () => {
      provider.dials = [];
      provider.latencyMs = 0;
      provider.behavior = () => "ok";
    };

    it("places exactly one call when ten identical requests race", async () => {
      reset();
      provider.latencyMs = 40;
      const to = phone();
      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          start(service(), "race-10", to).then(
            (value) => ({ ok: true as const, value }),
            (error: unknown) => ({ ok: false as const, error }),
          ),
        ),
      );

      const failures = results.filter((r) => !r.ok);
      assert.deepEqual(failures, [], "no request may fail: all see one call");
      const answered = results.flatMap((r) => (r.ok ? [r.value] : []));
      assert.equal(new Set(answered.map((r) => r.id)).size, 1, "one call id");
      assert.equal(answered.filter((r) => !r.replayed).length, 1, "one winner");
      assert.equal(provider.dials.length, 1, "the provider dialed once");
      assert.equal((await rowsForKey("integration-a", "race-10")).length, 1);
      assert.equal(
        await prisma.call.count({ where: { userId, toNumber: to } }),
        1,
        "and only one telephony row exists",
      );
    });

    it("places one call per key when different operations run together", async () => {
      reset();
      provider.latencyMs = 20;
      const to = phone();
      const results = await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          start(service(), `distinct-${i}`, to),
        ),
      );
      assert.equal(new Set(results.map((r) => r.id)).size, 8);
      assert.ok(results.every((r) => !r.replayed));
      assert.equal(provider.dials.length, 8, "a new key is a new call");
    });

    it("keeps the same key of two integrations apart", async () => {
      reset();
      const to = phone();
      const [a, b] = await Promise.all([
        start(service(), "shared-key", to, { scope: "integration-a" }),
        start(service(), "shared-key", to, { scope: "integration-b" }),
      ]);
      assert.notEqual(a.id, b.id);
      assert.equal(provider.dials.length, 2);
    });

    it("never lets another workspace see or reuse a call through its key", async () => {
      reset();
      const to = phone();
      const mine = await start(service(), "tenant-key", to);
      // Even with a forged identical scope (which authentication never allows),
      // the row belongs to another workspace and is never answered with.
      await assert.rejects(
        start(service(), "tenant-key", to, {
          context: otherCtx,
          agentId: otherAgent.id,
        }),
        (error: unknown) =>
          error instanceof ConflictException &&
          !JSON.stringify((error as ConflictException).getResponse()).includes(
            mine.id,
          ),
      );
      assert.equal(provider.dials.length, 1);
    });

    it("never dials again after the provider timed out (the leg may be live)", async () => {
      reset();
      provider.behavior = () => "timeout";
      const to = phone();
      await assert.rejects(
        start(service(), "ambiguous-1", to),
        (error: unknown) =>
          error instanceof VoiceAgentCallStartError &&
          error.outcome ===
            VoiceAgentCallStartOutcome.placed_pending_reconciliation,
      );
      // The retry (an n8n Retry On Fail, say) must answer with the stuck call.
      provider.behavior = () => "ok";
      const retry = await start(service(), "ambiguous-1", to);
      assert.equal(retry.replayed, true);
      assert.equal(provider.dials.length, 1, "no second paid call");
    });

    it("never dials again when the provider accepted but the response was lost", async () => {
      reset();
      const to = phone();
      // The leg is placed; persisting its handle then fails (a database blip).
      const flaky = new AiVoiceAgentCallRepository(db);
      const update = flaky.update.bind(flaky);
      let failNext = true;
      flaky.update = ((id: string, data: Record<string, unknown>) => {
        if (failNext && data.status === "initiating") {
          failNext = false;
          return Promise.reject(new Error("connection lost"));
        }
        return update(id, data as never);
      }) as never;
      const svc = new VoiceAgentCallService(
        {
          require: async () => agent,
          assertReadyForCalls: () => {},
          ensureCallingApp: async () => {},
          ensureInsightGroup: async () => {},
          ensureToolEndpoints: async () => true,
        } as never,
        { require: () => ({ variables: [] }) } as never,
        flaky,
        calls,
        {
          startCall: async (i: { to: string }) => {
            provider.dials.push(i.to);
            return {
              providerCallId: "p",
              callControlId: `cc-${randomUUID()}`,
              callSessionId: "s",
            };
          },
        } as never,
        { findOrCreateByPhone: async () => null } as never,
        { findOnDNC: async () => null } as never,
        { getBalance: async () => 100 } as never,
        {
          listOutboundCallerIds: async () => [
            { id: randomUUID(), phoneNumber: FROM },
          ],
        } as never,
        {
          getCachedUserById: async () => ({
            canCall: true,
            freeCallTrial: false,
          }),
        } as never,
      );

      await assert.rejects(
        start(svc, "lost-response-1", to),
        (error: unknown) =>
          error instanceof VoiceAgentCallStartError &&
          error.outcome ===
            VoiceAgentCallStartOutcome.placed_pending_reconciliation,
      );
      const retry = await start(svc, "lost-response-1", to);
      assert.equal(retry.replayed, true);
      assert.equal(provider.dials.length, 1, "the retry placed nothing");
    });

    it("leaves a call that never reached the provider as an answered, undialed row", async () => {
      reset();
      provider.behavior = () => "hang";
      const to = phone();
      // A process that dies after reserving the key but before the provider
      // answers: the request never settles.
      void start(service(), "crash-1", to).catch(() => undefined);
      await new Promise((r) => setTimeout(r, 300));
      assert.equal(provider.dials.length, 1);

      provider.behavior = () => "ok";
      const retry = await start(service(), "crash-1", to);
      // It cannot know the dial did not happen, so it never dials: it hands
      // back the call exactly as stored, still `created`.
      assert.equal(retry.replayed, true);
      assert.equal(retry.status, "created");
      assert.equal(provider.dials.length, 1);
    });

    it("refuses a retry of an attempt the provider definitively refused, and a new key works", async () => {
      reset();
      provider.behavior = () => "refuse";
      const to = phone();
      await assert.rejects(start(service(), "refused-1", to));

      provider.behavior = () => "ok";
      await assert.rejects(
        start(service(), "refused-1", to),
        (error: unknown) => {
          assert.ok(error instanceof ConflictException);
          assert.equal(
            (error.getResponse() as Record<string, unknown>).code,
            "idempotency_key_failed",
          );
          return true;
        },
      );
      assert.equal(
        provider.dials.length,
        1,
        "the refused retry dialed nothing",
      );

      const fresh = await start(service(), "refused-1-attempt-2", to);
      assert.equal(fresh.replayed, false);
      assert.equal(provider.dials.length, 2);
    });

    it("refuses the same key for a different number or agent", async () => {
      reset();
      const to = phone();
      await start(service(), "mismatch-1", to);
      await assert.rejects(
        start(service(), "mismatch-1", phone()),
        UnprocessableEntityException,
      );
      assert.equal(provider.dials.length, 1);
    });

    it("answers the same call for the same key whatever the other variables are", async () => {
      // Documented behavior: the key names the operation, not its payload.
      reset();
      const to = phone();
      const first = await start(service(), "payload-1", to, {
        variables: {},
      });
      const again = await start(service(), "payload-1", to, { variables: {} });
      assert.equal(again.id, first.id);
      assert.equal(provider.dials.length, 1);
    });

    it("applies no key to a request without one: every request is a call", async () => {
      reset();
      const to = phone();
      await Promise.all([
        start(service(), undefined, to),
        start(service(), undefined, to),
      ]);
      assert.equal(provider.dials.length, 2);
    });
  },
);
