import { describe, it, expect } from "vitest";
import { TelnyxEventNormalizer } from "./telnyx.event.normalizer";
import type { TelnyxWebhookEvent } from "./telnyx.webhook.types";

const normalizer = new TelnyxEventNormalizer();
const evt = (event_type: string, payload: Record<string, unknown> = {}) =>
  normalizer.normalize({
    event_type,
    payload: { call_control_id: "cc-1", ...payload },
  } as unknown as TelnyxWebhookEvent);

describe("TelnyxEventNormalizer", () => {
  it("maps carrier event names onto Ringee's vocabulary", () => {
    expect(evt("call.initiated")?.type).toBe("call.initiated");
    expect(evt("call.hangup")?.type).toBe("call.hangup");
    expect(evt("call.cost")?.type).toBe("call.cost");
  });

  it("folds the premium answering-machine tier into one domain event", () => {
    expect(evt("call.machine.greeting.ended")?.type).toBe(
      "call.machine.greeting.ended",
    );
    expect(evt("call.machine.premium.greeting.ended")?.type).toBe(
      "call.machine.greeting.ended",
    );
  });

  it("namespaces streaming failures under the call", () => {
    expect(evt("streaming.failed")?.type).toBe("call.streaming.failed");
  });

  it("reports an unrecognised carrier event as unknown but keeps its name", () => {
    const e = evt("call.bridged");
    expect(e?.type).toBe("unknown");
    expect(e?.providerEventType).toBe("call.bridged");
  });

  it("drops an event with no call to act on", () => {
    expect(
      normalizer.normalize({
        event_type: "call.initiated",
        payload: {},
      } as unknown as TelnyxWebhookEvent),
    ).toBeNull();
  });

  it("normalizes both spellings of each direction", () => {
    expect(evt("call.initiated", { direction: "incoming" })?.direction).toBe(
      "inbound",
    );
    expect(evt("call.initiated", { direction: "inbound" })?.direction).toBe(
      "inbound",
    );
    expect(evt("call.initiated", { direction: "outgoing" })?.direction).toBe(
      "outbound",
    );
    expect(evt("call.initiated", { direction: "OUTBOUND" })?.direction).toBe(
      "outbound",
    );
    expect(
      evt("call.initiated", { direction: "sideways" })?.direction,
    ).toBeNull();
  });

  it("lifts the common fields out of the payload", () => {
    const e = evt("call.initiated", {
      from: "+14155552671",
      to: "+13125559999",
      call_session_id: "sess-1",
      call_leg_id: "leg-1",
      client_state: "aW5pdGlhdGVfY2FsbA==",
      start_time: "2026-08-26T10:00:00.000Z",
    });
    expect(e?.from).toBe("+14155552671");
    expect(e?.to).toBe("+13125559999");
    expect(e?.callSessionId).toBe("sess-1");
    expect(e?.callLegId).toBe("leg-1");
    expect(e?.clientState).toBe("aW5pdGlhdGVfY2FsbA==");
    expect(e?.startedAt?.toISOString()).toBe("2026-08-26T10:00:00.000Z");
  });

  it("returns null for absent or unparseable common fields", () => {
    const e = evt("call.answered", { from: "", start_time: "not-a-date" });
    expect(e?.from).toBeNull();
    expect(e?.to).toBeNull();
    expect(e?.startedAt).toBeNull();
  });

  it("normalizes custom SIP headers and skips malformed entries", () => {
    const e = evt("call.initiated", {
      custom_headers: [
        { name: "X-Ringee-Call-Id", value: "token-1" },
        { name: "X-Empty" },
        { value: "no-name" },
        "garbage",
      ],
    });
    expect(e?.customHeaders).toEqual([
      { name: "X-Ringee-Call-Id", value: "token-1" },
    ]);
    expect(evt("call.initiated")?.customHeaders).toEqual([]);
  });

  it("keeps the untouched provider payload available", () => {
    const e = evt("call.cost", { total_cost: "0.03" });
    expect((e?.payload as { total_cost: string }).total_cost).toBe("0.03");
    expect(e?.provider).toBe("telnyx");
  });
});
