import { HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { TelnyxClient } from "./telnyx.client";
import { TelnyxService } from "./telnyx.service";

/**
 * `@ringee/configuration` validates the whole app environment on import and
 * calls `process.exit(1)` when anything is missing. Nothing under test reads
 * it, so it is replaced rather than satisfied with eighteen fake variables.
 */
vi.mock("@ringee/configuration", () => ({ apiConfiguration: {} }));

/** The module builds a real SDK client at import time; it is never called. */
vi.mock("telnyx", () => ({ default: class {} }));

/** What Telnyx answers a teardown command with once the leg is gone. */
const CALL_ENDED = {
  errors: [
    {
      code: "90018",
      title: "Call has already ended",
      detail: "This call is no longer active and can't receive commands.",
    },
  ],
};

function build(reason: unknown) {
  const post = vi.fn(() => Promise.reject(reason));
  const service = new TelnyxService({ post } as unknown as TelnyxClient);
  return { service, post };
}

describe("TelnyxService.stopStreaming", () => {
  /**
   * The shape that actually reaches the service: `TelnyxClient.handleError`
   * rethrows the provider's body as an `HttpException` under its own status.
   */
  it("treats a leg that already ended as the outcome it asked for", async () => {
    const { service, post } = build(new HttpException(CALL_ENDED, 422));

    await expect(service.stopStreaming("v3:cc-1")).resolves.toBeUndefined();
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("recognises it unwrapped too, in case the client stops mapping it", async () => {
    const { service } = build({ response: { status: 422, data: CALL_ENDED } });

    await expect(service.stopStreaming("v3:cc-1")).resolves.toBeUndefined();
  });

  it("still surfaces every other provider failure", async () => {
    const rejection = new HttpException({ errors: [{ code: "10015" }] }, 422);
    const { service } = build(rejection);

    await expect(service.stopStreaming("v3:cc-1")).rejects.toBe(rejection);
  });
});
