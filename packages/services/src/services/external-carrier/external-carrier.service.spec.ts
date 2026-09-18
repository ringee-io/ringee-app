import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BadGatewayException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { ExternalCarrierWithEndpoints } from "@ringee/database";
import {
  CarrierConnectionError,
  CarrierRegistration,
  CryptoService,
} from "@ringee/platform";
import { ExternalCarrierService } from "./external-carrier.service";
import {
  normalizeExternalNumber,
  normalizeSipInput,
  normalizeSipProxy,
} from "./external-carrier.validation";

const ctx = { userId: "user-1", organizationId: "org-1" };
const input = {
  extension: "201",
  proxy: "sip.example.com:5061",
  sipUsername: "auth201",
  password: "test-sip-password-DO-NOT-LOG",
  transport: "TLS" as const,
};
type Carrier = ExternalCarrierWithEndpoints;
type Endpoint = Carrier["endpoints"][number];

function setup() {
  const rows: Carrier[] = [];
  const calls: Array<{ method: string; id?: string; config?: unknown }> = [];
  const crypto = new CryptoService();
  const faults = {
    role: "org:admin",
    create: null as Error | null,
    update: false,
    registration: false,
    deleteId: "",
    saveId: false,
    localDelete: false,
    lock: false,
    found: true,
    inbound: false,
    fqdn: "generated.example.net" as string | null,
  };
  let state: CarrierRegistration = {
    status: "registered",
    providerStatus: "registered",
    lastRegisteredAt: new Date("2026-09-01T12:00:00Z"),
    ipAddress: "203.0.113.10",
    port: 5061,
    transport: "TLS",
  };
  const clone = <T>(value: T): T => structuredClone(value);
  const carrier = (owner: { organizationId?: string | null }, id: string) =>
    rows.find(
      (row) => row.id === id && row.organizationId === owner.organizationId,
    )!;
  const endpoint = (
    owner: { organizationId?: string | null; carrierId: string },
    id: string,
  ) => carrier(owner, owner.carrierId).endpoints.find((row) => row.id === id)!;
  const repo = {
    list: async (owner: typeof ctx) =>
      clone(rows.filter((row) => row.organizationId === owner.organizationId)),
    find: async (owner: typeof ctx, id: string) =>
      clone(carrier(owner, id) ?? null),
    create: async (owner: typeof ctx, name: string) => {
      const row = {
        id: `carrier-${rows.length + 1}`,
        ...owner,
        name,
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
        mutationToken: null,
        mutationExpiresAt: null,
        endpoints: [],
      };
      rows.push(row);
      return clone(row);
    },
    acquire: async () => !faults.lock,
    renew: async () => true,
    release: async () => {},
    updateCarrier: async (
      owner: typeof ctx & { carrierId: string },
      data: object,
    ) => Object.assign(carrier(owner, owner.carrierId), data),
    createEndpoint: async (
      owner: typeof ctx & { carrierId: string },
      data: Pick<
        Endpoint,
        | "id"
        | "extension"
        | "proxy"
        | "sipUsername"
        | "sipPasswordEncrypted"
        | "authUsername"
        | "fromUser"
        | "outboundProxy"
        | "transport"
        | "expirationSec"
      >,
    ) => {
      const row = {
        organizationId: owner.organizationId,
        carrierId: owner.carrierId,
        provider: "telnyx",
        providerConnectionId: null,
        providerFqdn: null,
        syncStatus: "pending",
        registrationStatus: "unknown",
        providerStatus: null,
        lastRegisteredAt: null,
        lastCheckedAt: null,
        lastIpAddress: null,
        lastPort: null,
        lastTransport: null,
        numbers: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      } as Endpoint;
      carrier(owner, owner.carrierId).endpoints.push(row);
      return clone(row);
    },
    updateEndpoint: async (
      owner: typeof ctx & { carrierId: string },
      id: string,
      data: Partial<Endpoint>,
    ) => {
      if (faults.saveId && data.providerConnectionId) {
        faults.saveId = false;
        throw new Error("database unavailable");
      }
      const row = endpoint(owner, id);
      Object.assign(row, data);
      return clone(row);
    },
    saveNumber: async (
      owner: typeof ctx & { carrierId: string },
      endpointId: string,
      data: {
        phoneNumber: string;
        active: boolean;
        inboundSipDeviceId?: string | null;
      },
      id?: string,
    ) => {
      const row = carrier(owner, owner.carrierId);
      const previous = row.endpoints
        .flatMap((ep) => ep.numbers)
        .find((number) => number.id === id);
      if (id)
        for (const ep of row.endpoints)
          ep.numbers = ep.numbers.filter((number) => number.id !== id);
      endpoint(owner, endpointId).numbers.push({
        id: id ?? `number-${Math.random()}`,
        endpointId,
        organizationId: owner.organizationId,
        ...data,
        inboundSipDeviceId:
          data.inboundSipDeviceId === undefined
            ? (previous?.inboundSipDeviceId ?? null)
            : data.inboundSipDeviceId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    },
    deleteNumber: async (
      owner: typeof ctx & { carrierId: string },
      id: string,
    ) => {
      for (const ep of carrier(owner, owner.carrierId).endpoints)
        ep.numbers = ep.numbers.filter((number) => number.id !== id);
    },
    deleteEndpoint: async (
      owner: typeof ctx & { carrierId: string },
      id: string,
    ) => {
      const row = carrier(owner, owner.carrierId);
      row.endpoints = row.endpoints.filter((ep) => ep.id !== id);
    },
    deleteCarrier: async (owner: typeof ctx & { carrierId: string }) => {
      if (faults.localDelete) throw new Error("database unavailable");
      rows.splice(rows.indexOf(carrier(owner, owner.carrierId)), 1);
    },
  };
  const provider = {
    getCarrierConnection: async (id: string) => ({ id, fqdn: faults.fqdn }),
    configureCarrierInbound: async () => {
      if (faults.inbound) throw new CarrierConnectionError(false);
    },
    createCarrierConnection: async (config: unknown) => {
      calls.push({ method: "create", config });
      if (faults.create) throw faults.create;
      return {
        id: `remote-${calls.filter((call) => call.method === "create").length}`,
      };
    },
    updateCarrierConnection: async (id: string, config: unknown) => {
      calls.push({ method: "update", id, config });
      if (faults.update) throw new CarrierConnectionError(true);
    },
    findCarrierConnection: async () => {
      calls.push({ method: "find" });
      return faults.found ? { id: "remote-1" } : null;
    },
    checkCarrierRegistration: async (id: string) => {
      calls.push({ method: "check", id });
      if (faults.registration) throw new CarrierConnectionError(true);
      return state;
    },
    deleteCarrierConnection: async (id: string) => {
      calls.push({ method: "delete", id });
      if (faults.deleteId === id) throw new CarrierConnectionError(true);
    },
  };
  const service = new ExternalCarrierService(
    repo as never,
    {
      findMembershipsByUserId: async () => [
        { organizationId: ctx.organizationId, role: faults.role },
      ],
    } as never,
    provider as never,
    crypto,
    {} as never,
  );
  const create = async () => {
    const created = await service.createCarrier(ctx, "Acme");
    await service.createEndpoint(ctx, created.id, input);
    return rows[0];
  };
  return {
    service,
    rows,
    calls,
    faults,
    crypto,
    create,
    setState: (next: Partial<CarrierRegistration>) => {
      state = { ...state, ...next };
    },
  };
}

describe("ExternalCarrierService", () => {
  it("backfills the provider host when an older extension is synchronized", async () => {
    const s = setup();
    const carrier = await s.create();
    carrier.endpoints[0].providerFqdn = null;
    await s.service.syncEndpoint(ctx, carrier.id, carrier.endpoints[0].id);
    assert.equal(carrier.endpoints[0].providerFqdn, "generated.example.net");
    assert.equal(carrier.endpoints[0].syncStatus, "synced");
  });

  it("keeps synchronization failed until the host and inbound destination are restored", async () => {
    const s = setup();
    const carrier = await s.create();
    const endpoint = carrier.endpoints[0];
    s.faults.fqdn = null;
    await assert.rejects(
      s.service.syncEndpoint(ctx, carrier.id, endpoint.id),
      BadGatewayException,
    );
    assert.equal(endpoint.syncStatus, "error");
    s.faults.fqdn = "generated.example.net";
    await s.service.saveNumber(ctx, carrier.id, {
      endpointId: endpoint.id,
      phoneNumber: "+13055550101",
    });
    endpoint.numbers[0].inboundSipDeviceId = "device-1";
    s.faults.inbound = true;
    await assert.rejects(
      s.service.syncEndpoint(ctx, carrier.id, endpoint.id),
      BadGatewayException,
    );
    assert.equal(endpoint.syncStatus, "error");
    s.faults.inbound = false;
    await s.service.syncEndpoint(ctx, carrier.id, endpoint.id);
    assert.equal(endpoint.syncStatus, "synced");
  });

  it("rejects personal workspaces, non-admins and nonmembers before mutations", async () => {
    const { service, faults, rows, calls } = setup();
    await assert.rejects(
      service.createCarrier({ userId: "user-1" }, "Acme"),
      ForbiddenException,
    );
    faults.role = "org:member";
    await assert.rejects(
      service.createCarrier(ctx, "Acme"),
      ForbiddenException,
    );
    await assert.rejects(service.list(ctx), ForbiddenException);
    faults.role = "org:admin";
    await assert.rejects(
      service.createCarrier({ ...ctx, organizationId: "other-org" }, "Acme"),
      ForbiddenException,
    );
    assert.equal(rows.length, 0);
    assert.equal(calls.length, 0);
  });

  it("scopes all operations and never accepts a guessed foreign resource", async () => {
    const { service, rows, create, calls } = setup();
    const row = await create();
    rows[0].organizationId = "other-org";
    calls.length = 0;
    assert.deepEqual(await service.list(ctx), []);
    for (const action of [
      () => service.updateCarrier(ctx, row.id, "x"),
      () => service.createEndpoint(ctx, row.id, input),
      () => service.updateEndpoint(ctx, row.id, row.endpoints[0].id, input),
      () => service.syncEndpoint(ctx, row.id, row.endpoints[0].id),
      () => service.refreshRegistration(ctx, row.id, row.endpoints[0].id),
      () =>
        service.saveNumber(ctx, row.id, {
          endpointId: row.endpoints[0].id,
          phoneNumber: "+13055550101",
        }),
      () => service.deleteNumber(ctx, row.id, "number"),
      () => service.deleteEndpoint(ctx, row.id, row.endpoints[0].id),
      () => service.deleteCarrier(ctx, row.id),
    ])
      await assert.rejects(action(), NotFoundException);
    assert.equal(calls.length, 0);
  });

  it("creates and renames a carrier without provider resources", async () => {
    const { service, calls } = setup();
    const row = await service.createCarrier(ctx, " Acme ");
    assert.equal(row.name, "Acme");
    assert.equal(row.source, "external_carrier");
    assert.equal(
      (await service.updateCarrier(ctx, row.id, "Office"))?.name,
      "Office",
    );
    assert.equal(calls.length, 0);
  });

  it("creates one UAC per extension, encrypts the secret and maps successful registration", async () => {
    const { create, rows, calls, crypto, service } = setup();
    await create();
    const row = rows[0].endpoints[0];
    assert.equal(row.extension, "201");
    assert.equal(row.sipUsername, "auth201");
    assert.equal(row.registrationStatus, "registered");
    assert.equal(row.syncStatus, "synced");
    assert.equal(
      crypto.decrypt(row.sipPasswordEncrypted).password,
      input.password,
    );
    assert.ok(!row.sipPasswordEncrypted.includes(input.password));
    assert.deepEqual(
      calls.map((call) => call.method),
      ["create", "check"],
    );
    const json = JSON.stringify(await service.list(ctx));
    for (const secret of [
      input.password,
      row.sipPasswordEncrypted,
      "sipPasswordEncrypted",
      "providerConnectionId",
      "mutationToken",
    ])
      assert.ok(!json.includes(secret));
  });

  it("does not mark a newly created configuration registered when the PBX rejects it", async () => {
    const h = setup();
    h.setState({
      status: "failed",
      providerStatus: "failed",
      lastRegisteredAt: null,
    });
    await h.create();
    assert.equal(h.rows[0].endpoints[0].syncStatus, "synced");
    assert.equal(h.rows[0].endpoints[0].registrationStatus, "failed");
    assert.equal(h.calls.filter((call) => call.method === "delete").length, 0);
  });

  it("retains a sanitized retryable record on a definitive creation failure", async () => {
    const h = setup();
    h.faults.create = new CarrierConnectionError(false);
    await assert.rejects(h.create(), BadGatewayException);
    const endpoint = h.rows[0].endpoints[0];
    assert.equal(endpoint.syncStatus, "error");
    assert.equal(endpoint.providerConnectionId, null);
    h.faults.create = null;
    await h.service.syncEndpoint(ctx, h.rows[0].id, endpoint.id);
    assert.equal(h.rows[0].endpoints[0].syncStatus, "synced");
  });

  it("recovers an ambiguous creation by reference without duplicating the UAC", async () => {
    const h = setup();
    h.faults.create = new CarrierConnectionError(true);
    await assert.rejects(h.create(), BadGatewayException);
    h.faults.create = null;
    await h.service.syncEndpoint(ctx, h.rows[0].id, h.rows[0].endpoints[0].id);
    assert.equal(h.calls.filter((call) => call.method === "create").length, 1);
    assert.equal(h.rows[0].endpoints[0].providerConnectionId, "remote-1");
  });

  it("never blindly recreates or discards an unresolved upstream create", async () => {
    const h = setup();
    h.faults.create = new CarrierConnectionError(true);
    await assert.rejects(h.create());
    h.faults.found = false;
    await assert.rejects(
      h.service.syncEndpoint(ctx, h.rows[0].id, h.rows[0].endpoints[0].id),
      ConflictException,
    );
    await assert.rejects(
      h.service.deleteEndpoint(ctx, h.rows[0].id, h.rows[0].endpoints[0].id),
      ConflictException,
    );
    assert.equal(h.calls.filter((call) => call.method === "create").length, 1);
    assert.equal(h.rows[0].endpoints.length, 1);
  });

  it("recovers when the remote ID could not be persisted after creation", async () => {
    const h = setup();
    h.faults.saveId = true;
    await assert.rejects(h.create());
    assert.equal(h.rows[0].endpoints[0].syncStatus, "pending");
    await h.service.syncEndpoint(ctx, h.rows[0].id, h.rows[0].endpoints[0].id);
    assert.equal(h.calls.filter((call) => call.method === "create").length, 1);
  });

  it("refreshes explicitly, records provider timestamps and never polls on list", async () => {
    const h = setup();
    const row = await h.create();
    h.calls.length = 0;
    await h.service.list(ctx);
    assert.equal(h.calls.length, 0);
    h.setState({
      status: "trying",
      lastRegisteredAt: new Date("2026-09-02T12:00:00Z"),
    });
    await h.service.refreshRegistration(ctx, row.id, row.endpoints[0].id);
    assert.equal(row.endpoints[0].registrationStatus, "trying");
    assert.equal(
      row.endpoints[0].lastRegisteredAt?.toISOString(),
      "2026-09-02T12:00:00.000Z",
    );
    h.faults.registration = true;
    await assert.rejects(
      h.service.refreshRegistration(ctx, row.id, row.endpoints[0].id),
      BadGatewayException,
    );
    assert.equal(row.endpoints[0].registrationStatus, "unknown");
    assert.equal(row.endpoints[0].syncStatus, "synced");
  });

  it("supports two extensions and several numbers sharing either one", async () => {
    const h = setup();
    const row = await h.create();
    await h.service.createEndpoint(ctx, row.id, {
      ...input,
      extension: "202",
      sipUsername: "auth202",
    });
    for (const [phoneNumber, index] of [
      ["+1 (305) 555-0101", 0],
      ["+13055550102", 0],
      ["+13055550103", 1],
    ] as const)
      await h.service.saveNumber(ctx, row.id, {
        endpointId: row.endpoints[index].id,
        phoneNumber,
      });
    assert.equal(row.endpoints[0].numbers[0].phoneNumber, "+13055550101");
    assert.equal(row.endpoints[0].numbers.length, 2);
    assert.equal(row.endpoints[1].numbers.length, 1);
    assert.equal(h.calls.filter((call) => call.method === "create").length, 2);
    await assert.rejects(
      h.service.createEndpoint(ctx, row.id, input),
      ConflictException,
    );
  });

  it("updates credentials with PATCH, preserves an omitted password, and retries desired state", async () => {
    const h = setup();
    const row = await h.create();
    const endpoint = row.endpoints[0];
    await h.service.updateEndpoint(ctx, row.id, endpoint.id, {
      ...input,
      password: "replacement-secret",
      proxy: "other.example.com",
    });
    assert.equal(
      h.crypto.decrypt(endpoint.sipPasswordEncrypted).password,
      "replacement-secret",
    );
    h.faults.update = true;
    await assert.rejects(
      h.service.updateEndpoint(ctx, row.id, endpoint.id, {
        ...input,
        password: undefined,
        proxy: "retry.example.com",
      }),
      BadGatewayException,
    );
    assert.equal(endpoint.proxy, "retry.example.com");
    assert.equal(endpoint.syncStatus, "error");
    h.faults.update = false;
    await h.service.syncEndpoint(ctx, row.id, endpoint.id);
    assert.equal(
      h.crypto.decrypt(endpoint.sipPasswordEncrypted).password,
      "replacement-secret",
    );
    assert.equal(h.calls.filter((call) => call.method === "create").length, 1);
  });

  it("edits/reassigns/deletes numbers without touching the shared UAC", async () => {
    const h = setup();
    const row = await h.create();
    await h.service.createEndpoint(ctx, row.id, { ...input, extension: "202" });
    for (const phoneNumber of ["+13055550101", "+13055550102"])
      await h.service.saveNumber(ctx, row.id, {
        endpointId: row.endpoints[0].id,
        phoneNumber,
      });
    h.calls.length = 0;
    const number = row.endpoints[0].numbers[0];
    await h.service.saveNumber(
      ctx,
      row.id,
      {
        endpointId: row.endpoints[1].id,
        phoneNumber: number.phoneNumber,
        active: false,
      },
      number.id,
    );
    assert.equal(row.endpoints[1].numbers[0].active, false);
    await h.service.deleteNumber(ctx, row.id, number.id);
    assert.equal(row.endpoints[0].numbers.length, 1);
    assert.equal(row.endpoints.length, 2);
    assert.equal(h.calls.length, 0);
  });

  it("rejects foreign extension/number ids within an owned carrier", async () => {
    const h = setup();
    const row = await h.create();
    await assert.rejects(
      h.service.saveNumber(ctx, row.id, {
        endpointId: "foreign",
        phoneNumber: "+13055550101",
      }),
      NotFoundException,
    );
    await assert.rejects(
      h.service.deleteNumber(ctx, row.id, "foreign"),
      NotFoundException,
    );
    await assert.rejects(
      h.service.updateEndpoint(ctx, row.id, "foreign", input),
      NotFoundException,
    );
  });

  it("prevents orphan numbers, then safely removes an unreferenced endpoint", async () => {
    const h = setup();
    const row = await h.create();
    const endpoint = row.endpoints[0];
    await h.service.saveNumber(ctx, row.id, {
      endpointId: endpoint.id,
      phoneNumber: "+13055550101",
    });
    await assert.rejects(
      h.service.deleteEndpoint(ctx, row.id, endpoint.id),
      ConflictException,
    );
    await h.service.deleteNumber(ctx, row.id, endpoint.numbers[0].id);
    h.faults.deleteId = endpoint.providerConnectionId!;
    await assert.rejects(
      h.service.deleteEndpoint(ctx, row.id, endpoint.id),
      BadGatewayException,
    );
    assert.equal(row.endpoints.length, 1);
    assert.equal(endpoint.syncStatus, "deleting");
    h.faults.deleteId = "";
    await h.service.deleteEndpoint(ctx, row.id, endpoint.id);
    assert.equal(row.endpoints.length, 0);
  });

  it("resumes partial carrier deletion and only cleans local records after every remote delete", async () => {
    const h = setup();
    const row = await h.create();
    await h.service.createEndpoint(ctx, row.id, { ...input, extension: "202" });
    await h.service.saveNumber(ctx, row.id, {
      endpointId: row.endpoints[0].id,
      phoneNumber: "+13055550101",
    });
    h.faults.deleteId = row.endpoints[1].providerConnectionId!;
    await assert.rejects(
      h.service.deleteCarrier(ctx, row.id),
      BadGatewayException,
    );
    assert.equal(row.status, "deleting");
    assert.equal(row.endpoints[0].numbers.length, 1);
    await assert.rejects(
      h.service.createEndpoint(ctx, row.id, { ...input, extension: "203" }),
      ConflictException,
    );
    h.faults.deleteId = "";
    h.faults.localDelete = true;
    await assert.rejects(h.service.deleteCarrier(ctx, row.id));
    assert.equal(h.rows.length, 1);
    h.faults.localDelete = false;
    await h.service.deleteCarrier(ctx, row.id);
    assert.equal(h.rows.length, 0);
  });

  it("rejects concurrent mutations before making a remote call", async () => {
    const h = setup();
    const row = await h.service.createCarrier(ctx, "Acme");
    h.faults.lock = true;
    await assert.rejects(
      h.service.createEndpoint(ctx, row.id, input),
      ConflictException,
    );
    assert.equal(h.calls.length, 0);
  });
});

describe("external SIP validation", () => {
  it("accepts public hosts and ports without requiring username to equal extension", () => {
    assert.equal(
      normalizeSipProxy(" SIP.EXAMPLE.COM:5061 "),
      "sip.example.com:5061",
    );
    assert.equal(normalizeSipInput(input, true).sipUsername, "auth201");
    assert.equal(normalizeExternalNumber("+1 (305) 555-0101"), "+13055550101");
  });
  it("rejects URLs, credentials, private targets, invalid ports and header injection", () => {
    for (const value of [
      "https://sip.example.com",
      "user:pass@sip.example.com",
      "127.0.0.1",
      "169.254.169.254",
      "10.0.0.1",
      "[::1]",
      "localhost",
      "sip.example.com:0",
      "sip.example.com:65536",
      "sip.example.com/path",
      "sip.example.com\r\nX: injected",
      "sip.example.com:abc",
    ])
      assert.throws(() => normalizeSipProxy(value), value);
    assert.throws(() =>
      normalizeSipInput({ ...input, password: undefined }, true),
    );
    assert.throws(() =>
      normalizeSipInput({ ...input, transport: "HTTPS" as "TLS" }, true),
    );
    assert.throws(() =>
      normalizeSipInput({ ...input, expirationSec: 0 }, true),
    );
    assert.throws(() => normalizeExternalNumber("201"));
  });
});
