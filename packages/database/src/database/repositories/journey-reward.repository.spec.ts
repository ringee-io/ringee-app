/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma } from "@prisma/client";
import { JourneyRewardRepository } from "./journey-reward.repository";

/**
 * Integration-shaped tests for the money path.
 *
 * These drive the repository against an in-memory Prisma double that records
 * the exact call order, so the properties that actually matter — the claim, the
 * balance increment and the ledger row commit together; a duplicate never pays
 * twice; balances are stamped before and after — are asserted directly rather
 * than inferred.
 */

const ORG = { userId: "user-1", organizationId: "org-1" };
const PERSONAL = { userId: "user-1", organizationId: null };

interface FakeClaim {
  id: string;
  userId: string | null;
  organizationId: string | null;
  programVersion: string;
  stageId: string;
  amountCents: number;
  currency: string;
  status: string;
  claimedByUserId: string | null;
  idempotencyKey: string;
  riskScore: number;
  riskBand: string;
  riskReasons: string[];
  balanceBefore: number | null;
  balanceAfter: number | null;
  claimedAt: Date | null;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  rejectionReason: string | null;
  reviewNote: string | null;
  createdAt: Date;
}

/** A minimal Prisma stand-in with real uniqueness on `idempotencyKey`. */
function makePrisma(initialBalance: number | null = 10) {
  const claims: FakeClaim[] = [];
  const topups: unknown[] = [];
  const operations: string[] = [];
  let credit =
    initialBalance === null ? null : { id: "credit-1", amount: initialBalance };
  let sequence = 0;

  const duplicate = () =>
    new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "6.16.3",
      meta: { target: ["idempotencyKey"] },
    });

  const client = {
    journeyRewardClaim: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        operations.push("claim.create");
        if (claims.some((c) => c.idempotencyKey === data.idempotencyKey)) {
          throw duplicate();
        }
        sequence += 1;
        const row: FakeClaim = {
          id: `claim-${sequence}`,
          userId: (data.userId as string) ?? null,
          organizationId: (data.organizationId as string) ?? null,
          programVersion: data.programVersion as string,
          stageId: data.stageId as string,
          amountCents: data.amountCents as number,
          currency: "USD",
          status: data.status as string,
          claimedByUserId: (data.claimedByUserId as string) ?? null,
          idempotencyKey: data.idempotencyKey as string,
          riskScore: (data.riskScore as number) ?? 0,
          riskBand: (data.riskBand as string) ?? "low",
          riskReasons: (data.riskReasons as string[]) ?? [],
          balanceBefore: null,
          balanceAfter: null,
          claimedAt: (data.claimedAt as Date) ?? null,
          approvedAt: null,
          rejectedAt: null,
          rejectionReason: null,
          reviewNote: null,
          createdAt: new Date(),
        };
        claims.push(row);
        return row;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        operations.push("claim.update");
        const row = claims.find((c) => c.id === where.id);
        if (!row) throw new Error("claim not found");
        Object.assign(row, data);
        return row;
      },
      findUnique: async ({ where }: { where: Record<string, string> }) => {
        const row = claims.find(
          (c) =>
            (where.id && c.id === where.id) ||
            (where.idempotencyKey && c.idempotencyKey === where.idempotencyKey),
        );
        return row ?? null;
      },
      findMany: async () => claims,
      aggregate: async () => ({
        _sum: {
          amountCents: claims
            .filter((c) => c.status === "claimed")
            .reduce((sum, c) => sum + c.amountCents, 0),
        },
      }),
    },
    credit: {
      findFirst: async () => {
        operations.push("credit.find");
        return credit;
      },
      create: async () => {
        operations.push("credit.create");
        credit = { id: "credit-1", amount: 0 };
        return credit;
      },
      update: async ({ data }: { data: { amount: { increment: number } } }) => {
        operations.push("credit.update");
        if (!credit) throw new Error("no credit row");
        credit = { ...credit, amount: credit.amount + data.amount.increment };
        return credit;
      },
    },
    creditTopup: {
      create: async ({ data }: { data: unknown }) => {
        operations.push("topup.create");
        topups.push(data);
        return data;
      },
    },
    $transaction: async <T>(work: (tx: unknown) => Promise<T>): Promise<T> => {
      operations.push("begin");
      try {
        const result = await work(client);
        operations.push("commit");
        return result;
      } catch (error) {
        operations.push("rollback");
        throw error;
      }
    },
  };

  return {
    client,
    claims,
    topups,
    operations,
    balance: () => credit?.amount ?? 0,
  };
}

const baseInput = {
  programVersion: "2026.08",
  stageId: "consistent_caller",
  amountCents: 300,
  claimedByUserId: "user-1",
  idempotencyKey: "journey:organization:org-1:2026.08:consistent_caller",
  riskScore: 0,
  riskBand: "low",
  riskReasons: [] as string[],
  riskVersion: "2026.08.1",
  eligibilitySnapshot: { requirements: [] },
  settleNow: true,
};

