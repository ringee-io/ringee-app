/// <reference types="node" />

import "reflect-metadata";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException } from "@nestjs/common";
import { OwedCallback } from "@ringee/database";
import { MyDayService } from "./my-day.service";

const NOW = new Date("2026-10-08T15:00:00.000Z");

function owed(id: string, phoneNumber: string): OwedCallback {
  return {
    id,
    scheduledAt: new Date("2026-10-08T10:00:00.000Z"),
    note: null,
    contact: {
      id: `contact-${id}`,
      name: null,
      phoneNumber,
      company: null,
      timezone: null,
      deletedAt: null,
    },
  };
}

function build(
  options: { callbacks?: OwedCallback[]; agentCallIds?: string[] } = {},
) {
  const scheduledTo: Date[] = [];
  const summaries: Array<{ start: Date; end: Date }> = [];
  const service = new MyDayService(
    {
      listOwedByUser: async (_owner: unknown, opts: { scheduledTo: Date }) => {
        scheduledTo.push(opts.scheduledTo);
        return options.callbacks ?? [];
      },
    } as never,
    { listMissedCallThreads: async () => [] } as never,
    { listOpenForCalling: async () => [] } as never,
    {
      findExistingIds: async (ids: string[]) =>
        new Set(ids.filter((id) => options.agentCallIds?.includes(id))),
    } as never,
    { latestOutboundTo: async () => [] } as never,
    { findListedPhones: async () => new Set<string>() } as never,
    {
      getMyDaySummary: async (
        _owner: unknown,
        range: { start: Date; end: Date },
      ) => {
        summaries.push(range);
        return {
          calls: 0,
          conversations: 0,
          meetingsBooked: 0,
          nextMeeting: null,
        };
      },
    } as never,
  );
  return { service, scheduledTo, summaries };
}

const ctx = { userId: "me", organizationId: "org-1" };

describe("MyDayService.getQueue", () => {
  it("leaves out the callbacks a voice agent will place itself", async () => {
    const { service } = build({
      callbacks: [owed("human", "+14155550101"), owed("agent", "+14155550102")],
      agentCallIds: ["agent"],
    });

    const queue = await service.getQueue(ctx, undefined, NOW);

    assert.deepEqual(
      queue.items.map((item) => item.reasons[0]),
      [
        {
          kind: "callback",
          callbackId: "human",
          at: new Date("2026-10-08T10:00:00.000Z"),
          note: null,
        },
      ],
    );
  });

  it("never reaches further than a day ahead, nor ends before now", async () => {
    const { service, scheduledTo } = build();

    await service.getQueue(ctx, new Date("2026-10-20T00:00:00.000Z"), NOW);
    await service.getQueue(ctx, new Date("2026-10-07T00:00:00.000Z"), NOW);
    await service.getQueue(ctx, new Date("2026-10-08T21:59:59.999Z"), NOW);

    assert.deepEqual(scheduledTo, [
      new Date("2026-10-10T03:00:00.000Z"),
      NOW,
      new Date("2026-10-08T21:59:59.999Z"),
    ]);
  });
});

describe("MyDayService.getSummary", () => {
  it("defaults to the UTC day", async () => {
    const { service, summaries } = build();

    await service.getSummary(ctx, undefined, NOW);

    assert.deepEqual(summaries, [
      {
        start: new Date("2026-10-08T00:00:00.000Z"),
        end: new Date("2026-10-08T23:59:59.999Z"),
      },
    ]);
  });

  it("refuses a range that is backwards or longer than a day", async () => {
    const { service } = build();

    await assert.rejects(
      service.getSummary(ctx, {
        from: new Date("2026-10-08T10:00:00.000Z"),
        to: new Date("2026-10-08T09:00:00.000Z"),
      }),
      BadRequestException,
    );
    await assert.rejects(
      service.getSummary(ctx, {
        from: new Date("2026-10-01T00:00:00.000Z"),
        to: new Date("2026-10-08T00:00:00.000Z"),
      }),
      BadRequestException,
    );
  });
});
