/// <reference types="node" />

import "reflect-metadata";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import {
  CallablePendingAction,
  ContactListEntryToCall,
  OwedCallback,
  WorkedContactList,
} from "@ringee/database";
import { MyDayService } from "./my-day.service";

const NOW = new Date("2026-10-08T15:00:00.000Z");

function owed(id: string, phoneNumber: string): OwedCallback {
  return {
    id,
    scheduledAt: new Date("2026-10-08T10:00:00.000Z"),
    note: null,
    contact: {
      id: `contact-${id}`,
      name: null,
      phoneNumber,
      company: null,
      timezone: null,
      deletedAt: null,
    },
  };
}

const LIST: WorkedContactList = {
  id: "list-1",
  name: "Fintech NYC",
  description: null,
  _count: { entries: 3 },
};

function listEntry(
  id: string,
  phoneNumber: string,
  skippedAt: Date | null = null,
): ContactListEntryToCall {
  return {
    id,
    sequence: BigInt(id.replace(/\D/g, "")),
    createdAt: new Date("2026-10-08T09:00:00.000Z"),
    skippedAt,
    contact: {
      id: `contact-${id}`,
      name: `Contact ${id}`,
      firstName: null,
      lastName: null,
      company: null,
      phoneNumber,
      timezone: null,
    },
  };
}

function build(
  options: {
    callbacks?: OwedCallback[];
    followUps?: CallablePendingAction[];
    agentCallIds?: string[];
    /** The lists assigned to the caller, by id. */
    assigned?: WorkedContactList[];
    /** Entries still to call: never skipped, then skipped. */
    toCall?: {
      fresh: ContactListEntryToCall[];
      skipped: ContactListEntryToCall[];
    };
    outbound?: { toNumber: string; userId: string | null; at: Date }[];
    openCallbacks?: string[];
    listed?: { contactId: string; list: { id: string; name: string } }[];
  } = {},
) {
  const scheduledTo: Date[] = [];
  const summaries: Array<{ start: Date; end: Date }> = [];
  const marked: { id: string; at: Date }[] = [];
  const skips: Array<{ listId: string; entryId: string }> = [];
  const listLookups: Array<{ userId: string; listId?: string }> = [];
  const service = new MyDayService(
    {
      listOwedByUser: async (_owner: unknown, opts: { scheduledTo: Date }) => {
        scheduledTo.push(opts.scheduledTo);
        return options.callbacks ?? [];
      },
      findContactsWithOpenCallback: async (
        _workspace: unknown,
        contactIds: string[],
      ) =>
        new Set(contactIds.filter((id) => options.openCallbacks?.includes(id))),
    } as never,
    { listMissedCallThreads: async () => [] } as never,
    {
      listOpenForCalling: async (
        _owner: unknown,
        opts: { after?: string; limit: number },
      ) => {
        const all = options.followUps ?? [];
        const start = opts.after
          ? all.findIndex((a) => a.id === opts.after) + 1
          : 0;
        return all.slice(start, start + opts.limit);
      },
    } as never,
    {
      findExistingIds: async (ids: string[]) =>
        new Set(ids.filter((id) => options.agentCallIds?.includes(id))),
    } as never,
    { latestOutboundTo: async () => options.outbound ?? [] } as never,
    { findListedPhones: async () => new Set<string>() } as never,
    {
      getMyDaySummary: async (
        _owner: unknown,
        range: { start: Date; end: Date },
      ) => {
        summaries.push(range);
        return {
          calls: 0,
          conversations: 0,
          meetingsBooked: 0,
          nextMeeting: null,
        };
      },
    } as never,
    {
      listsHolding: async (_ctx: unknown, userId: string) => {
        listLookups.push({ userId });
        return options.listed ?? [];
      },
      listAssignedTo: async (_ctx: unknown, userId: string) => {
        listLookups.push({ userId });
        return options.assigned ?? [];
      },
      findAssignedTo: async (_ctx: unknown, listId: string, userId: string) => {
        listLookups.push({ userId, listId });
        return options.assigned?.find((list) => list.id === listId) ?? null;
      },
      countToCall: async (listIds: string[]) =>
        new Map(listIds.map((id) => [id, 2])),
      listToCall: async (
        _listId: string,
        opts: {
          skipped: boolean;
          after?: ContactListEntryToCall;
          limit: number;
        },
      ) => {
        const all = opts.skipped
          ? (options.toCall?.skipped ?? [])
          : (options.toCall?.fresh ?? []);
        const start = opts.after
          ? all.findIndex((entry) => entry.id === opts.after!.id) + 1
          : 0;
        return all.slice(start, start + opts.limit);
      },
      markCalled: async (entries: { id: string; at: Date }[]) => {
        marked.push(...entries);
      },
      skipEntry: async (listId: string, entryId: string) => {
        skips.push({ listId, entryId });
        return true;
      },
    } as never,
  );
  return { service, scheduledTo, summaries, marked, skips, listLookups };
}

