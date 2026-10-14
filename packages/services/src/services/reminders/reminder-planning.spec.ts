/// <reference types="node" />
import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { apiConfiguration } from "@ringee/configuration";
import { ReminderService } from "./reminder.service";
import {
  planReminderCallAt,
  DEFAULT_CALLING_WINDOW,
} from "./reminder-call-schedule";

type Row = Record<string, any>;

describe("reminder planning regressions", () => {
  it("plans and previews every page, including meetings beyond the old 1000-row limit", async () => {
    apiConfiguration.AI_VOICE_AGENT_AUTOMATIONS_ORG_IDS = ["org"];
    const rows = Array.from({ length: 1001 }, (_, n) => ({
      id: String(n).padStart(5, "0"),
      organizationId: "org",
      userId: "user",
      scheduleVersion: 1,
      attendanceStatus: "pending",
      scheduledAt: new Date("2030-10-15T15:00:00Z"),
    }));
    const planned: Row[] = [];
    const service = new ReminderService(
      {} as never,
      {} as never,
      {} as never,
      {
        listUpcomingOnCalendars: async (_ctx: Row, input: Row) =>
          rows
            .filter(
              (row) => !input.afterCursor || row.id > input.afterCursor.id,
            )
            .slice(0, input.take),
      } as never,
      {} as never,
      [],
      {
        findByIdForOwner: async () => ({
          id: "calendar",
          isDefault: true,
          timezone: "UTC",
        }),
      } as never,
      { findForCalendar: async () => null } as never,
      {
        listUsedOffsets: async () => [],
        createMany: async (input: Row[]) => {
          planned.push(...input);
          return input.length;
        },
      } as never,
    );
    const ctx = { userId: "user", organizationId: "org" };
    const count = await service.planPolicyCalls(ctx, {
      id: "policy",
      calendarId: "calendar",
      userId: "user",
      agentId: "agent",
      version: 1,
      enabled: true,
      activatedAt: new Date("2026-01-01"),
      offsetsMinutes: [60],
      windowDays: DEFAULT_CALLING_WINDOW.days,
      windowStartMinute: 540,
      windowEndMinute: 1200,
    } as never);
    assert.equal(count, 1001);
    assert.equal(new Set(planned.map((row) => row.meetingId)).size, 1001);
    const preview = await service.previewPolicyCalls(ctx, {
      calendarIds: ["calendar"],
      offsetMinutes: 60,
    });
    assert.deepEqual(preview, { meetings: 1001, calls: 1001 });
  });

  it("leaves execution slack for the shortest accepted offset and old shorter policies", () => {
    const meetingAt = new Date("2030-10-15T15:00:00Z");
    for (const offsetMinutes of [5, 10, 15]) {
      const fireAt = planReminderCallAt({
        meetingAt,
        offsetMinutes,
        window: DEFAULT_CALLING_WINDOW,
        timeZone: "UTC",
        notBefore: new Date("2030-10-15T13:00:00Z"),
      });
      assert.equal(fireAt?.toISOString(), "2030-10-15T14:40:00.000Z");
      assert(meetingAt.getTime() - (fireAt!.getTime() + 60_000) >= 15 * 60_000);
    }
  });
});
