import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { PrismaClient } from "@prisma/client";
import { CreditRepository } from "./credit.repository";

const url = process.env.RINGEE_AUTOMATION_TEST_DATABASE_URL;

describe("credit admission reservations on PostgreSQL", { skip: !url }, () => {
  const prisma = new PrismaClient({ datasourceUrl: url });
  const repo = new CreditRepository(prisma as never);
  const userId = randomUUID();
  const organizationId = randomUUID();
  const ctx = { userId, organizationId };
  const personal = { userId, organizationId: null };
  const expires = () => new Date(Date.now() + 60_000);
  const part = (key = randomUUID(), amount = 0.1) => ({
    idempotencyKey: key,
    amount,
  });

  before(async () => {
    assert.ok(["127.0.0.1", "localhost"].includes(new URL(url!).hostname));
    await prisma.user.create({ data: { id: userId } });
    await prisma.organization.create({
      data: {
        id: organizationId,
        clerkId: organizationId,
        name: "Disposable reservation test",
      },
    });
    await prisma.credit.createMany({
      data: [
        { userId, amount: 1 },
        { organizationId, amount: 1 },
      ],
    });
  });
  after(async () => {
    await prisma.creditDebit.deleteMany({ where: { userId } });
    await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  async function reset() {
    await prisma.creditReservation.deleteMany({
      where: { credit: { OR: [{ userId }, { organizationId }] } },
    });
    await prisma.credit.updateMany({
      where: { OR: [{ userId }, { organizationId }] },
      data: { amount: 1 },
    });
  }

  it("100 concurrent admissions cannot reserve more than the available dollar", async () => {
    await reset();
    const results = await Promise.all(
      Array.from({ length: 100 }, () =>
        repo.reserveOnce(ctx, [part()], expires()),
      ),
    );
    assert.equal(results.filter(Boolean).length, 10);
    assert.equal(await repo.getBalance(ctx), 1, "a hold is not a debit");
    const held = await prisma.creditReservation.aggregate({
      where: { credit: { organizationId }, state: "held" },
      _sum: { amount: true },
    });
    assert.ok(Math.abs(held._sum.amount! - 1) < 1e-6);
  });

  it("duplicate admission keys create one hold across replicas", async () => {
    await reset();
    const hold = part();
    const results = await Promise.all(
      Array.from({ length: 25 }, () =>
        new CreditRepository(prisma as never).reserveOnce(
          ctx,
          [hold],
          expires(),
        ),
      ),
    );
    assert.ok(results.every(Boolean));
    assert.equal(
      await prisma.creditReservation.count({
        where: { idempotencyKey: hold.idempotencyKey },
      }),
      1,
    );
    assert.equal(await repo.reserveOnce(personal, [hold], expires()), false);
    assert.equal(
      await repo.reserveOnce(ctx, [{ ...hold, amount: 0.2 }], expires()),
      false,
    );
  });

  it("reserves both billing parts together or neither", async () => {
    await reset();
    const parts = [part(randomUUID(), 0.6), part(randomUUID(), 0.6)];
    assert.equal(await repo.reserveOnce(ctx, parts, expires()), false);
    assert.equal(
      await prisma.creditReservation.count({
        where: { idempotencyKey: { in: parts.map((p) => p.idempotencyKey) } },
      }),
      0,
    );
  });

  it("a real debit replaces its hold exactly once and leaves the other part reserved", async () => {
    await reset();
    const voice = part(randomUUID(), 0.2);
    const ai = part(randomUUID(), 0.3);
    assert.equal(await repo.reserveOnce(ctx, [voice, ai], expires()), true);
    const outcomes = await Promise.all(
      Array.from({ length: 20 }, () =>
        repo.consumeOnce(ctx, 0.12, {
          idempotencyKey: voice.idempotencyKey,
          source: "test",
        }),
      ),
    );
    assert.equal(outcomes.filter((o) => o.debited).length, 1);
    assert.ok(Math.abs((await repo.getBalance(ctx)) - 0.88) < 1e-6);
    assert.equal(
      (
        await prisma.creditReservation.findUniqueOrThrow({
          where: { idempotencyKey: voice.idempotencyKey },
        })
      ).state,
      "settled",
    );
    assert.equal(
      (
        await prisma.creditReservation.findUniqueOrThrow({
          where: { idempotencyKey: ai.idempotencyKey },
        })
      ).state,
      "held",
    );
    assert.equal(
      await repo.reserveOnce(ctx, [voice], expires()),
      false,
      "settlement cannot be re-admitted",
    );
  });

  it("release is workspace checked and a proven unsent retry can reserve again", async () => {
    await reset();
    const hold = part(randomUUID(), 1);
    assert.equal(await repo.reserveOnce(ctx, [hold], expires()), true);
    await repo.releaseReservations(personal, [hold.idempotencyKey]);
    assert.equal(await repo.reserveOnce(ctx, [part()], expires()), false);
    await repo.releaseReservations(ctx, [hold.idempotencyKey]);
    assert.equal(await repo.reserveOnce(ctx, [hold], expires()), true);
    assert.equal(await repo.getBalance(ctx), 1);
  });

  it("expired holds stop blocking funds but cannot restart their original operation", async () => {
    await reset();
    const hold = part(randomUUID(), 1);
    assert.equal(await repo.reserveOnce(ctx, [hold], expires()), true);
    await prisma.creditReservation.update({
      where: { idempotencyKey: hold.idempotencyKey },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    assert.equal(await repo.reserveOnce(ctx, [hold], expires()), false);
    assert.equal(
      await repo.reserveOnce(ctx, [part(randomUUID(), 1)], expires()),
      true,
    );
    assert.equal(
      await repo.reserveOnce(personal, [part(randomUUID(), 1)], expires()),
      true,
    );
  });
});
