import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("node:http", () => ({ request }));
vi.mock("node:https", () => ({ request }));
import { requestPublic } from "./public-network";

function respond(statusCode: number, headers: Record<string, string> = {}) {
  const res = Object.assign(Readable.from([Buffer.from("hello")]), {
    statusCode,
    statusMessage: "",
    headers,
  });
  request.mockImplementation((_url, _options, callback) => {
    const req = Object.assign(new EventEmitter(), {
      write: vi.fn(),
      end: () => queueMicrotask(() => callback(res)),
    });
    return req;
  });
  return res;
}

afterEach(() => vi.clearAllMocks());

describe("public HTTP response handling", () => {
  for (const status of [204, 205, 304]) {
    it(`accepts ${status} with no body and closes the socket`, async () => {
      const socket = respond(status);
      const response = await requestPublic(new URL("https://example.com"), {
        timeoutMs: 1000,
      });
      expect(response.status).toBe(status);
      expect(response.body).toBeNull();
      expect(socket.destroyed).toBe(true);
    });
  }

  it("rejects malformed response headers through the promise", async () => {
    const socket = respond(200, { "bad\nheader": "value" });
    await expect(
      requestPublic(new URL("https://example.com"), { timeoutMs: 1000 }),
    ).rejects.toThrow();
    expect(socket.destroyed).toBe(true);
  });

  it("still streams ordinary responses", async () => {
    respond(200, { "content-type": "text/plain" });
    const response = await requestPublic(new URL("https://example.com"), {
      timeoutMs: 1000,
    });
    expect(await response.text()).toBe("hello");
  });
});
