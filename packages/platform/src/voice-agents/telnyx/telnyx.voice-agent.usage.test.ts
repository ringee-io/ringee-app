import { describe, expect, it, vi } from "vitest";
import { TelnyxVoiceAgentService } from "./telnyx.voice-agent.service";
import type { TelnyxClient } from "../../telephony/telnyx/telnyx.client";
import type { TelnyxKnowledgeStore } from "./telnyx.knowledge.store";

/**
 * What one agent call costs is spread across three Telnyx record types, and
 * each is tagged with only the handle its own subsystem knows about. Asking a
 * record type by a handle it does not carry answers a confident, empty list —
 * which reads downstream as "this call was free" and gives the call away.
 */
function build(rows: Record<string, Record<string, unknown>[]> = {}) {
  const get = vi.fn(async (path: string) => {
    const recordType = new URL(`https://x${path}`).searchParams.get(
      "filter[record_type]",
    );
    return { data: rows[recordType ?? ""] ?? [] };
  });
  const service = new TelnyxVoiceAgentService(
    { get } as unknown as TelnyxClient,
    {} as TelnyxKnowledgeStore,
  );
  return { service, get };
}

/** The query string each record type was actually asked with. */
function queries(
  get: ReturnType<typeof vi.fn>,
): Record<string, URLSearchParams> {
  const byType: Record<string, URLSearchParams> = {};
  for (const [path] of get.mock.calls) {
    const params = new URL(`https://x${path}`).searchParams;
    byType[params.get("filter[record_type]")!] = params;
  }
  return byType;
}

describe("TelnyxVoiceAgentService usage records", () => {
  it("looks each record type up by a handle it actually carries", async () => {
    const { service, get } = build();

    await service.fetchUsageRecords({
      conversationId: "conv-1",
      callControlId: "v3:cc-1",
    });

    const asked = queries(get);
    // The voice leg has no idea a conversation happened.
    expect(asked["sip-trunking"].get("filter[call_control_id]")).toBe(
      "v3:cc-1",
    );
    expect(asked["sip-trunking"].get("filter[conversation_id]")).toBeNull();
    // The token records are never tagged with the SIP leg.
    expect(asked["inference"].get("filter[conversation_id]")).toBe("conv-1");
    expect(asked["inference"].get("filter[call_control_id]")).toBeNull();
    // The engine carries both; the conversation is the more precise one.
    expect(asked["ai-voice-assistant"].get("filter[conversation_id]")).toBe(
      "conv-1",
    );
  });

  it("prices a call that only ever had a control id", async () => {
    // The conversation id only arrives on a webhook. A call whose webhook never
    // landed still has to be priced, and the engine record carries the leg.
    const { service, get } = build({
      "sip-trunking": [
        { call_control_id: "v3:cc-1", cost: "0.265", billed_sec: 120 },
      ],
      "ai-voice-assistant": [
        {
          call_control_id: "v3:cc-1",
          conversation_id: "conv-1",
          cost: "0.1",
          billed_sec: 120,
        },
      ],
    });

    const records = await service.fetchUsageRecords({
      callControlId: "v3:cc-1",
    });

    expect(records.map((r) => [r.kind, r.costUsd])).toEqual([
      ["telephony", 0.265],
      ["voice_agent", 0.1],
    ]);
    // Nothing to ask the token records with, so they are not asked at all —
    // rather than asked wrongly and answered "free".
    expect(queries(get)["inference"]).toBeUndefined();
    // And the answer names the conversation the caller did not know yet.
    expect(records[1].conversationId).toBe("conv-1");
  });

  it("keeps the other record types when one of them fails", async () => {
    const get = vi.fn(async (path: string) => {
      if (path.includes("sip-trunking")) throw new Error("upstream is down");
      return {
        data: [{ call_control_id: "v3:cc-1", cost: "0.1", billed_sec: 60 }],
      };
    });
    const service = new TelnyxVoiceAgentService(
      { get } as unknown as TelnyxClient,
      {} as TelnyxKnowledgeStore,
    );

    const records = await service.fetchUsageRecords({
      conversationId: "conv-1",
      callControlId: "v3:cc-1",
    });

    expect(records.map((r) => r.kind)).toEqual(["voice_agent", "inference"]);
  });
});

describe("TelnyxVoiceAgentService recordings", () => {
  it("returns only the recordings that are finished", async () => {
    const get = vi.fn().mockResolvedValue({
      data: [
        {
          id: "rec-1",
          status: "processing",
          channels: "dual",
          download_urls: {},
        },
        {
          id: "rec-2",
          status: "completed",
          channels: "dual",
          call_control_id: "v3:cc-1",
          call_session_id: "cs-1",
          download_urls: { mp3: "https://provider.example/rec.mp3" },
          recording_started_at: "2026-09-01T02:18:36.775161Z",
          recording_ended_at: "2026-09-01T02:20:01.879485Z",
          duration_millis: 85104,
        },
      ],
    });
    const service = new TelnyxVoiceAgentService(
      { get } as unknown as TelnyxClient,
      {} as TelnyxKnowledgeStore,
    );

    const recordings = await service.fetchRecordings("cs-1");

    expect(get).toHaveBeenCalledWith(
      "/recordings?filter%5Bcall_session_id%5D=cs-1",
    );
    expect(recordings).toEqual([
      {
        providerRecordingId: "rec-2",
        callControlId: "v3:cc-1",
        callSessionId: "cs-1",
        downloadUrl: "https://provider.example/rec.mp3",
        channels: "dual",
        startedAt: new Date("2026-09-01T02:18:36.775161Z"),
        endedAt: new Date("2026-09-01T02:20:01.879485Z"),
        durationMillis: 85104,
      },
    ]);
  });
});
