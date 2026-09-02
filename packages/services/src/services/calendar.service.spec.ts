/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CalendarService } from "./calendar.service";

function build(busy: Array<{ start: Date; end: Date }> = []): {
  service: CalendarService;
  windows: Array<{ start: Date; end: Date }>;
} {
  const windows: Array<{ start: Date; end: Date }> = [];
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
  );

  return { service, windows };
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
});
