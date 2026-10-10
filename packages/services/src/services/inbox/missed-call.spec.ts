/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InboxThreadStatus } from "@ringee/database";
import {
  isMissedInboundCall,
  missedCallRecipientId,
  missedCallThreadPatch,
} from "./missed-call";

const ANSWERED_AT = new Date("2026-10-09T15:00:20.000Z");

describe("isMissedInboundCall", () => {
  it("is an inbound call nobody answered, however long it rang", () => {
    // `durationSeconds` is not read: a missed call that rang for twenty
    // seconds lasts twenty seconds.
    assert.equal(
      isMissedInboundCall({
        direction: "inbound",
        answeredAt: null,
        answeredByUserId: null,
      }),
      true,
    );
    assert.equal(
      isMissedInboundCall({
        direction: "incoming",
        answeredAt: null,
        answeredByUserId: null,
      }),
      true,
    );
  });

  it("is not a call somebody answered or claimed", () => {
    assert.equal(
      isMissedInboundCall({
        direction: "inbound",
        answeredAt: ANSWERED_AT,
        answeredByUserId: null,
      }),
      false,
    );
    // The claim is written before the media leg is answered, so it counts
    // even when `call.answered` has not arrived yet.
    assert.equal(
      isMissedInboundCall({
        direction: "inbound",
        answeredAt: null,
        answeredByUserId: "member-1",
      }),
      false,
    );
  });

  it("is never an outbound call, or one with no direction", () => {
    for (const direction of ["outbound", "outgoing", null]) {
      assert.equal(
        isMissedInboundCall({
          direction,
          answeredAt: null,
          answeredByUserId: null,
        }),
        false,
      );
    }
  });
});

describe("missedCallRecipientId", () => {
  it("is the assignee of an organization conversation, else its line's owner", () => {
    assert.equal(
      missedCallRecipientId({
        organizationId: "org-1",
        assignedToId: "member-2",
        userId: "member-1",
      }),
      "member-2",
    );
    assert.equal(
      missedCallRecipientId({
        organizationId: "org-1",
        assignedToId: null,
        userId: "member-1",
      }),
      "member-1",
    );
  });

  it("is always the owner of a personal conversation", () => {
    assert.equal(
      missedCallRecipientId({
        organizationId: null,
        assignedToId: "someone-else",
        userId: "owner-1",
      }),
      "owner-1",
    );
  });
});

describe("missedCallThreadPatch", () => {
  const thread = {
    organizationId: "org-1",
    assignedToId: null,
    userId: "member-1",
    status: InboxThreadStatus.open,
  };

  it("reopens a resolved or archived conversation", () => {
    for (const status of [
      InboxThreadStatus.resolved,
      InboxThreadStatus.archived,
    ]) {
      assert.deepEqual(
        missedCallThreadPatch({ ...thread, status }, { userId: "member-1" }),
        { status: InboxThreadStatus.open, resolvedAt: null, archivedAt: null },
      );
    }
  });

  it("leaves an open or pending conversation's status alone", () => {
    for (const status of [InboxThreadStatus.open, InboxThreadStatus.pending]) {
      assert.deepEqual(
        missedCallThreadPatch({ ...thread, status }, { userId: "member-1" }),
        {},
      );
    }
  });

  it("moves an unassigned organization conversation onto the line the call rang for", () => {
    assert.deepEqual(missedCallThreadPatch(thread, { userId: "member-2" }), {
      userId: "member-2",
    });
  });

  it("never moves an assigned or a personal conversation", () => {
    assert.deepEqual(
      missedCallThreadPatch(
        { ...thread, assignedToId: "member-3" },
        { userId: "member-2" },
      ),
      {},
    );
    assert.deepEqual(
      missedCallThreadPatch(
        { ...thread, organizationId: null },
        { userId: "member-2" },
      ),
      {},
    );
    assert.deepEqual(missedCallThreadPatch(thread, { userId: null }), {});
  });
});
