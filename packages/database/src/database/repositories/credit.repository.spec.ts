/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma } from "@prisma/client";
import { CreditRepository } from "./credit.repository";

describe("CreditRepository.updateBalance", () => {
  it("uses an atomic increment for every debit", async () => {
    const updates: unknown[] = [];
    const prisma = {
      credit: {
        findFirst: async () => ({ id: "credit-1", amount: 100 }),
        update: async (input: unknown) => {
          updates.push(input);
          return { id: "credit-1", amount: 99.75 };
        },
      },
    };
    const repository = new CreditRepository(prisma as never);

    await repository.updateBalance(
      { userId: "00000000-0000-0000-0000-000000000001" },
      -0.25,
    );

    assert.deepEqual(updates, [
      {
        where: { id: "credit-1" },
        data: { amount: { increment: -0.25 } },
      },
    ]);
  });
});

describe("CreditRepository.consumeOnce", () => {
  it("records the key and decrements the balance in one transaction", async () => {
    const operations: string[] = [];
    const ledgerWrites: unknown[] = [];
    const tx = {
      creditDebit: {
        create: async (input: unknown) => {
          operations.push("ledger");
          ledgerWrites.push(input);
        },
      },
      credit: {
        findFirst: async () => {
          operations.push("find-credit");
          return { id: "credit-1", amount: 100 };
        },
        update: async () => {
          operations.push("debit");
          return { id: "credit-1", amount: 99.75 };
        },
      },
    };
    const prisma = {
      $transaction: async (work: (client: typeof tx) => Promise<unknown>) => {
        operations.push("begin");
        const result = await work(tx);
        operations.push("commit");
        return result;
      },
    };
    const repository = new CreditRepository(prisma as never);

    const result = await repository.consumeOnce(
      { userId: "00000000-0000-0000-0000-000000000001" },
      0.25,
      { idempotencyKey: "call-cost:call-1", source: "telnyx.call.cost" },
    );

    assert.equal(result.debited, true);
    assert.equal(result.credit.amount, 99.75);
    assert.deepEqual(operations, [
      "begin",
      "find-credit",
      "debit",
      "ledger",
      "commit",
    ]);
    assert.deepEqual(ledgerWrites, [
      {
        data: {
          userId: "00000000-0000-0000-0000-000000000001",
          organizationId: null,
          amount: 0.25,
          balanceBefore: 100,
          balanceAfter: 99.75,
          idempotencyKey: "call-cost:call-1",
          source: "telnyx.call.cost",
        },
      },
    ]);
  });

  it("returns the current balance without decrementing on a duplicate key", async () => {
    const updates: unknown[] = [];
    const duplicate = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed",
      {
        code: "P2002",
        clientVersion: "6.16.3",
        meta: { target: ["idempotencyKey"] },
      },
    );
    const prisma = {
      $transaction: async () => {
        throw duplicate;
      },
      credit: {
        findFirst: async () => ({ id: "credit-1", amount: 99.75 }),
        update: async (input: unknown) => {
          updates.push(input);
          return { id: "credit-1", amount: 99.5 };
        },
      },
    };
    const repository = new CreditRepository(prisma as never);

    const result = await repository.consumeOnce(
      { userId: "00000000-0000-0000-0000-000000000001" },
      0.25,
      { idempotencyKey: "call-cost:call-1", source: "telnyx.call.cost" },
    );

    assert.equal(result.debited, false);
    assert.equal(result.credit.amount, 99.75);
    assert.deepEqual(updates, []);
  });
});

describe("CreditRepository.topupOnce", () => {
  it("records the top-up and credits the balance in one transaction", async () => {
    const operations: string[] = [];
    const ledgerWrites: unknown[] = [];
    const tx = {
      creditTopup: {
        create: async (input: unknown) => {
          operations.push("ledger");
          ledgerWrites.push(input);
        },
      },
      credit: {
        findFirst: async () => {
          operations.push("find-credit");
          return { id: "credit-1", amount: 10 };
        },
        update: async () => {
          operations.push("credit");
          return { id: "credit-1", amount: 35 };
        },
      },
    };
    const prisma = {
      $transaction: async (work: (client: typeof tx) => Promise<unknown>) => {
        operations.push("begin");
        const result = await work(tx);
        operations.push("commit");
        return result;
      },
    };
    const repository = new CreditRepository(prisma as never);

    const result = await repository.topupOnce(
      { userId: "00000000-0000-0000-0000-000000000001" },
      25,
      {
        stripeCheckoutSessionId: "cs_test_1",
        stripePaymentIntentId: "pi_test_1",
        source: "stripe.checkout",
      },
    );

    assert.equal(result.credited, true);
    assert.equal(result.credit.amount, 35);
    // The ledger row is written inside the same transaction as the balance
    // move, and before it, so a replay aborts before any money moves.
    assert.deepEqual(operations, [
      "begin",
      "find-credit",
      "ledger",
      "credit",
      "commit",
    ]);
    assert.deepEqual(ledgerWrites, [
      {
        data: {
          userId: "00000000-0000-0000-0000-000000000001",
          organizationId: null,
          amount: 25,
          amountCents: 2500,
          stripeCheckoutSessionId: "cs_test_1",
          stripePaymentIntentId: "pi_test_1",
          source: "stripe.checkout",
          status: "completed",
        },
      },
    ]);
  });

  it("leaves the balance untouched when Stripe replays the event", async () => {
    const updates: unknown[] = [];
    const duplicate = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed",
      {
        code: "P2002",
        clientVersion: "6.16.3",
        meta: { target: ["stripeCheckoutSessionId"] },
      },
    );
    const prisma = {
      $transaction: async () => {
        throw duplicate;
      },
      credit: {
        findFirst: async () => ({ id: "credit-1", amount: 35 }),
        update: async (input: unknown) => {
          updates.push(input);
          return { id: "credit-1", amount: 60 };
        },
      },
    };
    const repository = new CreditRepository(prisma as never);

    const result = await repository.topupOnce(
      { userId: "00000000-0000-0000-0000-000000000001" },
      25,
      {
        stripeCheckoutSessionId: "cs_test_1",
        stripePaymentIntentId: "pi_test_1",
        source: "stripe.checkout",
      },
    );

    assert.equal(result.credited, false);
    assert.equal(result.credit.amount, 35);
    assert.deepEqual(updates, []);
  });

  it("rethrows a unique-constraint failure that is not the top-up key", async () => {
    // Two requests racing to create the same workspace's Credit row also raise
    // P2002. Swallowing it as "already credited" would drop a real payment.
    const unrelated = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed",
      {
        code: "P2002",
        clientVersion: "6.16.3",
        meta: { target: ["userId"] },
      },
    );
    const prisma = {
      $transaction: async () => {
        throw unrelated;
      },
      credit: {
        findFirst: async () => ({ id: "credit-1", amount: 35 }),
      },
    };
    const repository = new CreditRepository(prisma as never);

    await assert.rejects(
      repository.topupOnce(
        { userId: "00000000-0000-0000-0000-000000000001" },
        25,
        {
          stripeCheckoutSessionId: "cs_test_1",
          stripePaymentIntentId: null,
          source: null,
        },
      ),
      unrelated,
    );
  });
});
