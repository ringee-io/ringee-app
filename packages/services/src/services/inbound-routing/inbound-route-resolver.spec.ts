import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { apiConfiguration } from "@ringee/configuration";
import { InboundDestinationType, NumberInboundMode } from "@ringee/database";
import { InboundRouteResolverService } from "./inbound-route-resolver.service";
import type {
  InboundCallOrigin,
  InboundRouteResolution,
} from "./inbound-routing.types";
import type { OwnershipContext } from "@ringee/platform";

const config = apiConfiguration as unknown as Record<string, unknown>;

type Row = Record<string, any>;

/**
 * One organization (`org-1`) with two members, one Ringee DID and one carrier
 * DID. Everything a test needs to move — a route, a group, a device — is a
 * field on `state`.
 */
function setup() {
  const state = {
    members: new Set(["user-a", "user-b"]),
    route: null as Row | null,
    ringGroup: {
      id: "group-1",
      userId: "user-a",
      organizationId: "org-1",
      name: "Sales",
      ringSeconds: 30,
      members: [{ userId: "user-a" }, { userId: "user-b" }],
    } as Row | null,
    device: {
      id: "device-1",
      publicRef: "dev_1",
      label: "Sales desk",
      userId: "user-a",
      organizationId: "org-1",
      sipUsername: "rgdesk201",
      allowInbound: true,
      status: "registered",
      deletedAt: null,
    } as Row | null,
    ringeeNumber: {
      id: "number-r",
      phoneNumber: "+13055550101",
      userId: "user-a",
      organizationId: "org-1",
      inboundMode: NumberInboundMode.ringee_default,
      inboundSipDeviceId: null,
    } as Row | null,
    externalNumber: {
      id: "number-x",
      phoneNumber: "+18095551234",
      organizationId: "org-1",
      active: true,
      inboundSipDeviceId: null,
    } as Row | null,
    users: new Map<string, Row>([
      ["user-a", { id: "user-a", firstName: "Edison" }],
      ["user-b", { id: "user-b", firstName: "Pedro" }],
      ["user-z", { id: "user-z", firstName: "Outsider" }],
    ]),
  };
  const owned = (ctx: OwnershipContext, row: Row | null) =>
    row &&
    !row.deletedAt &&
    (ctx.organizationId
      ? row.organizationId === ctx.organizationId
      : row.userId === ctx.userId && !row.organizationId);
  const service = new InboundRouteResolverService(
    {
      findOneByNumber: async (phone: string) =>
        state.ringeeNumber?.phoneNumber === phone ? state.ringeeNumber : null,
    } as never,
    {
      findNumberById: async (id: string) =>
        state.externalNumber?.id === id ? state.externalNumber : null,
    } as never,
    { findByNumber: async () => state.route } as never,
    {
      findByIdWithMembers: async (id: string) =>
        state.ringGroup?.id === id ? state.ringGroup : null,
      listByOwner: async (ctx: OwnershipContext) =>
        owned(ctx, state.ringGroup) ? [state.ringGroup] : [],
    } as never,
    {
      findActiveById: async (id: string) =>
        state.device?.id === id ? state.device : null,
      listByOwner: async (ctx: OwnershipContext) =>
        owned(ctx, state.device) ? [state.device] : [],
    } as never,
    {
      getCachedUserById: async (id: string) => state.users.get(id) ?? null,
    } as never,
    {
      isMember: async (userId: string, orgId: string) =>
        orgId === "org-1" && state.members.has(userId),
      listMembersWithUsers: async (orgId: string) =>
        orgId === "org-1"
          ? [...state.members].map((id) => ({
              user: state.users.get(id) ?? null,
            }))
          : [],
    } as never,
    { findByIdForOwner: async () => null } as never,
  );
  const ringee = (): InboundCallOrigin => ({
    transport: "ringee_webrtc",
    toNumber: "+13055550101",
    fromNumber: "+12125550199",
    callerId: "+12125550199",
  });
  const carrier = (): InboundCallOrigin => ({
    transport: "call_control",
    toNumber: "+18095551234",
    fromNumber: "+12125550199",
    callerId: "+12125550199",
    number: { kind: "external", id: "number-x" },
    organizationId: "org-1",
  });
  const route = (
    destinationType: InboundDestinationType,
    destinationId: string,
  ) => {
    state.route = { id: "route-1", destinationType, destinationId };
  };
  return { service, state, ringee, carrier, route };
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

function routed(resolution: InboundRouteResolution) {
  assert.equal(
    resolution.kind,
    "routed",
    `expected a routed call, got ${JSON.stringify(resolution)}`,
  );
  return resolution as Extract<InboundRouteResolution, { kind: "routed" }>;
}

function unroutable(resolution: InboundRouteResolution) {
  assert.equal(
    resolution.kind,
    "unroutable",
    `expected an unroutable call, got ${JSON.stringify(resolution)}`,
  );
  return resolution as Extract<InboundRouteResolution, { kind: "unroutable" }>;
}

describe("InboundRouteResolverService — dynamic directory", () => {
  const ctx = { userId: "user-a", organizationId: "org-1" };

  it("returns only logical destination identifiers and labels", () =>
    withDeskPhones(async () => {
      const s = setup();
      const result = await s.service.searchDirectory(ctx, " SALES ");
      assert.deepEqual(result, {
        destinations: [
          {
            destinationType: "ring_group",
            destinationId: "group-1",
            label: "Sales",
          },
          {
            destinationType: "desk_phone",
            destinationId: "device-1",
            label: "Sales desk",
          },
        ],
        hasMore: false,
      });
      assert.equal(JSON.stringify(result).includes("rgdesk201"), false);
      assert.deepEqual(
        await s.service.searchDirectory(ctx, "missing department"),
        {
          destinations: [],
          hasMore: false,
        },
      );
    }));

  it("reads current membership on every lookup and revalidates a selection", async () => {
    const s = setup();
    assert.equal(
      (await s.service.searchDirectory(ctx, "Pedro")).destinations.length,
      1,
    );
    s.state.members.delete("user-b");
    assert.deepEqual(
      (await s.service.searchDirectory(ctx, "Pedro")).destinations,
      [],
    );
    const resolution = await s.service.resolveDestination(ctx, {
      destinationType: InboundDestinationType.user,
      destinationId: "user-b",
    });
    assert.equal(
      "reason" in resolution && resolution.reason,
      "destination_foreign_workspace",
    );
  });

  it("keeps personal and organization directories separate", () =>
    withDeskPhones(async () => {
      const s = setup();
      assert.deepEqual(
        await s.service.searchDirectory({ ...ctx, organizationId: "org-2" }),
        {
          destinations: [],
          hasMore: false,
        },
      );
      assert.deepEqual(
        await s.service.searchDirectory({
          userId: "user-a",
          organizationId: null,
        }),
        {
          destinations: [
            {
              destinationType: "user",
              destinationId: "user-a",
              label: "Edison",
            },
          ],
          hasMore: false,
        },
      );
    }));

  it("excludes empty groups, unavailable phones and departed phone owners", () =>
    withDeskPhones(async () => {
      const s = setup();
      s.state.ringGroup!.members = [{ userId: "user-z" }];
      s.state.device!.allowInbound = false;
      assert.deepEqual(
        (await s.service.searchDirectory(ctx, "Sales")).destinations,
        [],
      );
      s.state.device!.allowInbound = true;
      s.state.members.delete("user-a");
      assert.deepEqual(
        (await s.service.searchDirectory(ctx, "Sales")).destinations,
        [],
      );
    }));

  it("preserves ambiguous names and bounds the response without inventing matches", async () => {
    const s = setup();
    s.state.users.set("user-b", { id: "user-b", firstName: "Edison" });
    assert.equal(
      (await s.service.searchDirectory(ctx, "Edison")).destinations.length,
      2,
    );
    for (let i = 0; i < 60; i++) {
      const id = `member-${i}`;
      s.state.members.add(id);
      s.state.users.set(id, { id, firstName: "Member" });
    }
    const result = await s.service.searchDirectory(ctx, "Member");
    assert.equal(result.destinations.length, 50);
    assert.equal(result.hasMore, true);
    await assert.rejects(() => s.service.searchDirectory(ctx, "x".repeat(201)));
  });
});

describe("InboundRouteResolverService — explicit routes", () => {
  it("routes a phone number to a user", async () => {
    const s = setup();
    s.route(InboundDestinationType.user, "user-b");
    const resolution = routed(await s.service.resolve(s.ringee()));
    assert.deepEqual(resolution.destination, {
      type: "user",
      userId: "user-b",
    });
    assert.equal(resolution.source, "explicit");
    assert.equal(resolution.routeId, "route-1");
    // The call is still attributed to the number's own workspace and owner.
    assert.deepEqual(resolution.ctx, {
      userId: "user-a",
      organizationId: "org-1",
    });
  });

  it("routes a phone number to a ring group, with its current members", async () => {
    const s = setup();
    s.route(InboundDestinationType.ring_group, "group-1");
    const resolution = routed(await s.service.resolve(s.ringee()));
    assert.equal(resolution.destination.type, "ring_group");
    assert.deepEqual(
      resolution.destination.type === "ring_group" &&
        resolution.destination.memberUserIds,
      ["user-a", "user-b"],
    );
  });

  it("routes a phone number to a desk phone", () =>
    withDeskPhones(async () => {
      const s = setup();
      s.route(InboundDestinationType.desk_phone, "device-1");
      const resolution = routed(await s.service.resolve(s.ringee()));
      assert.deepEqual(resolution.destination, {
        type: "desk_phone",
        sipDeviceId: "device-1",
        sipUsername: "rgdesk201",
        ownerUserId: "user-a",
      });
    }));

  it("drops a group member who has left the workspace, and refuses an empty group", async () => {
    const s = setup();
    s.route(InboundDestinationType.ring_group, "group-1");
    s.state.members.delete("user-b");
    const resolution = routed(await s.service.resolve(s.ringee()));
    assert.deepEqual(
      resolution.destination.type === "ring_group" &&
        resolution.destination.memberUserIds,
      ["user-a"],
    );

    s.state.members.clear();
    assert.equal(
      unroutable(await s.service.resolve(s.ringee())).reason,
      "ring_group_empty",
    );

    s.state.members.add("user-a");
    s.state.ringGroup!.members = [];
    assert.equal(
      unroutable(await s.service.resolve(s.ringee())).reason,
      "ring_group_empty",
    );
  });
});

describe("InboundRouteResolverService — refusals", () => {
  it("refuses a destination that was deleted", () =>
    withDeskPhones(async () => {
      const cases: Array<
        [InboundDestinationType, string, (s: ReturnType<typeof setup>) => void]
      > = [
        [
          InboundDestinationType.ring_group,
          "group-1",
          (s) => (s.state.ringGroup = null),
        ],
        [
          InboundDestinationType.desk_phone,
          "device-1",
          (s) => (s.state.device = null),
        ],
        [
          InboundDestinationType.user,
          "user-b",
          (s) => s.state.users.delete("user-b"),
        ],
      ];
      for (const [type, id, remove] of cases) {
        const s = setup();
        s.route(type, id);
        remove(s);
        assert.equal(
          unroutable(await s.service.resolve(s.ringee())).reason,
          "destination_deleted",
          `${type} was not reported as deleted`,
        );
      }
    }));

  it("never routes to a destination in another workspace", () =>
    withDeskPhones(async () => {
      // A ring group and a desk phone that belong to another organization,
      // and a user who is not a member of this one.
      const group = setup();
      group.route(InboundDestinationType.ring_group, "group-1");
      group.state.ringGroup!.organizationId = "org-2";
      assert.equal(
        unroutable(await group.service.resolve(group.ringee())).reason,
        "destination_foreign_workspace",
      );

      const device = setup();
      device.route(InboundDestinationType.desk_phone, "device-1");
      device.state.device!.organizationId = "org-2";
      assert.equal(
        unroutable(await device.service.resolve(device.ringee())).reason,
        "destination_foreign_workspace",
      );

      const user = setup();
      user.route(InboundDestinationType.user, "user-z");
      assert.equal(
        unroutable(await user.service.resolve(user.ringee())).reason,
        "destination_foreign_workspace",
      );

      // A desk phone whose owner left the organization is equally refused.
      const owner = setup();
      owner.route(InboundDestinationType.desk_phone, "device-1");
      owner.state.members.delete("user-a");
      assert.equal(
        unroutable(await owner.service.resolve(owner.ringee())).reason,
        "destination_foreign_workspace",
      );
    }));

  it("refuses a call the carrier and the number disagree about the owner of", async () => {
    const s = setup();
    const origin = { ...s.carrier(), organizationId: "org-2" };
    assert.equal((await s.service.resolve(origin)).kind, "unknown_number");
  });

  it("refuses a desk phone that cannot take calls", () =>
    withDeskPhones(async () => {
      for (const mutate of [
        (s: ReturnType<typeof setup>) => (s.state.device!.allowInbound = false),
        (s: ReturnType<typeof setup>) => (s.state.device!.status = "disabled"),
        (s: ReturnType<typeof setup>) => (s.state.device!.status = "deleted"),
      ]) {
        const s = setup();
        s.route(InboundDestinationType.desk_phone, "device-1");
        mutate(s);
        assert.equal(
          unroutable(await s.service.resolve(s.ringee())).reason,
          "desk_phone_unavailable",
        );
      }
    }));

  it("reports an unknown number without deciding anything about it", async () => {
    const s = setup();
    s.state.ringeeNumber = null;
    assert.equal((await s.service.resolve(s.ringee())).kind, "unknown_number");
  });
});

describe("InboundRouteResolverService — not implemented yet", () => {
  it("refuses an IVR destination as not implemented", async () => {
    const s = setup();
    s.route(InboundDestinationType.ivr, "ivr-1");
    const refusal = unroutable(await s.service.resolve(s.ringee()));
    assert.equal(refusal.reason, "destination_not_implemented");
    assert.equal(refusal.destinationType, InboundDestinationType.ivr);
  });

  it("refuses an AI receptionist that does not exist", async () => {
    const s = setup();
    s.route(InboundDestinationType.ai_receptionist, "receptionist-1");
    const refusal = unroutable(await s.service.resolve(s.ringee()));
    assert.equal(refusal.reason, "destination_deleted");
    assert.equal(
      refusal.destinationType,
      InboundDestinationType.ai_receptionist,
    );
  });
});

describe("InboundRouteResolverService — the default, for numbers with no route", () => {
  it("rings the number's owner, exactly as a managed Telnyx number does today", async () => {
    const s = setup();
    const resolution = routed(await s.service.resolve(s.ringee()));
    assert.deepEqual(resolution.destination, {
      type: "user",
      userId: "user-a",
    });
    assert.equal(resolution.source, "default");
    assert.equal(resolution.routeId, null);
  });

  it("keeps a desk-phone-only number on its desk phone", () =>
    withDeskPhones(async () => {
      const s = setup();
      s.state.ringeeNumber!.inboundMode = NumberInboundMode.desk_phone_only;
      s.state.ringeeNumber!.inboundSipDeviceId = "device-1";
      const resolution = routed(await s.service.resolve(s.ringee()));
      assert.equal(resolution.destination.type, "desk_phone");
      assert.equal(resolution.source, "default");
    }));

  it("keeps a carrier number on the desk phone it is pinned to", () =>
    withDeskPhones(async () => {
      const s = setup();
      s.state.externalNumber!.inboundSipDeviceId = "device-1";
      const resolution = routed(await s.service.resolve(s.carrier()));
      assert.deepEqual(resolution.destination, {
        type: "desk_phone",
        sipDeviceId: "device-1",
        sipUsername: "rgdesk201",
        ownerUserId: "user-a",
      });
      // A carrier number has no owner of its own: the call is attributed to
      // the member its destination names.
      assert.deepEqual(resolution.ctx, {
        userId: "user-a",
        organizationId: "org-1",
      });
    }));

  it("refuses a carrier number that is not routed inbound at all", async () => {
    const s = setup();
    assert.equal(
      unroutable(await s.service.resolve(s.carrier())).reason,
      "destination_missing",
    );
  });

  it("refuses an inactive carrier number", async () => {
    const s = setup();
    s.state.externalNumber!.active = false;
    assert.equal((await s.service.resolve(s.carrier())).kind, "unknown_number");
  });
});
