/// <reference types="node" />

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  CalendarService,
  MAX_MEETING_DURATION_MINUTES,
} from "./calendar.service";

interface StubRule {
  daysOfWeek: number[];
  startMinute: number;
  endMinute: number;
  capacity: number | null;
}

interface StubCalendar {
  id: string;
  name: string;
  timezone: string;
  isDefault: boolean;
  archivedAt: Date | null;
  calendarIntegrationId: string | null;
  externalCalendarId: string | null;
}

const GLOBAL_CALENDAR: StubCalendar = {
  id: "cal-global",
  name: "Global calendar",
  timezone: "UTC",
  isDefault: true,
  archivedAt: null,
  calendarIntegrationId: null,
  externalCalendarId: null,
};

function build(
  busy: Array<{ start: Date; end: Date }> = [],
  rules: StubRule[] = [],
  options: {
    calendars?: StubCalendar[];
    /** Windows keyed by calendar id; falls back to `rules` for any other. */
    rulesByCalendar?: Record<string, StubRule[]>;
    /** Busy meetings keyed by calendar id; falls back to `busy`. */
    busyByCalendar?: Record<string, Array<{ start: Date; end: Date }>>;
  } = {},
): {
  service: CalendarService;
  windows: Array<{ start: Date; end: Date }>;
  scopes: Array<{ calendarId: string; isDefault: boolean }>;
  savedRules: StubRule[];
  savedCalendarIds: string[];
} {
  const windows: Array<{ start: Date; end: Date }> = [];
  const scopes: Array<{ calendarId: string; isDefault: boolean }> = [];
  const savedRules: StubRule[] = [];
  const savedCalendarIds: string[] = [];
  const calendars = options.calendars ?? [GLOBAL_CALENDAR];

  const service = new CalendarService(
    {
      findByUserOrOrg: async () => [],
      findByIdForOwner: async () => null,
    } as never,
    {
      findBusySlots: async (
        _ctx: unknown,
        scope: { calendarId: string; isDefault: boolean },
        start: Date,
        end: Date,
      ) => {
        windows.push({ start, end });
        scopes.push(scope);
        return options.busyByCalendar?.[scope.calendarId] ?? busy;
      },
    } as never,
    {
      list: async (_ctx: unknown, calendarId: string) =>
        options.rulesByCalendar?.[calendarId] ?? rules,
      replace: async (
        _ctx: unknown,
        calendarId: string,
        nextRules: StubRule[],
      ) => {
        savedCalendarIds.push(calendarId);
        savedRules.push(...nextRules);
        return nextRules.map((rule, index) => ({
          ...rule,
          id: `rule-${index + 1}`,
          userId: "user-1",
          organizationId: "org-1",
          calendarId,
          createdAt: new Date(),
          updatedAt: new Date(),
        }));
      },
    } as never,
    {
      ensureDefault: async () =>
        calendars.find((calendar) => calendar.isDefault) ?? GLOBAL_CALENDAR,
      findDefault: async () =>
        calendars.find((calendar) => calendar.isDefault) ?? GLOBAL_CALENDAR,
      findByIdForOwner: async (_ctx: unknown, id: string) =>
        calendars.find((calendar) => calendar.id === id) ?? null,
      list: async () => calendars,
      create: async () => calendars[0],
      update: async () => calendars[0],
      countAgentsByCalendar: async () => new Map<string, number>(),
      listAgentsUsingCalendar: async () => [],
    } as never,
    {} as never,
  );

  return { service, windows, scopes, savedRules, savedCalendarIds };
}

