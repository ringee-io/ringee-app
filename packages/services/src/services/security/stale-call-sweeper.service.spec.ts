/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Logger } from "@nestjs/common";
import { StaleCallSweeperService } from "./stale-call-sweeper.service";

type Row = Record<string, any>;

/** Lets work the sweep started without awaiting it run to completion. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

function build(stuck: Row[], live: Set<string>) {
  const recorded: Row[] = [];
  const service = new StaleCallSweeperService(
    {
      expirePendingExternalCalls: async () => 0,
      findStuckActive: async () => stuck,
      // What the guard's close left behind.
      findById: async (id: string) => ({ id, endedAt: new Date() }),
    } as never,
    { confirmStillLive: async (call: Row) => live.has(call.id) } as never,
    { expireStalledTransfers: async () => {} } as never,
    {
      recordEndedCall: async (call: Row) => {
        recorded.push(call);
        return null;
      },
    } as never,
  );
  Object.assign(service, {
    logger: Object.assign(new Logger("spec"), {
      log: () => {},
      warn: () => {},
    }),
  });
  return { service, recorded };
}

describe("StaleCallSweeperService", () => {
  it("puts a call it closed on its conversation, as the lost hangup would have", async () => {
    const { service, recorded } = build(
      [{ id: "ghost" }, { id: "still-ringing" }],
      new Set(["still-ringing"]),
    );
    assert.equal(await service.sweep(), 1);
    await settle();
    assert.deepEqual(
      recorded.map((call) => call.id),
      ["ghost"],
    );
  });

  it("records nothing when every call is still up", async () => {
    const { service, recorded } = build([{ id: "live" }], new Set(["live"]));
    assert.equal(await service.sweep(), 0);
    await settle();
    assert.deepEqual(recorded, []);
  });
});
