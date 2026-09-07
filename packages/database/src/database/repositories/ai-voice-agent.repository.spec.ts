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
