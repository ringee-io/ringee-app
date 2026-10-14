/// <reference types="node" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MeetingReminderExecutionRepository } from "./meeting-reminder-execution.repository";
import { MeetingEmailDeliveryRepository } from "./meeting-email-delivery.repository";
import { MeetingRepository } from "./meeting.repository";

type Row = Record<string, any>;
const now = new Date("2030-10-13T15:00:00Z");

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (value && typeof value === "object" && "gt" in value)
      return row[key] > value.gt;
    if (value && typeof value === "object" && "in" in value)
      return value.in.includes(row[key]);
    return row[key] === value;
  });
}

describe("reminder claim fencing and stable reservations", () => {
  it("a replaced worker cannot reserve, place, defer or finish the replacement's execution", async () => {
    const row: Row = {
      id: "execution",
      status: "claimed",
      claimToken: "new-worker",
      dialTries: 0,
      dialReservedAt: null,
      leaseExpiresAt: new Date(now.getTime() + 300_000),
    };
    const update = async ({ where, data }: Row) => {
      if (!matches(row, where)) return [];
      Object.assign(row, {
        ...data,
        dialTries: data.dialTries?.increment
          ? row.dialTries + data.dialTries.increment
          : row.dialTries,
      });
      return [{ ...row }];
    };
    const repository = new MeetingReminderExecutionRepository({
      meetingReminderExecution: {
        updateManyAndReturn: update,
        updateMany: async (input: Row) => ({
          count: (await update(input)).length,
        }),
        findFirst: async ({ where }: Row) =>
          matches(row, where) ? { ...row } : null,
      },
    } as never);
    assert.equal(
      await repository.beginDial(row.id, "old-worker", now, row.leaseExpiresAt),
      null,
    );
    assert.equal(
      await repository.markPlaced(row.id, "call", "old-worker"),
      false,
    );
    assert.equal(
      await repository.defer(row.id, now, "old", "old-worker"),
      false,
    );
    assert.equal(
      await repository.finish(row.id, "failed", ["claimed"], {}, "old-worker"),
      false,
    );
    const first = await repository.beginDial(
      row.id,
      "new-worker",
      now,
      row.leaseExpiresAt,
    );
    assert.equal(first?.dialTries, 1);
    row.claimToken = "third-worker";
    const recovered = await repository.beginDial(
      row.id,
      "third-worker",
      now,
      row.leaseExpiresAt,
    );
    assert.equal(
      recovered?.dialTries,
      1,
      "reclaiming a reserved dial must not create a second provider key",
    );
  });

  it("does not let an expired worker reserve a dial even before another worker claims it", async () => {
    const row = {
      id: "execution",
      status: "claimed",
      claimToken: "expired",
      leaseExpiresAt: new Date(now.getTime() - 1),
      dialReservedAt: null,
    };
    const repository = new MeetingReminderExecutionRepository({
      meetingReminderExecution: {
        updateManyAndReturn: async ({ where }: Row) =>
          matches(row, where) ? [row] : [],
        findFirst: async ({ where }: Row) => (matches(row, where) ? row : null),
      },
    } as never);
    assert.equal(
      await repository.beginDial(row.id, row.claimToken, now, now),
      null,
    );
  });
});

describe("attendance delivery recovery", () => {
  it("an address supplied by a repeated attendance answer requeues only its waiting delivery", async () => {
    const meeting: Row = {
      id: "meeting",
      userId: "user",
      organizationId: "org",
      status: "scheduled",
      scheduleVersion: 1,
      scheduledAt: new Date("2035-01-01"),
      attendanceStatus: "pending",
    };
    let delivery: Row | null = null;
    const tx = {
      $queryRaw: async () => [meeting],
      meeting: {
        update: async ({ data }: Row) => Object.assign(meeting, data),
      },
      meetingEmailDelivery: {
        createMany: async ({ data }: Row) => {
          delivery ??= { ...data[0], status: "pending", firstAttemptAt: null };
          return { count: 1 };
        },
        updateMany: async ({ where, data }: Row) => {
          if (delivery && matches(delivery, where))
            Object.assign(delivery, data);
          return { count: 1 };
        },
      },
    };
    const repository = new MeetingRepository({
      $transaction: async (fn: (tx: unknown) => unknown) => fn(tx),
    } as never);
    const input = {
      meetingId: "meeting",
      expectedScheduleVersion: 1,
      status: "confirmed",
      agentCallId: "call",
      email: { kind: "attendance_confirmed", idempotencyKey: "key" },
    } as const;
    await repository.recordAttendance(
      { userId: "user", organizationId: "org" },
      input,
    );
    const current = delivery as unknown as Row;
    current.status = "needs_email";
    await repository.recordAttendance(
      { userId: "user", organizationId: "org" },
      { ...input, leadEmail: "lead@example.test" },
    );
    assert.equal(meeting.leadEmail, "lead@example.test");
    assert.equal(current.status, "pending");
    current.status = "sent";
    await repository.recordAttendance(
      { userId: "user", organizationId: "org" },
      { ...input, leadEmail: "lead@example.test" },
    );
    assert.equal(current.status, "sent");
  });

  it("a stale email worker cannot overwrite a reclaimed delivery", async () => {
    const row: Row = {
      id: "delivery",
      status: "sending",
      claimToken: "replacement",
    };
    const repository = new MeetingEmailDeliveryRepository({
      meetingEmailDelivery: {
        updateMany: async ({ where, data }: Row) => {
          if (!matches(row, where)) return { count: 0 };
          Object.assign(row, data);
          return { count: 1 };
        },
      },
    } as never);
    assert.equal(
      await repository.release(row.id, "failed", "stale", "old-worker"),
      false,
    );
    assert.equal(
      await repository.markSent(row.id, {} as never, "old-worker"),
      false,
    );
    assert.equal(row.status, "sending");
  });
});
