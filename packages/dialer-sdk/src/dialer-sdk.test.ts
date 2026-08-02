import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventBus } from "./event-bus";
import { RingeeError, toRingeeError } from "./errors";
import { mapEngineState } from "./telnyx/telnyx-state-mapper";
import { ApiClient } from "./api-client";
import { SessionManager } from "./session-manager";
import { BrowserCallLock } from "./browser-call-lock";

describe("EventBus", () => {
  it("delivers events and returns an unsubscribe", () => {
    const bus = new EventBus();
    const seen: string[] = [];
    const off = bus.on("authStateChanged", ({ state }) => seen.push(state));
    bus.emit("authStateChanged", { state: "authenticated" });
    off();
    bus.emit("authStateChanged", { state: "anonymous" });
    expect(seen).toEqual(["authenticated"]);
  });

  it("isolates a throwing handler from siblings", () => {
    const bus = new EventBus();
    const seen: string[] = [];
    bus.on("ready", () => {
      throw new Error("boom");
    });
    bus.on("ready", () => seen.push("ok"));
    expect(() => bus.emit("ready", {})).not.toThrow();
    expect(seen).toEqual(["ok"]);
  });
});

describe("errors", () => {
  it("marks only retryable codes retryable", () => {
    expect(new RingeeError("RATE_LIMITED", "x").retryable).toBe(true);
    expect(new RingeeError("DNC_BLOCKED", "x").retryable).toBe(false);
    expect(new RingeeError("NETWORK_ERROR", "x") instanceof RingeeError).toBe(
      true,
    );
  });

  it("maps a backend body to a known code, else UNKNOWN_ERROR", () => {
    expect(toRingeeError({ code: "DNC_BLOCKED", message: "no" }).code).toBe(
      "DNC_BLOCKED",
    );
    expect(toRingeeError({ code: "made_up" }).code).toBe("UNKNOWN_ERROR");
    expect(toRingeeError(undefined).code).toBe("UNKNOWN_ERROR");
  });
});

describe("telnyx state mapper", () => {
  it("maps engine states to public dialer states", () => {
    expect(mapEngineState("idle")).toBe("ready");
    expect(mapEngineState("connecting")).toBe("dialing");
    expect(mapEngineState("ringing")).toBe("ringing");
    expect(mapEngineState("active")).toBe("active");
    expect(mapEngineState("held")).toBe("held");
    expect(mapEngineState("ended")).toBe("ended");
    expect(mapEngineState("failed")).toBe("error");
    expect(mapEngineState(undefined)).toBe("connecting");
  });
});

describe("ApiClient", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends the publishable key and returns JSON", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          ok: true,
          integrationId: "int-1",
          workspace: "personal",
        }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new ApiClient("pk_live_x", "https://api.test");
    const res = await client.initialize();
    expect(res.integrationId).toBe("int-1");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.test/api/v1/sdk/initialize");
    expect((init.headers as Record<string, string>)["X-Ringee-Key"]).toBe(
      "pk_live_x",
    );
    expect(init.credentials).toBe("omit");
  });

  it("maps a non-2xx body to a typed RingeeError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 403,
        text: async () =>
          JSON.stringify({ code: "DOMAIN_NOT_ALLOWED", message: "nope" }),
      })),
    );
    const client = new ApiClient("pk_live_x", "https://api.test");
    await expect(client.initialize()).rejects.toMatchObject({
      code: "DOMAIN_NOT_ALLOWED",
    });
  });

  it("maps a network failure to NETWORK_ERROR", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("down");
      }),
    );
    const client = new ApiClient("pk_live_x", "https://api.test");
    await expect(client.initialize()).rejects.toMatchObject({
      code: "NETWORK_ERROR",
    });
  });
});

describe("SessionManager", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("scopes storage by integration + origin", () => {
    const a = new SessionManager();
    a.bind("int-1", "https://crm.example.com");
    a.save("tok-a");

    const b = new SessionManager();
    b.bind("int-2", "https://crm.example.com");
    expect(b.load()).toBeNull(); // different integration → isolated
    expect(a.load()).toBe("tok-a");

    a.clear();
    expect(a.load()).toBeNull();
  });
});

describe("BrowserCallLock (in-memory fallback)", () => {
  beforeEach(() => vi.stubGlobal("navigator", undefined));
  afterEach(() => vi.unstubAllGlobals());

  it("allows one holder and rejects a second until freed", async () => {
    const lock = new BrowserCallLock("test-lock");
    expect(await lock.acquire()).toBe(true);
    expect(await lock.acquire()).toBe(false);
    lock.free();
    expect(await lock.acquire()).toBe(true);
  });
});