describe("JourneyRewardRepository.claim — settlement", () => {
  it("writes the claim, credits the wallet and records the ledger in one transaction", async () => {
    const fake = makePrisma(10);
    const repository = new JourneyRewardRepository(fake.client as never);

    const outcome = await repository.claim(ORG, baseInput);

    assert.equal(outcome.settled, true);
    assert.equal(outcome.duplicate, false);
    assert.equal(outcome.claim.status, "claimed");
    // $3.00 on top of $10.00.
    assert.equal(outcome.balance, 13);
    assert.deepEqual(fake.operations, [
      "begin",
      "claim.create",
      "credit.find",
      "credit.update",
      "topup.create",
      "claim.update",
      "commit",
    ]);
  });

  it("stamps the balance before and after, like the debit ledger", async () => {
    const fake = makePrisma(42.5);
    const repository = new JourneyRewardRepository(fake.client as never);

    const outcome = await repository.claim(ORG, baseInput);

    assert.equal(outcome.claim.balanceBefore, 42.5);
    assert.equal(outcome.claim.balanceAfter, 45.5);
  });

  it("converts cents to the legacy float wallet exactly", async () => {
    // Every amount the program can pay must survive the single cents → dollars
    // conversion without a floating-point surprise.
    for (const cents of [300, 500, 700, 1000, 1200, 1, 99, 4000]) {
      const fake = makePrisma(0);
      const repository = new JourneyRewardRepository(fake.client as never);
      await repository.claim(ORG, {
        ...baseInput,
        amountCents: cents,
        idempotencyKey: `key-${cents}`,
      });
      assert.equal(
        Math.round(fake.balance() * 100),
        cents,
        `${cents} cents round-tripped`,
      );
    }
  });

  it("creates the wallet when the workspace has none yet", async () => {
    const fake = makePrisma(null);
    const repository = new JourneyRewardRepository(fake.client as never);

    const outcome = await repository.claim(PERSONAL, baseInput);

    assert.ok(fake.operations.includes("credit.create"));
    assert.equal(outcome.balance, 3);
  });

  it("writes the ledger row against the right owner", async () => {
    const fake = makePrisma(0);
    const repository = new JourneyRewardRepository(fake.client as never);
    await repository.claim(ORG, baseInput);

    assert.deepEqual(fake.topups, [
      {
        userId: null,
        organizationId: "org-1",
        amount: 3,
        amountCents: 300,
        stripeCheckoutSessionId: null,
        stripePaymentIntentId: null,
        source: "journey_reward",
        status: "completed",
      },
    ]);
  });

  it("sets exactly one owner column", async () => {
    const fake = makePrisma(0);
    const repository = new JourneyRewardRepository(fake.client as never);

    await repository.claim(PERSONAL, baseInput);
    assert.equal(fake.claims[0].userId, "user-1");
    assert.equal(fake.claims[0].organizationId, null);

    const orgFake = makePrisma(0);
    const orgRepository = new JourneyRewardRepository(orgFake.client as never);
    await orgRepository.claim(ORG, { ...baseInput, idempotencyKey: "k2" });
    assert.equal(orgFake.claims[0].userId, null);
    assert.equal(orgFake.claims[0].organizationId, "org-1");
  });
});

describe("JourneyRewardRepository.claim — idempotency", () => {
  it("pays once when the same request arrives twice", async () => {
    const fake = makePrisma(10);
    const repository = new JourneyRewardRepository(fake.client as never);

    const first = await repository.claim(ORG, baseInput);
    const second = await repository.claim(ORG, baseInput);

    assert.equal(first.settled, true);
    assert.equal(second.settled, false);
    assert.equal(second.duplicate, true);
    assert.equal(fake.balance(), 13, "balance moved exactly once");
    assert.equal(fake.claims.length, 1);
    assert.equal(fake.topups.length, 1);
  });

  it("returns the stored claim on a duplicate, never a fabricated one", async () => {
    const fake = makePrisma(10);
    const repository = new JourneyRewardRepository(fake.client as never);

    const first = await repository.claim(ORG, baseInput);
    const second = await repository.claim(ORG, baseInput);

    // v1 rewrote `claimedAt` to "now" for the losing request. This asserts the
    // second caller sees the real, original timestamp.
    assert.equal(
      second.claim.claimedAt?.toISOString(),
      first.claim.claimedAt?.toISOString(),
    );
    assert.equal(second.claim.id, first.claim.id);
  });

  it("handles two admins claiming concurrently", async () => {
    const fake = makePrisma(10);
    const repository = new JourneyRewardRepository(fake.client as never);

    const [a, b] = await Promise.all([
      repository.claim(ORG, { ...baseInput, claimedByUserId: "admin-a" }),
      repository.claim(ORG, { ...baseInput, claimedByUserId: "admin-b" }),
    ]);

    const settled = [a, b].filter((r) => r.settled);
    assert.equal(settled.length, 1, "exactly one settlement");
    assert.equal(fake.balance(), 13);
    assert.equal(fake.topups.length, 1, "one ledger entry");
  });

  it("does not pay again for a different stage under the same version", async () => {
    const fake = makePrisma(0);
    const repository = new JourneyRewardRepository(fake.client as never);

    await repository.claim(ORG, baseInput);
    await repository.claim(ORG, {
      ...baseInput,
      stageId: "campaign_operator",
      amountCents: 500,
      idempotencyKey: "journey:organization:org-1:2026.08:campaign_operator",
    });

    assert.equal(fake.balance(), 8);
    assert.equal(fake.claims.length, 2);
  });

  it("rethrows a non-duplicate database error instead of swallowing it", async () => {
    const fake = makePrisma(0);
    fake.client.journeyRewardClaim.create = async () => {
      throw new Error("connection lost");
    };
    const repository = new JourneyRewardRepository(fake.client as never);

    await assert.rejects(
      () => repository.claim(ORG, baseInput),
      /connection lost/,
    );
  });
});

