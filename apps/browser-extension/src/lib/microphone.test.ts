import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let permission: () => Promise<{ state: string }>;
let getUserMedia: ReturnType<typeof vi.fn>;
let openedTabs: string[];
let stopped: number;

async function load() {
  vi.resetModules();
  return import("./microphone");
}

beforeEach(() => {
  openedTabs = [];
  stopped = 0;
  permission = async () => ({ state: "granted" });
  getUserMedia = vi.fn(async () => ({
    getTracks: () => [{ stop: () => (stopped += 1) }],
  }));
  vi.stubGlobal("navigator", {
    permissions: { query: () => permission() },
    mediaDevices: { getUserMedia },
  });
  vi.stubGlobal("chrome", {
    runtime: { getURL: (path: string) => `chrome-extension://id/${path}` },
    tabs: { create: ({ url }: { url: string }) => openedTabs.push(url) },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("ensureMicrophoneAccess", () => {
  it("trusts a granted permission without opening the microphone", async () => {
    const { ensureMicrophoneAccess } = await load();
    await expect(ensureMicrophoneAccess()).resolves.toBe(true);
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(openedTabs).toEqual([]);
  });

  it("probes the microphone when the permission state is not granted", async () => {
    permission = async () => ({ state: "prompt" });
    const { ensureMicrophoneAccess } = await load();
    await expect(ensureMicrophoneAccess()).resolves.toBe(true);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(stopped).toBe(1);
  });

  it("probes the microphone when the permission state can't be read", async () => {
    permission = async () => Promise.reject(new TypeError("unsupported"));
    const { ensureMicrophoneAccess } = await load();
    await expect(ensureMicrophoneAccess()).resolves.toBe(true);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it("opens the permission tab when there is no grant", async () => {
    permission = async () => ({ state: "prompt" });
    getUserMedia.mockRejectedValue(
      new DOMException("denied", "NotAllowedError"),
    );
    const { ensureMicrophoneAccess } = await load();
    await expect(ensureMicrophoneAccess()).resolves.toBe(false);
    expect(openedTabs).toEqual([
      "chrome-extension://id/src/permission/index.html",
    ]);
  });
});
