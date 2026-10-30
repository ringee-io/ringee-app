import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
