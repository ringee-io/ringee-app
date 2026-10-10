/// <reference types="node" />

import "reflect-metadata";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CallablePendingAction,
  MissedCallThread,
  OwedCallback,
  PendingActionPriority,
  PendingActionType,
} from "@ringee/database";
import {
  buildMyDayQueue,
  myDayQueueContactIds,
  MyDayQueueSources,
} from "./my-day-queue";

const NOW = new Date("2026-10-08T15:00:00.000Z");
const at = (iso: string) => new Date(`2026-10-08T${iso}:00.000Z`);

function contact(id: string, phoneNumber: string): OwedCallback["contact"] {
  return {
    id,
    name: `Contact ${id}`,
    phoneNumber,
    company: null,
    timezone: null,
    deletedAt: null,
  };
}

function callback(
  id: string,
  scheduledAt: Date,
  who = contact("c-1", "+14155550101"),
): OwedCallback {
  return { id, scheduledAt, note: null, contact: who };
}

function missedCall(
  id: string,
  lastEventAt: Date,
  participant: string,
  who: MissedCallThread["contact"] = null,
): MissedCallThread {
  return {
    id,
    participantNumber: participant,
    participantNumberE164: participant,
    lastEventAt,
    lastEventKind: "missed_call",
    contact: who,
  };
}

function followUp(
  id: string,
  dueAt: Date | null,
  who = contact("c-3", "+14155550103"),
  options: { priority?: PendingActionPriority; createdAt?: Date } = {},
): CallablePendingAction {
  return {
    id,
    type: PendingActionType.book_meeting,
    priority: options.priority ?? PendingActionPriority.medium,
    title: "Book a meeting",
    dueAt,
    createdAt: options.createdAt ?? at("09:00"),
    contact: {
      id: who.id,
      name: who.name,
      phoneNumber: who.phoneNumber,
      company: who.company,
      timezone: who.timezone,
    },
  };
}

function build(sources: Partial<MyDayQueueSources>) {
  return buildMyDayQueue({
    userId: "me",
    now: NOW,
    callbacks: [],
    missedCalls: [],
    followUps: [],
    outbound: [],
    doNotCall: new Set(),
    lists: new Map(),
    ...sources,
  });
}

