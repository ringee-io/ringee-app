/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { apiConfiguration } from "@ringee/configuration";
import { VoiceAgentService } from "./voice-agent.service";

const CTX = { userId: "user-1", organizationId: "org-1" };
const AGENT = {
  id: "agent-1",
  type: "reminders_notifications",
  providerAssistantId: "assistant-1",
};

function supportToolUrl(): string {
  const base = apiConfiguration.PUBLIC_BACKEND_URL!.replace(/\/+$/, "");
  return `${base}/api/ai-voice-agents/tools/agent-1/request-human-support`;
}

function build(currentWebhookUrls: string[]) {
  const syncs: string[] = [];
  const service = new VoiceAgentService(
    {} as never,
    {
      require: () => ({
        buildTools: (ctx: {
          agentId: string;
          toolBaseUrl: string;
          toolSecretRef: string;
        }) => [
          {
            kind: "webhook",
            name: "request_human_support",
            description: "Notify an administrator.",
            url: `${ctx.toolBaseUrl}/${ctx.agentId}/request-human-support`,
            method: "POST",
            headers: [
              {
                name: "X-Ringee-Tool-Secret",
                secretRef: ctx.toolSecretRef,
              },
            ],
          },
          { kind: "hangup", description: "End the call." },
        ],
      }),
    } as never,
    {} as never,
    {
      getAssistant: async () => ({
        assistantId: "assistant-1",
        callingAppId: "calling-app-1",
        unauthenticatedWebCallsEnabled: false,
        toolWebhookUrls: currentWebhookUrls,
      }),
    } as never,
    {} as never,
    {} as never,
    {} as never,
  );

  (
    service as unknown as {
      syncToProvider: (
        ctx: typeof CTX,
        agentId: string,
      ) => Promise<typeof AGENT>;
    }
  ).syncToProvider = async (_ctx, agentId) => {
    syncs.push(agentId);
    return AGENT;
  };

  return { service, syncs };
}

describe("VoiceAgentService tool delivery", () => {
  it("re-syncs an older assistant when a required webhook tool is missing", async () => {
    const { service, syncs } = build([]);

    await service.ensureToolEndpoints(CTX, AGENT as never);

    assert.deepEqual(syncs, ["agent-1"]);
  });

  it("does not rewrite an assistant whose webhook set is current", async () => {
    const { service, syncs } = build([supportToolUrl()]);

    await service.ensureToolEndpoints(CTX, AGENT as never);

    assert.deepEqual(syncs, []);
  });

  it("re-syncs webhook tools that still point to an old backend", async () => {
    const { service, syncs } = build([
      "https://old-api.example/api/ai-voice-agents/tools/agent-1/request-human-support",
    ]);

    await service.ensureToolEndpoints(CTX, AGENT as never);

    assert.deepEqual(syncs, ["agent-1"]);
  });
});
