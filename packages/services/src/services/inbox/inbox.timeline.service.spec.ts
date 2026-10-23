/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InboxEventKind, InboxThreadStatus } from "@ringee/database";
import { InboxTimelineService } from "./inbox.timeline.service";

type Row = Record<string, any>;

const STARTED_AT = new Date("2026-10-09T15:00:00.000Z");
const ENDED_AT = new Date("2026-10-09T15:00:24.000Z");

/** An inbound call that rang for 24 seconds and nobody took. */
const MISSED = {
  id: "call-1",
  direction: "inbound",
  userId: "member-1",
  organizationId: "org-1",
  contactId: "contact-1",
  fromNumber: "+13055550123",
  toNumber: "+14155550100",
  createdAt: STARTED_AT,
  startedAt: STARTED_AT,
  endedAt: ENDED_AT,
  durationSeconds: 24,
  answeredAt: null,
  answeredByUserId: null,
  outcome: null,
  outcomeNote: null,
};

function build(
  over: {
    thread?: Row;
    existing?: boolean;
    /** Who last called the caller's number, or the lookup's failure. */
    lastCaller?: string | null | Error;
  } = {},
) {
  const thread = {
    id: "thread-1",
    organizationId: "org-1",
    userId: "member-1",
    assignedToId: null,
    status: InboxThreadStatus.open,
    contactId: "contact-1",
    ...over.thread,
  };
  const created: Row[] = [];
  const updates: Row[] = [];
  const notified: Array<{ callId: string; threadId: string }> = [];
  const lookups: Array<{ ctx: Row; toNumbers: string[]; before: Date }> = [];

  const service = new InboxTimelineService(
    {
      findOrCreate: async () => thread,
      update: async (id: string, data: Row) => {
        updates.push({ id, ...data });
        return { ...thread, ...data };
      },
    } as never,
    {
      existsForCallEvent: async () => over.existing === true,
      create: async (data: Row) => {
        created.push(data);
        return {
          id: `event-${created.length}`,
          kind: data.kind,
          threadId: data.thread.connect.id,
        };
      },
    } as never,
    { findByPhone: async () => null } as never,
    { findOne: async () => null } as never,
    {} as never,
    {
      latestOutboundCallerTo: async (
        ctx: Row,
        toNumbers: string[],
        before: Date,
      ) => {
        lookups.push({ ctx, toNumbers, before });
        if (over.lastCaller instanceof Error) throw over.lastCaller;
        return over.lastCaller ?? null;
      },
    } as never,
    {
      notify: async (call: Row, threadId: string) => {
        notified.push({ callId: call.id, threadId });
      },
    } as never,
  );
  return { service, created, updates, notified, lookups };
}

