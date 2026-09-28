import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InboundRingService } from "./inbound-ring.service";

type Row = Record<string, any>;

/** A saved contact, with more on it than whoever is rung is shown. */
const CONTACT = {
  id: "contact-1",
  name: "Pedro Pica Piedra",
  company: "Ringee",
  jobTitle: "CTO",
  email: "pedro@example.com",
  phoneNumber: "+18495322320",
  revenue: "1M",
};

const CALLER = {
  id: "contact-1",
  name: "Pedro Pica Piedra",
  company: "Ringee",
  jobTitle: "CTO",
  email: "pedro@example.com",
};

function setup(contact: Row | null | Error = CONTACT) {
  const call: Row = {
    id: "call",
    callControlId: "caller",
    userId: "owner",
    organizationId: "org",
    contactId: "contact-1",
    toNumber: "+18145434034",
    fromNumber: "+18495322320",
    callSessionId: null,
    ringGroupId: null,
    inboundDestinationType: "ai_receptionist",
    inboundTransferDestinationType: "extension",
  };
  const lookups: Row[] = [];
  const ringing: Row[] = [];
  const service = Object.assign(Object.create(InboundRingService.prototype), {
    contacts: {
      findByIdForOwner: async (ctx: Row, id: string) => {
        lookups.push({ ctx, id });
        if (contact instanceof Error) throw contact;
        return contact;
      },
    },
    attempts: {
      findByControlId: async (id: string) =>
        id === "browser-leg"
          ? { id: "attempt", userId: "member", call: { ...call } }
          : null,
      startMany: async (_callId: string, targets: Row[]) =>
        targets.map((target) => ({ userId: target.userId })),
    },
    presence: { list: async () => [{ connectionId: "socket" }] },
    userDevices: { findActiveByUser: async () => [] },
    users: { getCachedUserById: async () => null },
    realtime: {
      inboundCallRinging: async (userId: string, event: Row) => {
        ringing.push({ userId, ...event });
      },
    },
    logger: { log: () => {}, warn: () => {} },
  }) as InboundRingService;
  const offer = (userIds: string[]) =>
    service.offerToMembers(call as never, userIds, {
      callerName: null,
      destinationType: "ring_group",
      ringSeconds: 30,
    });
  return { service, lookups, ringing, offer };
}

describe("Inbound caller contact", () => {
  it("tells the person answering a transfer who is calling", async () => {
    const s = setup();
    const leg = await s.service.browserLeg(
      { userId: "member", organizationId: "org" },
      "browser-leg",
    );
    assert.deepEqual(leg.contact, CALLER);
    assert.equal(leg.callerName, "Pedro Pica Piedra");
    // Read inside the call's own workspace, never the member's.
    assert.deepEqual(s.lookups, [
      { ctx: { userId: "owner", organizationId: "org" }, id: "contact-1" },
    ]);
  });

  it("offers everyone rung the caller's contact, read once per call", async () => {
    const s = setup();
    await s.offer(["member-a", "member-b"]);
    assert.equal(s.lookups.length, 1);
    assert.deepEqual(
      s.ringing.map((event) => [event.userId, event.contact, event.callerName]),
      [
        ["member-a", CALLER, "Pedro Pica Piedra"],
        ["member-b", CALLER, "Pedro Pica Piedra"],
      ],
    );
  });

  it("still rings, with no contact, when there is none or it cannot be read", async () => {
    for (const contact of [null, new Error("database down")]) {
      const s = setup(contact);
      const leg = await s.service.browserLeg(
        { userId: "member", organizationId: "org" },
        "browser-leg",
      );
      assert.equal(leg.contact, null);
      assert.equal(leg.callerName, null);
      await s.offer(["member-a"]);
      assert.deepEqual(
        s.ringing.map((event) => [event.userId, event.contact]),
        [["member-a", null]],
      );
    }
  });
});
