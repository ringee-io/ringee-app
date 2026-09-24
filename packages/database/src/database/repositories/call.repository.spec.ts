/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CallStatus, Prisma } from "@prisma/client";
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

describe("CallRepository carrier lifecycle persistence", () => {
  it("recovers only the inbound leg's own unique-key conflict", async () => {
    let target = ["callControlId"];
    const existing = { id: "call", callControlId: "leg" };
    const repo = new CallRepository({
      call: {
        create: async () => {
          throw new Prisma.PrismaClientKnownRequestError("duplicate", {
            code: "P2002",
            clientVersion: "test",
            meta: { target },
          });
        },
        findUnique: async () => existing,
      },
    } as never);
    const create = () =>
      repo.createInboundOnce(
        { userId: "user", organizationId: "org" },
        {
          callControlId: "leg",
          fromNumber: "+12125550100",
          toNumber: "+12125550101",
        },
      );
    assert.deepEqual(await create(), { call: existing, created: false });
    target = ["anotherUniqueKey"];
    await assert.rejects(create(), { code: "P2002" });
  });

  it("expires only unbound carrier pre-dials, atomically against adoption", async () => {
    let query: any;
    const repo = new CallRepository({
      call: {
        updateMany: async (args: unknown) => {
          query = args;
          return { count: 2 };
        },
      },
    } as never);
    const before = new Date("2026-09-17T12:00:00Z");
    assert.equal(await repo.expirePendingExternalCalls(before), 2);
    assert.deepEqual(query.where, {
      status: CallStatus.pending,
      callControlId: null,
      externalSipEndpointId: { not: null },
      createdAt: { lt: before },
    });
    assert.equal(query.data.status, CallStatus.failed);
  });

  it("does not let another member or workspace abandon a pre-dial", async () => {
    const queries: any[] = [];
    const repo = new CallRepository({
      call: {
        updateMany: async (args: unknown) => {
          queries.push(args);
          return { count: 0 };
        },
      },
    } as never);
    await repo.failPendingExternalCall(
      { userId: "member", organizationId: "org" },
      "call",
      "failed",
    );
    await repo.failPendingExternalCall({ userId: "member" }, "call", "failed");
    assert.equal(queries[0].where.userId, "member");
    assert.equal(queries[0].where.organizationId, "org");
    assert.equal(queries[1].where.userId, "member");
    assert.equal(queries[1].where.organizationId, null);
    assert.equal(queries[0].where.callControlId, null);
  });
});