describe("CalendarService Ringee availability", () => {
  it("uses Ringee meetings without calling an external calendar", async () => {
    const { service, windows } = build([
      {
        start: new Date("2099-01-05T09:30:00.000Z"),
        end: new Date("2099-01-05T10:00:00.000Z"),
      },
    ]);

    const slots = await service.getBookableSlots(
      { userId: "user-1", organizationId: "org-1" },
      {
        date: "2099-01-05",
        timeZone: "UTC",
        durationMinutes: 30,
      },
    );

    assert.deepEqual(windows, [
      {
        start: new Date("2099-01-05T09:00:00.000Z"),
        end: new Date("2099-01-05T18:00:00.000Z"),
      },
    ]);
    assert.equal(
      slots.some((slot) => slot.start === "2099-01-05T09:30:00.000Z"),
      false,
    );
    assert.equal(slots[0]?.start, "2099-01-05T09:00:00.000Z");
  });

  it("blocks every slot that overlaps a Ringee meeting", async () => {
    const { service } = build([
      {
        start: new Date("2099-01-05T09:15:00.000Z"),
        end: new Date("2099-01-05T10:15:00.000Z"),
      },
    ]);

    const slots = await service.getBookableSlots(
      { userId: "user-1" },
      {
        date: "2099-01-05",
        timeZone: "UTC",
        durationMinutes: 30,
      },
    );

    assert.equal(
      slots.some((slot) => slot.start === "2099-01-05T09:00:00.000Z"),
      false,
    );
    assert.equal(
      slots.some((slot) => slot.start === "2099-01-05T09:30:00.000Z"),
      false,
    );
    assert.equal(
      slots.some((slot) => slot.start === "2099-01-05T10:00:00.000Z"),
      false,
    );
    assert.equal(
      slots.some((slot) => slot.start === "2099-01-05T10:30:00.000Z"),
      true,
    );
  });

  it("keeps a configured minute-precise slot open until its capacity is full", async () => {
    const date = "2099-01-05";
    const weekday = new Date(`${date}T12:00:00.000Z`).getUTCDay();
    const rule = {
      daysOfWeek: [weekday],
      startMinute: 8 * 60 + 20,
      endMinute: 9 * 60 + 20,
      capacity: 2,
    };
    const { service } = build(
      [
        {
          start: new Date("2099-01-05T08:20:00.000Z"),
          end: new Date("2099-01-05T08:50:00.000Z"),
        },
      ],
      [rule],
    );

    const slots = await service.getBookableSlots(
      { userId: "user-1", organizationId: "org-1" },
      { date, timeZone: "UTC", durationMinutes: 30 },
    );

    assert.deepEqual(
      slots.map((slot) => ({
        start: slot.start,
        capacity: slot.capacity,
        remaining: slot.remainingCapacity,
      })),
      [
        {
          start: "2099-01-05T08:20:00.000Z",
          capacity: 2,
          remaining: 1,
        },
        {
          start: "2099-01-05T08:50:00.000Z",
          capacity: 2,
          remaining: 2,
        },
      ],
    );
  });

  it("hides a configured slot once its simultaneous capacity is full", async () => {
    const date = "2099-01-05";
    const weekday = new Date(`${date}T12:00:00.000Z`).getUTCDay();
    const { service } = build(
      [
        {
          start: new Date("2099-01-05T08:20:00.000Z"),
          end: new Date("2099-01-05T08:50:00.000Z"),
        },
        {
          start: new Date("2099-01-05T08:20:00.000Z"),
          end: new Date("2099-01-05T08:50:00.000Z"),
        },
      ],
      [
        {
          daysOfWeek: [weekday],
          startMinute: 8 * 60 + 20,
          endMinute: 8 * 60 + 50,
          capacity: 2,
        },
      ],
    );

    const slots = await service.getBookableSlots(
      { userId: "user-1", organizationId: "org-1" },
      { date, timeZone: "UTC", durationMinutes: 30 },
    );

    assert.deepEqual(slots, []);
  });

  it("does not close an unlimited slot because of overlapping meetings", async () => {
    const date = "2099-01-05";
    const weekday = new Date(`${date}T12:00:00.000Z`).getUTCDay();
    const { service } = build(
      [
        {
          start: new Date("2099-01-05T14:20:00.000Z"),
          end: new Date("2099-01-05T14:50:00.000Z"),
        },
      ],
      [
        {
          daysOfWeek: [weekday],
          startMinute: 14 * 60 + 20,
          endMinute: 14 * 60 + 50,
          capacity: null,
        },
      ],
    );

    const [slot] = await service.getBookableSlots(
      { userId: "user-1", organizationId: "org-1" },
      { date, timeZone: "UTC", durationMinutes: 30 },
    );

    assert.equal(slot?.start, "2099-01-05T14:20:00.000Z");
    assert.equal(slot?.capacity, null);
    assert.equal(slot?.remainingCapacity, null);
  });

  it("rejects invalid or excessive slot durations before generating slots", async () => {
    const { service, windows } = build();
    const ctx = { userId: "user-1", organizationId: "org-1" };

    for (const durationMinutes of [
      0,
      -1,
      0.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      MAX_MEETING_DURATION_MINUTES + 1,
    ]) {
      await assert.rejects(
        () =>
          service.getBookableSlots(ctx, {
            date: "2099-01-05",
            timeZone: "UTC",
            durationMinutes,
          }),
        /Meeting length must be a whole number/,
      );
    }

    assert.deepEqual(windows, []);
  });

  it("skips a rule with a nonexistent DST-forward boundary", async () => {
    const { service, windows } = build(
      [],
      [
        {
          daysOfWeek: [0],
          startMinute: 2 * 60,
          endMinute: 3 * 60,
          capacity: 1,
        },
      ],
    );

    const slots = await service.getBookableSlots(
      { userId: "user-1", organizationId: "org-1" },
      {
        date: "2027-03-14",
        timeZone: "America/New_York",
        durationMinutes: 30,
      },
    );

    assert.deepEqual(slots, []);
    assert.deepEqual(windows, []);
  });

  it("normalizes and saves minute-precise availability windows", async () => {
    const { service, savedRules } = build();

    const saved = await service.updateAvailabilitySettings(
      { userId: "user-1", organizationId: "org-1" },
      [
        {
          daysOfWeek: [5, 1, 1, 3],
          startTime: "08:20",
          endTime: "09:20",
          capacity: null,
        },
      ],
    );

    assert.deepEqual(savedRules, [
      {
        daysOfWeek: [1, 3, 5],
        startMinute: 500,
        endMinute: 560,
        capacity: null,
      },
    ]);
    assert.deepEqual(saved.windows[0], {
      id: "rule-1",
      daysOfWeek: [1, 3, 5],
      startTime: "08:20",
      endTime: "09:20",
      capacity: null,
    });
  });

  it("rejects overlapping windows on any shared day", async () => {
    const { service, savedRules } = build();

    await assert.rejects(
      () =>
        service.updateAvailabilitySettings(
          { userId: "user-1", organizationId: "org-1" },
          [
            {
              daysOfWeek: [1],
              startTime: "08:20",
              endTime: "09:20",
              capacity: 2,
            },
            {
              daysOfWeek: [1, 2],
              startTime: "09:00",
              endTime: "10:00",
              capacity: 3,
            },
          ],
        ),
      /cannot overlap/,
    );
    assert.deepEqual(savedRules, []);
  });
});

