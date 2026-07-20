/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AiPipelineContextType, Prisma } from "@prisma/client";
import { ObjectionCallAnalysisRepository } from "./objection-call-analysis.repository";

describe("ObjectionCallAnalysisRepository.claim", () => {
  it("turns a duplicate callId claim into a no-op", async () => {
    const prisma = {
      objectionCallAnalysis: {
        create: async () => {
          throw new Prisma.PrismaClientKnownRequestError("duplicate", {
            code: "P2002",
            clientVersion: "test",
          });
        },
      },
    };
    const repository = new ObjectionCallAnalysisRepository(prisma as never);

    const result = await repository.claim({
      callId: "00000000-0000-0000-0000-000000000001",
      contextType: AiPipelineContextType.personal,
      contextKey: "personal:user-1",
      userId: "00000000-0000-0000-0000-000000000002",
      outcomeClass: "interested",
    });

    assert.equal(result, null);
  });
});
