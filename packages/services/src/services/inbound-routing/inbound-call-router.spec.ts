import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InboundDestinationType } from "@ringee/database";
import { InboundCallRouterService } from "./inbound-call-router.service";
import { InboundRingService } from "./inbound-ring.service";
import { UserDestinationHandler } from "./destinations/user.destination";
import { RingGroupDestinationHandler } from "./destinations/ring-group.destination";
import { DeskPhoneDestinationHandler } from "./destinations/desk-phone.destination";
import {
  AiReceptionistDestinationHandler,
  IvrDestinationHandler,
} from "./destinations/unsupported.destination";
import type {
  InboundCallOrigin,
  InboundDestination,
  RouteExecutionResult,
} from "./inbound-routing.types";

type Row = Record<string, any>;

const CALL = {
  id: "call-1",
  callControlId: "leg-a",
  userId: "user-a",
  organizationId: "org-1",
  fromNumber: "+12125550199",
  toNumber: "+18095551234",
  callSessionId: "session-1",
  direction: "inbound",
  answeredAt: null,
  endedAt: null,
  answeredByUserId: null,
} as Row;

const GROUP: InboundDestination = {
  type: "ring_group",
  ringGroupId: "group-1",
  name: "Sales",
  ringSeconds: 30,
  memberUserIds: ["edison", "pedro", "juan"],
  ownerUserId: "edison",
};

/**
 * An in-memory stand-in for the two stores the election depends on: the ring
 * attempts and the one conditional update on the call row. Both are modelled
 * the way Postgres behaves — `claimInboundAnswer` can succeed once.
 */
function setup(options: { online?: string[] } = {}) {
  const online = new Set(options.online ?? ["edison", "pedro", "juan"]);
  const call = { ...CALL };
  const attemptRows: Row[] = [];
  const sent: string[] = [];
  const cancelled: string[] = [];
  const transfers: Row[] = [];

  const attempts = {
    listByCall: async () => attemptRows.map((row) => ({ ...row })),
    // `createManyAndReturn` with `skipDuplicates`: the rows this insert won
    // come back, a target already on the list does not.
    startMany: async (callId: string, targets: Row[]) => {
      const inserted: Row[] = [];
      for (const target of targets)
        if (
          !attemptRows.some((row) => row.userId === (target.userId ?? null))
        ) {
          const row = {
            callId,
            userId: target.userId ?? null,
            sipDeviceId: target.sipDeviceId ?? null,
            status: "ringing",
          };
          attemptRows.push(row);
          inserted.push({ ...row });
        }
      return inserted;
    },
    markAnswered: async (_callId: string, userId: string | null) => {
      const row = attemptRows.find(
        (entry) => entry.userId === userId && entry.status === "ringing",
      );
      if (row) row.status = "answered";
      return !!row;
    },
    endRinging: async (
      _callId: string,
      params: { status: string; reason: string; exceptUserId?: string | null },
    ) => {
      const ending = attemptRows.filter(
        (row) =>
          row.status === "ringing" &&
          (!params.exceptUserId || row.userId !== params.exceptUserId),
      );
      for (const row of ending) row.status = params.status;
      return ending.map((row) => ({ ...row }));
    },
  };

  const callRepository = {
    findByControlId: async (id: string) =>
      call.callControlId === id ? call : null,
    // The real thing is a single conditional UPDATE; this is the same
    // semantics, and it is why two simultaneous claims cannot both win.
    claimInboundAnswer: async (id: string, userId: string) => {
      if (call.callControlId !== id) return { won: false, call: null };
      if (call.answeredByUserId === null && !call.endedAt) {
        call.answeredByUserId = userId;
        return { won: true, call };
      }
      return { won: call.answeredByUserId === userId, call };
    },
  };

  const ring = new InboundRingService(
    attempts as never,
    callRepository as never,
    { findActiveByUser: async () => [] } as never,
    { getCachedUserById: async (id: string) => ({ id, clerkId: id }) } as never,
    { sendNotification: async () => {} } as never,
    {
      list: async (userId: string) =>
        online.has(userId) ? [{ connectionId: `c-${userId}` }] : [],
    } as never,
    {
      inboundCallRinging: async (userId: string) => {
        sent.push(userId);
      },
      inboundCallCancelled: async (userId: string) => {
        cancelled.push(userId);
      },
    } as never,
  );

  const router = new InboundCallRouterService(
    new UserDestinationHandler(ring),
    new RingGroupDestinationHandler(ring),
    new DeskPhoneDestinationHandler(
      {
        connectInboundToDeskPhone: async (id: string, params: Row) => {
          transfers.push({ id, ...params });
        },
      } as never,
      attempts as never,
    ),
    new IvrDestinationHandler(),
    new AiReceptionistDestinationHandler(),
  );

  const origin = (
    transport: InboundCallOrigin["transport"] = "ringee_webrtc",
  ): InboundCallOrigin => ({
    transport,
    toNumber: call.toNumber,
    fromNumber: call.fromNumber,
    callerId: call.fromNumber,
  });

  const route = (
    destination: InboundDestination,
    transport: InboundCallOrigin["transport"] = "ringee_webrtc",
  ): Promise<RouteExecutionResult> =>
    router.routeInboundCall({
      call: call as never,
      ctx: { userId: "user-a", organizationId: "org-1" },
      origin: origin(transport),
      destination,
      callerName: "A Caller",
    });

  return {
    router,
    ring,
    route,
    call,
    attemptRows,
    sent,
    cancelled,
    transfers,
    online,
  };
}

