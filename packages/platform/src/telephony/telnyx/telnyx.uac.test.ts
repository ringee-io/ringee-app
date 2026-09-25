import { HttpException, Logger } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiConfiguration } from "@ringee/configuration";
import {
  CARRIER_INBOUND_HEADER,
  CarrierConnectionError,
  carrierOutboundLeg,
  carrierInboundHeaderCorrelation,
  carrierInboundLegCorrelation,
} from "../interfaces/carrier-connection";
import { TelnyxService } from "./telnyx.service";
import { TelnyxClient } from "./telnyx.client";
import {
  mapUacRegistration,
  uacInternalCredentials,
  uacMismatches,
  uacPayload,
} from "./telnyx.uac";

const http = vi.hoisted(() => ({
  post: vi.fn(),
  patch: vi.fn(),
  get: vi.fn(),
  delete: vi.fn(),
}));
vi.mock("@ringee/configuration", () => ({ apiConfiguration: {} }));
vi.mock("telnyx", () => ({ default: class {} }));
vi.mock("axios", () => ({ default: { create: () => http } }));
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

const config = {
  reference: "ringee-byoc-endpoint-1",
  routingKey: "rcr0123abc",
  proxy: "sip.example.com",
  username: "auth201",
  password: "never-log-this-secret",
  transport: "TLS" as const,
  authUsername: null,
  fromUser: "201",
  outboundProxy: null,
  expirationSec: 600,
};
const DESTINATION = "rcr0123abc@ringee.sip.telnyx.com";

const settings = apiConfiguration as unknown as Record<string, unknown>;
beforeEach(() => {
  settings.TELNYX_CALL_CONTROL_APP_ID = "cc-app";
  settings.PUBLIC_BACKEND_URL = "https://api.example.com";
});
afterEach(() => {
  delete settings.TELNYX_CALL_CONTROL_APP_ID;
  delete settings.PUBLIC_BACKEND_URL;
});

/** Ringee's Call Control application, as Telnyx returns it. */
const app = (overrides: Record<string, unknown> = {}) => ({
  data: {
    id: "cc-app",
    active: true,
    webhook_event_url: "https://api.example.com/api/call/webhook",
    inbound: {
      sip_subdomain: "Ringee",
      sip_subdomain_receive_settings: "only_my_connections",
    },
    ...overrides,
  },
});

/** A UAC connection holding everything Ringee manages, as Telnyx returns it. */
const stored = (overrides: Record<string, unknown> = {}) => ({
  data: {
    id: "remote-1",
    active: true,
    connection_name: config.reference,
    user_name: uacInternalCredentials(config.reference).user_name,
    password: "********",
    sip_uri_calling_preference: "internal",
    fqdn: "Generated.uac.telnyx.com",
    internal_uac_settings: { destination_uri: DESTINATION },
    external_uac_settings: { password: config.password },
    ...overrides,
  },
});

/** Routes GETs by path: the Call Control application or the connection. */
function provider(
  connection: unknown = stored(),
  application: unknown = app(),
) {
  return {
    get: vi.fn(async (path: string) =>
      path.startsWith("/call_control_applications") ? application : connection,
    ),
    post: vi.fn().mockResolvedValue({
      data: { id: "remote-1", fqdn: "generated.uac.telnyx.com" },
    }),
    patch: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  };
}