const ctx = { userId: "me", organizationId: "org-1" };

describe("MyDayService.getQueue", () => {
  it("pages past 100 called follow-ups without completing their actions", async () => {
    const followUps: CallablePendingAction[] = Array.from(
      { length: 102 },
      (_, i) => ({
        id: `action-${i}`,
        type: "book_meeting",
        priority: "medium",
        title: "Follow up",
        dueAt: NOW,
        createdAt: new Date(NOW.getTime() - 60_000),
        contact: owed(`cb-${i}`, `+1415555${String(i).padStart(4, "0")}`)
          .contact,
      }),
    );
    const { service } = build({
      followUps,
      outbound: followUps.slice(0, 100).map((action) => ({
        toNumber: action.contact!.phoneNumber,
        userId: "me",
        at: NOW,
      })),
    });
    for (let attempt = 0; attempt < 2; attempt++) {
      const queue = await service.getQueue(ctx, undefined, NOW);
      assert.deepEqual(
        queue.items.flatMap((item) =>
          item.reasons.map((reason) =>
            reason.kind === "follow_up" ? reason.actionId : null,
          ),
        ),
        ["action-100", "action-101"],
      );
    }
  });

  it("leaves out the callbacks a voice agent will place itself", async () => {
    const { service } = build({
      callbacks: [owed("human", "+14155550101"), owed("agent", "+14155550102")],
      agentCallIds: ["agent"],
    });

    const queue = await service.getQueue(ctx, undefined, NOW);

    assert.deepEqual(
      queue.items.map((item) => item.reasons[0]),
      [
        {
          kind: "callback",
          callbackId: "human",
          at: new Date("2026-10-08T10:00:00.000Z"),
          note: null,
        },
      ],
    );
  });

  it("never reaches further than a day ahead, nor ends before now", async () => {
    const { service, scheduledTo } = build();

    await service.getQueue(ctx, new Date("2026-10-20T00:00:00.000Z"), NOW);
    await service.getQueue(ctx, new Date("2026-10-07T00:00:00.000Z"), NOW);
    await service.getQueue(ctx, new Date("2026-10-08T21:59:59.999Z"), NOW);

    assert.deepEqual(scheduledTo, [
      new Date("2026-10-10T03:00:00.000Z"),
      NOW,
      new Date("2026-10-08T21:59:59.999Z"),
    ]);
  });

  it("names only the caller's own lists on each person", async () => {
    const { service, listLookups } = build({
      callbacks: [owed("cb-1", "+14155550101")],
      listed: [
        { contactId: "contact-cb-1", list: { id: "l-1", name: "Fintech" } },
        { contactId: "contact-cb-1", list: { id: "l-2", name: "Retail" } },
      ],
    });

    const queue = await service.getQueue(ctx, undefined, NOW);

    assert.deepEqual(queue.items[0]!.lists, [
      { id: "l-1", name: "Fintech" },
      { id: "l-2", name: "Retail" },
    ]);
    assert.deepEqual(listLookups, [{ userId: "me" }]);
  });
});

