/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CalendarService,
  MAX_MEETING_DURATION_MINUTES,
} from "./calendar.service";

function build(
  busy: Array<{ start: Date; end: Date }> = [],
  rules: Array<{
    daysOfWeek: number[];
    startMinute: number;
    endMinute: number;
    capacity: number | null;
  }> = [],
): {
  service: CalendarService;
  windows: Array<{ start: Date; end: Date }>;
  savedRules: Array<{
    daysOfWeek: number[];
    startMinute: number;
    endMinute: number;
    capacity: number | null;
  }>;
} {
  const windows: Array<{ start: Date; end: Date }> = [];
  const savedRules: Array<{
    daysOfWeek: number[];
    startMinute: number;
    endMinute: number;
    capacity: number | null;
  }> = [];
  const service = new CalendarService(
    {
      findByUserOrOrg: async () => {
        throw new Error("External calendars must not be read for availability");
      },
    } as never,
    {
      findBusySlots: async (_ctx: unknown, start: Date, end: Date) => {
        windows.push({ start, end });
        return busy;
      },
    } as never,
    {
      list: async () => rules,
      replace: async (_ctx: unknown, nextRules: typeof savedRules) => {
        savedRules.push(...nextRules);
        return nextRules.map((rule, index) => ({
          ...rule,
          id: `rule-${index + 1}`,
          userId: "user-1",
          organizationId: "org-1",
          createdAt: new Date(),
          updatedAt: new Date(),
        }));
      },
    } as never,
  );

  return { service, windows, savedRules };
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
