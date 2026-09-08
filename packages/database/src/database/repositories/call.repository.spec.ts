/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CallStatus } from "@prisma/client";
import { CallRepository } from "./call.repository";

function build(
  initialStatus: CallStatus,
  options: { failBeforeCompletedWrite?: boolean } = {},
) {
  const updates: Array<{
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }> = [];
  const conditionalUpdates: Array<{
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }> = [];
  let call = {
    id: "call-1",
    callControlId: "cc-1",
    status: initialStatus,
    direction: "outbound",
    startedAt: new Date("2026-09-07T13:58:00.000Z"),
    createdAt: new Date("2026-09-07T13:58:00.000Z"),
    answeredAt: null,
    outcome: null,
  };
  const repository = new CallRepository({
    call: {
      findUnique: async () => ({ ...call }),
      update: async (input: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        updates.push(input);
        call = { ...call, ...input.data } as typeof call;
        return { ...call };
      },
      updateMany: async (input: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        conditionalUpdates.push(input);
        if (options.failBeforeCompletedWrite) {
          call = { ...call, status: CallStatus.failed };
        }
        if (call.status === CallStatus.failed) return { count: 0 };
        call = { ...call, ...input.data } as typeof call;
        return { count: 1 };
      },
    },
  } as never);

  return { repository, updates, conditionalUpdates };
}

describe("CallRepository.completeCall terminal status", () => {
  it("persists an explicit provider failure", async () => {
    const { repository, updates, conditionalUpdates } = build(
      CallStatus.ringing,
    );

    const result = await repository.completeCall(
      "cc-1",
      null,
      "2026-09-07T14:00:00.000Z",
      "normal_temporary_failure",
      CallStatus.failed,
    );

    assert.equal(updates[0]!.data.status, CallStatus.failed);
    assert.equal(conditionalUpdates.length, 0);
    assert.equal(result!.status, CallStatus.failed);
  });

  it("keeps successful terminal behavior completed by default", async () => {
    const { repository, updates, conditionalUpdates } = build(
      CallStatus.answered,
    );

    const result = await repository.completeCall(
      "cc-1",
      null,
      "2026-09-07T14:00:00.000Z",
    );

    assert.equal(updates.length, 0);
    assert.equal(conditionalUpdates[0]!.data.status, CallStatus.completed);
    assert.equal(result!.status, CallStatus.completed);
  });

  it("does not reopen an existing failure on a duplicate hangup", async () => {
    const { repository, updates } = build(CallStatus.failed);

    const result = await repository.completeCall(
      "cc-1",
      null,
      "2026-09-07T14:00:00.000Z",
    );

    assert.equal(updates.length, 0);
    assert.equal(result!.status, CallStatus.failed);
  });

  it("does not overwrite a failure committed after the initial read", async () => {
    const { repository, updates, conditionalUpdates } = build(
      CallStatus.ringing,
      { failBeforeCompletedWrite: true },
    );

    const result = await repository.completeCall(
      "cc-1",
      null,
      "2026-09-07T14:00:00.000Z",
    );

    assert.equal(
      (conditionalUpdates[0]!.where.status as { not: CallStatus }).not,
      CallStatus.failed,
    );
    assert.equal(updates.length, 0);
    assert.equal(result!.status, CallStatus.failed);
  });
});
