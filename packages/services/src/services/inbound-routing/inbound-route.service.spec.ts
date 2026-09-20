import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ConflictException,
  NotFoundException,
  NotImplementedException,
} from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import { InboundDestinationType, NumberInboundMode } from "@ringee/database";
import { InboundRouteService } from "./inbound-route.service";
import { InboundCallRouterService } from "./inbound-call-router.service";
import { UserDestinationHandler } from "./destinations/user.destination";
import { RingGroupDestinationHandler } from "./destinations/ring-group.destination";
import { DeskPhoneDestinationHandler } from "./destinations/desk-phone.destination";
import {
  AiReceptionistDestinationHandler,
  IvrDestinationHandler,
} from "./destinations/unsupported.destination";

const config = apiConfiguration as unknown as Record<string, unknown>;
const ADMIN = { userId: "user-a", organizationId: "org-1" };

type Row = Record<string, any>;

function setup() {
  const saved: Row[] = [];
  const deleted: Row[] = [];
  const state = {
    route: null as Row | null,
    number: {
      id: "number-r",
      phoneNumber: "+13055550101",
      userId: "user-a",
      organizationId: "org-1",
      deletedAt: null,
      inboundMode: NumberInboundMode.ringee_default,
      inboundSipDeviceId: null,
    } as Row,
    externalNumber: {
      id: "number-x",
      phoneNumber: "+18095551234",
      organizationId: "org-1",
      active: true,
      inboundSipDeviceId: null,
    } as Row,
    group: {
      id: "group-1",
      name: "Sales",
      userId: "user-a",
      organizationId: "org-1",
      members: [],
    } as Row | null,
    device: {
      id: "device-1",
      label: "Office Yealink",
      userId: "user-a",
      organizationId: "org-1",
      allowInbound: true,
    } as Row | null,
    members: new Set(["user-a", "user-b"]),
  };
  const router = new InboundCallRouterService(
    new UserDestinationHandler({} as never),
    new RingGroupDestinationHandler({} as never),
    new DeskPhoneDestinationHandler({} as never, {} as never),
    new IvrDestinationHandler(),
    new AiReceptionistDestinationHandler(),
  );
  const service = new InboundRouteService(
    {
      listByOwner: async () => (state.route ? [state.route] : []),
      findOwnedByNumber: async () => state.route,
      saveForNumber: async (_ctx: Row, ref: Row, destination: Row) => {
        saved.push({ ref, ...destination });
        state.route = { id: "route-1", updatedAt: new Date(), ...destination };
        return state.route;
      },
      deleteForNumber: async (_ctx: Row, ref: Row) => {
        deleted.push(ref);
        state.route = null;
        return 1;
      },
    } as never,
    {
      findById: async (id: string) =>
        state.number.id === id ? state.number : null,
    } as never,
    {
      findNumberById: async (id: string) =>
        state.externalNumber.id === id ? state.externalNumber : null,
    } as never,
    { findOwnedById: async () => state.group } as never,
    { findActiveById: async () => state.device } as never,
    {
      isMember: async (userId: string, orgId: string) =>
        orgId === "org-1" && state.members.has(userId),
    } as never,
    {
      getCachedUserById: async (id: string) =>
        state.members.has(id) ? { id, firstName: "Member" } : null,
    } as never,
    router,
  );
  return { service, state, saved, deleted };
}

async function withDeskPhones<T>(run: () => Promise<T>): Promise<T> {
  const previous = config.DESK_PHONES_ENABLED;
  config.DESK_PHONES_ENABLED = true;
  try {
    return await run();
  } finally {
    config.DESK_PHONES_ENABLED = previous;
  }
}

const ringee = { kind: "ringee" as const, id: "number-r" };
const external = { kind: "external" as const, id: "number-x" };

