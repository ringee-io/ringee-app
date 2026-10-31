import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { gzipSync, deflateSync, brotliCompressSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";

const { request, lookup } = vi.hoisted(() => ({
  request: vi.fn(),
  lookup: vi.fn(),
}));
vi.mock("node:http", () => ({ request }));
vi.mock("node:https", () => ({ request }));
vi.mock("node:dns/promises", () => ({ lookup }));
import {
  publicLookup,
  requestPublic,
  ResponseTooLargeError,
} from "./public-network";

function respond(
  statusCode: number,
  headers: Record<string, string> = {},
  body: Buffer = Buffer.from("hello"),
) {
  const res = Object.assign(Readable.from([body]), {
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

describe("public HTTP network boundary", () => {
  for (const host of [
    "127.0.0.1",
    "2130706433",
    "0x7f000001",
    "localhost",
    "169.254.169.254",
    "10.0.0.1",
    "[::1]",
    "[::ffff:127.0.0.1]",
    "[64:ff9b::a9fe:a9fe]",
    "[fd00::1]",
  ]) {
    it(`refuses ${host} before opening a socket`, async () => {
      await expect(
        requestPublic(new URL(`http://${host}/`), { timeoutMs: 1000 }),
      ).rejects.toThrow(/public network/);
      expect(request).not.toHaveBeenCalled();
    });
  }

  it("uses the checked resolver on the actual socket and does not follow redirects", async () => {
    respond(302, { location: "http://169.254.169.254/" });
    const response = await requestPublic(new URL("https://public.example/"), {
      timeoutMs: 1000,
    });
    expect(request.mock.calls[0][1].lookup).toBe(publicLookup);
    expect(response.status).toBe(302);
    expect(request).toHaveBeenCalledTimes(1);
    await response.body?.cancel();
  });

  it("refuses mixed/private DNS answers and rechecks on a new connection", async () => {
    const resolve = () =>
      new Promise((accept, reject) => {
        publicLookup("rebind.example", { all: true }, (error, addresses) =>
          error ? reject(error) : accept(addresses),
        );
      });
    const publicEntry = { address: "93.184.216.34", family: 4 };
    lookup.mockResolvedValueOnce([publicEntry]);
    expect(await resolve()).toEqual([publicEntry]);
    for (const entries of [
      [{ address: "127.0.0.1", family: 4 }],
      [publicEntry, { address: "::ffff:7f00:1", family: 6 }],
      [],
    ]) {
      lookup.mockResolvedValueOnce(entries);
      await expect(resolve()).rejects.toThrow(/public network/);
    }
    lookup.mockRejectedValueOnce(new Error("DNS unavailable"));
    await expect(resolve()).rejects.toThrow("DNS unavailable");
  });
});

describe("decoded response budget", () => {
  for (const [encoding, compress] of [
    ["gzip", gzipSync],
    ["deflate", deflateSync],
    ["br", brotliCompressSync],
  ] as const) {
    it(`aborts a small ${encoding} body expanding past the default budget`, async () => {
      const compressed = compress(Buffer.alloc(2_000_000, "a"));
      expect(compressed.length).toBeLessThan(10_000);
      const socket = respond(200, { "content-encoding": encoding }, compressed);
      const response = await requestPublic(new URL("https://example.com"), {
        timeoutMs: 1000,
      });
      await expect(response.text()).rejects.toBeInstanceOf(
        ResponseTooLargeError,
      );
      expect(socket.destroyed).toBe(true);
    });
  }
  it("still reads compressed content inside the budget", async () => {
    respond(200, { "content-encoding": "gzip" }, gzipSync("hello"));
    const response = await requestPublic(new URL("https://example.com"), {
      timeoutMs: 1000,
      maxBodyBytes: 5,
    });
    expect(await response.text()).toBe("hello");
  });
});
