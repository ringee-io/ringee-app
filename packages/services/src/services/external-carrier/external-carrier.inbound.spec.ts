import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import {
  CarrierConnectionError,
  signCarrierRouteKey,
  type TelephonyEvent,
} from "@ringee/platform";
import { ExternalCarrierService } from "./external-carrier.service";

process.env.SDK_SIGNING_SECRET ||= "external-carrier-inbound-spec-secret";

const ENDPOINT = "3f2b9c1e-8d4a-4b6f-9e21-5c7d8a9b0c1d";
const APP = "cc-app";
const config = apiConfiguration as unknown as Record<string, unknown>;

type Device = {
  id: string;
  userId: string;
  organizationId: string;
  sipUsername: string;
  allowInbound: boolean;
  status: string;
  deletedAt: Date | null;
};

function setup() {
  const desk: Device = {
    id: "device-1",
    userId: "user-a",
    organizationId: "org-1",
    sipUsername: "rgdesk201",
    allowInbound: true,
    status: "registered",
    deletedAt: null,
  };
  const state = {
    members: new Set(["user-a"]),
    endpoint: {
      id: ENDPOINT,
      organizationId: "org-1",
      carrierId: "carrier-1",
      syncStatus: "synced",
      providerConnectionId: "uac-1",
      carrier: { organizationId: "org-1", status: "active" },
      numbers: [
        {
          id: "number-1",
          active: true,
          organizationId: "org-1",
          phoneNumber: "+13055550101",
          inboundSipDevice: desk as Device | null,
        },
      ],
    } as Record<string, any> | null,
  };
  const lookups: string[] = [];
  const service = new ExternalCarrierService(
    {
      findInboundRoute: async (id: string) => {
        lookups.push(id);
        return state.endpoint && structuredClone(state.endpoint);
      },
    } as never,
    {
      isMember: async (userId: string, orgId: string) =>
        orgId === "org-1" && state.members.has(userId),
    } as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const event = (overrides: Partial<TelephonyEvent> = {}): TelephonyEvent => ({
    type: "call.initiated",
    provider: "telnyx",
    providerEventType: "call.initiated",
    callControlId: "leg-a",
    connectionId: APP,
    callSessionId: "session-1",
    callLegId: "leg-id",
    clientState: null,
    direction: "inbound",
    from: "sip:+12125550199@pbx.example.com",
    to: `sip:${signCarrierRouteKey(ENDPOINT)}@ringee.sip.telnyx.com`,
    occurredAt: new Date(),
    startedAt: new Date(),
    customHeaders: [],
    conversation: null,
    payload: {},
    ...overrides,
  });
  return { service, state, desk, event, lookups };
}

async function withConfig<T>(run: () => Promise<T>) {
  const previous = {
    app: config.TELNYX_CALL_CONTROL_APP_ID,
    desk: config.DESK_PHONES_ENABLED,
  };
  config.TELNYX_CALL_CONTROL_APP_ID = APP;
  config.DESK_PHONES_ENABLED = true;
  try {
    return await run();
  } finally {
    config.TELNYX_CALL_CONTROL_APP_ID = previous.app;
    config.DESK_PHONES_ENABLED = previous.desk;
  }
}

describe("ExternalCarrierService inbound routing", () => {
  it("routes a verified carrier call to its number's desk phone, preserving both numbers", () =>
    withConfig(async () => {
      const s = setup();
      assert.deepEqual(await s.service.resolveInbound(s.event()), {
        kind: "desk_phone",
        ctx: { userId: "user-a", organizationId: "org-1" },
        fromNumber: "+12125550199",
        callerId: "+12125550199",
        toNumber: "+13055550101",
        externalCarrierId: "carrier-1",
        externalSipEndpointId: ENDPOINT,
        sipDeviceId: "device-1",
        sipUsername: "rgdesk201",
      });
    }));

  it("leaves Ringee's own inbound calls alone without touching the database", () =>
    withConfig(async () => {
      const s = setup();
      for (const overrides of [
        { connectionId: "credential-connection", to: "+13055550101" },
        { to: "+13055550101" },
        { connectionId: "credential-connection" },
      ])
        assert.deepEqual(await s.service.resolveInbound(s.event(overrides)), {
          kind: "none",
        });
      assert.deepEqual(s.lookups, []);
    }));

  it("refuses a forged routing key without looking anything up", () =>
    withConfig(async () => {
      const s = setup();
      const forged = `rcr${"0".repeat(64)}`;
      const route = await s.service.resolveInbound(
        s.event({ to: `sip:${forged}@ringee.sip.telnyx.com` }),
      );
      assert.equal(route.kind, "refused");
      assert.deepEqual(s.lookups, []);
    }));

  it("uses the PBX's called-number header only among the extension's own numbers", () =>
    withConfig(async () => {
      const s = setup();
      const second = { ...s.state.endpoint!.numbers[0] };
      s.state.endpoint!.numbers.push({
        ...second,
        id: "number-2",
        phoneNumber: "+13055550102",
        inboundSipDevice: { ...s.desk, id: "device-2", sipUsername: "desk2" },
      });
      const header = (value: string) => ({
        customHeaders: [{ name: "X-Ringee-Called-Number", value }],
      });
      const routed = await s.service.resolveInbound(
        s.event(header("+1 (305) 555-0102")),
      );
      assert.equal(routed.kind, "desk_phone");
      assert.equal(
        routed.kind === "desk_phone" && routed.toNumber,
        "+13055550102",
      );
      assert.equal(routed.kind === "desk_phone" && routed.sipUsername, "desk2");
      // Ambiguity is never resolved by guessing.
      assert.equal((await s.service.resolveInbound(s.event())).kind, "refused");
      assert.equal(
        (await s.service.resolveInbound(s.event(header("+19995550100")))).kind,
        "refused",
      );
      assert.equal(
        (
          await s.service.resolveInbound(
            s.event({
              customHeaders: [
                { name: "x-ringee-called-number", value: "+13055550101" },
                { name: "x-ringee-called-number", value: "+13055550102" },
              ],
            }),
          )
        ).kind,
        "refused",
      );
    }));

  it("refuses when the route or its desk phone cannot take the call", () =>
    withConfig(async () => {
      const cases: Array<(s: ReturnType<typeof setup>) => void> = [
        (s) => (s.state.endpoint = null),
        (s) => (s.state.endpoint!.carrier.status = "deleting"),
        (s) => (s.state.endpoint!.syncStatus = "error"),
        (s) => (s.state.endpoint!.carrier.organizationId = "org-2"),
        (s) => (s.state.endpoint!.numbers = []),
        (s) => (s.state.endpoint!.numbers[0].active = false),
        (s) => (s.state.endpoint!.numbers[0].inboundSipDevice = null),
        (s) => (s.state.endpoint!.numbers[0].organizationId = "org-2"),
        (s) =>
          (s.state.endpoint!.numbers[0].inboundSipDevice.organizationId =
            "org-2"),
        (s) =>
          (s.state.endpoint!.numbers[0].inboundSipDevice.status = "disabled"),
        (s) =>
          (s.state.endpoint!.numbers[0].inboundSipDevice.allowInbound = false),
        (s) =>
          (s.state.endpoint!.numbers[0].inboundSipDevice.deletedAt =
            new Date()),
        (s) => s.state.members.clear(),
        () => (config.DESK_PHONES_ENABLED = false),
      ];
      for (const [index, mutate] of cases.entries()) {
        const s = setup();
        config.DESK_PHONES_ENABLED = true;
        mutate(s);
        const route = await s.service.resolveInbound(s.event());
        assert.equal(route.kind, "refused", `case ${index}`);
      }
    }));

  it("does not send an inactive DID's unidentified calls to the remaining active DID", () =>
    withConfig(async () => {
      const s = setup();
      s.state.endpoint!.numbers.push({
        ...s.state.endpoint!.numbers[0],
        id: "inactive-number",
        phoneNumber: "+13055550102",
        active: false,
      });
      assert.equal((await s.service.resolveInbound(s.event())).kind, "refused");
      const identified = (value: string) =>
        s.event({
          customHeaders: [{ name: "X-Ringee-Called-Number", value }],
        });
      assert.equal(
        (await s.service.resolveInbound(identified("+13055550102"))).kind,
        "refused",
      );
      assert.equal(
        (await s.service.resolveInbound(identified("+13055550101"))).kind,
        "desk_phone",
      );
    }));

  it("keeps a caller without an E.164 number as reported, with no caller ID", () =>
    withConfig(async () => {
      const s = setup();
      const route = await s.service.resolveInbound(
        s.event({ from: "sip:anonymous@pbx.example.com" }),
      );
      assert.equal(
        route.kind === "desk_phone" && route.fromNumber,
        "anonymous",
      );
      assert.equal(route.kind === "desk_phone" && route.callerId, null);
    }));
});

describe("ExternalCarrierService desk phone assignment", () => {
  function carrierSetup() {
    const events: string[] = [];
    const number = {
      id: "number-1",
      endpointId: ENDPOINT,
      phoneNumber: "+13055550101",
      active: true,
      inboundSipDeviceId: null as string | null,
    };
    const endpoint = {
      id: ENDPOINT,
      extension: "201",
      syncStatus: "synced",
      providerConnectionId: "uac-1",
      numbers: [number],
    };
    const carrier = {
      id: "carrier-1",
      organizationId: "org-1",
      status: "active",
      endpoints: [endpoint] as Array<Record<string, unknown>>,
    };
    const faults = { device: null as Error | null, provider: false };
    const saved: Array<Record<string, unknown>> = [];
    const service = new ExternalCarrierService(
      {
        find: async () => structuredClone(carrier),
        acquire: async () => true,
        release: async () => {},
        saveNumber: async (
          _owner: unknown,
          _endpointId: string,
          data: Record<string, unknown>,
        ) => {
          saved.push(data);
        },
      } as never,
      {
        findMembershipsByUserId: async () => [
          { organizationId: "org-1", role: "org:admin" },
        ],
      } as never,
      {
        configureCarrierInbound: async (id: string, key: string) => {
          events.push(`configure:${id}:${key}`);
          if (faults.provider) throw new CarrierConnectionError(false);
        },
      } as never,
      {} as never,
      {
        prepareForCarrierInbound: async (
          owner: { organizationId: string },
          deviceId: string,
        ) => {
          events.push(`prepare:${owner.organizationId}:${deviceId}`);
          if (faults.device) throw faults.device;
        },
      } as never,
    );
    const admin = { userId: "admin", organizationId: "org-1" };
    return { service, events, saved, endpoint, number, faults, admin, carrier };
  }

  it("prepares the desk phone and points the connection at Ringee before saving", async () => {
    const h = carrierSetup();
    await h.service.saveNumber(
      h.admin,
      "carrier-1",
      {
        endpointId: ENDPOINT,
        phoneNumber: "+13055550101",
        inboundSipDeviceId: "device-1",
      },
      "number-1",
    );
    assert.deepEqual(h.events, [
      "prepare:org-1:device-1",
      `configure:uac-1:${signCarrierRouteKey(ENDPOINT)}`,
    ]);
    assert.equal(h.saved[0].inboundSipDeviceId, "device-1");
  });

  it("validates the number before changing any provider routing", async () => {
    const h = carrierSetup();
    await assert.rejects(
      h.service.saveNumber(h.admin, "carrier-1", {
        endpointId: ENDPOINT,
        phoneNumber: "not-a-number",
        inboundSipDeviceId: "device-1",
      }),
      BadRequestException,
    );
    assert.deepEqual(h.events, []);
    assert.deepEqual(h.saved, []);
  });

  it("clears routing without provider calls and keeps it on unrelated edits", async () => {
    const h = carrierSetup();
    await h.service.saveNumber(
      h.admin,
      "carrier-1",
      {
        endpointId: ENDPOINT,
        phoneNumber: "+13055550101",
        inboundSipDeviceId: null,
      },
      "number-1",
    );
    assert.deepEqual(h.events, []);
    assert.equal(h.saved[0].inboundSipDeviceId, null);
    h.number.inboundSipDeviceId = "device-1";
    await h.service.saveNumber(
      h.admin,
      "carrier-1",
      { endpointId: ENDPOINT, phoneNumber: "+13055550101", active: false },
      "number-1",
    );
    // An unrelated edit touches neither the phone nor the connection.
    assert.deepEqual(h.events, []);
    assert.equal(h.saved[1].inboundSipDeviceId, undefined);
  });

  it("re-points the new extension's connection when a routed number moves", async () => {
    const h = carrierSetup();
    const other = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
    h.number.inboundSipDeviceId = "device-1";
    (h.endpoint as { numbers: unknown[] }).numbers = [];
    h.carrier.endpoints.push({
      id: other,
      extension: "202",
      syncStatus: "synced",
      providerConnectionId: "uac-2",
      numbers: [],
    });
    (h.carrier.endpoints[0] as { numbers: unknown[] }).numbers = [
      { ...h.number, endpointId: ENDPOINT },
    ];
    await h.service.saveNumber(
      h.admin,
      "carrier-1",
      { endpointId: other, phoneNumber: "+13055550101" },
      "number-1",
    );
    assert.deepEqual(h.events, [
      `configure:uac-2:${signCarrierRouteKey(other)}`,
    ]);
  });

  it("refuses routing on an unsynchronized extension or an unusable phone", async () => {
    const h = carrierSetup();
    h.endpoint.syncStatus = "error";
    await assert.rejects(
      h.service.saveNumber(h.admin, "carrier-1", {
        endpointId: ENDPOINT,
        phoneNumber: "+13055550101",
        inboundSipDeviceId: "device-1",
      }),
      ConflictException,
    );
    const g = carrierSetup();
    g.faults.device = new BadRequestException("no inbound");
    await assert.rejects(
      g.service.saveNumber(g.admin, "carrier-1", {
        endpointId: ENDPOINT,
        phoneNumber: "+13055550101",
        inboundSipDeviceId: "device-1",
      }),
      BadRequestException,
    );
    const f = carrierSetup();
    f.faults.provider = true;
    await assert.rejects(
      f.service.saveNumber(f.admin, "carrier-1", {
        endpointId: ENDPOINT,
        phoneNumber: "+13055550101",
        inboundSipDeviceId: "device-1",
      }),
      BadGatewayException,
    );
    assert.deepEqual([...h.saved, ...g.saved, ...f.saved], []);
  });
});
