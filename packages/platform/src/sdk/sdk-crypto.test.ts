import { describe, it, expect } from "vitest";
import {
  normalizeOrigin,
  isOriginAllowed,
  normalizeAllowedOrigins,
} from "./origin";
import {
  mintPublishableKey,
  verifyPublishableKey,
  PUBLISHABLE_KEY_PREFIX,
} from "./publishable-key";
import {
  mintAgentSession,
  verifyAgentSession,
  SDK_SESSION_PREFIX,
} from "./sdk-session";
import { generateOtpCode, hashOtp, verifyOtp, maskEmail } from "./otp";
import { signCallCorrelation, verifyCallCorrelation } from "./call-correlation";

describe("origin normalization + allow-listing", () => {
  it("normalizes to scheme://host[:port] and drops default ports/paths", () => {
    expect(normalizeOrigin("https://crm.example.com/")).toBe(
      "https://crm.example.com",
    );
    expect(normalizeOrigin("https://crm.example.com:443")).toBe(
      "https://crm.example.com",
    );
    expect(normalizeOrigin("http://localhost:3000")).toBe(
      "http://localhost:3000",
    );
    expect(normalizeOrigin("HTTPS://CRM.EXAMPLE.COM")).toBe(
      "https://crm.example.com",
    );
  });

  it("rejects invalid, path-scoped, or credentialed origins", () => {
    expect(normalizeOrigin("")).toBeNull();
    expect(normalizeOrigin(undefined)).toBeNull();
    expect(normalizeOrigin("not a url")).toBeNull();
    expect(normalizeOrigin("ftp://crm.example.com")).toBeNull();
    expect(normalizeOrigin("https://crm.example.com/app")).toBeNull();
    expect(normalizeOrigin("https://user:pass@crm.example.com")).toBeNull();
  });

  it("matches exactly — no scheme upgrade, subdomain, or suffix tricks", () => {
    const allowed = ["https://crm.example.com"];
    expect(isOriginAllowed("https://crm.example.com", allowed)).toBe(true);
    expect(isOriginAllowed("http://crm.example.com", allowed)).toBe(false);
    expect(isOriginAllowed("https://sub.crm.example.com", allowed)).toBe(false);
    expect(
      isOriginAllowed("https://crm.example.com.attacker.com", allowed),
    ).toBe(false);
    expect(isOriginAllowed(undefined, allowed)).toBe(false);
  });

  it("normalizeAllowedOrigins de-dupes and rejects malformed entries", () => {
    expect(
      normalizeAllowedOrigins([
        "https://crm.example.com/",
        "https://crm.example.com",
      ]),
    ).toEqual(["https://crm.example.com"]);
    expect(() => normalizeAllowedOrigins([])).toThrow();
    expect(() => normalizeAllowedOrigins(["nope"])).toThrow();
  });
});

describe("publishable key sign/verify", () => {
  const input = {
    integrationId: "int-123",
    apiKeyPrefix: "cik_live_a1b2c3d4",
    allowedOrigins: ["https://crm.example.com"],
  };

  it("mints a pk_live token and verifies its claims", () => {
    const { key, claims } = mintPublishableKey(input);
    expect(key.startsWith(PUBLISHABLE_KEY_PREFIX)).toBe(true);
    const res = verifyPublishableKey(key);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.claims.integrationId).toBe("int-123");
      expect(res.claims.apiKeyPrefix).toBe("cik_live_a1b2c3d4");
      expect(res.claims.allowedOrigins).toEqual(["https://crm.example.com"]);
      expect(claims.type).toBe("ringee_publishable_key");
    }
  });

  it("rejects a tampered payload", () => {
    const { key } = mintPublishableKey(input);
    const body = key.slice(PUBLISHABLE_KEY_PREFIX.length);
    const [payload, sig] = body.split(".");
    const forgedClaims = Buffer.from(
      JSON.stringify({
        type: "ringee_publishable_key",
        version: 1,
        integrationId: "attacker",
        apiKeyPrefix: "cik_live_a1b2c3d4",
        allowedOrigins: ["https://evil.com"],
        issuedAt: 1,
      }),
    ).toString("base64url");
    const forged = `${PUBLISHABLE_KEY_PREFIX}${forgedClaims}.${sig}`;
    expect(verifyPublishableKey(forged)).toEqual({
      ok: false,
      error: "bad_signature",
    });
    // sanity: original payload still verifies
    expect(
      verifyPublishableKey(`${PUBLISHABLE_KEY_PREFIX}${payload}.${sig}`).ok,
    ).toBe(true);
  });

  it("rejects malformed input", () => {
    expect(verifyPublishableKey("garbage").ok).toBe(false);
    expect(verifyPublishableKey("pk_live_onlyonepart").ok).toBe(false);
    expect(verifyPublishableKey(123 as unknown).ok).toBe(false);
  });
});

