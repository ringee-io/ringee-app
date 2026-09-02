/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MeetingRepository } from "./meeting.repository";

const MEETING = {
  id: "meeting-1",
  scheduledAt: new Date("2099-01-05T15:00:00.000Z"),
};

function build(conflict = false) {
  const events: string[] = [];
  const transaction = {
    $queryRaw: async (strings: TemplateStringsArray) => {
      const sql = strings.join("?");
      if (sql.includes("FOR UPDATE")) {
        events.push("lock");
        return [];
      }
      events.push("check");
      return conflict ? [{ id: "meeting-existing" }] : [];
    },
    meeting: {
      create: async () => {
        events.push("create");
        return MEETING;
      },
    },
  };
  const repository = new MeetingRepository({
    $transaction: async (
      work: (client: typeof transaction) => Promise<unknown>,
    ) => work(transaction),
  } as never);

  return { repository, events };
}

describe("MeetingRepository.createIfAvailable", () => {
  it("locks, re-checks and creates in one transaction", async () => {
    const { repository, events } = build();

    const meeting = await repository.createIfAvailable(
      { userId: "user-1", organizationId: "org-1" },
      {
        contactId: "contact-1",
        scheduledAt: new Date("2099-01-05T15:00:00.000Z"),
        duration: 30,
      },
    );

    assert.equal(meeting?.id, "meeting-1");
    assert.deepEqual(events, ["lock", "check", "create"]);
  });

  it("does not insert when a meeting now overlaps the slot", async () => {
    const { repository, events } = build(true);

    const meeting = await repository.createIfAvailable(
      { userId: "user-1" },
      {
        contactId: "contact-1",
        scheduledAt: new Date("2099-01-05T15:00:00.000Z"),
        duration: 30,
      },
    );

    assert.equal(meeting, null);
    assert.deepEqual(events, ["lock", "check"]);
  });
});