describe("SIP Attach adapter", () => {
  it("builds the complete desired state and represents unset optional fields as null", () => {
    const credentials = uacInternalCredentials(config.reference);
    expect(uacPayload(config, DESTINATION, credentials)).toEqual({
      connection_name: config.reference,
      active: true,
      sip_uri_calling_preference: "internal",
      user_name: credentials.user_name,
      password: credentials.password,
      internal_uac_settings: { destination_uri: DESTINATION },
      external_uac_settings: {
        proxy: config.proxy,
        username: config.username,
        password: config.password,
        transport: "TLS",
        auth_username: null,
        from_user: "201",
        outbound_proxy: null,
        expiration_sec: 600,
      },
    });
    const body = uacPayload(config, DESTINATION);
    expect(body).not.toHaveProperty("user_name");
    expect(body).not.toHaveProperty("password");
    expect(body.internal_uac_settings.destination_uri).toBe(DESTINATION);
  });

  it("sends the Zadarma regression configuration exactly as entered", () => {
    const zadarma = {
      ...config,
      proxy: "sip.zadarma.com",
      username: "875605",
      password: "zadarma-password",
      transport: "UDP" as const,
      authUsername: "875605",
      fromUser: "875605",
      outboundProxy: null,
      expirationSec: 120,
    };
    expect(uacPayload(zadarma, DESTINATION).external_uac_settings).toEqual({
      proxy: "sip.zadarma.com",
      username: "875605",
      password: "zadarma-password",
      transport: "UDP",
      auth_username: "875605",
      from_user: "875605",
      outbound_proxy: null,
      expiration_sec: 120,
    });
  });

  it("derives stable, private internal credentials in the format Telnyx documents", () => {
    const credentials = uacInternalCredentials(config.reference);
    expect(credentials).toEqual(uacInternalCredentials(config.reference));
    expect(credentials.user_name).toMatch(/^[a-z][a-z0-9]{3,31}$/);
    expect(credentials.user_name).toHaveLength(32);
    expect(credentials.password).toMatch(/^[0-9a-f]{64}$/);
    const other = uacInternalCredentials("ringee-byoc-endpoint-2");
    expect(other.user_name).not.toBe(credentials.user_name);
    expect(other.password).not.toBe(credentials.password);
    expect(credentials.password).not.toContain(config.reference);
  });

  it("creates the connection complete — credentials and Internal SIP URI in the first POST", async () => {
    const client = provider();
    const service = new TelnyxService(client as unknown as TelnyxClient);
    expect(await service.createCarrierConnection(config)).toEqual({
      id: "remote-1",
      reference: config.reference,
      fqdn: "generated.uac.telnyx.com",
    });
    expect(client.get).toHaveBeenCalledWith(
      "/call_control_applications/cc-app",
    );
    expect(client.post).toHaveBeenCalledWith(
      "/uac_connections",
      uacPayload(config, DESTINATION, uacInternalCredentials(config.reference)),
    );
  });

  it("updates with the whole desired state and re-sends credentials only when the connection lacks Ringee's", async () => {
    const client = provider();
    const service = new TelnyxService(client as unknown as TelnyxClient);
    await service.updateCarrierConnection("remote-1", config);
    expect(client.patch).toHaveBeenLastCalledWith(
      "/uac_connections/remote-1",
      uacPayload(config, DESTINATION),
    );
    // Created before internal settings were managed: no user name, no URI.
    client.get.mockImplementation(async (path: string) =>
      path.startsWith("/call_control_applications")
        ? app()
        : stored({ user_name: "", internal_uac_settings: {} }),
    );
    await service.updateCarrierConnection("remote-1", config);
    expect(client.patch).toHaveBeenLastCalledWith(
      "/uac_connections/remote-1",
      uacPayload(config, DESTINATION, uacInternalCredentials(config.reference)),
    );
  });

  it("waits out a 409 from an update still being applied, then gives up", async () => {
    const client = provider();
    client.patch
      .mockRejectedValueOnce(new HttpException("in progress", 409))
      .mockResolvedValueOnce({});
    const service = new TelnyxService(client as unknown as TelnyxClient);
    Object.assign(service, { uacConflictBackoffMs: [0, 0] });
    await service.updateCarrierConnection("remote-1", config);
    expect(client.patch).toHaveBeenCalledTimes(2);
    client.patch.mockClear();
    client.patch.mockRejectedValue(new HttpException("in progress", 409));
    await expect(
      service.updateCarrierConnection("remote-1", config),
    ).rejects.toMatchObject({ status: 409, uncertain: false });
    expect(client.patch).toHaveBeenCalledTimes(3);
    client.patch.mockClear();
    client.patch.mockRejectedValue(new HttpException("invalid", 422));
    await expect(
      service.updateCarrierConnection("remote-1", config),
    ).rejects.toMatchObject({ status: 422 });
    expect(client.patch).toHaveBeenCalledTimes(1);
  });

  it("verifies what Telnyx holds and names only the fields that differ", async () => {
    const warn = vi
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => {});
    const client = provider();
    const service = new TelnyxService(client as unknown as TelnyxClient);
    expect(await service.verifyCarrierConnection("remote-1", config)).toEqual({
      id: "remote-1",
      reference: config.reference,
      fqdn: "generated.uac.telnyx.com",
      complete: true,
    });
    for (const overrides of [
      { internal_uac_settings: {} },
      {
        internal_uac_settings: {
          destination_uri: "rcrother@ringee.sip.telnyx.com",
        },
      },
      { user_name: "generated123" },
      { active: false },
      { sip_uri_calling_preference: "unrestricted" },
      { connection_name: "renamed" },
    ]) {
      client.get.mockImplementation(async (path: string) =>
        path.startsWith("/call_control_applications")
          ? app()
          : stored(overrides),
      );
      expect(
        (await service.verifyCarrierConnection("remote-1", config)).complete,
      ).toBe(false);
    }
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain("internal_uac_settings.destination_uri");
    expect(logged).not.toContain(config.password);
    expect(logged).not.toContain(
      uacInternalCredentials(config.reference).password,
    );
  });

  it("accepts a stored Internal SIP URI in any case or with a sip: prefix", () => {
    const expected = {
      reference: config.reference,
      destinationUri: DESTINATION,
      userName: uacInternalCredentials(config.reference).user_name,
    };
    for (const destination_uri of [
      DESTINATION,
      `sip:${DESTINATION}`,
      DESTINATION.toUpperCase(),
    ])
      expect(
        uacMismatches(
          stored({ internal_uac_settings: { destination_uri } }).data,
          expected,
        ),
      ).toEqual([]);
  });

  it("fails closed when the provider answers for a different connection", async () => {
    const client = provider(stored({ id: "other" }));
    const service = new TelnyxService(client as unknown as TelnyxClient);
    await expect(
      service.verifyCarrierConnection("remote-1", config),
    ).rejects.toBeInstanceOf(CarrierConnectionError);
    await expect(
      service.updateCarrierConnection("remote-1", config),
    ).rejects.toBeInstanceOf(CarrierConnectionError);
    expect(client.patch).not.toHaveBeenCalled();
  });

  /** What `GET /sip_registration_status` answered for a live UAC. */
  const registration = (overrides: Record<string, unknown> = {}) => ({
    connection_id: "remote-1",
    connection_name: config.reference,
    credential_type: "uac_external_credential",
    credential_username: uacInternalCredentials(config.reference).user_name,
    registered: true,
    sip_registration_status: "registered",
    last_registration_response: "200 OK",
    sip_registration_details: {
      auth_retries: 0,
      failures: 0,
      sip_uri_user_host: "875605@sip.zadarma.com",
    },
    ...overrides,
  });

  it("reads the live registration Mission Control shows, and deletes with DELETE", async () => {
    const client = provider();
    client.get.mockImplementation(async (path: string) =>
      path.startsWith("/sip_registration_status") ? registration() : stored(),
    );
    const service = new TelnyxService(client as unknown as TelnyxClient);
    expect(await service.checkCarrierRegistration("remote-1")).toEqual({
      status: "registered",
      providerStatus: "registered (200 OK)",
      lastRegisteredAt: null,
      ipAddress: null,
      port: null,
      transport: null,
    });
    expect(client.get).toHaveBeenCalledWith(
      "/sip_registration_status?credential_type=uac_external_credential&connection_id=remote-1",
    );
    // Neither the retired action (410 Gone) nor the connection's stale field.
    expect(client.post).not.toHaveBeenCalled();
    await service.deleteCarrierConnection("remote-1");
    expect(client.delete).toHaveBeenCalledWith("/uac_connections/remote-1");
  });

  it.each([
    ["registered", true, "registered"],
    ["trying", false, "trying"],
    ["failed", false, "failed"],
    ["unregistering", false, "unregistering"],
    ["connection_disabled", false, "disabled"],
    ["unknown", false, "unknown"],
    ["future-state", false, "unknown"],
    // Registered only when the flag agrees.
    ["registered", false, "unknown"],
  ])(
    "normalizes %s (registered=%s) without guessing registration",
    (sip_registration_status, registered, expected) => {
      expect(
        mapUacRegistration(
          registration({ sip_registration_status, registered }),
          "remote-1",
        )?.status,
      ).toBe(expected);
    },
  );

  it("keeps the PBX's last answer and nothing arbitrary from the provider", () => {
    expect(
      mapUacRegistration(
        registration({
          sip_registration_status: "failed",
          registered: false,
          last_registration_response: "401 Unauthorized",
        }),
        "remote-1",
      )?.providerStatus,
    ).toBe("failed (401 Unauthorized)");
    for (const last_registration_response of [
      config.password,
      "401 Unauthorized\r\nX: injected",
      `401 ${config.password}${config.password}${config.password}`,
    ])
      expect(
        mapUacRegistration(
          registration({ last_registration_response }),
          "remote-1",
        )?.providerStatus,
      ).toBe("registered");
    expect(
      mapUacRegistration(
        registration({ sip_registration_status: config.password }),
        "remote-1",
      )?.providerStatus,
    ).toBeNull();
    expect(
      mapUacRegistration({ data: registration() }, "remote-1")?.status,
    ).toBe("registered");
  });

  it("fails closed when the registration answer is about another connection", async () => {
    expect(mapUacRegistration(registration(), "other")).toBeNull();
    expect(mapUacRegistration(null, "remote-1")).toBeNull();
    const client = provider();
    client.get.mockResolvedValue(registration({ connection_id: "other" }));
    const service = new TelnyxService(client as unknown as TelnyxClient);
    await expect(
      service.checkCarrierRegistration("remote-1"),
    ).rejects.toMatchObject({ uncertain: false });
  });

  it("reports a registration lookup the provider could not answer as the provider's failure", async () => {
    const client = provider();
    client.get.mockRejectedValue(new HttpException("down", 503));
    const service = new TelnyxService(client as unknown as TelnyxClient);
    await expect(
      service.checkCarrierRegistration("remote-1"),
    ).rejects.toMatchObject({ status: 503, uncertain: true });
  });

  it("recovers only a unique exact reference and refuses incomplete/ambiguous searches", async () => {
    const get = vi.fn().mockResolvedValue({
      data: [
        { id: "remote-1", connection_name: config.reference },
        { id: "other", connection_name: `${config.reference}-other` },
      ],
    });
    const service = new TelnyxService({ get } as unknown as TelnyxClient);
    expect(await service.findCarrierConnection(config.reference)).toEqual({
      id: "remote-1",
      reference: config.reference,
    });
    get.mockResolvedValueOnce({ data: [], meta: { total_pages: 2 } });
    await expect(
      service.findCarrierConnection(config.reference),
    ).rejects.toBeInstanceOf(CarrierConnectionError);
  });

  it("treats a repeated delete's 404 as success but preserves authorization/server failures", async () => {
    const remove = vi.fn().mockRejectedValue(new HttpException("missing", 404));
    const service = new TelnyxService({
      delete: remove,
    } as unknown as TelnyxClient);
    await expect(
      service.deleteCarrierConnection("remote-1"),
    ).resolves.toBeUndefined();
    for (const status of [401, 403, 500]) {
      remove.mockRejectedValueOnce(new HttpException("private body", status));
      await expect(
        service.deleteCarrierConnection("remote-1"),
      ).rejects.toBeInstanceOf(CarrierConnectionError);
    }
  });

  it("marks a timed out/malformed create uncertain and a rejected validation safe to retry", async () => {
    const client = provider();
    client.post.mockRejectedValue(new HttpException("timeout", 502));
    const service = new TelnyxService(client as unknown as TelnyxClient);
    await expect(service.createCarrierConnection(config)).rejects.toMatchObject(
      { uncertain: true, status: 502 },
    );
    client.post.mockRejectedValueOnce(new HttpException("validation", 422));
    await expect(service.createCarrierConnection(config)).rejects.toMatchObject(
      { uncertain: false, status: 422 },
    );
    client.post.mockResolvedValueOnce({ data: {} });
    await expect(service.createCarrierConnection(config)).rejects.toMatchObject(
      { uncertain: true },
    );
  });

  it("logs Telnyx's code, title, detail and field without any secret it was sent; bounded timeouts, no redirects", async () => {
    const warn = vi
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => {});
    const credentials = uacInternalCredentials(config.reference);
    const body = uacPayload(config, DESTINATION, credentials);
    http.post.mockRejectedValue({
      response: {
        status: 422,
        data: {
          external_uac_settings: { password: config.password },
          errors: [
            {
              code: "10015",
              title: "Bad Request",
              detail: "outbound_proxy is invalid",
              source: { pointer: "/external_uac_settings/outbound_proxy" },
            },
            {
              code: "10015",
              title: "Bad Request",
              detail: `Invalid password: ${config.password} was provided`,
              source: { pointer: "/external_uac_settings/password" },
            },
            {
              code: "10015",
              detail: `Invalid value ${credentials.password.slice(3, 20)}`,
              source: { pointer: "/password\r\nInjected: header" },
            },
            { code: config.password },
          ],
        },
      },
      message: config.password,
    });
    const client = new TelnyxClient();
    await expect(client.post("/uac_connections", body)).rejects.toMatchObject({
      message: "Carrier provider request failed",
    });
    const logged = JSON.stringify(warn.mock.calls);
    for (const secret of [
      config.password,
      credentials.password,
      credentials.password.slice(3, 20),
    ])
      expect(logged).not.toContain(secret);
    expect(logged).toContain("status=422");
    expect(logged).toContain("outbound_proxy is invalid");
    expect(logged).toContain("/external_uac_settings/outbound_proxy");
    expect(logged).toContain("Invalid password: [redacted] was provided");
    expect(logged).toContain("[withheld]");
    expect(logged).not.toContain("Injected");
    expect(http.post).toHaveBeenCalledWith(
      "https://api.telnyx.com/v2/uac_connections",
      body,
      { timeout: 15000, maxRedirects: 0 },
    );
  });
});

