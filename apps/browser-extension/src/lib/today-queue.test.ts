import { describe, expect, it } from "vitest";
import type { CallListNext, QueueItem } from "./ringee-api";
import {
  arrangeQueue,
  callbackNote,
  isCallableNow,
  keepOrder,
  localDay,
  owedCallbacks,
  pickNextCall,
  upcomingCall,
} from "./today-queue";

const NOW = new Date("2026-10-30T15:00:00.000Z");

function item(key: string, patch: Partial<QueueItem> = {}): QueueItem {
  return {
    key,
    group: "now",
    dueAt: null,
    contact: {
      id: `contact-${key}`,
      name: `Person ${key}`,
      company: null,
      phoneNumber: "+14155550100",
      timezone: null,
      country: "US",
    },
    doNotCall: false,
    reasons: [],
    lists: [],
    ...patch,
  };
}

const LIST_NEXT: CallListNext = {
  list: {
    id: "list-1",
    name: "Q4 leads",
    description: null,
    contactCount: 20,
    remaining: 12,
  },
  next: {
    entryId: "entry-1",
    skipped: false,
    contact: {
      id: "contact-list",
      name: "Listed Person",
      company: "Acme",
      phoneNumber: "+34600000000",
      timezone: "Europe/Madrid",
      country: "ES",
    },
  },
};

describe("isCallableNow", () => {
  it("calls the now and anytime groups straight away", () => {
    expect(isCallableNow(item("a"), NOW)).toBe(true);
    expect(isCallableNow(item("b", { group: "anytime" }), NOW)).toBe(true);
  });

  it("calls a later item only once it is due", () => {
    const later = (dueAt: string) => item("c", { group: "later", dueAt });
    expect(isCallableNow(later("2026-10-30T16:00:00.000Z"), NOW)).toBe(false);
    expect(isCallableNow(later("2026-10-30T14:59:00.000Z"), NOW)).toBe(true);
  });

  it("never offers a Do Not Call number", () => {
    expect(isCallableNow(item("d", { doNotCall: true }), NOW)).toBe(false);
  });
});

describe("pickNextCall", () => {
  it("takes the first callable person in today's queue", () => {
    const items = [
      item("dnc", { doNotCall: true }),
      item("due"),
      item("other", { group: "anytime" }),
    ];
    expect(pickNextCall(items, LIST_NEXT, NOW)).toEqual({
      source: "queue",
      item: items[1],
    });
  });

  it("falls through to the picked list when nobody in the queue is due", () => {
    const items = [
      item("later", { group: "later", dueAt: "2026-10-30T18:00:00.000Z" }),
    ];
    const next = pickNextCall(items, LIST_NEXT, NOW);
    expect(next?.source).toBe("list");
    expect(next?.item).toMatchObject({
      key: "list-entry:entry-1",
      contact: LIST_NEXT.next!.contact,
      lists: [{ id: "list-1", name: "Q4 leads" }],
      reasons: [],
    });
  });

  it("has nobody to offer with an empty queue and no list's next", () => {
    expect(pickNextCall([], null, NOW)).toBeNull();
    expect(pickNextCall([], { ...LIST_NEXT, next: null }, NOW)).toBeNull();
  });
});

describe("upcomingCall", () => {
  it("names who comes due next once nobody is due", () => {
    const later = item("later", {
      group: "later",
      dueAt: "2026-10-30T18:00:00.000Z",
    });
    expect(upcomingCall([later], NOW)).toBe(later);
    expect(upcomingCall([later, item("due")], NOW)).toBeNull();
  });

  it("skips a Do Not Call number", () => {
    const blocked = item("later", {
      group: "later",
      dueAt: "2026-10-30T18:00:00.000Z",
      doNotCall: true,
    });
    expect(upcomingCall([blocked], NOW)).toBeNull();
  });
});

describe("keepOrder / arrangeQueue", () => {
  it("keeps the first load's order and holds newcomers back", () => {
    const first = [item("a"), item("b")];
    const order = keepOrder(null, first);
    expect(order).toEqual(["a", "b"]);

    const refreshed = [item("c"), item("b"), item("a")];
    const kept = keepOrder(order, refreshed);
    const { items, incoming } = arrangeQueue(refreshed, kept);
    expect(items.map((i) => i.key)).toEqual(["a", "b"]);
    expect(incoming.map((i) => i.key)).toEqual(["c"]);
  });

  it("lets whoever was called back leave at once, for good", () => {
    const order = keepOrder(null, [item("a"), item("b")]);
    const withoutA = keepOrder(order, [item("b")]);
    expect(withoutA).toEqual(["b"]);

    // Back again later: new, not slotted back into its old place.
    const back = [item("a"), item("b")];
    expect(arrangeQueue(back, keepOrder(withoutA, back)).incoming).toEqual([
      back[0],
    ]);
  });

  it("orders sections by time of day, arrival inside each", () => {
    const fresh = [
      item("anytime", { group: "anytime" }),
      item("later", { group: "later", dueAt: "2026-10-30T18:00:00.000Z" }),
      item("now-1"),
      item("now-2"),
    ];
    const { items } = arrangeQueue(fresh, keepOrder(null, fresh));
    expect(items.map((i) => i.key)).toEqual([
      "now-1",
      "now-2",
      "later",
      "anytime",
    ]);
  });
});

describe("callbacks on an item", () => {
  const reasons: QueueItem["reasons"] = [
    {
      kind: "missed_call",
      threadId: "t1",
      at: "2026-10-30T14:00:00.000Z",
      voicemail: false,
    },
    {
      kind: "callback",
      callbackId: "cb1",
      at: "2026-10-30T14:30:00.000Z",
      note: "  After lunch ",
    },
  ];

  it("lists the callbacks calling the item completes", () => {
    expect(
      owedCallbacks(item("a", { reasons })).map((r) => r.callbackId),
    ).toEqual(["cb1"]);
  });

  it("reads the callback's note, trimmed", () => {
    expect(callbackNote(reasons)).toBe("After lunch");
    expect(callbackNote([])).toBeNull();
  });
});

describe("localDay", () => {
  it("spans the local day around now", () => {
    const { from, to } = localDay(NOW);
    expect(from.getHours()).toBe(0);
    expect(from.getMinutes()).toBe(0);
    expect(to.getHours()).toBe(23);
    expect(to.getMinutes()).toBe(59);
    expect(from.getTime()).toBeLessThanOrEqual(NOW.getTime());
    expect(to.getTime()).toBeGreaterThanOrEqual(NOW.getTime());
  });
});