describe("buildMyDayQueue", () => {
  it("orders now (callbacks, missed calls, follow-ups), later, then anytime", () => {
    const queue = build({
      callbacks: [
        callback("cb-later", at("18:30"), contact("c-4", "+14155550104")),
        callback("cb-due", at("10:30")),
      ],
      missedCalls: [missedCall("t-1", at("14:48"), "+14155550102")],
      followUps: [
        followUp("fu-due", at("12:00")),
        followUp("fu-any", null, contact("c-5", "+14155550105")),
      ],
    });

    assert.deepEqual(
      queue.map((item) => [item.key, item.group]),
      [
        ["contact:c-1:+14155550101", "now"],
        ["phone:+14155550102", "now"],
        ["contact:c-3:+14155550103", "now"],
        ["contact:c-4:+14155550104", "later"],
        ["contact:c-5:+14155550105", "anytime"],
      ],
    );
    assert.deepEqual(queue[3]!.dueAt, at("18:30"));
    assert.equal(queue[0]!.dueAt, null);
  });

  it("shows a person once, with every reason, the most pressing first", () => {
    const ana = contact("c-1", "+14155550101");
    const queue = build({
      callbacks: [callback("cb-1", at("10:30"), ana)],
      missedCalls: [missedCall("t-1", at("14:00"), "+14155550101")],
      followUps: [followUp("fu-1", null, ana)],
    });

    assert.equal(queue.length, 1);
    assert.equal(queue[0]!.contact.id, "c-1");
    assert.equal(queue[0]!.contact.country, "US");
    assert.deepEqual(
      queue[0]!.reasons.map((reason) => reason.kind),
      ["callback", "missed_call", "follow_up"],
    );
  });

  it("keeps a secondary missed number separate from the primary callback", () => {
    const ana = contact("c-1", "+14155550101");
    const queue = build({
      callbacks: [callback("cb-later", at("18:30"), ana)],
      missedCalls: [missedCall("secondary", at("14:00"), "+14155550102", ana)],
    });
    assert.equal(queue.length, 2);
    assert.equal(queue[0]!.contact.phoneNumber, "+14155550102");
    assert.equal(queue[0]!.group, "now");
    assert.deepEqual(
      queue[0]!.reasons.map((reason) => reason.kind),
      ["missed_call"],
    );
    assert.equal(queue[1]!.contact.phoneNumber, "+14155550101");
    assert.equal(queue[1]!.group, "later");
    assert.notEqual(queue[0]!.key, queue[1]!.key);
  });

  it("names an unknown caller once they turn out to be a contact", () => {
    const queue = build({
      missedCalls: [
        missedCall("t-1", at("14:00"), "+14155550101"),
        missedCall(
          "t-2",
          at("13:00"),
          "+14155550101",
          contact("c-1", "+14155550101"),
        ),
      ],
    });

    assert.equal(queue.length, 1);
    assert.equal(queue[0]!.key, "contact:c-1:+14155550101");
    assert.equal(queue[0]!.reasons.length, 2);
  });

  it("drops a missed call once anyone in the workspace called the number back", () => {
    const queue = build({
      missedCalls: [
        missedCall("returned", at("13:00"), "+14155550101"),
        missedCall("waiting", at("14:00"), "+14155550102"),
      ],
      outbound: [
        { toNumber: "+14155550101", userId: "teammate", at: at("13:05") },
        // Called before the missed call: that call was not a return.
        { toNumber: "+14155550102", userId: "me", at: at("12:00") },
      ],
    });

    assert.deepEqual(
      queue.map((item) => item.key),
      ["phone:+14155550102"],
    );
  });

  it("drops a follow-up once its owner called the contact after it was raised", () => {
    const queue = build({
      followUps: [
        followUp("mine", null, contact("c-1", "+14155550101")),
        followUp("teammates", null, contact("c-2", "+14155550102")),
      ],
      outbound: [
        { toNumber: "+14155550101", userId: "me", at: at("10:00") },
        { toNumber: "+14155550102", userId: "teammate", at: at("10:00") },
      ],
    });

    assert.deepEqual(
      queue.map((item) => item.key),
      ["contact:c-2:+14155550102"],
    );
  });

  it("keeps a callback until it is completed, whoever called the contact", () => {
    const queue = build({
      callbacks: [callback("cb-1", at("10:30"))],
      outbound: [{ toNumber: "+14155550101", userId: "me", at: at("11:00") }],
    });

    assert.equal(queue.length, 1);
  });

  it("puts the most recent missed call first", () => {
    const queue = build({
      missedCalls: [
        missedCall("old", at("09:00"), "+14155550101"),
        missedCall("new", at("14:30"), "+14155550102"),
      ],
    });

    assert.deepEqual(
      queue.map((item) => item.key),
      ["phone:+14155550102", "phone:+14155550101"],
    );
  });

  it("orders undated follow-ups by priority", () => {
    const queue = build({
      followUps: [
        followUp("low", null, contact("c-1", "+14155550101"), {
          priority: PendingActionPriority.low,
        }),
        followUp("high", null, contact("c-2", "+14155550102"), {
          priority: PendingActionPriority.high,
        }),
      ],
    });

    assert.deepEqual(
      queue.map((item) => item.key),
      ["contact:c-2:+14155550102", "contact:c-1:+14155550101"],
    );
  });

  it("flags numbers on the Do Not Call list", () => {
    const queue = build({
      callbacks: [callback("cb-1", at("10:30"))],
      doNotCall: new Set(["+14155550101"]),
    });

    assert.equal(queue[0]!.doNotCall, true);
  });

  it("skips deleted contacts and numbers that cannot be called back", () => {
    const deleted = {
      ...contact("c-1", "+14155550101"),
      deletedAt: at("08:00"),
    };
    const queue = build({
      callbacks: [callback("cb-1", at("10:30"), deleted)],
      missedCalls: [
        {
          ...missedCall("t-1", at("14:00"), "anonymous"),
          participantNumberE164: null,
        },
        missedCall("t-2", at("14:10"), "+14155550102", deleted),
      ],
    });

    assert.deepEqual(
      queue.map((item) => [item.key, item.contact.id]),
      [["phone:+14155550102", null]],
    );
  });

  it("names the person's lists a contact is in, and none for an unknown caller", () => {
    const fintech = { id: "list-1", name: "Fintech NYC" };
    const queue = build({
      callbacks: [callback("cb-1", at("10:30"))],
      missedCalls: [missedCall("t-1", at("14:00"), "+14155550109")],
      lists: new Map([["c-1", [fintech]]]),
    });

    assert.deepEqual(
      queue.map((item) => [item.key, item.lists]),
      [
        ["contact:c-1:+14155550101", [fintech]],
        ["phone:+14155550109", []],
      ],
    );
  });
});

describe("myDayQueueContactIds", () => {
  it("collects every saved, live contact once", () => {
    const deleted = {
      ...contact("c-9", "+14155550109"),
      deletedAt: at("08:00"),
    };
    const ids = myDayQueueContactIds({
      callbacks: [callback("cb-1", at("10:30"))],
      missedCalls: [
        missedCall(
          "t-1",
          at("14:00"),
          "+14155550101",
          contact("c-1", "+14155550101"),
        ),
        missedCall("t-2", at("14:05"), "+14155550102"),
        missedCall("t-3", at("14:10"), "+14155550109", deleted),
      ],
      followUps: [followUp("fu-1", null)],
    });

    assert.deepEqual(ids, ["c-1", "c-3"]);
  });
});