describe("TelnyxClient request paths", () => {
  it.each([
    "https://attacker.example/v2/calls",
    "//attacker.example/calls",
    "/\\attacker.example/calls",
    "calls/leg-1",
    "/calls/leg 1",
    "/uac_connections/..",
    "/uac_connections/../phone_numbers",
    "/calls/%2e%2e/actions/hangup",
    "/calls/./leg-1",
    "/..",
  ])("never sends a request for %s", async (path) => {
    const client = new TelnyxClient();
    await expect(client.post(path, {})).rejects.toMatchObject({
      message: "Invalid telephony provider path",
    });
    await expect(client.get(path)).rejects.toMatchObject({
      message: "Invalid telephony provider path",
    });
    expect(http.post).not.toHaveBeenCalled();
    expect(http.get).not.toHaveBeenCalled();
  });
});

describe("UAC outbound routing", () => {
  const uac = (overrides: Record<string, unknown> = {}) => ({
    data: {
      id: "uac",
      active: true,
      fqdn: "Provider-Generated.example.net",
      sip_uri_calling_preference: "internal",
      external_uac_settings: {
        username: "auth201",
        from_user: "201",
        password: config.password,
      },
      ...overrides,
    },
  });

  it("allows calls only from this account's connections and never sends the generated subdomain settings", () => {
    const body = uacPayload(config, DESTINATION);
    expect(body.sip_uri_calling_preference).toBe("internal");
    expect(body).not.toHaveProperty("inbound");
  });

  it("dials through the provider-generated FQDN without reconfiguring the connection", async () => {
    const client = { get: vi.fn().mockResolvedValue(uac()), patch: vi.fn() };
    const service = new TelnyxService(client as unknown as TelnyxClient);
    const route = await service.getCarrierDialDestination(
      "uac",
      "+12125550199",
    );
    expect(route).toEqual({
      uri: "sip:+12125550199@provider-generated.example.net",
      fqdn: "provider-generated.example.net",
    });
    expect(client.get).toHaveBeenCalledWith("/uac_connections/uac");
    expect(client.patch).not.toHaveBeenCalled();
    expect(JSON.stringify(route)).not.toContain(config.password);
  });

  it("dials a number without its + for a carrier that writes numbers that way", async () => {
    const client = { get: vi.fn().mockResolvedValue(uac()) };
    const service = new TelnyxService(client as unknown as TelnyxClient);
    await expect(
      service.getCarrierDialDestination("uac", "12125550199"),
    ).resolves.toEqual({
      uri: "sip:12125550199@provider-generated.example.net",
      fqdn: "provider-generated.example.net",
    });
  });

  it.each([
    { active: false },
    { sip_uri_calling_preference: "disabled" },
    { sip_uri_calling_preference: "unrestricted" },
    { sip_uri_calling_preference: undefined },
  ])(
    "reports a connection that cannot take the call as unavailable (%o)",
    async (overrides) => {
      const client = { get: vi.fn().mockResolvedValue(uac(overrides)) };
      const service = new TelnyxService(client as unknown as TelnyxClient);
      await expect(
        service.getCarrierDialDestination("uac", "+12125550199"),
      ).resolves.toBeNull();
    },
  );

  it.each([
    undefined,
    "",
    "sip:secret@host.test",
    "host.test/path",
    "host.test\r\nSecret: value",
    "host.test:5060",
    "localhost",
  ])(
    "fails closed for an absent or malformed provider FQDN %s",
    async (fqdn) => {
      const client = { get: vi.fn().mockResolvedValue(uac({ fqdn })) };
      const service = new TelnyxService(client as unknown as TelnyxClient);
      await expect(
        service.getCarrierDialDestination("uac", "+12125550199"),
      ).rejects.toBeInstanceOf(CarrierConnectionError);
    },
  );

  it("fails closed when the provider answers for a different connection", async () => {
    const client = { get: vi.fn().mockResolvedValue(uac({ id: "other" })) };
    const service = new TelnyxService(client as unknown as TelnyxClient);
    await expect(
      service.getCarrierDialDestination("uac", "+12125550199"),
    ).rejects.toBeInstanceOf(CarrierConnectionError);
  });

  it("maps provider failures to a sanitized carrier error", async () => {
    const client = {
      get: vi.fn().mockRejectedValue(new HttpException(config.password, 503)),
    };
    const service = new TelnyxService(client as unknown as TelnyxClient);
    const error = await service
      .getCarrierDialDestination("uac", "+12125550199")
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CarrierConnectionError);
    expect(String((error as Error).message)).not.toContain(config.password);
  });

  it.each([
    "sip:attacker@elsewhere.test",
    "+0123456789",
    "0123456789",
    "++12125550199",
    "12125550199@elsewhere.test",
    "",
  ])(
    "never calls the provider for a destination that is not E.164 (%s)",
    async (destination) => {
      const client = { get: vi.fn() };
      const service = new TelnyxService(client as unknown as TelnyxClient);
      await expect(
        service.getCarrierDialDestination("uac", destination),
      ).rejects.toBeInstanceOf(CarrierConnectionError);
      expect(client.get).not.toHaveBeenCalled();
    },
  );
});

