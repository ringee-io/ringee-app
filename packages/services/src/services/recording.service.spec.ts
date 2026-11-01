/// <reference types="node" />

import "reflect-metadata";

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { ResponseTooLargeError } from "@ringee/platform";
import { RecordingService } from "./recording.service";

const ctx = { userId: "user-1", organizationId: "org-1" };

function recording(overrides: Record<string, unknown>) {
  return {
    id: "rec",
    callId: "call-1",
    url: null,
    format: "mp3",
    status: "started",
    durationSec: null,
    transcript: null,
    createdAt: new Date("2026-11-01T12:00:00.000Z"),
    updatedAt: new Date("2026-11-01T12:00:00.000Z"),
    ...overrides,
  };
}

describe("RecordingService.getPlaybackAudio", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("answers null for a call outside the caller's reach, without reading storage or the key", async () => {
    const lookups: unknown[] = [];
    let touched = false;
    globalThis.fetch = (async () => {
      touched = true;
      return new Response("x");
    }) as typeof fetch;

    const service = new RecordingService(
      {
        findByCallId: async () => {
          touched = true;
          return [];
        },
      } as never,
      {
        findByIdForOwner: async (...args: unknown[]) => {
          lookups.push(args);
          return null;
        },
      } as never,
      {
        getWorkspaceKey: async () => {
          touched = true;
          return "key";
        },
      } as never,
      {} as never,
    );

    const audio = await service.getPlaybackAudio(ctx, "call-1", {
      filterUserId: "member-1",
    });

    assert.equal(audio, null);
    assert.equal(touched, false);
    // The member scoping reaches the owner-scoped lookup.
    assert.deepEqual(lookups, [[ctx, "call-1", { filterUserId: "member-1" }]]);
  });

  it("decrypts the first finished recording with the workspace key", async () => {
    const fetched: string[] = [];
    globalThis.fetch = (async (url: string) => {
      fetched.push(url);
      return new Response(new Uint8Array([9, 8, 7]));
    }) as unknown as typeof fetch;
    const decrypted: Array<{ data: number[]; key: string }> = [];

    const service = new RecordingService(
      {
        findByCallId: async () => [
          recording({
            id: "later",
            url: "https://storage.test/later.bin",
            status: "completed",
            createdAt: new Date("2026-11-01T12:05:00.000Z"),
          }),
          recording({ id: "open", status: "processing" }),
          recording({
            id: "first",
            url: "https://storage.test/first.bin",
            status: "completed",
            createdAt: new Date("2026-11-01T12:01:00.000Z"),
          }),
        ],
      } as never,
      { findByIdForOwner: async () => ({ id: "call-1" }) } as never,
      { getWorkspaceKey: async () => "workspace-key" } as never,
      {
        decryptBuffer: (data: Buffer, key: string) => {
          decrypted.push({ data: [...data], key });
          return Buffer.from("mp3");
        },
      } as never,
    );

    const audio = await service.getPlaybackAudio(ctx, "call-1");

    assert.equal(audio?.toString(), "mp3");
    assert.deepEqual(fetched, ["https://storage.test/first.bin"]);
    assert.deepEqual(decrypted, [{ data: [9, 8, 7], key: "workspace-key" }]);
  });

  it("answers null while no recording has its file yet", async () => {
    let fetchedAny = false;
    globalThis.fetch = (async () => {
      fetchedAny = true;
      return new Response("x");
    }) as typeof fetch;

    const service = new RecordingService(
      {
        findByCallId: async () => [recording({ status: "processing" })],
      } as never,
      { findByIdForOwner: async () => ({ id: "call-1" }) } as never,
      { getWorkspaceKey: async () => "workspace-key" } as never,
      {} as never,
    );

    assert.equal(await service.getPlaybackAudio(ctx, "call-1"), null);
    assert.equal(fetchedAny, false);
  });

  it("plays a stored file whatever its row's status, as the dashboard does", async () => {
    // Processing writes the file and `completed` together; a file on a row
    // with another status is still the call's recording.
    const fetched: string[] = [];
    globalThis.fetch = (async (url: string) => {
      fetched.push(url);
      return new Response(new Uint8Array([1]));
    }) as unknown as typeof fetch;

    const service = new RecordingService(
      {
        findByCallId: async () => [
          recording({ url: "https://storage.test/legacy.bin", status: null }),
        ],
      } as never,
      { findByIdForOwner: async () => ({ id: "call-1" }) } as never,
      { getWorkspaceKey: async () => "workspace-key" } as never,
      { decryptBuffer: () => Buffer.from("mp3") } as never,
    );

    assert.equal(
      (await service.getPlaybackAudio(ctx, "call-1"))?.toString(),
      "mp3",
    );
    assert.deepEqual(fetched, ["https://storage.test/legacy.bin"]);
  });

  it("refuses a file declared larger than the playback cap, unread", async () => {
    let decrypted = false;
    globalThis.fetch = (async () =>
      new Response("x", {
        headers: { "content-length": String(Number.MAX_SAFE_INTEGER) },
      })) as typeof fetch;

    const service = new RecordingService(
      {
        findByCallId: async () => [
          recording({ url: "https://storage.test/a.bin", status: "completed" }),
        ],
      } as never,
      { findByIdForOwner: async () => ({ id: "call-1" }) } as never,
      { getWorkspaceKey: async () => "workspace-key" } as never,
      {
        decryptBuffer: () => {
          decrypted = true;
          return Buffer.from("mp3");
        },
      } as never,
    );

    await assert.rejects(
      service.getPlaybackAudio(ctx, "call-1"),
      ResponseTooLargeError,
    );
    assert.equal(decrypted, false);
  });

  it("stops reading a file that streams past the playback cap", async () => {
    // No length up front: an endless body, 1 MB at a time.
    const chunk = new Uint8Array(1024 * 1024);
    let cancelled = false;
    globalThis.fetch = (async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          pull: (controller) => controller.enqueue(chunk),
          cancel: () => {
            cancelled = true;
          },
        }),
      )) as typeof fetch;

    const service = new RecordingService(
      {
        findByCallId: async () => [
          recording({ url: "https://storage.test/a.bin", status: "completed" }),
        ],
      } as never,
      { findByIdForOwner: async () => ({ id: "call-1" }) } as never,
      { getWorkspaceKey: async () => "workspace-key" } as never,
      {} as never,
    );

    await assert.rejects(
      service.getPlaybackAudio(ctx, "call-1"),
      ResponseTooLargeError,
    );
    assert.equal(cancelled, true);
  });

  it("fails rather than playing when storage does not return the file", async () => {
    globalThis.fetch = (async () =>
      new Response("gone", { status: 404 })) as typeof fetch;

    const service = new RecordingService(
      {
        findByCallId: async () => [
          recording({ url: "https://storage.test/a.bin", status: "completed" }),
        ],
      } as never,
      { findByIdForOwner: async () => ({ id: "call-1" }) } as never,
      { getWorkspaceKey: async () => "workspace-key" } as never,
      {} as never,
    );

    await assert.rejects(service.getPlaybackAudio(ctx, "call-1"), /HTTP 404/);
  });
});
