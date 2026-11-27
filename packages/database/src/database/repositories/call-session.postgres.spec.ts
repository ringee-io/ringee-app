import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import {
  CallSessionItemStatus,
  CallSessionStatus,
  PrismaClient,
} from "@prisma/client";
import { CallSessionRepository } from "./call-session.repository";

/**
 * `admitItem` on real PostgreSQL. A magic-link dial waits for outbound
 * capacity between its first read of the session and the admission, so the
 * admission reads the session again under its row lock: a pause or revoke
 * that committed in between stops the dial, and admitting never reopens a
 * session its owner just paused.
 *
 * Opt in with a disposable database; without it the suite is skipped.
 */
const url = process.env.RINGEE_AUTOMATION_TEST_DATABASE_URL;

describe("call session admission on PostgreSQL", { skip: !url }, () => {
  const prisma = new PrismaClient({ datasourceUrl: url });
  const repo = new CallSessionRepository(prisma as never);
  const userId = randomUUID();

  before(async () => {
    assert.ok(["127.0.0.1", "localhost"].includes(new URL(url!).hostname));
    await prisma.user.create({ data: { id: userId } });
  });
  after(async () => {
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  async function sessionWithItem(status: CallSessionStatus) {
    const session = await prisma.callSession.create({
      data: { userId, status },
    });
    const item = await prisma.callSessionItem.create({
      data: {
        callSessionId: session.id,
        phoneNumber: "+12025550123",
        positionIndex: 0,
      },
    });
    return { session, item };
  }

  it("opens a ready session as it admits the item", async () => {
    const { session, item } = await sessionWithItem(CallSessionStatus.ready);
    assert.equal(await repo.admitItem(session.id, item.id, null), "admitted");
    const stored = await prisma.callSession.findUniqueOrThrow({
      where: { id: session.id },
    });
    assert.equal(stored.status, CallSessionStatus.active);
    assert.ok(stored.startedAt);
  });

  it("refuses a session paused or closed since the caller read it, leaving the item pending", async () => {
    for (const [status, refusal] of [
      [CallSessionStatus.paused, "paused"],
      [CallSessionStatus.revoked, "closed"],
      [CallSessionStatus.completed, "closed"],
    ] as const) {
      const { session, item } = await sessionWithItem(CallSessionStatus.ready);
      // The owner acts while the dial waits for capacity.
      await prisma.callSession.update({
        where: { id: session.id },
        data: { status },
      });
      assert.equal(await repo.admitItem(session.id, item.id, null), refusal);
      const stored = await prisma.callSessionItem.findUniqueOrThrow({
        where: { id: item.id },
      });
      assert.equal(stored.status, CallSessionItemStatus.pending);
      assert.equal(stored.startedAt, null, "no allowance was used");
      const reread = await prisma.callSession.findUniqueOrThrow({
        where: { id: session.id },
      });
      assert.equal(reread.status, status, "the owner's change stands");
    }
  });

  it("lets a pause and an admission racing each other leave a consistent session", async () => {
    for (let round = 0; round < 10; round++) {
      const { session, item } = await sessionWithItem(CallSessionStatus.ready);
      const [admission] = await Promise.all([
        repo.admitItem(session.id, item.id, null),
        prisma.callSession.update({
          where: { id: session.id },
          data: { status: CallSessionStatus.paused },
        }),
      ]);
      const stored = await prisma.callSession.findUniqueOrThrow({
        where: { id: session.id },
      });
      const storedItem = await prisma.callSessionItem.findUniqueOrThrow({
        where: { id: item.id },
      });
      // Whichever committed second, the owner's pause is what remains.
      assert.equal(stored.status, CallSessionStatus.paused);
      assert.equal(
        storedItem.status,
        admission === "admitted"
          ? CallSessionItemStatus.calling
          : CallSessionItemStatus.pending,
      );
    }
  });
});