describe("UAC inbound routing", () => {
  it("points the Internal SIP URI at the Call Control application's own subdomain on create", async () => {
    const client = provider();
    const service = new TelnyxService(client as unknown as TelnyxClient);
    await service.createCarrierConnection(config);
    expect(client.post.mock.calls[0][1].internal_uac_settings).toEqual({
      destination_uri: "rcr0123abc@ringee.sip.telnyx.com",
    });
  });

  it.each([
    { id: "other-app" },
    { active: false },
    { active: undefined },
    { inbound: { sip_subdomain_receive_settings: "only_my_connections" } },
    {
      inbound: {
        sip_subdomain: "ringee",
        sip_subdomain_receive_settings: "from_anyone",
      },
    },
    { webhook_event_url: "https://api.example.com/api/other/webhook" },
    {
      webhook_event_url:
        "https://other-environment.example.com/api/call/webhook",
    },
    { webhook_event_url: "not a url" },
  ])(
    "creates, updates or verifies nothing through an application that cannot safely receive carrier calls (%o)",
    async (overrides) => {
      const warn = vi
        .spyOn(Logger.prototype, "warn")
        .mockImplementation(() => {});
      const client = provider(stored(), app(overrides));
      const service = new TelnyxService(client as unknown as TelnyxClient);
      await expect(
        service.createCarrierConnection(config),
      ).rejects.toMatchObject({ uncertain: false });
      await expect(
        service.updateCarrierConnection("remote-1", config),
      ).rejects.toBeInstanceOf(CarrierConnectionError);
      await expect(
        service.verifyCarrierConnection("remote-1", config),
      ).rejects.toBeInstanceOf(CarrierConnectionError);
      expect(client.post).not.toHaveBeenCalled();
      expect(client.patch).not.toHaveBeenCalled();
      // The operator is told which check failed.
      expect(JSON.stringify(warn.mock.calls)).toContain(
        "Call Control application cc-app",
      );
    },
  );

  it("creates nothing while the Call Control application is not configured", async () => {
    delete settings.TELNYX_CALL_CONTROL_APP_ID;
    const client = provider();
    const service = new TelnyxService(client as unknown as TelnyxClient);
    await expect(
      service.createCarrierConnection(config),
    ).rejects.toBeInstanceOf(CarrierConnectionError);
    expect(client.get).not.toHaveBeenCalled();
    expect(client.post).not.toHaveBeenCalled();
  });

  it.each(["", "key.with.dots", "key@host", "a".repeat(129)])(
    "never sends a routing key Telnyx does not accept (%s)",
    async (routingKey) => {
      const client = provider();
      const service = new TelnyxService(client as unknown as TelnyxClient);
      await expect(
        service.createCarrierConnection({ ...config, routingKey }),
      ).rejects.toBeInstanceOf(CarrierConnectionError);
      expect(client.get).not.toHaveBeenCalled();
      expect(client.post).not.toHaveBeenCalled();
    },
  );

  it("hands the browser Ringee's own application, addressed with the call key, and reuses a validated application briefly", async () => {
    const client = provider();
    const service = new TelnyxService(client as unknown as TelnyxClient);
    expect(await service.getCarrierOutboundEntry("rco0123abc")).toBe(
      "sip:rco0123abc@ringee.sip.telnyx.com",
    );
    await service.getCarrierOutboundEntry("rco0456def");
    expect(
      client.get.mock.calls.filter(([path]) =>
        String(path).startsWith("/call_control_applications"),
      ),
    ).toHaveLength(1);
  });

  it.each(["", "+12125550199", "key@host", "a".repeat(129)])(
    "never hands out an entry for a key that is not a SIP user (%s)",
    async (key) => {
      const client = provider();
      const service = new TelnyxService(client as unknown as TelnyxClient);
      await expect(service.getCarrierOutboundEntry(key)).rejects.toBeInstanceOf(
        CarrierConnectionError,
      );
      expect(client.get).not.toHaveBeenCalled();
    },
  );

  it("hands out no entry, and caches nothing, through an unsafe application", async () => {
    const client = provider(stored(), app({ active: false }));
    const service = new TelnyxService(client as unknown as TelnyxClient);
    vi.spyOn(Logger.prototype, "warn").mockImplementation(() => {});
    for (let attempt = 0; attempt < 2; attempt++)
      await expect(
        service.getCarrierOutboundEntry("rco0123abc"),
      ).rejects.toBeInstanceOf(CarrierConnectionError);
    expect(client.get).toHaveBeenCalledTimes(2);
  });

  it("transfers the parked browser call to the connection's host and marks the carrier leg", async () => {
    const client = { post: vi.fn().mockResolvedValue({}) };
    const service = new TelnyxService(client as unknown as TelnyxClient);
    const params = {
      destinationUri: "sip:+18299621624@6eq9dcjrfudd.uac.telnyx.com",
      from: "+18495322320",
      correlation: "call-1.signature",
      commandId: "carrier-outbound-call-1",
      timeoutSecs: 90,
    };
    // The parked leg is the call: it keeps reporting its own lifecycle.
    await service.connectOutboundToCarrier("entry-leg", {
      ...params,
      markEntry: false,
    });
    expect(client.post.mock.calls[0][1]).not.toHaveProperty("client_state");
    expect(
      carrierOutboundLeg(client.post.mock.calls[0][1].target_leg_client_state),
    ).toEqual({ leg: "carrier", call: "call-1.signature" });
    client.post.mockClear();
    // Another leg is the call: the parked one only relays it.
    await service.connectOutboundToCarrier("entry-leg", {
      ...params,
      markEntry: true,
    });
    const [path, body] = client.post.mock.calls[0];
    expect(path).toBe("/calls/entry-leg/actions/transfer");
    expect(body).toMatchObject({
      to: "sip:+18299621624@6eq9dcjrfudd.uac.telnyx.com",
      from: "+18495322320",
      timeout_secs: 90,
      early_media: true,
      command_id: "carrier-outbound-call-1",
    });
    expect(carrierOutboundLeg(body.client_state)).toEqual({
      leg: "entry",
      call: "call-1.signature",
    });
    expect(carrierOutboundLeg(body.target_leg_client_state)).toEqual({
      leg: "carrier",
      call: "call-1.signature",
    });
  });

  it("transfers numbers without their + as written", async () => {
    const client = { post: vi.fn().mockResolvedValue({}) };
    const service = new TelnyxService(client as unknown as TelnyxClient);
    await service.connectOutboundToCarrier("entry-leg", {
      destinationUri: "sip:18299621624@6eq9dcjrfudd.uac.telnyx.com",
      from: "18495322320",
      correlation: "c",
      commandId: "id",
      timeoutSecs: 90,
      markEntry: false,
    });
    expect(client.post.mock.calls[0][1]).toMatchObject({
      to: "sip:18299621624@6eq9dcjrfudd.uac.telnyx.com",
      from: "18495322320",
    });
  });

  it.each([
    ["sip:+18299621624@6eq9dcjrfudd.uac.telnyx.com", "not-a-number"],
    ["sip:+18299621624@6eq9dcjrfudd.uac.telnyx.com", "08495322320"],
    ["sip:+18299621624@6eq9dcjrfudd.uac.telnyx.com", "++18495322320"],
    ["sip:08299621624@6eq9dcjrfudd.uac.telnyx.com", "+18495322320"],
    ["+18299621624", "+18495322320"],
    ["sip:+18299621624@host.test:5060", "+18495322320"],
    ["sip:+18299621624@a.test@b.test", "+18495322320"],
    ["sip:+18299621624@localhost", "+18495322320"],
  ])("transfers nothing to %s from %s", async (destinationUri, from) => {
    const client = { post: vi.fn() };
    const service = new TelnyxService(client as unknown as TelnyxClient);
    await expect(
      service.connectOutboundToCarrier("entry-leg", {
        destinationUri,
        from,
        correlation: "c",
        commandId: "id",
        timeoutSecs: 90,
        markEntry: false,
      }),
    ).rejects.toBeInstanceOf(CarrierConnectionError);
    expect(client.post).not.toHaveBeenCalled();
  });

  it("ends a refused entry leg with its mark kept", async () => {
    const client = { post: vi.fn().mockResolvedValue({}) };
    const service = new TelnyxService(client as unknown as TelnyxClient);
    await service.refuseCarrierOutbound("entry-leg", "refuse-1");
    const [path, body] = client.post.mock.calls[0];
    expect(path).toBe("/calls/entry-leg/actions/hangup");
    expect(body.command_id).toBe("refuse-1");
    expect(carrierOutboundLeg(body.client_state)).toEqual({
      leg: "entry",
      call: null,
    });
  });

  it("reads only its own outbound marks", () => {
    const encode = (value: unknown) =>
      Buffer.from(JSON.stringify(value)).toString("base64");
    expect(carrierOutboundLeg(undefined)).toBeNull();
    expect(carrierOutboundLeg("aGFuZ3Vw")).toBeNull();
    expect(
      carrierOutboundLeg(
        encode({ action: "carrier_inbound_desk_phone", call: "c" }),
      ),
    ).toBeNull();
    expect(
      carrierOutboundLeg(
        encode({ action: "carrier_outbound_bridge", leg: "other", call: "c" }),
      ),
    ).toBeNull();
    expect(
      carrierOutboundLeg(
        encode({ action: "carrier_outbound_bridge", leg: "carrier", call: 7 }),
      ),
    ).toEqual({ leg: "carrier", call: null });
  });

  it("rings the desk phone through its SIP identity and marks the new leg", async () => {
    const client = { post: vi.fn().mockResolvedValue({}) };
    const service = new TelnyxService(client as unknown as TelnyxClient);
    await service.connectInboundToDeskPhone("leg-a", {
      sipUsername: "rgdesk201",
      from: "+12125550199",
      fromDisplayName: "anonymous <script>",
      correlation: "call-1.signature",
      commandId: "carrier-inbound-call-1",
      timeoutSecs: 120,
    });
    const [path, body] = client.post.mock.calls[0];
    expect(path).toBe("/calls/leg-a/actions/transfer");
    expect(body).toMatchObject({
      to: "sip:rgdesk201@sip.telnyx.com",
      from: "+12125550199",
      from_display_name: "anonymous script",
      command_id: "carrier-inbound-call-1",
      timeout_secs: 120,
      custom_headers: [
        { name: CARRIER_INBOUND_HEADER, value: "call-1.signature" },
      ],
    });
    expect(carrierInboundLegCorrelation(body.target_leg_client_state)).toBe(
      "call-1.signature",
    );
    expect(carrierInboundHeaderCorrelation(body.custom_headers)).toBe(
      "call-1.signature",
    );
  });

  it("refuses a malformed SIP username before calling the provider", async () => {
    const client = { post: vi.fn() };
    const service = new TelnyxService(client as unknown as TelnyxClient);
    await expect(
      service.connectInboundToDeskPhone("leg-a", {
        sipUsername: "desk@evil.example",
        from: "+12125550199",
        correlation: "c",
        commandId: "id",
        timeoutSecs: 120,
      }),
    ).rejects.toBeInstanceOf(CarrierConnectionError);
    expect(client.post).not.toHaveBeenCalled();
  });

  it("opens a desk phone's SIP URI to this account's connections only", async () => {
    const client = { patch: vi.fn().mockResolvedValue({}) };
    const service = new TelnyxService(client as unknown as TelnyxClient);
    await service.allowDeskPhoneInternalCalls("desk-connection");
    expect(client.patch).toHaveBeenCalledWith(
      "/credential_connections/desk-connection",
      { sip_uri_calling_preference: "internal" },
    );
  });

  it("reads correlations only from Ringee's own markers", () => {
    const encode = (value: unknown) =>
      Buffer.from(JSON.stringify(value)).toString("base64");
    expect(carrierInboundLegCorrelation(undefined)).toBeNull();
    expect(carrierInboundLegCorrelation("not-base64-json")).toBeNull();
    expect(
      carrierInboundLegCorrelation(encode({ action: "desk_phone_outbound" })),
    ).toBeNull();
    expect(
      carrierInboundLegCorrelation(
        encode({ action: "carrier_inbound_desk_phone", call: 7 }),
      ),
    ).toBeNull();
    expect(
      carrierInboundHeaderCorrelation([
        { name: "x-ringee-carrier-inbound", value: "token" },
      ]),
    ).toBe("token");
    expect(carrierInboundHeaderCorrelation("nope")).toBeNull();
  });
});
