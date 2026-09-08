/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CallStatus } from "@prisma/client";
import { CallRepository } from "./call.repository";

function build(initialStatus: CallStatus) {
  const updates: Array<{
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }> = [];
  const call = {
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
      findUnique: async () => call,
      update: async (input: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        updates.push(input);
        return { ...call, ...input.data };
      },
    },
  } as never);

  return { repository, updates };
}

describe("CallRepository.completeCall terminal status", () => {
  it("persists an explicit provider failure", async () => {
    const { repository, updates } = build(CallStatus.ringing);

    const result = await repository.completeCall(
      "cc-1",
      null,
      "2026-09-07T14:00:00.000Z",
      "normal_temporary_failure",
      CallStatus.failed,
    );

    assert.equal(updates[0]!.data.status, CallStatus.failed);
    assert.equal(result!.status, CallStatus.failed);
  });

  it("keeps successful terminal behavior completed by default", async () => {
    const { repository, updates } = build(CallStatus.answered);

    const result = await repository.completeCall(
      "cc-1",
      null,
      "2026-09-07T14:00:00.000Z",
    );

    assert.equal(updates[0]!.data.status, CallStatus.completed);
    assert.equal(result!.status, CallStatus.completed);
  });

  it("does not reopen an existing failure on a duplicate hangup", async () => {
    const { repository, updates } = build(CallStatus.failed);

    const result = await repository.completeCall(
      "cc-1",
      null,
      "2026-09-07T14:00:00.000Z",
    );

    assert.equal(updates[0]!.data.status, CallStatus.failed);
    assert.equal(result!.status, CallStatus.failed);
  });
});