describe("InboundCallRouterService — ring groups", () => {
  it("rings every available member at once, as one call", async () => {
    const s = setup();
    const result = await s.route(GROUP);
    assert.deepEqual(result, { status: "ringing", targets: 3 });
    assert.deepEqual(s.sent.sort(), ["edison", "juan", "pedro"]);
    // Three legs, one call. Nothing here creates a second Call row.
    assert.equal(s.attemptRows.length, 3);
    assert.ok(s.attemptRows.every((row) => row.callId === "call-1"));
  });

  it("does not ring the group twice when the webhook is redelivered", async () => {
    const s = setup();
    await s.route(GROUP);
    const again = await s.route(GROUP);

    // Still one leg per member, and nobody was rung a second time.
    assert.deepEqual(again, { status: "ringing", targets: 3 });
    assert.equal(s.attemptRows.length, 3);
    assert.deepEqual(s.sent.sort(), ["edison", "juan", "pedro"]);
    // And the replay is not read as "nobody was available", which would have
    // cancelled the members who are ringing right now.
    assert.deepEqual(s.cancelled, []);
    assert.ok(s.attemptRows.every((row) => row.status === "ringing"));
  });

  it("gives the call to the first member who answers and cancels the rest", async () => {
    const s = setup();
    await s.route(GROUP);

    const claim = await s.ring.claim("leg-a", "pedro");
    assert.equal(claim.status, "won");
    assert.equal(s.call.answeredByUserId, "pedro");
    assert.equal(
      s.attemptRows.find((row) => row.userId === "pedro")!.status,
      "answered",
    );
    assert.deepEqual(
      s.attemptRows
        .filter((row) => row.userId !== "pedro")
        .map((row) => row.status),
      ["cancelled", "cancelled"],
    );
    // And the losing members are told to stop ringing, immediately.
    assert.deepEqual(s.cancelled.sort(), ["edison", "juan"]);
  });

  it("cannot let two simultaneous answers both win", async () => {
    const s = setup();
    await s.route(GROUP);

    const [edison, pedro, juan] = await Promise.all([
      s.ring.claim("leg-a", "edison"),
      s.ring.claim("leg-a", "pedro"),
      s.ring.claim("leg-a", "juan"),
    ]);
    const winners = [edison, pedro, juan].filter(
      (claim) => claim.status === "won",
    );
    assert.equal(winners.length, 1);
    assert.equal(
      [edison, pedro, juan].filter((claim) => claim.status === "lost").length,
      2,
    );
    // The row names exactly one member, and re-claiming by the winner is
    // still a win rather than a spurious loss on a retried request.
    assert.ok(s.call.answeredByUserId);
    const again = await s.ring.claim("leg-a", s.call.answeredByUserId);
    assert.equal(again.status, "won");
  });

  it("refuses a member the call was never offered to", async () => {
    const s = setup();
    await s.route(GROUP);
    assert.equal(
      (await s.ring.claim("leg-a", "someone-else")).status,
      "not_a_target",
    );
    assert.equal(s.call.answeredByUserId, null);
  });

  it("fails explicitly when no member of the group is available", async () => {
    const s = setup({ online: [] });
    const result = await s.route(GROUP);
    assert.equal(result.status, "failed");
    assert.equal(
      result.status === "failed" && result.reason,
      "ring_group_no_available_members",
    );
    assert.ok(s.attemptRows.every((row) => row.status === "failed"));
  });

  it("fails a redelivery of a group that already failed, instead of reporting it ringing", async () => {
    const s = setup({ online: [] });
    await s.route(GROUP);
    const again = await s.route(GROUP);

    // The members' attempts ended as failed. They are neither rung again nor
    // counted as ringing, so the call is failed — and hung up — once more.
    assert.equal(again.status, "failed");
    assert.equal(s.attemptRows.length, 3);
    assert.deepEqual(s.sent, []);
    assert.ok(s.attemptRows.every((row) => row.status === "failed"));
  });

  it("stops ringing when the caller's leg disconnects", async () => {
    const s = setup();
    await s.route(GROUP);
    s.call.endedAt = new Date();
    await s.ring.cancelForEndedCall(s.call as never, "caller_hangup");
    assert.ok(s.attemptRows.every((row) => row.status === "cancelled"));
    assert.deepEqual(s.cancelled.sort(), ["edison", "juan", "pedro"]);
    // Nothing can be claimed afterwards.
    assert.equal((await s.ring.claim("leg-a", "pedro")).status, "gone");
  });
});

