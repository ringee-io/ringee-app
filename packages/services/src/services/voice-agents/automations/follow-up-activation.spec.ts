/// <reference types="node" />

import "reflect-metadata";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException } from "@nestjs/common";
import { policyCoversMeeting } from "../../reminders/reminder-call-schedule";
import {
  PROPOSED_REMINDER_OFFSET_MINUTES,
  followUpState,
  parseEntrySource,
  parseFollowUpDraft,
} from "./follow-up-activation";

describe("follow-up review state", () => {
  const base = {
    admitted: true,
    requirements: [] as never[],
    adopted: false,
    adoptedCapabilities: [],
  };

  it("is unavailable outside the pilot, whatever else is true", () => {
    assert.equal(followUpState({ ...base, admitted: false }), "not_admitted");
  });

  it("puts configuration before money, and never says ready without credit", () => {
    assert.equal(
      followUpState({ ...base, requirements: ["get_number", "add_credit"] }),
      "needs_configuration",
    );
    assert.equal(
      followUpState({ ...base, requirements: ["add_credit"] }),
      "add_credit",
    );
    assert.equal(followUpState(base), "ready_to_activate");
  });

  it("separates adopted-but-blocked, active and paused", () => {
    const adopted = {
      ...base,
      adopted: true,
      adoptedCapabilities: [
        { capability: "scheduling" as const, on: true },
        { capability: "reminders" as const, on: true },
      ],
    };
    assert.equal(followUpState(adopted), "active");
    assert.equal(
      followUpState({ ...adopted, requirements: ["add_credit"] }),
      "pending",
    );
    assert.equal(
      followUpState({
        ...adopted,
        adoptedCapabilities: [
          { capability: "scheduling", on: false },
          { capability: "reminders", on: false },
        ],
      }),
      "paused",
    );
  });

  it("proposes confirmations four hours before", () => {
    assert.equal(PROPOSED_REMINDER_OFFSET_MINUTES, 240);
  });
});

describe("follow-up draft validation", () => {
  it("accepts a partial draft and normalizes what it holds", () => {
    const draft = parseFollowUpDraft({
      identity: { companyName: "  Northwind ", companyWebsite: "northwind.io" },
      callingHours: { days: [5, 1, 1, 3], startMinute: 540, endMinute: 1080 },
      capabilities: { scheduling: true, reminders: false },
      reminderOffsetMinutes: 240,
      existingMeetings: "none",
    });
    assert.equal(draft.identity?.companyName, "Northwind");
    assert.equal(draft.identity?.companyWebsite, "https://northwind.io/");
    assert.deepEqual(draft.callingHours?.days, [1, 3, 5]);
    assert.equal(draft.numberId, undefined);
  });

  it("allows clearing a field with null", () => {
    const draft = parseFollowUpDraft({ availability: null, numberId: null });
    assert.equal(draft.availability, null);
    assert.equal(draft.numberId, null);
  });

  it("refuses malformed ids, windows, zones and offsets", () => {
    for (const raw of [
      { numberId: "not-a-uuid" },
      { calendarId: 7 },
      { callingHours: { days: [], startMinute: 0, endMinute: 600 } },
      { callingHours: { days: [1], startMinute: 600, endMinute: 610 } },
      { timeZone: "Mars/Olympus" },
      { reminderOffsetMinutes: 5 },
      { existingMeetings: "everything" },
      { capabilities: { scheduling: "yes", reminders: true } },
      [],
    ]) {
      assert.throws(() => parseFollowUpDraft(raw), BadRequestException);
    }
  });

  it("keeps entry sources bounded", () => {
    assert.equal(parseEntrySource("meeting_booked"), "meeting_booked");
    assert.equal(parseEntrySource("https://example.com"), null);
  });
});

describe("reminder coverage of an adopted policy", () => {
  const adoptedAt = new Date("2026-11-11T12:00:00Z");
  const before = { id: "m-old", createdAt: new Date("2026-11-10T12:00:00Z") };
  const after = { id: "m-new", createdAt: new Date("2026-11-11T13:00:00Z") };

  it("keeps a legacy policy covering every meeting", () => {
    assert.equal(
      policyCoversMeeting({ coversMeetingsFrom: null }, before),
      true,
    );
  });

  it("covers new bookings, and older ones only when explicitly included", () => {
    const policy = { coversMeetingsFrom: adoptedAt, includedMeetingIds: [] };
    assert.equal(policyCoversMeeting(policy, after), true);
    assert.equal(policyCoversMeeting(policy, before), false);
    assert.equal(
      policyCoversMeeting({ ...policy, includedMeetingIds: ["m-old"] }, before),
      true,
    );
  });
});
