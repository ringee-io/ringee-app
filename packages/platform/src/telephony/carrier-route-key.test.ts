import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  isCarrierRouteKey,
  signCarrierRouteKey,
  verifyCarrierRouteKey,
} from "./carrier-route-key";

const ENDPOINT = "3f2b9c1e-8d4a-4b6f-9e21-5c7d8a9b0c1d";
const previous = process.env.SDK_SIGNING_SECRET;
beforeAll(() => {
  process.env.SDK_SIGNING_SECRET = "carrier-route-key-test-secret";
});
afterAll(() => {
  process.env.SDK_SIGNING_SECRET = previous;
});

describe("carrier route key", () => {
  it("names the endpoint with characters every SIP URI field accepts", () => {
    const key = signCarrierRouteKey(ENDPOINT);
    expect(key).toMatch(/^[a-z0-9]+$/);
    expect(key).toHaveLength(67);
    expect(isCarrierRouteKey(key)).toBe(true);
    expect(verifyCarrierRouteKey(key)).toBe(ENDPOINT);
    // Providers may change the case of a SIP user part.
    expect(verifyCarrierRouteKey(key.toUpperCase())).toBe(ENDPOINT);
  });

  it("refuses a key for another endpoint or with a forged MAC", () => {
    const key = signCarrierRouteKey(ENDPOINT);
    const other = "0".repeat(32);
    expect(verifyCarrierRouteKey(`rcr${other}${key.slice(35)}`)).toBeNull();
    const forged = `${key.slice(0, -1)}${key.endsWith("0") ? "1" : "0"}`;
    expect(isCarrierRouteKey(forged)).toBe(true);
    expect(verifyCarrierRouteKey(forged)).toBeNull();
  });

  it("does not verify under a different signing secret", () => {
    const key = signCarrierRouteKey(ENDPOINT);
    process.env.SDK_SIGNING_SECRET = "rotated-secret";
    try {
      expect(verifyCarrierRouteKey(key)).toBeNull();
    } finally {
      process.env.SDK_SIGNING_SECRET = "carrier-route-key-test-secret";
    }
  });

  it.each([
    undefined,
    null,
    "",
    "+13055550101",
    "rcr1234",
    "gencred1",
    ENDPOINT,
  ])("treats %s as no key at all", (value) => {
    expect(isCarrierRouteKey(value)).toBe(false);
    expect(verifyCarrierRouteKey(value)).toBeNull();
  });

  it("only signs UUIDs", () => {
    expect(() => signCarrierRouteKey("not-a-uuid")).toThrow();
  });
});
