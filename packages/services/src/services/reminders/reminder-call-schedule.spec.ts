/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_CALLING_WINDOW,
  isWithinCallingWindow,
  planReminderCallAt,
  readCallingWindow,
} from "./reminder-call-schedule";

/**
 * When a reminder call rings (AGENT-019). The rule a person reads in the rail
 * is "24 hours before" — these pin what happens when that moment is at night,
 * on a weekend the window skips, across a clock change, or already gone.
 */

const NY = "America/New_York";
const MADRID = "Europe/Madrid";
const LONG_AGO = new Date("2026-01-01T00:00:00Z");

describe("planReminderCallAt", () => {
  it("calls exactly at the offset when that moment is inside the window", () => {
    // Wed 2026-10-14 15:00 New York (EDT, UTC-4) → 24 h before is Tue 15:00.
    const at = planReminderCallAt({
      meetingAt: new Date("2026-10-14T19:00:00Z"),
      offsetMinutes: 24 * 60,
      window: DEFAULT_CALLING_WINDOW,
      timeZone: NY,
      notBefore: LONG_AGO,
    });
    assert.equal(at?.toISOString(), "2026-10-13T19:00:00.000Z");
  });

  it("pulls a reminder that would ring after hours to before the window's close", () => {
    // Meeting Wed 2026-10-14 23:30 NY; 2 h before is 21:30 — after 20:00.
    const at = planReminderCallAt({
      meetingAt: new Date("2026-10-15T03:30:00Z"),
      offsetMinutes: 120,
      window: DEFAULT_CALLING_WINDOW,
      timeZone: NY,
      notBefore: LONG_AGO,
    });
    // 19:30 NY the same day: half an hour for a late tick, a retry or a
    // deferral to still land inside the window.
    assert.equal(at?.toISOString(), "2026-10-14T23:30:00.000Z");
  });

  it("pulls a reminder that would ring before the window opens to the previous evening", () => {
    // Meeting Wed 2026-10-14 08:00 NY; 24 h before is Tue 08:00 — before 09:00.
    const at = planReminderCallAt({
      meetingAt: new Date("2026-10-14T12:00:00Z"),
      offsetMinutes: 24 * 60,
      window: DEFAULT_CALLING_WINDOW,
      timeZone: NY,
      notBefore: LONG_AGO,
    });
    // Mon 2026-10-12 19:30 NY.
    assert.equal(at?.toISOString(), "2026-10-12T23:30:00.000Z");
  });

  it("skips the days the window does not call on", () => {
    // Window Mon–Fri. Meeting Mon 2026-10-19 10:00 NY; 24 h before is Sunday.
    const at = planReminderCallAt({
      meetingAt: new Date("2026-10-19T14:00:00Z"),
      offsetMinutes: 24 * 60,
      window: {
        startMinute: 9 * 60,
        endMinute: 18 * 60,
        days: [1, 2, 3, 4, 5],
      },
      timeZone: NY,
      notBefore: LONG_AGO,
    });
    // Friday 2026-10-16 17:30 NY.
    assert.equal(at?.toISOString(), "2026-10-16T21:30:00.000Z");
  });

  it("never pulls a reminder to before a short window opens", () => {
    // Window 09:00–09:20 only — shorter than the slack before its close.
    // Meeting Wed 2026-10-14 12:00 NY; 1 h before is 11:00, after the close.
    const at = planReminderCallAt({
      meetingAt: new Date("2026-10-14T16:00:00Z"),
      offsetMinutes: 60,
      window: { startMinute: 9 * 60, endMinute: 9 * 60 + 20, days: [3] },
      timeZone: NY,
      notBefore: LONG_AGO,
    });
    // Wed 09:00 NY, the moment it opens.
    assert.equal(at?.toISOString(), "2026-10-14T13:00:00.000Z");
  });

  it("lands on the right instant across a daylight-saving change", () => {
    // Madrid moves to CEST at 02:00 on Sun 2026-03-29. Meeting Mon 30 at
    // 08:00 CEST (06:00Z): 24 h before is Sun 08:00 CEST — before 09:00 — so
    // the call is pulled to Sat 28 at 19:30 CET (18:30Z), an hour apart in UTC
    // from what the same wall clock means a day later.
    const at = planReminderCallAt({
      meetingAt: new Date("2026-03-30T06:00:00Z"),
      offsetMinutes: 24 * 60,
      window: DEFAULT_CALLING_WINDOW,
      timeZone: MADRID,
      notBefore: LONG_AGO,
    });
    assert.equal(at?.toISOString(), "2026-03-28T18:30:00.000Z");
  });

  it("never plans an offset that has already passed", () => {
    const meetingAt = new Date("2026-10-14T19:00:00Z");
    const at = planReminderCallAt({
      meetingAt,
      offsetMinutes: 24 * 60,
      window: DEFAULT_CALLING_WINDOW,
      timeZone: NY,
      // Activated three hours before the meeting: 24 h before is long gone.
      notBefore: new Date("2026-10-14T16:00:00Z"),
    });
    assert.equal(at, null);
  });

  it("does not pull a reminder into the past to fit the window", () => {
    // 2 h before a 08:30 meeting is 06:30, pulled to 19:30 the evening before —
    // but the policy was only switched on at 22:00 that evening.
    const at = planReminderCallAt({
      meetingAt: new Date("2026-10-14T12:30:00Z"),
      offsetMinutes: 120,
      window: DEFAULT_CALLING_WINDOW,
      timeZone: NY,
      notBefore: new Date("2026-10-14T02:00:00Z"),
    });
    assert.equal(at, null);
  });
});

describe("isWithinCallingWindow", () => {
  it("treats the end of the window as closed", () => {
    // 20:00 NY exactly.
    assert.equal(
      isWithinCallingWindow(
        new Date("2026-10-14T00:00:00Z"),
        DEFAULT_CALLING_WINDOW,
        NY,
      ),
      false,
    );
    // 19:59 NY.
    assert.equal(
      isWithinCallingWindow(
        new Date("2026-10-13T23:59:00Z"),
        DEFAULT_CALLING_WINDOW,
        NY,
      ),
      true,
    );
  });
});

describe("readCallingWindow", () => {
  it("falls back to the default for a window that could never ring", () => {
    assert.deepEqual(
      readCallingWindow({
        windowStartMinute: 600,
        windowEndMinute: 540,
        windowDays: [1],
      }),
      DEFAULT_CALLING_WINDOW,
    );
    assert.deepEqual(
      readCallingWindow({
        windowStartMinute: 540,
        windowEndMinute: 1020,
        windowDays: [],
      }),
      DEFAULT_CALLING_WINDOW,
    );
  });
});
