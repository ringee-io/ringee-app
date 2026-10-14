import { HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { TelnyxVoiceAgentService } from "./telnyx.voice-agent.service";
import type { TelnyxClient } from "../../telephony/telnyx/telnyx.client";
import type { TelnyxKnowledgeStore } from "./telnyx.knowledge.store";
import {
  VoiceAgentCallRefusedError,
  type VoiceAgentCallRequest,
} from "../interfaces/voice-agent.provider";

const REQUEST: VoiceAgentCallRequest = {
  assistantId: "assistant-1",
  callingAppId: "app-1",
  from: "+13055550001",
  to: "+13055550123",
};

function serviceRejecting(error: unknown) {
  const post = vi.fn().mockRejectedValue(error);
  return new TelnyxVoiceAgentService(
    { post } as unknown as TelnyxClient,
    {} as TelnyxKnowledgeStore,
  );
}

/**
 * Whether a failed dial may have rung someone. Only a refusal Telnyx stated
 * proves it did not; a durable caller retries nothing else (AGENT-019).
 */
describe("Telnyx outbound agent call start", () => {
  it("reports a 4xx as a refusal, keeping Telnyx's answer", async () => {
    const error = new HttpException({ errors: [{ code: "10016" }] }, 422);

    const rejection = await serviceRejecting(error)
      .startCall(REQUEST)
      .catch((thrown: unknown) => thrown);

    expect(rejection).toBeInstanceOf(VoiceAgentCallRefusedError);
    expect((rejection as HttpException).getStatus()).toBe(422);
    expect((rejection as HttpException).getResponse()).toEqual({
      errors: [{ code: "10016" }],
    });
  });

  it("passes a 4xx that proves nothing through: the leg may exist", async () => {
    // 408/425 can come from a hop after the request was forwarded, and a
    // throttled request is not promised to have had no effect.
    for (const status of [408, 425, 429]) {
      const error = new HttpException("uncertain", status);
      await expect(serviceRejecting(error).startCall(REQUEST)).rejects.toBe(
        error,
      );
    }
  });

  it("passes a 5xx or a lost connection through: the leg may exist", async () => {
    // The client reports a request that got no answer as a 502.
    for (const status of [500, 502, 504]) {
      const error = new HttpException("upstream", status);
      await expect(serviceRejecting(error).startCall(REQUEST)).rejects.toBe(
        error,
      );
    }
  });
});
