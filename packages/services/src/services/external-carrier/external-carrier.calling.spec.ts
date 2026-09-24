import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import type { ExternalCallingRoute } from "@ringee/database";
import {
  CarrierConnectionError,
  signCarrierCallKey,
  type CarrierDialDestination,
  type CarrierRegistration,
} from "@ringee/platform";
import { ExternalCarrierService } from "./external-carrier.service";

const ctx = { userId: "member-1", organizationId: "org-1" };
const HOST = "generated.example.net";

function setup() {
  const provider: string[] = [];
  const recorded: Array<{ endpointId: string; fqdn: string }> = [];
  const lookups: Array<Record<string, unknown>> = [];
  const state = {
    member: true,
    number: {
      id: "number-1",
      phoneNumber: "+13055550101",
      active: true,
      endpoint: {
        id: "endpoint-1",
        carrierId: "carrier-1",
        syncStatus: "synced",
        providerConnectionId: "uac-1",
        providerFqdn: null as string | null,
        carrier: { id: "carrier-1", status: "active" },
      },
    } as ExternalCallingRoute | null,
    registration: "registered" as CarrierRegistration["status"],
    dial: {
      uri: `sip:+12125550199@${HOST}`,
      fqdn: HOST,
    } as CarrierDialDestination | null,
    providerError: null as Error | null,
  };
  const repo = {
    listCallingNumbers: async () =>
      state.number
        ? [{ id: state.number.id, phoneNumber: state.number.phoneNumber }]
        : [],
    findCallingRoute: async (
      owner: typeof ctx,
      where: Record<string, unknown>,
    ) => {
      lookups.push({ organizationId: owner.organizationId, ...where });
      return state.number && structuredClone(state.number);
    },
    recordProviderFqdn: async (
      _owner: typeof ctx,
      endpointId: string,
      fqdn: string,
    ) => {
      recorded.push({ endpointId, fqdn });
    },
    isProviderFqdn: async (host: string) => host === HOST,
  };
  const telephony = {
    checkCarrierRegistration: async (id: string) => {
      provider.push(`check:${id}`);
      if (state.providerError) throw state.providerError;
      return { status: state.registration } as CarrierRegistration;
    },
    getCarrierDialDestination: async (id: string, destination: string) => {
      provider.push(`destination:${id}:${destination}`);
      if (state.providerError) throw state.providerError;
      return state.dial;
    },
    getCarrierOutboundEntry: async (key: string) => {
      provider.push(`entry:${key}`);
      if (state.providerError) throw state.providerError;
      return `sip:${key}@ringee.sip.telnyx.com`;
    },
  };
  const service = new ExternalCarrierService(
    repo as never,
    { isMember: async () => state.member } as never,
    telephony as never,
    {} as never,
    {} as never,
  );
  return { service, state, provider, recorded, lookups };
}

