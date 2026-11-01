import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CallQualitySummary } from "@ringee/dialer-core/contracts";
import { recordCallQuality } from "./call-quality-log";

const summary = (measuredSec: number): CallQualitySummary => ({
  measuredSec,
  capturedSec: measuredSec,
  captureGaps: 0,
  packetsSent: measuredSec * 50,
  sentPerSec: 50,
  sendGaps: 0,
  packetsReceived: measuredSec * 50,
  packetsLost: 0,
  warnings: {},
});

let store: Record<string, unknown>;

beforeEach(() => {
  store = {};
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: async (key: string) => ({ [key]: store[key] }),
        set: async (items: Record<string, unknown>) =>
          Object.assign(store, items),
      },
    },
  });
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("recordCallQuality", () => {
  it("keeps the newest call first, stamped with when it ended", async () => {
    await recordCallQuality(summary(10), new Date("2026-10-31T10:00:00Z"));
    await recordCallQuality(summary(20), new Date("2026-10-31T10:05:00Z"));

    const log = store["ringee:callQualityLog"] as Array<{
      at: string;
      measuredSec: number;
    }>;
    expect(log.map((e) => [e.at, e.measuredSec])).toEqual([
      ["2026-10-31T10:05:00.000Z", 20],
      ["2026-10-31T10:00:00.000Z", 10],
    ]);
  });

  it("keeps both of two calls recorded at once", async () => {
    await Promise.all([
      recordCallQuality(summary(10), new Date("2026-10-31T10:00:00Z")),
      recordCallQuality(summary(20), new Date("2026-10-31T10:05:00Z")),
    ]);
    const log = store["ringee:callQualityLog"] as Array<{
      measuredSec: number;
    }>;
    expect(log.map((e) => e.measuredSec)).toEqual([20, 10]);
  });

  it("keeps only the last 20 calls", async () => {
    for (let i = 1; i <= 25; i += 1) await recordCallQuality(summary(i));
    const log = store["ringee:callQualityLog"] as Array<{
      measuredSec: number;
    }>;
    expect(log).toHaveLength(20);
    expect(log[0]?.measuredSec).toBe(25);
    expect(log[19]?.measuredSec).toBe(6);
  });

  it("never fails the caller when storage does", async () => {
    vi.stubGlobal("chrome", {
      storage: { local: { get: async () => Promise.reject(new Error("x")) } },
    });
    await expect(recordCallQuality(summary(5))).resolves.toBeUndefined();
  });
});