describe("InboundRouteService", () => {
  it("shows the default a number answers by when nothing is configured", async () => {
    const s = setup();
    const view = await s.service.getForNumber(ADMIN, ringee);
    assert.equal(view.configured, false);
    // The same destination the router would pick: the number's own owner,
    // named — not an empty "user" with nothing behind it.
    assert.equal(view.destinationType, InboundDestinationType.user);
    assert.equal(view.destinationId, "user-a");
    assert.equal(view.destinationLabel, "Member");
    assert.deepEqual(view.availableDestinationTypes, [
      InboundDestinationType.user,
      InboundDestinationType.ring_group,
      InboundDestinationType.desk_phone,
    ]);
  });

  it("shows a desk-phone-pinned number's default as that desk phone", () =>
    withDeskPhones(async () => {
      const s = setup();
      s.state.number.inboundMode = NumberInboundMode.desk_phone_only;
      s.state.number.inboundSipDeviceId = "device-1";
      const view = await s.service.getForNumber(ADMIN, ringee);
      assert.equal(view.configured, false);
      assert.equal(view.destinationType, InboundDestinationType.desk_phone);
      assert.equal(view.destinationId, "device-1");
      assert.equal(view.destinationLabel, "Office Yealink");
    }));

  it("saves and resets a route for a number in the caller's workspace", async () => {
    const s = setup();
    const saved = await s.service.saveForNumber(ADMIN, ringee, {
      destinationType: InboundDestinationType.ring_group,
      destinationId: "group-1",
    });
    assert.equal(saved.configured, true);
    assert.equal(saved.destinationLabel, "Sales");
    assert.equal(s.saved.length, 1);

    const reset = await s.service.deleteForNumber(ADMIN, ringee);
    assert.equal(reset.configured, false);
    assert.deepEqual(s.deleted, [ringee]);
  });

  it("refuses a number in another workspace as if it did not exist", async () => {
    const s = setup();
    s.state.number.organizationId = "org-2";
    await assert.rejects(
      s.service.getForNumber(ADMIN, ringee),
      NotFoundException,
    );
    s.state.externalNumber.organizationId = "org-2";
    await assert.rejects(
      s.service.getForNumber(ADMIN, external),
      NotFoundException,
    );
  });

  it("refuses a destination in another workspace", async () => {
    const s = setup();
    s.state.group = null;
    await assert.rejects(
      s.service.saveForNumber(ADMIN, ringee, {
        destinationType: InboundDestinationType.ring_group,
        destinationId: "group-of-another-org",
      }),
      NotFoundException,
    );
    await assert.rejects(
      s.service.saveForNumber(ADMIN, ringee, {
        destinationType: InboundDestinationType.user,
        destinationId: "user-z",
      }),
      NotFoundException,
    );
    assert.deepEqual(s.saved, []);
  });

  it("refuses IVR and AI receptionist destinations as not available yet", async () => {
    const s = setup();
    for (const destinationType of [
      InboundDestinationType.ivr,
      InboundDestinationType.ai_receptionist,
    ])
      await assert.rejects(
        s.service.saveForNumber(ADMIN, ringee, {
          destinationType,
          destinationId: "00000000-0000-4000-8000-000000000000",
        }),
        NotImplementedException,
      );
    assert.deepEqual(s.saved, []);
  });

  it("refuses a route the number could never deliver", () =>
    withDeskPhones(async () => {
      const s = setup();
      // A carrier number cannot reach a browser (DEBT-020), so it is refused
      // when the route is written rather than on the first real call.
      for (const destinationType of [
        InboundDestinationType.user,
        InboundDestinationType.ring_group,
      ])
        await assert.rejects(
          s.service.saveForNumber(ADMIN, external, {
            destinationType,
            destinationId: "user-b",
          }),
          ConflictException,
        );
      assert.deepEqual(s.saved, []);

      const deskPhone = await s.service.saveForNumber(ADMIN, external, {
        destinationType: InboundDestinationType.desk_phone,
        destinationId: "device-1",
      });
      assert.equal(deskPhone.destinationLabel, "Office Yealink");
      assert.deepEqual(deskPhone.availableDestinationTypes, [
        InboundDestinationType.desk_phone,
      ]);
    }));

  it("refuses a desk phone that does not accept inbound calls", () =>
    withDeskPhones(async () => {
      const s = setup();
      s.state.device!.allowInbound = false;
      await assert.rejects(
        s.service.saveForNumber(ADMIN, ringee, {
          destinationType: InboundDestinationType.desk_phone,
          destinationId: "device-1",
        }),
        ConflictException,
      );
    }));
});
