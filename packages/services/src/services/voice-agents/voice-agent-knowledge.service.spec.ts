/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { VoiceAgentKnowledgeService } from "./voice-agent-knowledge.service";
import { VoiceAgentService } from "./voice-agent.service";

const CTX = { userId: "user-1", organizationId: "org-1" };

describe("VoiceAgentKnowledgeService", () => {
  it("gives every added source its own provider bucket", async () => {
    const rows: Array<Record<string, unknown>> = [];
    const createdStores: string[] = [];
    const indexed: Array<{ store: string; url: string }> = [];
    const repository = {
      createKnowledgeSource: async (data: Record<string, unknown>) => {
        const row = {
          sourceUrl: null,
          content: null,
          providerFileName: null,
          embeddingTaskId: null,
          lastError: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        rows.push(row);
        return row;
      },
      updateKnowledgeSource: async (
        id: string,
        data: Record<string, unknown>,
      ) => {
        const row = rows.find((candidate) => candidate.id === id)!;
        Object.assign(row, data);
        return row;
      },
    };
    const provider = {
      createKnowledgeStore: async (store: string) => {
        createdStores.push(store);
      },
      indexKnowledgeUrl: async (store: string, url: string) => {
        indexed.push({ store, url });
        return `task-${indexed.length}`;
      },
    };
    const service = new VoiceAgentKnowledgeService(
      { require: async () => ({ id: "agent-1" }) } as never,
      repository as never,
      provider as never,
    );

    await service.addUrl(CTX as never, "agent-1", {
      url: "https://first.example/pricing",
    });
    await service.addUrl(CTX as never, "agent-1", {
      url: "https://second.example/pricing",
    });

    assert.equal(createdStores.length, 2);
    assert.notEqual(createdStores[0], createdStores[1]);
    assert.match(createdStores[0]!, /^ringee-kb-[0-9a-f-]{36}$/);
    assert.deepEqual(
      indexed.map(({ store }) => store),
      createdStores,
    );
    assert.deepEqual(
      rows.map(({ providerBucket }) => providerBucket),
      createdStores,
    );
  });

  it("syncs every distinct ready source onto the provider assistant", async () => {
    const attached: string[][] = [];
    const agent = {
      id: "agent-1",
      name: "Sofia",
      type: "reminders_notifications",
      status: "draft",
      modelProvider: "ringee",
      llmApiKeyRef: null,
      voiceId: null,
      voiceLanguage: "en",
      companyName: null,
      companyWebsite: null,
      companyDescription: null,
      providerAssistantId: "assistant-1",
      providerTexmlAppId: null,
      providerInsightGroupId: "insight-group-1",
      analysisSettings: {
        summary: false,
        outcome: false,
        sentiment: false,
        insightIds: {},
      },
      extractionFields: [],
      conversationSettings: {
        greetingMode: "assistant_speaks_first",
        greeting: "Hello",
        instructions: "Help the caller.",
        postConversationEnabled: false,
        postConversationInstructions: "",
      },
      callerNumberId: null,
      calendarIntegrationId: null,
      meetingDurationMinutes: 30,
      timezone: null,
      meetingTitle: null,
      knowledgeSources: [
        { status: "ready", providerBucket: "bucket-one" },
        { status: "ready", providerBucket: "bucket-two" },
      ],
    };
    const blueprint = {
      type: "reminders_notifications",
      requiresCalendar: false,
      variables: [],
      buildGreeting: () => "Hello",
      buildInstructions: () => "Help the caller.",
      buildSafetyInstructions: () => "Be safe.",
      buildInsights: () => ({}),
      buildTools: (context: { knowledgeBucketIds: string[] }) => {
        attached.push(context.knowledgeBucketIds);
        return [];
      },
    };
    const service = new VoiceAgentService(
      {
        findByIdForOwner: async () => agent,
        update: async (_id: string, data: Record<string, unknown>) => ({
          ...agent,
          ...data,
        }),
      } as never,
      { require: () => blueprint } as never,
      {
        resolveForAgent: async () => ({
          name: "Acme",
          description: "Widgets",
          website: "https://acme.example",
        }),
      } as never,
      {
        updateInsightGroup: async () => {},
        updateAssistant: async () => ({
          assistantId: "assistant-1",
          callingAppId: null,
          unauthenticatedWebCallsEnabled: false,
          toolWebhookUrls: [],
        }),
      } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.resync(CTX as never, agent.id);

    assert.deepEqual(attached, [["bucket-one", "bucket-two"]]);
  });

  it("cleans up a new store when URL source persistence fails", async () => {
    const createdStores: string[] = [];
    const deletedStores: string[] = [];
    const original = new Error("persist failed");

    const service = new VoiceAgentKnowledgeService(
      { require: async () => ({ id: "agent-1" }) } as never,
      {
        createKnowledgeSource: async () => {
          throw original;
        },
      } as never,
      {
        createKnowledgeStore: async (store: string) => {
          createdStores.push(store);
        },
        deleteKnowledgeStore: async (store: string) => {
          deletedStores.push(store);
        },
      } as never,
    );

    await assert.rejects(
      () =>
        service.addUrl(CTX as never, "agent-1", {
          url: "https://example.com/help",
        }),
      (error: unknown) => error === original,
    );

    assert.equal(createdStores.length, 1);
    assert.deepEqual(deletedStores, createdStores);
  });

  it("rethrows the original upload error when cleanup also fails", async () => {
    const original = new Error("upload failed");
    let createCalls = 0;

    const service = new VoiceAgentKnowledgeService(
      { require: async () => ({ id: "agent-1" }) } as never,
      {
        createKnowledgeSource: async () => {
          createCalls += 1;
          return {};
        },
      } as never,
      {
        createKnowledgeStore: async () => {},
        putKnowledgeDocument: async () => {
          throw original;
        },
        deleteKnowledgeStore: async () => {
          throw new Error("cleanup failed");
        },
      } as never,
    );

    await assert.rejects(
      () =>
        service.addText(CTX as never, "agent-1", {
          label: "FAQ",
          content: "Hours are 9 to 5.",
        }),
      (error: unknown) => error === original,
    );

    assert.equal(createCalls, 0);
  });

  it("cleans up a copied document store when persisting the copy fails", async () => {
    const createdStores: string[] = [];
    const deletedStores: string[] = [];
    const original = new Error("persist failed");

    const service = new VoiceAgentKnowledgeService(
      { require: async () => ({ id: "agent-2" }) } as never,
      {
        findKnowledgeSourceForOwner: async () => ({
          id: "source-1",
          agentId: "agent-1",
          kind: "pdf",
          label: "Pricing Guide",
          sourceUrl: null,
          content: null,
          providerBucket: "origin-bucket",
          providerFileName: "pricing.pdf",
        }),
        listKnowledgeSources: async () => [],
        createKnowledgeSource: async () => {
          throw original;
        },
      } as never,
      {
        readKnowledgeDocument: async () => ({
          body: Buffer.from("pdf-data"),
          contentType: "application/pdf",
        }),
        createKnowledgeStore: async (store: string) => {
          createdStores.push(store);
        },
        putKnowledgeDocument: async () => {},
        deleteKnowledgeStore: async (store: string) => {
          deletedStores.push(store);
        },
      } as never,
    );

    await assert.rejects(
      () => service.reuse(CTX as never, "agent-2", "source-1"),
      (error: unknown) => error === original,
    );

    assert.equal(createdStores.length, 1);
    assert.deepEqual(deletedStores, createdStores);
  });
});
