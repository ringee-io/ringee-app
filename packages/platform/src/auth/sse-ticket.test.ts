import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as secrets from "../sdk/secrets";
import { signSseTicket, verifySseTicket } from "./sse-ticket";

const previous = process.env.SDK_SIGNING_SECRET;
beforeAll(() => {
  process.env.SDK_SIGNING_SECRET = "sse-ticket-test-secret";
});
afterAll(() => {
  process.env.SDK_SIGNING_SECRET = previous;
});

describe("sse ticket", () => {
  const ctx = { userId: "user-1", organizationId: "org-1" };

  it("rejects malformed and oversized tickets before deriving a key", () => {
    const derive = vi.spyOn(secrets, "deriveSdkKey");
    try {
      for (const value of [
        "a.b",
        "a." + "b".repeat(42),
        "a=." + "b".repeat(43),
        "a.b.c",
        "a".repeat(3000) + "." + "b".repeat(43),
      ]) {
        expect(verifySseTicket(value, "ai:conv-1")).toBeNull();
      }
      expect(derive).not.toHaveBeenCalled();
    } finally {
      derive.mockRestore();
    }
  });

  it("opens only the stream it was issued for", () => {
    const ticket = signSseTicket("ai:conv-1", ctx);
    expect(verifySseTicket(ticket, "ai:conv-1")).toEqual(ctx);
    expect(verifySseTicket(ticket, "ai:conv-2")).toBeNull();
  });

  it("expires", () => {
    const ticket = signSseTicket("ai:conv-1", ctx, { now: 0, ttlMs: 10 });
    expect(verifySseTicket(ticket, "ai:conv-1", 11)).toBeNull();
  });

  it("refuses a tampered or malformed ticket", () => {
    const ticket = signSseTicket("ai:conv-1", ctx);
    const [, signature] = ticket.split(".");
    const forged = Buffer.from(
      JSON.stringify({
        s: "ai:conv-1",
        u: "user-2",
        o: null,
        e: Date.now() + 60_000,
      }),
    ).toString("base64url");
    expect(verifySseTicket(`${forged}.${signature}`, "ai:conv-1")).toBeNull();
    expect(verifySseTicket("conv-1", "ai:conv-1")).toBeNull();
    expect(verifySseTicket(undefined, "ai:conv-1")).toBeNull();
  });
});
