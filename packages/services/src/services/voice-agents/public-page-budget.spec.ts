import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EventEmitter } from "node:events";
// Default imports: under esModuleInterop a namespace import is a copy whose
// members cannot be mocked, while the module itself is what the code calls.
import http from "node:http";
import dns from "node:dns/promises";
import { Readable } from "node:stream";
import { gzipSync } from "node:zlib";
import { ResponseTooLargeError } from "@ringee/platform";
import { CompanyProfileService } from "./company-profile.service";
import { fetchPublicPage, readPageText } from "./public-url";

describe("public page decompression budget", () => {
  it("cuts an expanding page off at 1 MB instead of decoding it whole", async (t) => {
    t.mock.method(dns, "lookup", async () => [
      { address: "93.184.216.34", family: 4 },
    ]);
    const compressed = gzipSync(Buffer.alloc(2_000_000, "a"));
    assert.ok(compressed.length < 10_000);
    const sockets: Readable[] = [];
    t.mock.method(
      http,
      "request",
      (
        _url: URL,
        _options: unknown,
        callback: (response: Readable) => void,
      ) => {
        const response = Object.assign(Readable.from([compressed]), {
          statusCode: 200,
          statusMessage: "OK",
          headers: { "content-encoding": "gzip" },
        });
        sockets.push(response);
        return Object.assign(new EventEmitter(), {
          end: () => queueMicrotask(() => callback(response)),
        });
      },
    );
    const url = new URL("http://public.example/");

    // Reading the whole body is refused past the budget…
    const whole = await fetchPublicPage(url, { timeoutMs: 1000 });
    assert.ok(whole);
    await assert.rejects(whole.text(), ResponseTooLargeError);

    // …while the page readers stop there and keep its beginning.
    const page = await fetchPublicPage(url, { timeoutMs: 1000 });
    assert.ok(page);
    const markup = await readPageText(page);
    assert.ok(markup.length > 0 && markup.length <= 1_000_000);

    const service = Object.assign(
      Object.create(CompanyProfileService.prototype),
      { logger: { warn: () => undefined } },
    );
    assert.equal((await service.fetchPageText(url))?.length, 12_000);
    assert.equal(sockets.length, 3);
    assert.ok(sockets.every((socket) => socket.destroyed));
  });
});
