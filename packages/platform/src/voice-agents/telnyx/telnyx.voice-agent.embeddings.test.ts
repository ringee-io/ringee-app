import { HttpException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TelnyxVoiceAgentService } from "./telnyx.voice-agent.service";
import type { TelnyxClient } from "../../telephony/telnyx/telnyx.client";
import type { TelnyxKnowledgeStore } from "./telnyx.knowledge.store";

/**
 * Starting an embedding task is the one provider call that cannot be repeated
 * by the user: the document is already in the agent's bucket, so a refusal here
 * marks the source failed and the file has to be uploaded a second time.
 * `/ai/embeddings` answers valid requests with a generic `503 10007` often
 * enough that taking the first reply as final is what loses the upload — but a
 * rejected request must still fail immediately, or the user waits on retries
 * for an error that was never going to change.
 */

const UNEXPECTED_ERROR = {
  errors: [{ code: "10007", detail: "An unexpected error occurred." }],
};

function build() {
  const client = { post: vi.fn(), get: vi.fn(), delete: vi.fn(), put: vi.fn() };
  const service = new TelnyxVoiceAgentService(
    client as unknown as TelnyxClient,
    {} as TelnyxKnowledgeStore,
  );
  return { service, client };
}

/**
 * Drives the backoff without waiting on it in real time. The outcome is parked
 * in a thunk the moment the call is made — otherwise a rejection sits unhandled
 * while the fake clock is being wound forward.
 */
async function settle<T>(start: () => Promise<T>): Promise<T> {
  vi.useFakeTimers();
  try {
    const outcome = start().then(
      (value) => () => value,
      (error: unknown) => () => {
        throw error;
      },
    );
    await vi.runAllTimersAsync();
    return (await outcome)();
  } finally {
    vi.useRealTimers();
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe("TelnyxVoiceAgentService embeddings", () => {
  it("retries a 503 and keeps the document", async () => {
    const { service, client } = build();
    client.post
      .mockRejectedValueOnce(new HttpException(UNEXPECTED_ERROR, 503))
      .mockResolvedValueOnce({ data: { task_id: "task-1" } });

    const taskId = await settle(() =>
      service.indexKnowledgeStore("agent-bucket"),
    );

    expect(taskId).toBe("task-1");
    expect(client.post).toHaveBeenCalledTimes(2);
    expect(client.post).toHaveBeenLastCalledWith("/ai/embeddings", {
      bucket_name: "agent-bucket",
    });
  });

  it("gives up with the provider's own reason once retries run out", async () => {
    const { service, client } = build();
    client.post.mockRejectedValue(new HttpException(UNEXPECTED_ERROR, 503));

    await expect(
      settle(() => service.indexKnowledgeStore("agent-bucket")),
    ).rejects.toMatchObject({ response: UNEXPECTED_ERROR });
    expect(client.post).toHaveBeenCalledTimes(3);
  });

  it("does not retry a request the provider rejected", async () => {
    const { service, client } = build();
    client.post.mockRejectedValue(
      new HttpException({ errors: [{ detail: "url is invalid" }] }, 400),
    );

    await expect(
      settle(() =>
        service.indexKnowledgeUrl("agent-bucket", "https://example.com"),
      ),
    ).rejects.toBeInstanceOf(HttpException);
    expect(client.post).toHaveBeenCalledTimes(1);
  });
});