describe("MyDayService lists", () => {
  it("reaches callable entries after 500 contacts with open callbacks", async () => {
    const fresh = Array.from({ length: 501 }, (_, i) =>
      listEntry(`e-${i + 1}`, `+1415555${String(i).padStart(4, "0")}`),
    );
    const { service } = build({
      assigned: [LIST],
      toCall: { fresh, skipped: [] },
      openCallbacks: fresh.slice(0, 500).map((entry) => entry.contact.id),
    });
    assert.equal(
      (await service.getListNext(ctx, LIST.id)).next?.entryId,
      "e-501",
    );
    assert.equal(
      (await service.getListNext(ctx, LIST.id)).next?.entryId,
      "e-501",
    );
  });

  it("exhausts a fully blocked list without advancing its entries", async () => {
    const fresh = Array.from({ length: 501 }, (_, i) =>
      listEntry(`e-${i + 1}`, "+14155550101"),
    );
    const { service, marked } = build({
      assigned: [LIST],
      toCall: { fresh, skipped: [] },
      openCallbacks: fresh.map((entry) => entry.contact.id),
    });
    assert.equal((await service.getListNext(ctx, LIST.id)).next, null);
    assert.deepEqual(marked, []);
  });

  it("offers the lists assigned to the caller, with what is left to call", async () => {
    const { service, listLookups } = build({ assigned: [LIST] });

    const lists = await service.getLists(ctx);

    assert.deepEqual(lists, {
      data: [
        {
          id: "list-1",
          name: "Fintech NYC",
          description: null,
          contactCount: 3,
          remaining: 2,
        },
      ],
    });
    assert.deepEqual(listLookups, [{ userId: "me" }]);
  });

  it("answers 404 for a list that is not assigned to the caller", async () => {
    const { service } = build({ assigned: [] });

    await assert.rejects(service.getListNext(ctx, "list-1"), NotFoundException);
    await assert.rejects(
      service.skipListEntry(ctx, "list-1", "e-1"),
      NotFoundException,
    );
  });

  it("offers the next contact, recording the ones already called", async () => {
    const { service, marked } = build({
      assigned: [LIST],
      toCall: {
        fresh: [
          listEntry("e-1", "+14155550101"),
          listEntry("e-2", "+14155550102"),
          listEntry("e-3", "+14155550103"),
        ],
        skipped: [],
      },
      outbound: [
        {
          toNumber: "+14155550101",
          userId: "teammate",
          at: new Date("2026-10-08T10:00:00.000Z"),
        },
      ],
      openCallbacks: ["contact-e-2"],
    });

    const result = await service.getListNext(ctx, "list-1");

    assert.equal(result.next?.entryId, "e-3");
    assert.equal(result.list.remaining, 2);
    assert.deepEqual(marked, [
      { id: "e-1", at: new Date("2026-10-08T10:00:00.000Z") },
    ]);
  });

  it("comes back to skipped contacts once nobody else is left", async () => {
    const { service } = build({
      assigned: [LIST],
      toCall: {
        fresh: [],
        skipped: [
          listEntry(
            "e-7",
            "+14155550107",
            new Date("2026-10-08T11:00:00.000Z"),
          ),
        ],
      },
    });

    const result = await service.getListNext(ctx, "list-1");

    assert.equal(result.next?.entryId, "e-7");
    assert.equal(result.next?.skipped, true);
  });

  it("skips within the caller's own list and answers with who is next", async () => {
    const { service, skips } = build({
      assigned: [LIST],
      toCall: { fresh: [listEntry("e-2", "+14155550102")], skipped: [] },
    });

    const result = await service.skipListEntry(ctx, "list-1", "e-1");

    assert.deepEqual(skips, [{ listId: "list-1", entryId: "e-1" }]);
    assert.equal(result.next?.entryId, "e-2");
  });
});

describe("MyDayService.getSummary", () => {
  it("defaults to the UTC day", async () => {
    const { service, summaries } = build();

    await service.getSummary(ctx, undefined, NOW);

    assert.deepEqual(summaries, [
      {
        start: new Date("2026-10-08T00:00:00.000Z"),
        end: new Date("2026-10-08T23:59:59.999Z"),
      },
    ]);
  });

  it("refuses a range that is backwards or longer than a day", async () => {
    const { service } = build();

    await assert.rejects(
      service.getSummary(ctx, {
        from: new Date("2026-10-08T10:00:00.000Z"),
        to: new Date("2026-10-08T09:00:00.000Z"),
      }),
      BadRequestException,
    );
    await assert.rejects(
      service.getSummary(ctx, {
        from: new Date("2026-10-01T00:00:00.000Z"),
        to: new Date("2026-10-08T00:00:00.000Z"),
      }),
      BadRequestException,
    );
  });
});
