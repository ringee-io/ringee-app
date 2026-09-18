import { HttpException, Logger } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiConfiguration } from "@ringee/configuration";
import {
  CARRIER_INBOUND_HEADER,
  CarrierConnectionError,
  carrierInboundHeaderCorrelation,
  carrierInboundLegCorrelation,
} from "../interfaces/carrier-connection";
import { TelnyxService } from "./telnyx.service";
import { TelnyxClient } from "./telnyx.client";
import { mapUacRegistration, uacPayload } from "./telnyx.uac";

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
  proxy: "sip.example.com",
  username: "auth201",
  password: "never-log-this-secret",
  transport: "TLS" as const,
  authUsername: null,
  fromUser: "201",
  outboundProxy: null,
  expirationSec: 600,
};

describe("SIP Attach adapter", () => {
  it("sends credentials only under external_uac_settings and clears optional fields on PATCH", () => {
    const body = uacPayload(config);
    expect(body).not.toHaveProperty("password");
    expect(body).not.toHaveProperty("user_name");
    expect(body.external_uac_settings).toEqual({
      proxy: config.proxy,
      username: config.username,
      password: config.password,
      transport: "TLS",
      auth_username: "",
      from_user: "201",
      outbound_proxy: "",
      expiration_sec: 600,
    });
  });

  it("uses the existing client with POST, PATCH, GET, registration POST and DELETE", async () => {
    const client = {
      post: vi.fn().mockResolvedValue({ data: { id: "remote-1" } }),
      patch: vi.fn().mockResolvedValue({}),
      get: vi.fn().mockResolvedValue({
        data: {
          id: "remote-1",
          connection_name: config.reference,
          password: config.password,
        },
      }),
      delete: vi.fn().mockResolvedValue({}),
    };
    const service = new TelnyxService(client as unknown as TelnyxClient);
    expect(await service.createCarrierConnection(config)).toEqual({
      id: "remote-1",
      reference: config.reference,
      fqdn: null,
    });
    await service.updateCarrierConnection("remote-1", config);
    expect(client.patch).toHaveBeenCalledWith(
      "/uac_connections/remote-1",
      uacPayload(config),
    );
    expect(await service.getCarrierConnection("remote-1")).toEqual({
      id: "remote-1",
      reference: config.reference,
      fqdn: null,
    });
    client.post.mockResolvedValueOnce({
      data: { status: "Registered", last_registration: "2026-09-01T00:00:00Z" },
    });
    expect((await service.checkCarrierRegistration("remote-1")).status).toBe(
      "registered",
    );
    expect(client.post).toHaveBeenLastCalledWith(
      "/uac_connections/remote-1/actions/check_registration_status",
    );
    await service.deleteCarrierConnection("remote-1");
    expect(client.delete).toHaveBeenCalledWith("/uac_connections/remote-1");
  });

  it.each([
    ["Registered", "registered"],
    ["Trying", "trying"],
    ["Failed", "failed"],
    ["Expired", "failed"],
    ["Unregistering", "unregistering"],
    ["Connection Disabled", "disabled"],
    ["Not Applicable", "unknown"],
    ["future-state", "unknown"],
  ])("normalizes %s without guessing registration", (status, expected) => {
    expect(mapUacRegistration({ status }).status).toBe(expected);
  });

  it("handles nested registration responses and invalid dates without leaking arbitrary provider text", () => {
    expect(
      mapUacRegistration({
        data: {
          status: "Registered",
          last_registration: "invalid",
          ip_address: "secret",
          transport: "secret",
          password: config.password,
        },
      }),
    ).toEqual({
      status: "registered",
      providerStatus: "registered",
      lastRegisteredAt: null,
      ipAddress: null,
      port: null,
      transport: null,
    });
    expect(
      mapUacRegistration({ status: config.password }).providerStatus,
    ).toBeNull();
    expect(mapUacRegistration(null).status).toBe("unknown");
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
    const post = vi.fn().mockRejectedValue(new HttpException("timeout", 502));
    const service = new TelnyxService({ post } as unknown as TelnyxClient);
    await expect(service.createCarrierConnection(config)).rejects.toMatchObject(
      { uncertain: true },
    );
    post.mockRejectedValueOnce(new HttpException("validation", 422));
    await expect(service.createCarrierConnection(config)).rejects.toMatchObject(
      { uncertain: false },
    );
    post.mockResolvedValueOnce({ data: {} });
    await expect(service.createCarrierConnection(config)).rejects.toMatchObject(
      { uncertain: true },
    );
  });

  it("never logs/returns echoed SIP credentials; uses bounded timeouts without redirects", async () => {
    const warn = vi
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => {});
    http.post.mockRejectedValue({
      response: {
        status: 422,
        data: {
          external_uac_settings: { password: config.password },
          errors: [
            { code: "10015", detail: config.password },
            { code: config.password },
          ],
        },
      },
      message: config.password,
    });
    const client = new TelnyxClient();
    await expect(
      client.post("/uac_connections", uacPayload(config)),
    ).rejects.toMatchObject({ message: "Carrier provider request failed" });
    expect(JSON.stringify(warn.mock.calls)).not.toContain(config.password);
    expect(JSON.stringify(warn.mock.calls)).toContain("10015");
    expect(http.post).toHaveBeenCalledWith(
      "/uac_connections",
      uacPayload(config),
      { timeout: 15000, maxRedirects: 0 },
    );
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
    const body = uacPayload(config);
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

  it.each(["sip:attacker@elsewhere.test", "12125550199", "+0123456789", ""])(
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
  const config = apiConfiguration as unknown as Record<string, unknown>;
  beforeEach(() => {
    config.PUBLIC_BACKEND_URL = "https://api.example.com";
  });
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
  afterEach(() => {
    delete config.TELNYX_CALL_CONTROL_APP_ID;
    delete config.PUBLIC_BACKEND_URL;
  });

  it("points the Internal SIP URI at the Call Control application's own subdomain", async () => {
    config.TELNYX_CALL_CONTROL_APP_ID = "cc-app";
    const client = {
      get: vi.fn().mockResolvedValue(app()),
      patch: vi.fn().mockResolvedValue({}),
    };
    const service = new TelnyxService(client as unknown as TelnyxClient);
    await service.configureCarrierInbound("uac", "rcr0123abc");
    expect(client.get).toHaveBeenCalledWith(
      "/call_control_applications/cc-app",
    );
    expect(client.patch).toHaveBeenCalledWith("/uac_connections/uac", {
      internal_uac_settings: {
        destination_uri: "rcr0123abc@ringee.sip.telnyx.com",
      },
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
    "refuses an application that cannot safely receive carrier calls (%o)",
    async (overrides) => {
      config.TELNYX_CALL_CONTROL_APP_ID = "cc-app";
      const client = {
        get: vi.fn().mockResolvedValue(app(overrides)),
        patch: vi.fn(),
      };
      const service = new TelnyxService(client as unknown as TelnyxClient);
      await expect(
        service.configureCarrierInbound("uac", "rcr0123abc"),
      ).rejects.toBeInstanceOf(CarrierConnectionError);
      expect(client.patch).not.toHaveBeenCalled();
    },
  );

  it.each(["", "key.with.dots", "key@host", "a".repeat(129)])(
    "never sends a routing key Telnyx does not accept (%s)",
    async (key) => {
      config.TELNYX_CALL_CONTROL_APP_ID = "cc-app";
      const client = { get: vi.fn(), patch: vi.fn() };
      const service = new TelnyxService(client as unknown as TelnyxClient);
      await expect(
        service.configureCarrierInbound("uac", key),
      ).rejects.toBeInstanceOf(CarrierConnectionError);
      expect(client.get).not.toHaveBeenCalled();
    },
  );

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
