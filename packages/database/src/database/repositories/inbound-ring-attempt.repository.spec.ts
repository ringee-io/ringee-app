/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InboundRingAttemptRepository } from "./inbound-ring-attempt.repository";

describe("InboundRingAttemptRepository.retireEndedBefore", () => {
  it("retires every ended attempt of an earlier handoff in one transaction", async () => {
    const before = new Date();
    let where: any;
    const batches: Array<Array<{ where: unknown; data: unknown }>> = [];
    const repo = new InboundRingAttemptRepository({
      inboundRingAttempt: {
        findMany: async (args: any) => {
          where = args.where;
          return [
            { id: "a", endpointKey: "browser:one" },
            { id: "b", endpointKey: "desk:two" },
          ];
        },
        update: (args: { where: unknown; data: unknown }) => args,
      },
      $transaction: async (updates: Array<{ where: unknown; data: unknown }>) =>
        batches.push(updates),
    } as never);

    await repo.retireEndedBefore("call", before);

    assert.deepEqual(where, {
      callId: "call",
      endedAt: { lt: before },
      NOT: { endpointKey: { contains: "#" } },
    });
    assert.deepEqual(batches, [
      [
        { where: { id: "a" }, data: { endpointKey: "browser:one#a" } },
        { where: { id: "b" }, data: { endpointKey: "desk:two#b" } },
      ],
    ]);
  });

  it("opens no transaction when nothing is left to retire", async () => {
    let transactions = 0;
    const repo = new InboundRingAttemptRepository({
      inboundRingAttempt: { findMany: async () => [] },
      $transaction: async () => transactions++,
    } as never);

    await repo.retireEndedBefore("call", new Date());

    assert.equal(transactions, 0);
  });
});