describe("CalendarService multiple calendars", () => {
  const ctx = { userId: "user-1", organizationId: "org-1" };
  const salesCalendar: StubCalendar = {
    id: "cal-sales",
    name: "Sales",
    timezone: "America/New_York",
    isDefault: false,
    archivedAt: null,
    calendarIntegrationId: null,
    externalCalendarId: null,
  };

  it("reads the global calendar when no calendar is named", async () => {
    const { service, scopes } = build();

    await service.getBookableSlots(ctx, {
      date: "2099-01-05",
      timeZone: "UTC",
      durationMinutes: 30,
    });

    assert.deepEqual(scopes, [{ calendarId: "cal-global", isDefault: true }]);
  });

  it("scopes availability to the named calendar", async () => {
    const { service, scopes } = build([], [], {
      calendars: [GLOBAL_CALENDAR, salesCalendar],
    });

    await service.getBookableSlots(ctx, {
      date: "2099-01-05",
      timeZone: "UTC",
      durationMinutes: 30,
      calendarId: "cal-sales",
    });

    assert.deepEqual(scopes, [{ calendarId: "cal-sales", isDefault: false }]);
  });

  it("keeps two calendars' availability independent", async () => {
    const date = "2099-01-05";
    const weekday = new Date(`${date}T12:00:00.000Z`).getUTCDay();
    const window = {
      daysOfWeek: [weekday],
      startMinute: 14 * 60,
      endMinute: 14 * 60 + 30,
      capacity: 1,
    };
    const { service } = build([], [], {
      calendars: [GLOBAL_CALENDAR, salesCalendar],
      rulesByCalendar: { "cal-global": [window], "cal-sales": [window] },
      // The global calendar's only slot is taken; the other calendar's is not.
      busyByCalendar: {
        "cal-global": [
          {
            start: new Date("2099-01-05T14:00:00.000Z"),
            end: new Date("2099-01-05T14:30:00.000Z"),
          },
        ],
        "cal-sales": [],
      },
    });

    const globalSlots = await service.getBookableSlots(ctx, {
      date,
      timeZone: "UTC",
      durationMinutes: 30,
    });
    const salesSlots = await service.getBookableSlots(ctx, {
      date,
      timeZone: "UTC",
      durationMinutes: 30,
      calendarId: "cal-sales",
    });

    assert.deepEqual(globalSlots, []);
    assert.equal(salesSlots[0]?.start, "2099-01-05T14:00:00.000Z");
  });

  it("reads a calendar's own time zone when the caller names none", async () => {
    const date = "2099-01-05";
    const weekday = new Date(`${date}T12:00:00.000Z`).getUTCDay();
    const { service } = build([], [], {
      calendars: [GLOBAL_CALENDAR, salesCalendar],
      rulesByCalendar: {
        "cal-sales": [
          {
            daysOfWeek: [weekday],
            startMinute: 9 * 60,
            endMinute: 9 * 60 + 30,
            capacity: 1,
          },
        ],
      },
    });

    const [slot] = await service.getBookableSlots(ctx, {
      date,
      durationMinutes: 30,
      calendarId: "cal-sales",
    });

    // 09:00 in America/New_York on that date is 14:00 UTC.
    assert.equal(slot?.start, "2099-01-05T14:00:00.000Z");
  });

  it("refuses to book against an archived calendar instead of falling back", async () => {
    const { service } = build([], [], {
      calendars: [
        GLOBAL_CALENDAR,
        { ...salesCalendar, archivedAt: new Date("2099-01-01T00:00:00.000Z") },
      ],
    });

    await assert.rejects(
      () => service.resolveCalendar(ctx, { calendarId: "cal-sales" }),
      /archived/,
    );
  });

  it("rejects a calendar id from another workspace", async () => {
    const { service } = build();

    await assert.rejects(
      () => service.resolveCalendar(ctx, { calendarId: "cal-someone-else" }),
      /Calendar not found/,
    );
  });

  it("refuses to archive the global calendar", async () => {
    const { service } = build();

    await assert.rejects(
      () => service.setCalendarArchived(ctx, "cal-global", true),
      /global calendar cannot be archived/,
    );
  });

  it("writes availability windows to the calendar they belong to", async () => {
    const { service, savedCalendarIds } = build([], [], {
      calendars: [GLOBAL_CALENDAR, salesCalendar],
    });

    await service.updateAvailabilitySettings(
      ctx,
      [
        {
          daysOfWeek: [1],
          startTime: "08:00",
          endTime: "09:00",
          capacity: 1,
        },
      ],
      "cal-sales",
    );

    assert.deepEqual(savedCalendarIds, ["cal-sales"]);
  });

  it("has no external destination when the calendar has no connection", async () => {
    const { service } = build();

    const resolved = await service.resolveCalendar(ctx);

    assert.equal(resolved.destination, null);
    assert.equal(resolved.timezone, "UTC");
  });
});

