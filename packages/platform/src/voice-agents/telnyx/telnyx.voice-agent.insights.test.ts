import { describe, expect, it, vi } from "vitest";
import { TelnyxVoiceAgentService } from "./telnyx.voice-agent.service";
import type { TelnyxClient } from "../../telephony/telnyx/telnyx.client";
import type { TelnyxKnowledgeStore } from "./telnyx.knowledge.store";

/**
 * The verbs Telnyx expects are not uniform, and guessing costs a whole feature:
 * an assistant is updated with POST, an insight with PUT. Sending POST to an
 * insight answers 404 "Resource not found" for an insight that exists, which
 * fails the agent's re-sync and leaves its knowledge base attached to nothing.
 */
function build() {
  const client = {
    post: vi.fn().mockResolvedValue({ data: { id: "insight-1" } }),
    put: vi.fn().mockResolvedValue({}),
    get: vi.fn(),
    delete: vi.fn().mockResolvedValue({}),
  };
  const service = new TelnyxVoiceAgentService(
    client as unknown as TelnyxClient,
    {} as TelnyxKnowledgeStore,
  );
  return { service, client };
}

describe("TelnyxVoiceAgentService insights", () => {
  it("updates an insight with PUT, not POST", async () => {
    const { service, client } = build();

    await service.updateInsight("insight-1", {
      name: "Summary",
      instructions: "Summarize the call.",
    });

    expect(client.put).toHaveBeenCalledWith(
      "/ai/conversations/insights/insight-1",
      { name: "Summary", instructions: "Summarize the call." },
    );
    expect(client.post).not.toHaveBeenCalled();
  });

  it("creates an insight with POST and assigns it to the group", async () => {
    const { service, client } = build();

    const id = await service.createInsight("group-1", {
      name: "Outcome",
      instructions: "Decide the outcome.",
    });

    expect(id).toBe("insight-1");
    expect(client.post).toHaveBeenNthCalledWith(
      1,
      "/ai/conversations/insights",
      {
        name: "Outcome",
        instructions: "Decide the outcome.",
      },
    );
    expect(client.post).toHaveBeenNthCalledWith(
      2,
      "/ai/conversations/insight-groups/group-1/insights/insight-1/assign",
      {},
    );
  });
});

describe("TelnyxVoiceAgentService insight groups", () => {
  it("creates the group with the callback its results come back on", async () => {
    const { service, client } = build();
    client.post.mockResolvedValueOnce({ data: { id: "group-1" } });

    const id = await service.createInsightGroup({
      name: "Ringee agent 7",
      webhookUrl: "https://api.ringee.io/insights/7",
    });

    expect(id).toBe("group-1");
    expect(client.post).toHaveBeenCalledWith(
      "/ai/conversations/insight-groups",
      { name: "Ringee agent 7", webhook: "https://api.ringee.io/insights/7" },
    );
  });

  it("re-points an existing group with PUT", async () => {
    // Groups created before there was a callback are still analysing every
    // call and delivering nowhere. This is the only thing that fixes them.
    const { service, client } = build();

    await service.updateInsightGroup("group-1", {
      name: "Ringee agent 7",
      webhookUrl: "https://api.ringee.io/insights/7",
    });

    expect(client.put).toHaveBeenCalledWith(
      "/ai/conversations/insight-groups/group-1",
      { name: "Ringee agent 7", webhook: "https://api.ringee.io/insights/7" },
    );
    expect(client.post).not.toHaveBeenCalled();
  });
});

describe("TelnyxVoiceAgentService transcript", () => {
  it("walks every page of the conversation", async () => {
    const { service, client } = build();
    client.get
      .mockResolvedValueOnce({
        data: [{ role: "assistant", text: "Hi." }],
        meta: { total_pages: 2 },
      })
      .mockResolvedValueOnce({
        data: [{ role: "user", text: "Hello." }],
        meta: { total_pages: 2 },
      });

    const turns = await service.fetchTranscript("conv-1");

    expect(turns).toEqual([
      { role: "agent", text: "Hi.", at: null },
      { role: "customer", text: "Hello.", at: null },
    ]);
    expect(client.get).toHaveBeenNthCalledWith(
      1,
      "/ai/conversations/conv-1/messages?page%5Bsize%5D=100&page%5Bnumber%5D=1",
    );
    expect(client.get).toHaveBeenNthCalledWith(
      2,
      "/ai/conversations/conv-1/messages?page%5Bsize%5D=100&page%5Bnumber%5D=2",
    );
  });

  it("reports nothing rather than an empty transcript when the provider has none yet", async () => {
    // The conversation is published after the call ends, so "no messages" is
    // "not yet" — the caller retries instead of recording silence.
    const { service, client } = build();
    client.get.mockResolvedValueOnce({ data: [] });

    expect(await service.fetchTranscript("conv-1")).toEqual([]);
    expect(client.get).toHaveBeenCalledTimes(1);
  });
});
