import { Logger } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TelnyxClient } from "./telnyx.client";
import { TelnyxService } from "./telnyx.service";

const http = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("@ringee/configuration", () => ({ apiConfiguration: {} }));
vi.mock("telnyx", () => ({ default: class {} }));
vi.mock("axios", () => ({ default: { create: () => http } }));
afterEach(() => vi.restoreAllMocks());

describe("media-stream failure diagnostics", () => {
  it("keeps the credential out of both adapter logs and the rethrown error, even if echoed", async () => {
    const token = "stream-secret-that-must-never-reach-logs";
    const url = `wss://api.example.com/media-stream?callId=call-1&token=${token}`;
    const warn = vi
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);
    const error = vi
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => undefined);
    http.post.mockRejectedValue({
      response: {
        status: 422,
        data: {
          stream_url: url,
          errors: [
            {
              code: "10015",
              title: token,
              detail: `Invalid stream_url ${url}`,
              source: { pointer: token },
            },
          ],
        },
      },
    });
    const service = new TelnyxService(new TelnyxClient());
    let response: unknown;
    try {
      await service.startStreaming("call-1", url);
    } catch (failure) {
      response = (failure as { getResponse(): unknown }).getResponse();
    }
    expect(response).toBeDefined();
    const diagnostics = JSON.stringify({
      warn: warn.mock.calls,
      error: error.mock.calls,
      response,
    });
    expect(diagnostics).not.toContain(token);
    expect(diagnostics).not.toContain("stream_url");
    expect(diagnostics).toContain("10015");
    expect(http.post.mock.calls[0][1].stream_url).toBe(url);
  });
});