describe("ExternalCarrierService outbound calling", () => {
  it("resolves the provider-generated destination for an organization member", async () => {
    const s = setup();
    const route = await s.service.resolveOutbound(
      ctx,
      "number-1",
      "+1 (212) 555-0199",
    );
    assert.deepEqual(route, {
      fromNumber: "+13055550101",
      toNumber: "+12125550199",
      destinationUri: `sip:+12125550199@${HOST}`,
      externalCarrierId: "carrier-1",
      externalSipEndpointId: "endpoint-1",
    });
    assert.deepEqual(s.provider.sort(), [
      "check:uac-1",
      "destination:uac-1:+12125550199",
    ]);
    assert.deepEqual(s.lookups, [{ organizationId: "org-1", id: "number-1" }]);
    // The host Telnyx generated is remembered for the carrier-host guard.
    assert.deepEqual(s.recorded, [{ endpointId: "endpoint-1", fqdn: HOST }]);
  });

  it("requires an organization membership and never reaches the provider otherwise", async () => {
    const s = setup();
    await assert.rejects(
      s.service.resolveOutbound(
        { userId: "user-1" },
        "number-1",
        "+12125550199",
      ),
      ForbiddenException,
    );
    s.state.member = false;
    await assert.rejects(
      s.service.resolveOutbound(ctx, "number-1", "+12125550199"),
      ForbiddenException,
    );
    assert.deepEqual(await s.service.listCallingNumbers({ userId: "u" }), []);
    assert.deepEqual(s.provider, []);
  });

  it("reports a number of another organization as not found", async () => {
    const s = setup();
    s.state.number = null;
    await assert.rejects(
      s.service.resolveOutbound(ctx, "foreign-number", "+12125550199"),
      NotFoundException,
    );
    assert.deepEqual(s.provider, []);
  });

  it("rejects an invalid destination before any lookup", async () => {
    const s = setup();
    for (const destination of ["12125550199", "sip:+1212@evil.test", "+1"]) {
      await assert.rejects(
        s.service.resolveOutbound(ctx, "number-1", destination),
        BadRequestException,
      );
    }
    assert.deepEqual(s.provider, []);
  });

  it("refuses a missing endpoint, UAC or an unusable carrier without dialing", async () => {
    const mutations: Array<(n: ExternalCallingRoute) => void> = [
      (n) => (n.active = false),
      (n) => (n.endpoint.syncStatus = "pending"),
      (n) => (n.endpoint.providerConnectionId = null),
      (n) => (n.endpoint.carrier.status = "deleting"),
    ];
    for (const mutate of mutations) {
      const s = setup();
      mutate(s.state.number!);
      await assert.rejects(
        s.service.resolveOutbound(ctx, "number-1", "+12125550199"),
        ConflictException,
      );
      assert.deepEqual(s.provider, []);
    }
  });

  it("refuses an unregistered or uncallable connection", async () => {
    const s = setup();
    s.state.registration = "failed";
    await assert.rejects(
      s.service.resolveOutbound(ctx, "number-1", "+12125550199"),
      /not registered/,
    );
    s.state.registration = "registered";
    s.state.dial = null;
    await assert.rejects(
      s.service.resolveOutbound(ctx, "number-1", "+12125550199"),
      /Synchronize its extension/,
    );
    assert.deepEqual(s.recorded, []);
  });

  it("maps provider failures to a sanitized carrier error", async () => {
    const s = setup();
    s.state.providerError = new CarrierConnectionError(true);
    const error = await s.service
      .resolveOutbound(ctx, "number-1", "+12125550199")
      .catch((e: unknown) => e);
    assert.ok(error instanceof BadGatewayException);
    assert.doesNotMatch((error as Error).message, /uac|telnyx|sip:/i);
  });

  it("re-confirms a route from Ringee's records only", async () => {
    const s = setup();
    s.state.number!.endpoint.providerFqdn = HOST;
    assert.equal(
      await s.service.confirmOutboundRoute(ctx, {
        fromNumber: "+13055550101",
        externalSipEndpointId: "endpoint-1",
      }),
      HOST,
    );
    assert.deepEqual(s.lookups.at(-1), {
      organizationId: "org-1",
      phoneNumbers: ["+13055550101", "13055550101"],
      endpointId: "endpoint-1",
    });
    s.state.number!.endpoint.syncStatus = "error";
    assert.equal(
      await s.service.confirmOutboundRoute(ctx, {
        fromNumber: "+13055550101",
        externalSipEndpointId: "endpoint-1",
      }),
      null,
    );
    s.state.member = false;
    s.state.number!.endpoint.syncStatus = "synced";
    assert.equal(
      await s.service.confirmOutboundRoute(ctx, {
        fromNumber: "+13055550101",
        externalSipEndpointId: "endpoint-1",
      }),
      null,
    );
    assert.deepEqual(s.provider, []);
  });

  it("sends the browser to Ringee's application with the call's own key, never to the carrier", async () => {
    const s = setup();
    const id = "7c1e2d3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f";
    const entry = await s.service.outboundEntry(id);
    assert.equal(entry, `sip:${signCarrierCallKey(id)}@ringee.sip.telnyx.com`);
    assert.ok(!entry.includes(HOST));
    s.state.providerError = new CarrierConnectionError(false);
    await assert.rejects(s.service.outboundEntry(id), BadGatewayException);
  });

  it("builds the carrier leg's destination from Ringee's records only", async () => {
    const s = setup();
    s.state.number!.endpoint.providerFqdn = HOST;
    const route = {
      fromNumber: "+13055550101",
      toNumber: "+18299621624",
      externalSipEndpointId: "endpoint-1",
    };
    assert.equal(
      await s.service.outboundCarrierDestination(ctx, route),
      `sip:+18299621624@${HOST}`,
    );
    assert.equal(
      await s.service.outboundCarrierDestination(ctx, {
        ...route,
        toNumber: "sip:evil@elsewhere.example",
      }),
      null,
    );
    s.state.number!.endpoint.syncStatus = "error";
    assert.equal(await s.service.outboundCarrierDestination(ctx, route), null);
    s.state.number!.endpoint.syncStatus = "synced";
    s.state.number!.endpoint.providerFqdn = null;
    assert.equal(await s.service.outboundCarrierDestination(ctx, route), null);
    assert.deepEqual(s.provider, []);
  });

  it("dials in the format the external number was saved in, keeping Ringee's records E.164", async () => {
    const s = setup();
    s.state.number!.phoneNumber = "13055550101";
    s.state.dial = { uri: `sip:12125550199@${HOST}`, fqdn: HOST };
    const route = await s.service.resolveOutbound(
      ctx,
      "number-1",
      "+1 (212) 555-0199",
    );
    assert.equal(route.fromNumber, "+13055550101");
    assert.equal(route.toNumber, "+12125550199");
    assert.equal(route.destinationUri, `sip:12125550199@${HOST}`);
    assert.ok(s.provider.includes("destination:uac-1:12125550199"));
    assert.deepEqual(
      (await s.service.listCallingNumbers(ctx)).map((n) => n.phoneNumber),
      ["+13055550101"],
    );

    s.state.number!.endpoint.providerFqdn = HOST;
    assert.equal(
      await s.service.outboundCarrierDestination(ctx, {
        fromNumber: "+13055550101",
        toNumber: "+18299621624",
        externalSipEndpointId: "endpoint-1",
      }),
      `sip:18299621624@${HOST}`,
    );
  });

  it("recognizes carrier hosts case-insensitively", async () => {
    const s = setup();
    assert.equal(await s.service.isCarrierHost("GENERATED.example.net"), true);
    assert.equal(await s.service.isCarrierHost("sip.example.com"), false);
  });
});