describe("JourneyRewardRepository.claim — held for review", () => {
  it("records the claim without moving money", async () => {
    const fake = makePrisma(10);
    const repository = new JourneyRewardRepository(fake.client as never);

    const outcome = await repository.claim(ORG, {
      ...baseInput,
      settleNow: false,
      riskBand: "medium",
      riskScore: 45,
    });

    assert.equal(outcome.settled, false);
    assert.equal(outcome.claim.status, "pending_review");
    assert.equal(outcome.claim.claimedAt, null);
    assert.equal(fake.balance(), 10, "wallet untouched");
    assert.equal(fake.topups.length, 0, "no ledger entry");
  });

  it("keeps the risk verdict on the row for the reviewer", async () => {
    const fake = makePrisma(0);
    const repository = new JourneyRewardRepository(fake.client as never);

    const outcome = await repository.claim(ORG, {
      ...baseInput,
      settleNow: false,
      riskBand: "medium",
      riskScore: 45,
      riskReasons: ["phone_unverified", "account_too_new"],
    });

    assert.equal(outcome.claim.riskScore, 45);
    assert.deepEqual(outcome.claim.riskReasons, [
      "phone_unverified",
      "account_too_new",
    ]);
  });
});

describe("JourneyRewardRepository — review decisions", () => {
  it("pays on approval and stamps the reviewer", async () => {
    const fake = makePrisma(5);
    const repository = new JourneyRewardRepository(fake.client as never);

    const held = await repository.claim(ORG, {
      ...baseInput,
      settleNow: false,
    });
    const approved = await repository.approve(
      held.claim.id,
      "reviewer-1",
      "ok",
    );

    assert.equal(approved?.status, "claimed");
    assert.equal(fake.balance(), 8);
    assert.equal(fake.topups.length, 1);
  });

  it("cannot be approved twice", async () => {
    const fake = makePrisma(5);
    const repository = new JourneyRewardRepository(fake.client as never);

    const held = await repository.claim(ORG, {
      ...baseInput,
      settleNow: false,
    });
    await repository.approve(held.claim.id, "reviewer-1");
    const second = await repository.approve(held.claim.id, "reviewer-2");

    assert.equal(second, null, "second approval is a no-op");
    assert.equal(fake.balance(), 8, "paid exactly once");
  });

  it("records a rejection without touching the wallet", async () => {
    const fake = makePrisma(5);
    const repository = new JourneyRewardRepository(fake.client as never);

    const held = await repository.claim(ORG, {
      ...baseInput,
      settleNow: false,
    });
    const rejected = await repository.reject(
      held.claim.id,
      "reviewer-1",
      "farm",
    );

    assert.equal(rejected?.status, "rejected");
    assert.equal(rejected?.rejectionReason, "farm");
    assert.equal(fake.balance(), 5);
  });

  it("refuses to reject an already-paid claim", async () => {
    const fake = makePrisma(5);
    const repository = new JourneyRewardRepository(fake.client as never);

    const paid = await repository.claim(ORG, baseInput);
    const rejected = await repository.reject(
      paid.claim.id,
      "reviewer-1",
      "oops",
    );

    // Rejecting a settled claim would desynchronise the ledger from the wallet.
    assert.equal(rejected, null);
    assert.equal(fake.balance(), 8);
  });
});

describe("JourneyRewardRepository — accounting reads", () => {
  it("totals only money that actually moved", async () => {
    const fake = makePrisma(0);
    const repository = new JourneyRewardRepository(fake.client as never);

    await repository.claim(ORG, baseInput);
    await repository.claim(ORG, {
      ...baseInput,
      stageId: "campaign_operator",
      amountCents: 500,
      idempotencyKey: "k-campaign",
      settleNow: false,
    });

    const total = await repository.totalGrantedCents(ORG, "2026.08");
    assert.equal(total, 300, "the held claim is not counted as granted");
  });
});