describe("InboxTimelineService.recordEndedCall", () => {
  it("files an inbound call that rang unanswered as missed, and announces it", async () => {
    const { service, created, notified } = build();
    const event = await service.recordEndedCall(MISSED as never);

    assert.equal(event?.kind, InboxEventKind.missed_call);
    assert.equal(created[0].kind, InboxEventKind.missed_call);
    assert.deepEqual(notified, [{ callId: "call-1", threadId: "thread-1" }]);
  });

  it("files an answered call as completed, and announces nothing", async () => {
    const { service, created, notified } = build();
    await service.recordEndedCall({
      ...MISSED,
      answeredAt: new Date("2026-10-09T15:00:05.000Z"),
    } as never);

    assert.equal(created[0].kind, InboxEventKind.call_completed);
    assert.deepEqual(notified, []);
  });

  it("files an outbound call nobody answered as completed, never as missed", async () => {
    const { service, created, notified } = build();
    await service.recordEndedCall({
      ...MISSED,
      direction: "outbound",
      fromNumber: "+14155550100",
      toNumber: "+13055550123",
    } as never);

    assert.equal(created[0].kind, InboxEventKind.call_completed);
    assert.deepEqual(notified, []);
  });

  it("neither adds nor announces a missed call twice", async () => {
    const { service, created, notified } = build({ existing: true });
    assert.equal(await service.recordEndedCall(MISSED as never), null);
    assert.deepEqual(created, []);
    assert.deepEqual(notified, []);
  });

  it("does nothing for a call with no owner", async () => {
    const { service, created } = build();
    assert.equal(
      await service.recordEndedCall({ ...MISSED, userId: null } as never),
      null,
    );
    assert.deepEqual(created, []);
  });

  it("reopens the conversation and puts it on the line the call rang for", async () => {
    const { service, updates } = build({
      thread: { status: InboxThreadStatus.resolved, userId: "member-9" },
    });
    await service.recordEndedCall(MISSED as never);

    assert.equal(updates.length, 1);
    const [update] = updates;
    assert.equal(update.status, InboxThreadStatus.open);
    assert.equal(update.resolvedAt, null);
    assert.equal(update.archivedAt, null);
    assert.equal(update.userId, "member-1");
    assert.equal(update.lastEventKind, InboxEventKind.missed_call);
    assert.deepEqual(update.unreadCount, { increment: 1 });
  });

  it("leaves an answered call's conversation where it is", async () => {
    const { service, updates, lookups } = build({
      thread: { status: InboxThreadStatus.resolved, userId: "member-9" },
      lastCaller: "member-7",
    });
    await service.recordEndedCall({
      ...MISSED,
      answeredAt: new Date("2026-10-09T15:00:05.000Z"),
    } as never);

    assert.equal(updates[0].status, undefined);
    assert.equal(updates[0].userId, undefined);
    assert.deepEqual(lookups, []);
  });

  it("puts a missed call on the line of the member who called that number last, whoever it rang", async () => {
    // member-1 is who the route rang; member-7 called the caller before.
    const { service, updates, notified, lookups } = build({
      lastCaller: "member-7",
    });
    await service.recordEndedCall(MISSED as never);

    assert.equal(updates[0].userId, "member-7");
    assert.deepEqual(lookups, [
      {
        ctx: { userId: "member-1", organizationId: "org-1" },
        toNumbers: ["+13055550123"],
        before: STARTED_AT,
      },
    ]);
    // The email follows the queue: it reads the conversation once moved.
    assert.deepEqual(notified, [{ callId: "call-1", threadId: "thread-1" }]);
  });

  it("looks the caller up as dialed and in E.164", async () => {
    const { service, lookups } = build({ lastCaller: "member-7" });
    await service.recordEndedCall({
      ...MISSED,
      fromNumber: "13055550123",
    } as never);

    assert.deepEqual(lookups[0].toNumbers, ["+13055550123", "13055550123"]);
  });

  it("keeps an assigned conversation with its assignee", async () => {
    const { service, updates } = build({
      thread: { assignedToId: "member-3" },
      lastCaller: "member-7",
    });
    await service.recordEndedCall(MISSED as never);

    assert.equal(updates[0].userId, undefined);
  });

  it("leaves the missed call on the line it rang when the lookup fails", async () => {
    const { service, created, updates, notified } = build({
      thread: { userId: "member-9" },
      lastCaller: new Error("connection reset"),
    });
    await service.recordEndedCall(MISSED as never);

    assert.equal(created[0].kind, InboxEventKind.missed_call);
    assert.equal(updates[0].userId, "member-1");
    assert.equal(notified.length, 1);
  });

  it("never looks for a last caller in a personal workspace, or for a hidden number", async () => {
    const personal = build({
      thread: { organizationId: null },
      lastCaller: "member-7",
    });
    await personal.service.recordEndedCall({
      ...MISSED,
      organizationId: null,
    } as never);
    assert.deepEqual(personal.lookups, []);

    const hidden = build({ thread: { userId: "member-9" } });
    await hidden.service.recordEndedCall({
      ...MISSED,
      fromNumber: "anonymous",
    } as never);
    assert.deepEqual(hidden.lookups, []);
    assert.equal(hidden.updates[0].userId, "member-1");
  });
});

describe("InboxTimelineService.backfillFromCalls", () => {
  it("files past missed calls without announcing them", async () => {
    const { service, created, notified } = build();
    // ensureThreadForCall resolves the same thread first.
    const result = await service.backfillFromCalls(
      { userId: "member-1", organizationId: "org-1" },
      [MISSED as never],
    );

    assert.equal(result.eventsCreated, 1);
    assert.equal(created[0].kind, InboxEventKind.missed_call);
    assert.deepEqual(notified, []);
  });
});
