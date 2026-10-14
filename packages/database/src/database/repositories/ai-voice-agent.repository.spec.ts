/// <reference types="node" />
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { describe, it } from "node:test";
import { AiVoiceAgentRepository } from "./ai-voice-agent.repository";

const ctx = { userId: "user-1", organizationId: "org-1" };
const data = { requestKey: "request-1" } as never;

function duplicateError(target: unknown[]) {
  return new Prisma.PrismaClientKnownRequestError("duplicate", {
    code: "P2002",
    clientVersion: "test",
    meta: { target },
  });
}

describe("AiVoiceAgentRepository.reserveCustomVoice", () => {
  it("recognizes request-key constraint names returned by PostgreSQL", async () => {
    const existing = { id: "voice-1" };
    const repository = new AiVoiceAgentRepository({
      aiVoiceAgentCustomVoice: {
        create: async () => {
          throw duplicateError(['"AiVoiceAgentCustomVoice_requestKey_key"']);
        },
        findFirstOrThrow: async () => existing,
      },
    } as never);

    assert.deepEqual(await repository.reserveCustomVoice(ctx, data), {
      created: false,
      voice: existing,
    });
  });

  it("rethrows unique violations unrelated to the request key", async () => {
    const error = duplicateError(["voiceId"]);
    const repository = new AiVoiceAgentRepository({
      aiVoiceAgentCustomVoice: {
        create: async () => {
          throw error;
        },
      },
    } as never);

    await assert.rejects(repository.reserveCustomVoice(ctx, data), error);
  });
});

describe("AiVoiceAgentRepository.createForAutomation", () => {
  it("rejects a replaced claim before creating an agent", async () => {
    let creations = 0;
    const repository = new AiVoiceAgentRepository({
      $transaction: async (fn: (tx: unknown) => unknown) =>
        fn({
          $queryRaw: async () => [{ claimToken: "replacement", agentId: null }],
          aiVoiceAgent: {
            create: async () => {
              creations++;
              return {};
            },
          },
        }),
    } as never);
    assert.equal(
      await repository.createForAutomation(
        ctx,
        { name: "Agent", type: "appointment_booking" },
        { id: "automation", token: "old" },
      ),
      null,
    );
    assert.equal(creations, 0);
  });

  it("associates the local agent in the same transaction before provisioning", async () => {
    const events: string[] = [];
    const repository = new AiVoiceAgentRepository({
      $transaction: async (fn: (tx: unknown) => unknown) =>
        fn({
          $queryRaw: async () => [{ claimToken: "owner", agentId: null }],
          aiVoiceAgent: {
            create: async () => {
              events.push("create");
              return { id: "agent" };
            },
          },
          aiVoiceAgentAutomation: {
            update: async () => {
              events.push("associate");
            },
          },
        }),
    } as never);
    const agent = await repository.createForAutomation(
      ctx,
      { name: "Agent", type: "appointment_booking" },
      { id: "automation", token: "owner" },
    );
    assert.equal(agent?.id, "agent");
    assert.deepEqual(events, ["create", "associate"]);
  });
});
