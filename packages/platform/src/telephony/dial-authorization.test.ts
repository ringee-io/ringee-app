import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  signDialAuthorization,
  verifyDialAuthorization,
} from "./dial-authorization";

const previous = process.env.SDK_SIGNING_SECRET;
beforeAll(() => {
  process.env.SDK_SIGNING_SECRET = "dial-authorization-test-secret";
});
afterAll(() => {
  process.env.SDK_SIGNING_SECRET = previous;
});

describe("dial authorization", () => {
  const claims = {
    userId: "3f2b9c1e-8d4a-4b6f-9e21-5c7d8a9b0c1d",
    organizationId: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
    destination: "+1 (415) 555-0100",
  };

  it("round-trips the user, workspace and destination digits", () => {
    const token = signDialAuthorization(claims, { now: 1_000 });
    expect(verifyDialAuthorization(token, 2_000)).toEqual({
      userId: claims.userId,
      organizationId: claims.organizationId,
      destination: "14155550100",
      callerId: null,
      expiresAt: 1_000 + 5 * 60_000,
    });
  });

  it("binds the caller ID the pre-flight chose", () => {
    const token = signDialAuthorization({
      ...claims,
      callerId: "+12125559999",
    });
    expect(verifyDialAuthorization(token)?.callerId).toBe("12125559999");
  });

  it("keeps a personal workspace personal", () => {
    const token = signDialAuthorization({ ...claims, organizationId: null });
    expect(verifyDialAuthorization(token)?.organizationId).toBeNull();
  });

  it("refuses an expired token", () => {
    const token = signDialAuthorization(claims, { now: 1_000, ttlMs: 10 });
    expect(verifyDialAuthorization(token, 1_011)).toBeNull();
  });

  it("refuses claims that were edited after signing", () => {
    const token = signDialAuthorization(claims);
    const [version, , signature] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({
        u: "another-user",
        o: null,
        d: "14155550100",
        e: Date.now() + 60_000,
      }),
    ).toString("base64url");
    expect(verifyDialAuthorization(`${version}.${forged}.${signature}`)).toBe(
      null,
    );
  });

  it("refuses anything that is not a token", () => {
    expect(verifyDialAuthorization(undefined)).toBeNull();
    expect(verifyDialAuthorization("user_123")).toBeNull();
    expect(verifyDialAuthorization("v1.a.b")).toBeNull();
  });
});
