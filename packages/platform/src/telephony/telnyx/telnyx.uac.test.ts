import { HttpException, Logger } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CarrierConnectionError } from "../interfaces/carrier-connection";
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
    });
    await service.updateCarrierConnection("remote-1", config);
    expect(client.patch).toHaveBeenCalledWith(
      "/uac_connections/remote-1",
      uacPayload(config),
    );
    expect(await service.getCarrierConnection("remote-1")).toEqual({
      id: "remote-1",
      reference: config.reference,
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
