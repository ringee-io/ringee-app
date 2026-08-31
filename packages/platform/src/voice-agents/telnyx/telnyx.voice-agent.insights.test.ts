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
