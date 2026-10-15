import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BadRequestException,
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
import { IvrDestinationHandler } from "./destinations/unsupported.destination";

import { AiReceptionistDestinationHandler } from "./destinations/ai-receptionist.destination";

const config = apiConfiguration as unknown as Record<string, unknown>;
const ADMIN = { userId: "user-a", organizationId: "org-1" };

type Row = Record<string, any>;

function setup() {
  const saved: Row[] = [];
  const deleted: Row[] = [];
  const assignments: string[] = [];
  const casWrites: Row[] = [];
  const droppedLeftovers: string[] = [];
  const state = {
    route: null as Row | null,
    /** A route the number kept from the workspace it was moved out of. */
    leftover: null as Row | null,
    /** Runs as the number's route lock is granted, e.g. a transfer that won. */
    onLock: null as (() => void) | null,
    agent: null as Row | null,
    number: {
      id: "number-r",
      phoneNumber: "+13055550101",
      userId: "user-a",
      organizationId: "org-1",
      deletedAt: null,
      active: true,
      kind: "purchased",
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
    new AiReceptionistDestinationHandler({
      startInbound: async () => {},
    } as never),
  );
  const service = new InboundRouteService(
    {
      listByOwner: async () => (state.route ? [state.route] : []),
      findOwnedByNumber: async () => state.route,
      // Unscoped, as on the inbound path: the workspace's own route, or one
      // another workspace left on the number.
      findByNumber: async () =>
        state.leftover ??
        (state.route
          ? { userId: "user-a", organizationId: "org-1", ...state.route }
          : null),
      deleteLeftoverForNumber: async (_ref: Row, id: string) => {
        droppedLeftovers.push(id);
        if (state.leftover?.id !== id) return 0;
        state.leftover = null;
        return 1;
      },
      saveForNumber: async (
        _ctx: Row,
        ref: Row,
        destination: Row,
        restore: Row | null = null,
      ) => {
        saved.push({ ref, ...destination, restore });
        state.route = {
          id: "route-1",
          updatedAt: new Date(),
          numberId: ref.kind === "ringee" ? ref.id : null,
          externalNumberId: ref.kind === "external" ? ref.id : null,
          version: (state.route?.version ?? 0) + 1,
          ...destination,
          restoreDestinationType: restore?.destinationType ?? null,
          restoreDestinationId: restore?.destinationId ?? null,
        };
        return state.route;
      },
      listByDestination: async (_ctx: Row, type: string, id: string) =>
        state.route &&
        state.route.destinationType === type &&
        state.route.destinationId === id
          ? [state.route]
          : [],
      replaceIfUnchanged: async (_ctx: Row, expected: Row, target: Row) => {
        casWrites.push({ expected, target });
        if (
          !state.route ||
          state.route.version !== expected.version ||
          state.route.destinationId !== expected.destinationId
        )
          return null;
        state.route = {
          ...state.route,
          ...target,
          restoreDestinationType: null,
          restoreDestinationId: null,
          version: state.route.version + 1,
        };
        return state.route;
      },
      deleteIfUnchanged: async (_ctx: Row, expected: Row) => {
        casWrites.push({ expected, target: null });
        if (!state.route || state.route.version !== expected.version)
          return false;
        state.route = null;
        return true;
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
      update: async (_id: string, data: Row) =>
        Object.assign(state.number, data),
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
    {
      resolveDestination: async () =>
        state.agent
          ? {
              type: "ai_receptionist",
              agentId: state.agent.id,
              ownerUserId: "user-a",
            }
          : { reason: "destination_missing", detail: "Missing agent" },
    } as never,
    { findByIdForOwner: async () => state.agent } as never,
    {
      assignNumberToConnection: async (number: string, appId: string) => {
        assignments.push(number);
        return { connectionId: appId, connectionName: "Call Control" };
      },
    } as never,
    {
      setIfAbsent: async () => {
        state.onLock?.();
        return true;
      },
      compareAndSwap: async () => true,
    } as never,
  );
  return {
    service,
    state,
    saved,
    deleted,
    assignments,
    casWrites,
    droppedLeftovers,
  };
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
  it("assigns the same existing agent to Ringee and BYOC numbers, moving only the Ringee DID", async () => {
    const previous = config.TELNYX_CALL_CONTROL_APP_ID;
    config.TELNYX_CALL_CONTROL_APP_ID = "receptionist-app";
    try {
      const s = setup();
      s.state.agent = {
        id: "existing-agent",
        name: "Reception",
        type: "receptionist",
      };
      const destination = {
        destinationType: InboundDestinationType.ai_receptionist,
        destinationId: "existing-agent",
      };
      await s.service.saveForNumber(ADMIN, ringee, destination);
      await s.service.saveForNumber(ADMIN, external, destination);
      assert.deepEqual(
        s.saved.map((row) => row.destinationId),
        ["existing-agent", "existing-agent"],
      );
      assert.deepEqual(s.assignments, [s.state.number.phoneNumber]);
      assert.equal(s.state.number.providerConnectionId, "receptionist-app");
    } finally {
      config.TELNYX_CALL_CONTROL_APP_ID = previous;
    }
  });

  it("refuses to assign a number to an agent that is not a receptionist", async () => {
    for (const type of ["appointment_booking", "reminders_notifications"]) {
      const s = setup();
      s.state.agent = { id: "outbound-agent", name: "Sofia", type };
      await assert.rejects(
        s.service.saveForNumber(ADMIN, ringee, {
          destinationType: InboundDestinationType.ai_receptionist,
          destinationId: "outbound-agent",
        }),
        BadRequestException,
      );
      assert.deepEqual(s.saved, []);
      assert.deepEqual(s.assignments, []);
    }
  });

  for (const pinned of [false, true])
    for (const leave of ["reroute", "reset"] as const)
      it(`returns a Ringee DID to its ${pinned ? "desk phone" : "shared"} connection when it leaves the AI (${leave})`, () =>
        withDeskPhones(async () => {
          const previous = {
            app: config.TELNYX_CALL_CONTROL_APP_ID,
            shared: config.TELNYX_CONNECTION_ID,
          };
          config.TELNYX_CALL_CONTROL_APP_ID = "receptionist-app";
          config.TELNYX_CONNECTION_ID = "shared-webrtc";
          try {
            const s = setup();
            s.state.agent = {
              id: "existing-agent",
              name: "Reception",
              type: "receptionist",
            };
            s.state.device = {
              ...s.state.device,
              telnyxConnectionId: "desk-connection",
            };
            if (pinned)
              Object.assign(s.state.number, {
                inboundMode: NumberInboundMode.desk_phone_only,
                inboundSipDeviceId: "device-1",
              });
            await s.service.saveForNumber(ADMIN, ringee, {
              destinationType: InboundDestinationType.ai_receptionist,
              destinationId: "existing-agent",
            });
            assert.equal(
              s.state.number.providerConnectionId,
              "receptionist-app",
            );
            if (leave === "reroute")
              await s.service.saveForNumber(ADMIN, ringee, {
                destinationType: InboundDestinationType.user,
                destinationId: "user-b",
              });
            else await s.service.deleteForNumber(ADMIN, ringee);
            assert.equal(
              s.state.number.providerConnectionId,
              pinned ? "desk-connection" : "shared-webrtc",
            );
            // A number that is home already is not moved again.
            const moves = s.assignments.length;
            await s.service.deleteForNumber(ADMIN, ringee);
            assert.equal(s.assignments.length, moves);
          } finally {
            config.TELNYX_CALL_CONTROL_APP_ID = previous.app;
            config.TELNYX_CONNECTION_ID = previous.shared;
          }
        }));

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
      InboundDestinationType.extension,
      InboundDestinationType.ai_receptionist,
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
    assert.deepEqual(s.droppedLeftovers, []);
  });

  // A number moved out of the personal workspace kept its route there: the
  // organization could not see it, and its saves landed on it.
  const personalLeftover = {
    id: "personal-route",
    userId: "user-a",
    organizationId: null,
    numberId: "number-r",
    destinationType: InboundDestinationType.user,
    destinationId: "user-a",
    version: 3,
  };

  it("replaces a route the number kept from the workspace it was moved out of", async () => {
    const previous = config.TELNYX_CALL_CONTROL_APP_ID;
    config.TELNYX_CALL_CONTROL_APP_ID = "receptionist-app";
    try {
      const s = setup();
      s.state.leftover = { ...personalLeftover };
      s.state.agent = { id: "lucia", name: "Lucía", type: "receptionist" };
      const view = await s.service.saveForNumber(ADMIN, ringee, {
        destinationType: InboundDestinationType.ai_receptionist,
        destinationId: "lucia",
      });
      assert.deepEqual(s.droppedLeftovers, ["personal-route"]);
      assert.equal(s.state.leftover, null);
      assert.equal(view.configured, true);
      assert.equal(view.destinationId, "lucia");
      // Nothing of the old workspace's route is carried over as a backup.
      assert.equal(s.saved[0]!.restore, null);
    } finally {
      config.TELNYX_CALL_CONTROL_APP_ID = previous;
    }
  });

  it("resets a number to its default even when the old workspace's route is still on it", async () => {
    const s = setup();
    s.state.leftover = { ...personalLeftover };
    const view = await s.service.deleteForNumber(ADMIN, ringee);
    assert.deepEqual(s.droppedLeftovers, ["personal-route"]);
    assert.equal(view.configured, false);
  });

  // The number was checked, then moved to another workspace before this write
  // got the lock: the route that workspace wrote meanwhile is not a leftover to
  // drop, and no route may be written back for the workspace it left.
  for (const write of ["save", "reset"] as const)
    it(`touches no route when the number moved away before the ${write} got the lock`, async () => {
      const s = setup();
      const newOwners = {
        id: "org-2-route",
        userId: "user-z",
        organizationId: "org-2",
        numberId: "number-r",
        destinationType: InboundDestinationType.user,
        destinationId: "user-z",
        version: 1,
      };
      s.state.onLock = () => {
        s.state.number.organizationId = "org-2";
        s.state.leftover = newOwners;
      };
      await assert.rejects(
        write === "save"
          ? s.service.saveForNumber(ADMIN, ringee, {
              destinationType: InboundDestinationType.ring_group,
              destinationId: "group-1",
            })
          : s.service.deleteForNumber(ADMIN, ringee),
        NotFoundException,
      );
      assert.deepEqual(s.droppedLeftovers, []);
      assert.equal(s.state.leftover, newOwners);
      assert.deepEqual(s.saved, []);
      assert.deepEqual(s.deleted, []);
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

  it("lists the workspace's routes and skips one whose number is gone", async () => {
    const s = setup();
    await s.service.saveForNumber(ADMIN, ringee, {
      destinationType: InboundDestinationType.ring_group,
      destinationId: "group-1",
    });
    s.state.route!.numberId = "number-r";

    assert.equal((await s.service.list(ADMIN)).length, 1);

    // Releasing a number soft-deletes it and leaves its route behind. That
    // stale row is skipped; it must not take the whole list down with it.
    s.state.number.deletedAt = new Date();
    assert.deepEqual(await s.service.list(ADMIN), []);
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

  it("refuses IVR destinations as not available yet", async () => {
    const s = setup();
    for (const destinationType of [InboundDestinationType.ivr])
      await assert.rejects(
        s.service.saveForNumber(ADMIN, ringee, {
          destinationType,
          destinationId: "00000000-0000-4000-8000-000000000000",
        }),
        NotImplementedException,
      );
    assert.deepEqual(s.saved, []);
  });

  it("allows existing carrier destinations on the controlled transport", () =>
    withDeskPhones(async () => {
      const s = setup();
      await s.service.saveForNumber(ADMIN, external, {
        destinationType: InboundDestinationType.user,
        destinationId: "user-b",
      });
      await s.service.saveForNumber(ADMIN, external, {
        destinationType: InboundDestinationType.ring_group,
        destinationId: "group-1",
      });
      const deskPhone = await s.service.saveForNumber(ADMIN, external, {
        destinationType: InboundDestinationType.desk_phone,
        destinationId: "device-1",
      });
      assert.equal(deskPhone.destinationLabel, "Office Yealink");
      assert.ok(
        deskPhone.availableDestinationTypes.includes(
          InboundDestinationType.ai_receptionist,
        ),
      );
      assert.ok(
        deskPhone.availableDestinationTypes.includes(
          InboundDestinationType.user,
        ),
      );
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

describe("InboundRouteService receptionist pause (AGENT-018)", () => {
  const ringee = { kind: "ringee" as const, id: "number-r" };
  const external = { kind: "external" as const, id: "number-x" };
  const RECEPTIONIST = {
    destinationType: InboundDestinationType.ai_receptionist,
    destinationId: "agent-r",
  };

  async function withApp<T>(run: () => Promise<T>): Promise<T> {
    const previous = {
      app: config.TELNYX_CALL_CONTROL_APP_ID,
      shared: config.TELNYX_CONNECTION_ID,
    };
    config.TELNYX_CALL_CONTROL_APP_ID = "receptionist-app";
    config.TELNYX_CONNECTION_ID = "shared-webrtc";
    try {
      return await run();
    } finally {
      config.TELNYX_CALL_CONTROL_APP_ID = previous.app;
      config.TELNYX_CONNECTION_ID = previous.shared;
    }
  }

  function receptionistSetup() {
    const s = setup();
    s.state.agent = { id: "agent-r", name: "Lucía", type: "receptionist" };
    return s;
  }

  it("remembers where a number rang before the receptionist took it", () =>
    withApp(async () => {
      const s = receptionistSetup();
      await s.service.saveForNumber(ADMIN, ringee, {
        destinationType: InboundDestinationType.ring_group,
        destinationId: "group-1",
      });
      await s.service.saveForNumber(ADMIN, ringee, RECEPTIONIST);
      assert.deepEqual(s.saved.at(-1)!.restore, {
        destinationType: InboundDestinationType.ring_group,
        destinationId: "group-1",
      });
      // Saving the receptionist again keeps that, rather than "remembering"
      // the receptionist itself.
      await s.service.saveForNumber(ADMIN, ringee, RECEPTIONIST);
      assert.deepEqual(s.saved.at(-1)!.restore, {
        destinationType: InboundDestinationType.ring_group,
        destinationId: "group-1",
      });
    }));

  it("stores an explicit backup chosen at setup, once it is checked", () =>
    withApp(async () => {
      const s = receptionistSetup();
      await s.service.saveForNumber(ADMIN, ringee, RECEPTIONIST, {
        restoreTo: {
          destinationType: InboundDestinationType.user,
          destinationId: "user-b",
        },
      });
      assert.deepEqual(s.saved.at(-1)!.restore, {
        destinationType: InboundDestinationType.user,
        destinationId: "user-b",
      });
      await assert.rejects(
        s.service.saveForNumber(ADMIN, ringee, RECEPTIONIST, {
          restoreTo: {
            destinationType: InboundDestinationType.user,
            destinationId: "not-a-member",
          },
        }),
        NotFoundException,
      );
    }));

  it("hands the number back under compare-and-set and returns the DID to its connection", () =>
    withApp(async () => {
      const s = receptionistSetup();
      await s.service.saveForNumber(ADMIN, ringee, {
        destinationType: InboundDestinationType.ring_group,
        destinationId: "group-1",
      });
      await s.service.saveForNumber(ADMIN, ringee, RECEPTIONIST);
      const version = s.state.route!.version;

      const result = await s.service.releaseReceptionist(ADMIN, "agent-r");

      assert.deepEqual(result, { restored: 1, failed: [] });
      assert.equal(s.casWrites[0]!.expected.version, version);
      assert.equal(s.state.route!.destinationType, "ring_group");
      assert.equal(s.state.number.providerConnectionId, "shared-webrtc");
    }));

  it("leaves a number another admin re-pointed meanwhile exactly as they set it", () =>
    withApp(async () => {
      const s = receptionistSetup();
      await s.service.saveForNumber(ADMIN, ringee, {
        destinationType: InboundDestinationType.user,
        destinationId: "user-a",
      });
      await s.service.saveForNumber(ADMIN, ringee, RECEPTIONIST);
      // Read by the release, then moved on by someone else before its write.
      const service = s.service as unknown as {
        routes: { listByDestination: () => Promise<Row[]> };
      };
      const stale = { ...s.state.route! };
      s.state.route!.version += 1;
      service.routes.listByDestination = async () => [stale];

      const result = await s.service.releaseReceptionist(ADMIN, "agent-r");

      assert.equal(result.restored, 0);
      assert.equal(result.failed.length, 1);
      assert.match(result.failed[0]!.error, /changed this number's routing/);
      assert.equal(s.state.route!.destinationType, "ai_receptionist");
    }));

  it("never leaves a BYOC number unrouted to pause the receptionist", () =>
    withApp(async () => {
      const s = receptionistSetup();
      await s.service.saveForNumber(ADMIN, external, RECEPTIONIST);

      const result = await s.service.releaseReceptionist(ADMIN, "agent-r");

      assert.equal(result.restored, 0);
      assert.match(result.failed[0]!.error, /Choose where calls/);
      assert.equal(s.state.route!.destinationId, "agent-r");
    }));
});