describe("CalendarService.moveExternalEvent (CAL-002)", () => {
  const ctx = { userId: "user-1", organizationId: "org-1" };
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  const MEETING = {
    id: "meeting-1",
    scheduledAt: new Date("2099-01-06T16:00:00.000Z"),
    duration: 30,
    // A move marks it pending in its own transaction.
    externalSyncStatus: "pending",
    externalEventId: "event-1",
    externalCalendarIntegrationId: "integration-1",
    externalCalendarTargetId: "team@group.calendar.google.com",
  };

  function moveBuild(
    integration: Record<string, unknown> | null,
    options: {
      response?: { ok: boolean; status: number };
      /** What each conditional "synced" write answers, in turn. */
      applied?: boolean[];
      /** The meeting as read again after a write that did not apply. */
      latest?: Record<string, unknown>;
    } = {},
  ) {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const recorded: Array<Record<string, unknown>> = [];
    const moves: Array<Record<string, unknown>> = [];
    const applied = [...(options.applied ?? [true])];
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      requests.push({ url, init });
      return {
        ...(options.response ?? { ok: true, status: 200 }),
        json: async () => ({}),
      };
    }) as unknown as typeof fetch;
    const service = new CalendarService(
      { findByIdForOwner: async () => integration } as never,
      {
        recordExternalSync: async (
          _id: string,
          result: Record<string, unknown>,
        ) => {
          recorded.push(result);
          return {};
        },
        recordExternalMove: async (
          _id: string,
          move: Record<string, unknown>,
        ) => {
          moves.push(move);
          return applied.shift() ?? true;
        },
        findById: async () => options.latest ?? null,
      } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, requests, recorded, moves };
  }

  const google = {
    id: "integration-1",
    provider: "google",
    accessToken: "token",
    expiresAt: null,
    calendarId: null,
  };

  it("moves a Google event to the meeting's time and tells its attendees", async () => {
    const { service, requests, recorded, moves } = moveBuild(google);

    const result = await service.moveExternalEvent(ctx, MEETING as never);

    assert.equal(result.status, "synced");
    assert.equal(requests.length, 1);
    assert.equal(
      requests[0]!.url,
      "https://www.googleapis.com/calendar/v3/calendars/team%40group.calendar.google.com/events/event-1?sendUpdates=all",
    );
    assert.equal(requests[0]!.init.method, "PATCH");
    assert.deepEqual(JSON.parse(String(requests[0]!.init.body)), {
      start: { dateTime: "2099-01-06T16:00:00.000Z" },
      end: { dateTime: "2099-01-06T16:30:00.000Z" },
    });
    // Synced only for the time that was applied, in the account and
    // calendar the event lives in.
    assert.deepEqual(moves, [
      {
        scheduledAt: MEETING.scheduledAt,
        duration: 30,
        externalEventId: "event-1",
        integrationId: "integration-1",
        targetCalendarId: "team@group.calendar.google.com",
      },
    ]);
    assert.deepEqual(recorded, []);
  });

  it("moves a Microsoft event by its id", async () => {
    const { service, requests } = moveBuild({
      ...google,
      provider: "microsoft",
    });
    await service.moveExternalEvent(ctx, MEETING as never);
    assert.equal(
      requests[0]!.url,
      "https://graph.microsoft.com/v1.0/me/events/event-1",
    );
    assert.equal(requests[0]!.init.method, "PATCH");
    assert.deepEqual(JSON.parse(String(requests[0]!.init.body)), {
      start: { dateTime: "2099-01-06T16:00:00.000Z", timeZone: "UTC" },
      end: { dateTime: "2099-01-06T16:30:00.000Z", timeZone: "UTC" },
    });
  });

  it("has nothing to move without an event, or with one that already follows the meeting", async () => {
    for (const meeting of [
      { ...MEETING, externalEventId: null },
      { ...MEETING, externalSyncStatus: "synced" },
    ]) {
      const { service, requests, recorded } = moveBuild(google);
      await service.moveExternalEvent(ctx, meeting as never);
      assert.deepEqual(requests, []);
      assert.deepEqual(recorded, []);
    }
  });

  // Two moves close together: the first one's time must not be recorded as
  // synced over the second's.
  it("applies the latest time when the meeting moved again meanwhile", async () => {
    const LATER = new Date("2099-01-07T10:00:00.000Z");
    const { service, requests, moves } = moveBuild(google, {
      applied: [false, true],
      latest: { ...MEETING, scheduledAt: LATER },
    });
    const result = await service.moveExternalEvent(ctx, MEETING as never);
    assert.equal(result.status, "synced");
    assert.deepEqual(
      requests.map(
        (request) => JSON.parse(String(request.init.body)).start.dateTime,
      ),
      ["2099-01-06T16:00:00.000Z", "2099-01-07T10:00:00.000Z"],
    );
    assert.deepEqual(
      moves.map((move) => move.scheduledAt),
      [MEETING.scheduledAt, LATER],
    );
  });

  it("records a failure on the meeting, and keeps the account it was created in", async () => {
    const refused = moveBuild(google, {
      response: { ok: false, status: 404 },
    });
    const result = await refused.service.moveExternalEvent(
      ctx,
      MEETING as never,
    );
    assert.equal(result.status, "failed");
    assert.equal(refused.recorded[0]!.status, "failed");
    assert.equal(refused.recorded[0]!.integrationId, "integration-1");
    assert.deepEqual(refused.moves, []);

    // Disconnected since: nothing is sent, and reconnecting can retry it.
    const disconnected = moveBuild(null);
    await disconnected.service.moveExternalEvent(ctx, MEETING as never);
    assert.deepEqual(disconnected.requests, []);
    assert.equal(disconnected.recorded[0]!.status, "failed");
    assert.equal(disconnected.recorded[0]!.integrationId, "integration-1");
  });

  // A first attempt reached Google but Ringee never saw it, and the meeting
  // moved before the retry: the event found must not stay at the old time.
  it("moves an event a retried push finds at the meeting's old time", async () => {
    const OLD = new Date("2099-01-05T15:00:00.000Z");
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      requests.push({ url, init });
      if (init?.method === "POST") return { ok: false, status: 409 };
      if (!init?.method) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: "ringeeevent",
            start: { dateTime: OLD.toISOString() },
            end: {
              dateTime: new Date(OLD.getTime() + 30 * 60_000).toISOString(),
            },
          }),
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    }) as unknown as typeof fetch;
    const recorded: Array<Record<string, unknown>> = [];
    const service = new CalendarService(
      { findByIdForOwner: async () => google } as never,
      {
        markExternalSyncPending: async () => true,
        recordExternalSync: async (
          _id: string,
          result: Record<string, unknown>,
        ) => {
          recorded.push(result);
          return {};
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.syncMeetingToExternalCalendar(
      ctx,
      {
        ...MEETING,
        externalEventId: null,
        externalSyncStatus: "failed",
      } as never,
      {
        destination: {
          integrationId: "integration-1",
          externalCalendarId: null,
        },
      },
    );

    assert.equal(result.status, "synced");
    const patch = requests.find((request) => request.init?.method === "PATCH");
    assert.ok(patch, "the event found is moved");
    assert.deepEqual(JSON.parse(String(patch.init!.body)), {
      start: { dateTime: "2099-01-06T16:00:00.000Z" },
      end: { dateTime: "2099-01-06T16:30:00.000Z" },
    });
    assert.equal(recorded[0]!.status, "synced");
    assert.equal(recorded[0]!.externalEventId, "ringeeevent");
  });
});
