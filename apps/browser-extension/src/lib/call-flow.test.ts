import { describe, expect, it } from "vitest";
import {
  MessageType,
  type CallSnapshotMsg,
} from "@ringee/dialer-core/contracts";
import {
  ERROR_COPY,
  buildStartCall,
  callDurationSeconds,
  callEventSnapshotPatch,
  createCommandFilter,
  failureSnapshot,
  reportsPlacedLeg,
  statusTextFor,
} from "./call-flow";
import type { PrepareCallResponse } from "./ringee-api";

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

describe("callEventSnapshotPatch", () => {
  it("keeps the last Telnyx session id when the terminal event omits it", () => {
    const patch = callEventSnapshotPatch(
      {
        type: MessageType.CallSnapshot,
        state: "active",
        telnyxSessionId: "telnyx-session-1",
      },
      { type: MessageType.CallEvent, state: "ended" },
    );

    expect(patch.state).toBe("ended");
    expect(patch.telnyxSessionId).toBe("telnyx-session-1");
  });

  it("uses a newly observed Telnyx session id", () => {
    const patch = callEventSnapshotPatch(
      { type: MessageType.CallSnapshot, state: "connecting" },
      {
        type: MessageType.CallEvent,
        state: "ringing",
        detail: { telnyxSessionId: "telnyx-session-2" },
      },
    );

    expect(patch.telnyxSessionId).toBe("telnyx-session-2");
  });

  it("records when the call ended, once", () => {
    const live: CallSnapshotMsg = {
      type: MessageType.CallSnapshot,
      state: "active",
    };
    expect(
      callEventSnapshotPatch(
        live,
        { type: MessageType.CallEvent, state: "held" },
        5_000,
      ),
    ).not.toHaveProperty("endedAt");

    const ended = callEventSnapshotPatch(
      live,
      { type: MessageType.CallEvent, state: "ended" },
      5_000,
    );
    expect(ended.endedAt).toBe(5_000);
    // A repeated end report keeps the first one.
    expect(
      callEventSnapshotPatch(
        { ...live, ...ended },
        { type: MessageType.CallEvent, state: "ended" },
        9_000,
      ).endedAt,
    ).toBe(5_000);
    expect(
      callEventSnapshotPatch(
        live,
        { type: MessageType.CallEvent, state: "failed" },
        6_000,
      ).endedAt,
    ).toBe(6_000);
  });
});

describe("callDurationSeconds", () => {
  it("counts up to the recorded end, however late the wrap-up opens", () => {
    expect(
      callDurationSeconds({ startedAt: 1_000, endedAt: 66_000 }, 3_600_000),
    ).toBe(65);
  });

  it("counts up to now when no end was recorded", () => {
    expect(callDurationSeconds({ startedAt: 1_000 }, 31_400)).toBe(30);
  });

  it("is zero without a start, and never negative", () => {
    expect(callDurationSeconds({}, 10_000)).toBe(0);
    expect(callDurationSeconds({ startedAt: 10_000 }, 5_000)).toBe(0);
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

describe("backend-minted credentials only", () => {
  it("dials with the credential prepare-call minted, never a bundled one", () => {
    const msg = buildStartCall(PREPARED, { userId: "user_1" });
    expect(msg.sip).toEqual({ username: "sip-user", password: "sip-pass" });
    expect(msg.callerId).toBe("+14155550000");
  });

  it("carries the dial authorization prepare-call issued", () => {
    const msg = buildStartCall(
      { ...PREPARED, dialToken: "v1.claims.sig" },
      { userId: "user_1" },
    );
    expect(msg.dialToken).toBe("v1.claims.sig");
  });
});

describe("statusTextFor", () => {
  it("maps call states to labels the modal shows", () => {
    expect(statusTextFor("active")).toBe("Connected");
    expect(statusTextFor("held")).toBe("On hold");
    expect(statusTextFor("ringing")).toBe("Ringing…");
  });
});

describe("reportsPlacedLeg", () => {
  it("counts a live leg as placed", () => {
    for (const state of ["connecting", "ringing", "active", "held"] as const) {
      expect(reportsPlacedLeg(state)).toBe(true);
    }
  });

  it("does not count a dial called off, refused or already over", () => {
    for (const state of ["idle", "requesting", "failed", "ended"] as const) {
      expect(reportsPlacedLeg(state)).toBe(false);
    }
  });
});

describe("createCommandFilter", () => {
  it("acts on a press once, however many times it is delivered", () => {
    const firstDelivery = createCommandFilter();
    expect(firstDelivery("press-1")).toBe(true);
    expect(firstDelivery("press-1")).toBe(false);
    expect(firstDelivery("press-2")).toBe(true);
  });

  it("lets a command without an id through", () => {
    const firstDelivery = createCommandFilter();
    expect(firstDelivery(undefined)).toBe(true);
    expect(firstDelivery(undefined)).toBe(true);
  });

  it("forgets the oldest ids past its limit", () => {
    const firstDelivery = createCommandFilter(2);
    firstDelivery("a");
    firstDelivery("b");
    firstDelivery("c");
    expect(firstDelivery("a")).toBe(true);
    expect(firstDelivery("c")).toBe(false);
  });
});
