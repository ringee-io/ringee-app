/// <reference types="node" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CallRepository } from "./call.repository";
import { ContactListRepository } from "./contact-list.repository";
import { DashboardRepository } from "./dashboard.repository";
import { InboxThreadRepository } from "./inbox-thread.repository";
import { PendingActionRepository } from "./pending-action.repository";

const now = new Date("2026-10-10T15:00:00Z");
const earlier = new Date("2026-10-10T09:00:00Z");
const owner = { userId: "me", organizationId: null };

describe("My Day persistence regressions", () => {
  it("requires a real carrier leg for outbound completion, within the workspace", async () => {
    const queries: any[] = [];
    const repo = new CallRepository({
      call: {
        groupBy: async (q: unknown) => {
          queries.push(q);
          return [
            {
              toNumber: "+14155550100",
              userId: "me",
              _max: { createdAt: now },
            },
          ];
        },
      },
    } as never);
    assert.deepEqual(
      await repo.latestOutboundTo(owner, ["+14155550100"], earlier),
      [{ toNumber: "+14155550100", userId: "me", at: now }],
    );
    await repo.latestOutboundTo(
      { userId: "me", organizationId: "org" },
      ["+14155550100"],
      earlier,
    );
    assert.deepEqual(queries[0].where.callControlId, { not: null });
    assert.equal(queries[0].where.userId, "me");
    assert.equal(queries[0].where.organizationId, null);
    assert.equal(queries[1].where.organizationId, "org");
    assert.equal(queries[1].where.userId, undefined);
    assert.equal(queries[0].where.direction, "outbound");
    assert.deepEqual(queries[0].where.createdAt, { gte: earlier });
  });

  it("checks list emptiness in the delete, including when the last read was stale", async () => {
    let query: any;
    const repo = new ContactListRepository({
      contactList: {
        deleteMany: async (q: unknown) => {
          query = q;
          return { count: 0 };
        },
      },
    } as never);
    await repo.delete("saved", true);
    assert.deepEqual(query.where, { id: "saved", entries: { none: {} } });
    await repo.delete("intentional-delete");
    assert.deepEqual(query.where, { id: "intentional-delete" });
  });

  it("reads the missed event after a note, using its original time for return calls", async () => {
    const queries: any[] = [];
    const repo = new InboxThreadRepository({
      inboxThread: {
        findMany: async (q: any) => {
          queries.push(q);
          // This thread's preview is now a note. Filtering on that preview would
          // drop it, even though its historical missed event remains outstanding.
          if (q.where.lastEventKind) return [];
          return [
            {
              id: "thread",
              participantNumber: "+14155550100",
              participantNumberE164: "+14155550100",
              contact: null,
              events: [{ occurredAt: earlier, kind: "missed_call" }],
            },
          ];
        },
      },
    } as never);
    const threads = await repo.listMissedCallThreads(owner, {
      since: earlier,
      limit: 50,
    });
    assert.equal(threads.length, 1);
    assert.equal(threads[0].lastEventAt, earlier);
    assert.equal(threads[0].lastEventKind, "missed_call");
    assert.deepEqual(queries[0].where.events.some.occurredAt, { gte: earlier });
    assert.equal(queries[0].where.organizationId, null);
    await repo.listMissedCallThreads(
      { userId: "me", organizationId: "org" },
      { since: earlier, limit: 50 },
    );
    assert.equal(queries[1].where.organizationId, "org");
    assert.deepEqual(queries[1].where.OR, [
      { assignedToId: "me" },
      { assignedToId: null, userId: "me" },
    ]);
  });

  it("finds a future or ongoing meeting beyond ten ended meetings", async () => {
    const ended = Array.from({ length: 10 }, (_, i) => ({
      id: `ended-${i}`,
      scheduledAt: earlier,
      duration: 30,
    }));
    const future = {
      id: "future",
      scheduledAt: new Date("2026-10-10T16:00:00Z"),
      duration: 30,
    };
    let meetings = [...ended, future];
    const repo = new DashboardRepository({
      call: { count: async () => 0 },
      meeting: {
        count: async () => 0,
        findMany: async (q: any) => {
          assert.equal(q.where.userId, owner.userId);
          assert.equal(q.where.organizationId, null);
          return q.take ? meetings.slice(0, q.take) : meetings;
        },
      },
    } as never);
    const range = { start: earlier, end: new Date("2026-10-10T23:59:59Z") };
    assert.equal(
      (await repo.getMyDaySummary(owner, range, now)).nextMeeting?.id,
      "future",
    );
    meetings = [
      ...ended,
      {
        id: "ongoing",
        scheduledAt: new Date("2026-10-10T14:45:00Z"),
        duration: 30,
      },
      future,
    ];
    assert.equal(
      (await repo.getMyDaySummary(owner, range, now)).nextMeeting?.id,
      "ongoing",
    );
    meetings = ended;
    assert.equal(
      (await repo.getMyDaySummary(owner, range, now)).nextMeeting,
      null,
    );
  });

  it("pages follow-ups with a deterministic cursor and preserves ownership", async () => {
    let query: any;
    const repo = new PendingActionRepository({
      pendingAction: {
        findMany: async (q: unknown) => {
          query = q;
          return [];
        },
      },
    } as never);
    await repo.listOpenForCalling(owner, {
      types: ["book_meeting"],
      dueBy: now,
      now,
      limit: 100,
      after: "action-100",
    });
    assert.deepEqual(query.cursor, { id: "action-100" });
    assert.equal(query.skip, 1);
    assert.deepEqual(query.where.AND[0], owner);
    assert.deepEqual(query.orderBy, [
      { dueAt: "asc" },
      { createdAt: "asc" },
      { id: "asc" },
    ]);
  });
});
