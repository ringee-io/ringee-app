/// <reference types="node" />

import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_CALLING_WINDOW,
  isWithinCallingWindow,
  nextCallingWindowMoment,
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
  it("allows a close four-hour pilot meeting only inside the window with twenty minutes left", () => {
    const params = {
      offsetMinutes: 240,
      timeZone: NY,
      window: DEFAULT_CALLING_WINDOW,
      notBefore: new Date("2026-11-05T13:00:00Z"),
      allowNearMeeting: true,
    };
    assert.equal(
      planReminderCallAt({
        ...params,
        meetingAt: new Date("2026-11-05T15:00:00Z"),
      })?.toISOString(),
      "2026-11-05T14:00:00.000Z",
    );
    // Exactly twenty minutes is still allowed; nineteen is not.
    assert.equal(
      planReminderCallAt({
        ...params,
        meetingAt: new Date("2026-11-05T14:20:00Z"),
      })?.toISOString(),
      "2026-11-05T14:00:00.000Z",
    );
    assert.equal(
      planReminderCallAt({
        ...params,
        meetingAt: new Date("2026-11-05T14:19:00Z"),
      }),
      null,
    );
    // 12:05 planned at 08:00: its moment (08:05) is before the window opens
    // and pulling it earlier lands before planning — the 09:00 window takes it.
    assert.equal(
      planReminderCallAt({
        ...params,
        meetingAt: new Date("2026-11-05T17:05:00Z"),
      })?.toISOString(),
      "2026-11-05T14:00:00.000Z",
    );
    assert.equal(
      planReminderCallAt({
        ...params,
        meetingAt: new Date("2026-11-05T17:05:00Z"),
        allowNearMeeting: false,
      }),
      null,
    );
    assert.equal(
      planReminderCallAt({
        ...params,
        meetingAt: new Date("2026-11-05T15:00:00Z"),
        allowNearMeeting: false,
      }),
      null,
    );
  });

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

/**
 * When a recovery call for a handoff request may ring (AGENT-021): never at
 * night, and never in the last half hour before the window closes.
 */
describe("nextCallingWindowMoment", () => {
  it("is the moment itself when that is inside the window", () => {
    // Tue 2026-11-03 12:00 Madrid (CET, UTC+1).
    const at = new Date("2026-11-03T11:00:00Z");
    assert.equal(
      nextCallingWindowMoment(
        at,
        DEFAULT_CALLING_WINDOW,
        MADRID,
      )?.toISOString(),
      at.toISOString(),
    );
  });

  it("waits for the next opening after hours", () => {
    // 22:30 Madrid → 09:00 the next morning.
    assert.equal(
      nextCallingWindowMoment(
        new Date("2026-11-03T21:30:00Z"),
        DEFAULT_CALLING_WINDOW,
        MADRID,
      )?.toISOString(),
      "2026-11-04T08:00:00.000Z",
    );
    // 07:00 Madrid → 09:00 the same day.
    assert.equal(
      nextCallingWindowMoment(
        new Date("2026-11-04T06:00:00Z"),
        DEFAULT_CALLING_WINDOW,
        MADRID,
      )?.toISOString(),
      "2026-11-04T08:00:00.000Z",
    );
  });

  it("does not start in the last half hour before the close", () => {
    // 19:45 Madrid is inside 09:00–20:00, but too close to its end.
    assert.equal(
      nextCallingWindowMoment(
        new Date("2026-11-03T18:45:00Z"),
        DEFAULT_CALLING_WINDOW,
        MADRID,
      )?.toISOString(),
      "2026-11-04T08:00:00.000Z",
    );
  });

  it("skips the days the window leaves out, and gives up on an empty window", () => {
    const weekdays = { ...DEFAULT_CALLING_WINDOW, days: [1, 2, 3, 4, 5] };
    // Sat 2026-11-07 10:00 New York → Mon 2026-11-09 09:00.
    assert.equal(
      nextCallingWindowMoment(
        new Date("2026-11-07T15:00:00Z"),
        weekdays,
        NY,
      )?.toISOString(),
      "2026-11-09T14:00:00.000Z",
    );
    assert.equal(
      nextCallingWindowMoment(
        new Date("2026-11-07T15:00:00Z"),
        { ...DEFAULT_CALLING_WINDOW, days: [] },
        NY,
      ),
      null,
    );
  });
});
