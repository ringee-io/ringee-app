import { describe, expect, it } from "vitest";
import {
  generateCliDeviceCode,
  generateCliUserCode,
  generatePersonalApiKey,
  hashOpaqueSecret,
  isPersonalApiKeyShape,
  normalizeCliUserCode,
} from "./personal-api-key.util";

describe("personal API keys", () => {
  it("generates a recognizable key whose hash and prefix match", () => {
    const key = generatePersonalApiKey();
    expect(key.plaintext).toMatch(/^ringee_sk_[0-9a-f]{64}$/);
    expect(key.plaintext.startsWith(key.prefix)).toBe(true);
    expect(key.prefix).toHaveLength("ringee_sk_".length + 8);
    expect(key.hash).toBe(hashOpaqueSecret(key.plaintext));
    expect(isPersonalApiKeyShape(key.plaintext)).toBe(true);
  });

  it("rejects other credential shapes", () => {
    expect(isPersonalApiKeyShape(undefined)).toBe(false);
    expect(isPersonalApiKeyShape("ringee_sk_short")).toBe(false);
    expect(isPersonalApiKeyShape(`cik_live_${"a".repeat(64)}`)).toBe(false);
  });
});

describe("CLI device login codes", () => {
  it("issues XXXX-XXXX codes from the unambiguous alphabet", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateCliUserCode();
      expect(code).toMatch(
        /^[BCDFGHJKLMNPQRSTVWXZ]{4}-[BCDFGHJKLMNPQRSTVWXZ]{4}$/,
      );
      expect(normalizeCliUserCode(code)).toBe(code);
    }
  });

  it("normalizes what a person types", () => {
    expect(normalizeCliUserCode("wdjb mjht")).toBe("WDJB-MJHT");
    expect(normalizeCliUserCode(" WDJBMJHT ")).toBe("WDJB-MJHT");
    expect(normalizeCliUserCode("WDJB-MJH")).toBeNull();
    // Vowels are never issued, so a code containing one is not ours.
    expect(normalizeCliUserCode("WDJB-MJHA")).toBeNull();
    expect(normalizeCliUserCode(null)).toBeNull();
  });

  it("hashes the device code it hands to the CLI", () => {
    const device = generateCliDeviceCode();
    expect(device.plaintext.length).toBeGreaterThanOrEqual(43);
    expect(device.hash).toBe(hashOpaqueSecret(device.plaintext));
  });
});