describe("agent session sign/verify", () => {
  const base = {
    integrationId: "int-1",
    userId: "user-1",
    organizationId: "org-1",
    email: "agent@company.com",
    origin: "https://crm.example.com",
  };

  it("mints and verifies a session", () => {
    const { token, claims } = mintAgentSession(base);
    expect(token.startsWith(SDK_SESSION_PREFIX)).toBe(true);
    const res = verifyAgentSession(token);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.claims.userId).toBe("user-1");
      expect(res.claims.origin).toBe("https://crm.example.com");
    }
    expect(claims.expiresAt).toBeGreaterThan(claims.issuedAt);
  });

  it("reports expiry", () => {
    const { token, claims } = mintAgentSession({ ...base, ttlSeconds: 10 });
    const res = verifyAgentSession(token, claims.expiresAt + 1);
    expect(res).toEqual({ ok: false, error: "expired" });
  });

  it("rejects tampered userId", () => {
    const { token } = mintAgentSession(base);
    const [prefixed, sig] = token.split(".");
    const payload = prefixed.slice(SDK_SESSION_PREFIX.length);
    const forged = Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(payload, "base64url").toString()),
        userId: "attacker",
      }),
    ).toString("base64url");
    expect(verifyAgentSession(`${SDK_SESSION_PREFIX}${forged}.${sig}`)).toEqual(
      { ok: false, error: "bad_signature" },
    );
  });
});

describe("otp", () => {
  it("generates a 6-digit code", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateOtpCode();
      expect(code).toMatch(/^\d{6}$/);
    }
  });

  it("hashes + verifies with constant-time compare, salted per challenge", () => {
    const code = "123456";
    const h1 = hashOtp(code, "chal-1");
    const h2 = hashOtp(code, "chal-2");
    expect(h1).not.toBe(h2); // same code, different challenge → different hash
    expect(verifyOtp(code, "chal-1", h1)).toBe(true);
    expect(verifyOtp("000000", "chal-1", h1)).toBe(false);
    expect(verifyOtp(code, "chal-2", h1)).toBe(false);
  });

  it("masks emails", () => {
    expect(maskEmail("agent@company.com")).toBe("ag***@company.com");
    expect(maskEmail("a@company.com")).toBe("a***@company.com");
  });
});

describe("call correlation", () => {
  it("signs and verifies a callId", () => {
    const callId = "550e8400-e29b-41d4-a716-446655440000";
    const token = signCallCorrelation(callId);
    expect(token.startsWith(`${callId}.`)).toBe(true);
    expect(verifyCallCorrelation(token)).toBe(callId);
  });

  it("rejects a forged or swapped signature", () => {
    const token = signCallCorrelation("call-a");
    const sig = token.split(".")[1];
    expect(verifyCallCorrelation(`call-b.${sig}`)).toBeNull();
    expect(verifyCallCorrelation("call-a.deadbeef")).toBeNull();
    expect(verifyCallCorrelation("no-dot")).toBeNull();
    expect(verifyCallCorrelation(42 as unknown)).toBeNull();
  });
});
