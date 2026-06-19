import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MessageType } from "@ringee/dialer-core/contracts";
import {
  ERROR_COPY,
  buildStartCall,
  buildStaticStartCall,
  failureSnapshot,
  statusTextFor,
} from "./call-flow";
import type { PrepareCallResponse } from "./ringee-api";

// Vitest loads the project's .env, so the static-credential vars may be set.
// Clear them before each test and let the cases that need them stub explicitly,
// keeping every assertion deterministic regardless of the local .env.
beforeEach(() => {
  vi.stubEnv("VITE_TELNYX_LOGIN", "");
  vi.stubEnv("VITE_TELNYX_PASSWORD", "");
  vi.stubEnv("VITE_RINGEE_PUBLIC_CALLER_ID", "");
});
afterEach(() => vi.unstubAllEnvs());

const PREPARED: PrepareCallResponse = {
  callId: "call_1",
  contact: { id: "c1", name: "Jane", company: "Acme" },
  callerId: "+14155550000",
  credential: {
    sipUsername: "sip-user",
    sipPassword: "sip-pass",
    expiresAt: "2026-06-16T00:00:00Z",
    connectionId: "conn_1",
  },
  destination: "+18095551234",
};

describe("failureSnapshot", () => {
  it("flags DNC and surfaces the right copy", () => {
    const snap = failureSnapshot("DNC_BLOCKED");
    expect(snap.state).toBe("failed");
    expect(snap.dncBlocked).toBe(true);
    expect(snap.error).toBe(ERROR_COPY.DNC_BLOCKED);
  });

  it("maps credit / caller-id / permission failures without the DNC flag", () => {
    expect(failureSnapshot("INSUFFICIENT_CREDITS").dncBlocked).toBe(false);
    expect(failureSnapshot("NO_CALLER_ID").error).toBe(ERROR_COPY.NO_CALLER_ID);
    expect(failureSnapshot("FORBIDDEN").error).toBe(ERROR_COPY.FORBIDDEN);
  });

  it("falls back to the generic message for unknown codes", () => {
    expect(failureSnapshot("UNKNOWN").error).toBe(ERROR_COPY.UNKNOWN);
  });
});

describe("buildStartCall (prepare-call → offscreen)", () => {
  it("carries the backend-resolved caller ID + ephemeral creds (never hardcoded)", () => {
    const msg = buildStartCall(PREPARED, { userId: "user_1", orgId: "org_1" });
    expect(msg.type).toBe(MessageType.StartCall);
    expect(msg.callerId).toBe("+14155550000");
    expect(msg.sip).toEqual({ username: "sip-user", password: "sip-pass" });
    expect(msg.destination).toBe("+18095551234");
    expect(msg.userId).toBe("user_1");
    expect(msg.organizationId).toBe("org_1");
    expect(msg.callId).toBe("call_1");
  });

  it("omits the org for a personal workspace and normalizes a null callId", () => {
    const msg = buildStartCall(
      { ...PREPARED, callId: null },
      { userId: "user_1" },
    );
    expect(msg.organizationId).toBeUndefined();
    expect(msg.callId).toBeUndefined();
  });
});

describe("static env credentials (web-app style)", () => {
  it("overrides the backend SIP creds + caller ID when env is set", () => {
    vi.stubEnv("VITE_TELNYX_LOGIN", "useredison44068");
    vi.stubEnv("VITE_TELNYX_PASSWORD", "G7bJ#!+Gtj=K");
    vi.stubEnv("VITE_RINGEE_PUBLIC_CALLER_ID", "+17869460882");

    const msg = buildStartCall(PREPARED, { userId: "user_1" });
    expect(msg.sip).toEqual({
      username: "useredison44068",
      password: "G7bJ#!+Gtj=K",
    });
    expect(msg.callerId).toBe("+17869460882");
    // Backend attribution (contact/callId) is still carried through.
    expect(msg.callId).toBe("call_1");
  });

  it("buildStaticStartCall dials straight from env, bypassing the backend", () => {
    vi.stubEnv("VITE_TELNYX_LOGIN", "useredison44068");
    vi.stubEnv("VITE_TELNYX_PASSWORD", "G7bJ#!+Gtj=K");
    vi.stubEnv("VITE_RINGEE_PUBLIC_CALLER_ID", "+17869460882");

    const msg = buildStaticStartCall(
      { destination: "+18095551234" },
      { userId: "user_1", orgId: "org_1" },
    );
    expect(msg).not.toBeNull();
    expect(msg!.type).toBe(MessageType.StartCall);
    expect(msg!.callerId).toBe("+17869460882");
    expect(msg!.destination).toBe("+18095551234");
    expect(msg!.callId).toBeUndefined();
  });

  it("buildStaticStartCall returns null unless creds AND caller ID are set", () => {
    expect(
      buildStaticStartCall({ destination: "+18095551234" }, { userId: "u" }),
    ).toBeNull();

    vi.stubEnv("VITE_TELNYX_LOGIN", "useredison44068");
    vi.stubEnv("VITE_TELNYX_PASSWORD", "G7bJ#!+Gtj=K");
    // No caller ID → still null.
    expect(
      buildStaticStartCall({ destination: "+18095551234" }, { userId: "u" }),
    ).toBeNull();
  });
});

describe("statusTextFor", () => {
  it("maps call states to labels the modal shows", () => {
    expect(statusTextFor("active")).toBe("Connected");
    expect(statusTextFor("held")).toBe("On hold");
    expect(statusTextFor("ringing")).toBe("Ringing…");
  });
});
