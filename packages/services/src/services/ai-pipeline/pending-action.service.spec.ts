import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PendingActionService } from "./pending-action.service";

describe("follow-up reconciliation batch", () => {
  it("one objective failing, even its deferral, does not stop the rest", async () => {
    const now = new Date("2026-11-03T12:00:00Z");
    const snapshots: string[] = [];
    const deferred: Array<{ id: string; revision: number }> = [];
    // "a" fails and so does its deferral; "b" fails and is deferred; "c" is
    // simply gone by the time it is read.
    const failures = new Map([
      ["a", 2],
      ["b", 1],
    ]);
    const repo = {
      listFollowUpsForReview: async () => [
        { id: "a" },
        { id: "b" },
        { id: "c" },
      ],
      followUpSnapshot: async (id: string) => {
        snapshots.push(id);
        const left = failures.get(id) ?? 0;
        if (left > 0) {
          failures.set(id, left - 1);
          throw new Error(`database unavailable for ${id}`);
        }
        return id === "b" ? { id, revision: 4 } : null;
      },
      deferFollowUpReview: async (id: string, revision: number) => {
        deferred.push({ id, revision });
      },
    };
    const service = new PendingActionService(
      repo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { outcomeRecorded: async () => undefined } as never,
    );
    await service.reconcileFollowUps(now);
    assert.deepEqual(snapshots, ["a", "a", "b", "b", "c"]);
    assert.deepEqual(deferred, [{ id: "b", revision: 4 }]);
  });
});