describe("InboundCallRouterService — users and desk phones", () => {
  it("offers a user destination to that user alone", async () => {
    const s = setup();
    const result = await s.route({ type: "user", userId: "edison" });
    assert.deepEqual(result, { status: "ringing", targets: 1 });
    assert.deepEqual(s.sent, ["edison"]);
  });

  it("still rings a user with nothing online, as it always has", async () => {
    const s = setup({ online: [] });
    const result = await s.route({ type: "user", userId: "edison" });
    assert.deepEqual(result, { status: "ringing", targets: 1 });
  });

  it("transfers a call-control call to the desk phone it is routed to", async () => {
    const s = setup();
    const result = await s.route(
      {
        type: "desk_phone",
        sipDeviceId: "device-1",
        sipUsername: "rgdesk201",
        ownerUserId: "user-a",
      },
      "call_control",
    );
    assert.deepEqual(result, { status: "ringing", targets: 1 });
    assert.equal(s.transfers.length, 1);
    assert.equal(s.transfers[0].sipUsername, "rgdesk201");
    assert.equal(s.transfers[0].commandId, "carrier-inbound-call-1");
  });

  it("commands nothing when the number's own assignment already rings the phone", async () => {
    const s = setup();
    const result = await s.route({
      type: "desk_phone",
      sipDeviceId: "device-1",
      sipUsername: "rgdesk201",
      ownerUserId: "user-a",
    });
    assert.deepEqual(result, { status: "ringing", targets: 1 });
    assert.deepEqual(s.transfers, []);
  });

  it("refuses a destination the delivering transport cannot reach", async () => {
    const s = setup();
    for (const destination of [
      GROUP,
      { type: "user", userId: "edison" } as InboundDestination,
    ]) {
      const result = await s.route(destination, "call_control");
      assert.equal(result.status, "failed");
      assert.equal(
        result.status === "failed" && result.reason,
        "transport_cannot_reach_destination",
      );
    }
    // Nothing was offered to anybody.
    assert.deepEqual(s.sent, []);
  });
});

describe("InboundCallRouterService — destinations that do not exist yet", () => {
  it("reports IVR and AI receptionist as not implemented", async () => {
    const s = setup();
    for (const type of [
      InboundDestinationType.ivr,
      InboundDestinationType.ai_receptionist,
    ]) {
      const handler = s.router["handlers"].get(type)!;
      const result = await handler.execute({
        call: CALL as never,
        ctx: { userId: "user-a", organizationId: "org-1" },
        origin: {
          transport: "ringee_webrtc",
          toNumber: CALL.toNumber,
          fromNumber: CALL.fromNumber,
          callerId: null,
        },
        destination: { type: "user", userId: "edison" },
        callerName: null,
      });
      assert.equal(result.status, "failed");
      assert.equal(
        result.status === "failed" && result.reason,
        "destination_not_implemented",
      );
      // And they can be reached over nothing at all, so a stored route for
      // one is refused before any handler runs.
      assert.deepEqual(s.router.transportsFor(type), []);
    }
  });
});
