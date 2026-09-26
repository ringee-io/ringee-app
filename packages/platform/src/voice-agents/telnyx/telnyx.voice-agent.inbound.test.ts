import { describe, expect, it, vi } from "vitest";
import { TelnyxVoiceAgentService } from "./telnyx.voice-agent.service";
import type { TelnyxClient } from "../../telephony/telnyx/telnyx.client";
import type { TelnyxKnowledgeStore } from "./telnyx.knowledge.store";
import type { VoiceAgentConfig } from "../interfaces/voice-agent.provider";

const config: VoiceAgentConfig = {
  name: "Reception",
  instructions: "Help directly using company knowledge.",
  greeting: "How can I help?",
  modelId: "existing-model",
  language: "es",
  voiceId: "Telnyx.Ultra.Clara",
  recordCalls: true,
  dynamicVariables: { current_date: "2026-09-23" },
  tools: [{ kind: "retrieval", bucketIds: ["existing-knowledge"] }],
};

describe("Telnyx inbound assistant on the existing caller leg", () => {
  it("answers with configured recording, then starts the existing assistant with per-call tools and context", async () => {
    const post = vi
      .fn()
      .mockResolvedValue({ data: { conversation_id: "conversation" } });
    const service = new TelnyxVoiceAgentService(
      { post } as unknown as TelnyxClient,
      {} as TelnyxKnowledgeStore,
    );
    const handle = await service.startInboundCall({
      assistantId: "existing-assistant",
      callControlId: "original-leg",
      commandId: "inbound-one",
      config,
    });
    expect(handle.conversationId).toBe("conversation");
    expect(post.mock.calls[0]).toEqual([
      "/calls/original-leg/actions/answer",
      {
        command_id: "inbound-one-answer",
        record: "record-from-answer",
        record_channels: "dual",
        record_format: "mp3",
      },
    ]);
    expect(post.mock.calls[1][0]).toBe(
      "/calls/original-leg/actions/ai_assistant_start",
    );
    expect(post.mock.calls[1][1]).toMatchObject({
      command_id: "inbound-one",
      assistant: {
        id: "existing-assistant",
        instructions: config.instructions,
        dynamic_variables: config.dynamicVariables,
        tools: [{ type: "retrieval" }],
        voice_settings: { voice: config.voiceId },
      },
      greeting: config.greeting,
    });
    // Telnyx documents no top-level voice on this command.
    expect(post.mock.calls[1][1]).not.toHaveProperty("voice");
    expect(
      post.mock.calls.some(
        ([path]) => path.includes("texml") || path === "/ai/assistants",
      ),
    ).toBe(false);
  });
  it("respects recording disabled and uses an idempotent stop without hanging up the caller", async () => {
    const post = vi.fn().mockResolvedValue({ data: {} });
    const service = new TelnyxVoiceAgentService(
      { post } as unknown as TelnyxClient,
      {} as TelnyxKnowledgeStore,
    );
    await service.startInboundCall({
      assistantId: "existing-assistant",
      callControlId: "caller",
      commandId: "one",
      config: { ...config, recordCalls: false },
    });
    expect(post.mock.calls[0][1]).not.toHaveProperty("record");
    await service.stopInboundAssistant("caller", "stop-one");
    expect(post).toHaveBeenLastCalledWith(
      "/calls/caller/actions/ai_assistant_stop",
      { command_id: "stop-one" },
    );
  });
});
