/// <reference types="node" />

import "reflect-metadata";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ContactListEntryToCall } from "@ringee/database";
import { MyDayListCandidates, pickListNext } from "./my-day-list";

const at = (iso: string) => new Date(`2026-10-08T${iso}:00.000Z`);

function entry(
  id: string,
  phoneNumber: string,
  options: {
    joinedAt?: Date;
    skippedAt?: Date | null;
    name?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  } = {},
): ContactListEntryToCall {
  return {
    id,
    sequence: BigInt(id.replace(/\D/g, "") || "0"),
    createdAt: options.joinedAt ?? at("09:00"),
    skippedAt: options.skippedAt ?? null,
    contact: {
      id: `contact-${id}`,
      name: options.name === undefined ? `Contact ${id}` : options.name,
      firstName: options.firstName ?? null,
      lastName: options.lastName ?? null,
      company: null,
      phoneNumber,
      timezone: null,
    },
  };
}

function pick(candidates: Partial<MyDayListCandidates>) {
  return pickListNext({
    entries: [],
    outbound: [],
    doNotCall: new Set(),
    openCallbacks: new Set(),
    ...candidates,
  });
}

describe("pickListNext", () => {
  it("offers the first contact nobody has called since it joined the list", () => {
    const result = pick({
      entries: [
        entry("e-1", "+14155550101"),
        entry("e-2", "+14155550102"),
        entry("e-3", "+14155550103"),
      ],
      outbound: [{ toNumber: "+14155550101", at: at("10:00") }],
    });

    assert.equal(result.next?.entryId, "e-2");
    assert.deepEqual(result.called, [{ id: "e-1", at: at("10:00") }]);
  });

  it("does not count a call placed before the contact joined the list", () => {
    const result = pick({
      entries: [entry("e-1", "+14155550101", { joinedAt: at("11:00") })],
      outbound: [{ toNumber: "+14155550101", at: at("10:00") }],
    });

    assert.equal(result.next?.entryId, "e-1");
    assert.deepEqual(result.called, []);
  });

  it("records every called contact of the page, past the one it offers", () => {
    const result = pick({
      entries: [
        entry("e-1", "+14155550101"),
        entry("e-2", "+14155550102"),
        entry("e-3", "+14155550103"),
      ],
      outbound: [
        { toNumber: "+14155550101", at: at("10:00") },
        { toNumber: "+14155550103", at: at("10:30") },
        { toNumber: "+14155550103", at: at("12:00") },
      ],
    });

    assert.equal(result.next?.entryId, "e-2");
    assert.deepEqual(result.called, [
      { id: "e-1", at: at("10:00") },
      { id: "e-3", at: at("12:00") },
    ]);
  });

  it("passes over Do Not Call numbers and booked callbacks without recording them", () => {
    const result = pick({
      entries: [
        entry("e-1", "+14155550101"),
        entry("e-2", "+14155550102"),
        entry("e-3", "+14155550103"),
      ],
      doNotCall: new Set(["+14155550101"]),
      openCallbacks: new Set(["contact-e-2"]),
    });

    assert.equal(result.next?.entryId, "e-3");
    assert.deepEqual(result.called, []);
  });

  it("matches a number however the contact stored it", () => {
    const result = pick({
      entries: [entry("e-1", "(415) 555-0101"), entry("e-2", "+14155550102")],
      outbound: [{ toNumber: "+14155550101", at: at("10:00") }],
    });

    assert.equal(result.next?.entryId, "e-2");
    assert.deepEqual(result.called, [{ id: "e-1", at: at("10:00") }]);
  });

  it("answers with the number to dial, a name, and whether it was skipped", () => {
    const result = pick({
      entries: [
        entry("e-1", "(415) 555-0101", {
          name: null,
          firstName: "Ada",
          lastName: "Lovelace",
          skippedAt: at("09:30"),
        }),
      ],
    });

    assert.deepEqual(result.next, {
      entryId: "e-1",
      skipped: true,
      contact: {
        id: "contact-e-1",
        name: "Ada Lovelace",
        company: null,
        phoneNumber: "+14155550101",
        timezone: null,
        country: "US",
      },
    });
  });

  it("has no one to offer when every contact is set aside", () => {
    const result = pick({
      entries: [entry("e-1", "+14155550101"), entry("e-2", "not a number")],
      doNotCall: new Set(["+14155550101"]),
    });

    assert.equal(result.next, null);
  });
});
