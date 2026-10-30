import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HttpException, Logger } from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import { TranscriptionService } from "./transcription.service";

describe("realtime transcription credential confidentiality", () => {
  it("never logs or persists a media token echoed by a failed provider request", async (t) => {
    const previous = apiConfiguration.TRANSCRIPTION_MEDIA_STREAM_PUBLIC_URL;
    apiConfiguration.TRANSCRIPTION_MEDIA_STREAM_PUBLIC_URL =
      "wss://api.example.com/media-stream";
    const logged: unknown[] = [];
    const stored: unknown[] = [];
    let token = "";
    t.mock.method(Logger.prototype, "error", (...args: unknown[]) => {
      logged.push(args);
    });
    const service: TranscriptionService = Object.assign(
      Object.create(TranscriptionService.prototype),
      {
        logger: new Logger("TranscriptionSecurityTest"),
        deepgramService: { isConfigured: true },
        computeCreditsForDuration: () => 0,
        resolveDurationSeconds: () => 60,
        assertTranscriptionCredits: async () => undefined,
        transcriptionRepo: {
          findHeaderByCallAndSource: async () => null,
          upsertHeader: async () => ({ id: "transcription-1" }),
          markStatus: async (_id: string, _status: unknown, data: unknown) => {
            stored.push(data);
          },
        },
        telephonyService: {
          startStreaming: async (_id: string, url: string) => {
            token = new URL(url).searchParams.get("token")!;
            throw new HttpException(
              { errors: [{ code: "10015", detail: `Rejected URL: ${url}` }] },
              422,
            );
          },
        },
      },
    );
    try {
      await assert.rejects(
        service.startRealtimeForCall({
          id: "call-1",
          callControlId: "leg-1",
        } as never),
        /Failed to start live transcription/,
      );
      assert.ok(token.length > 20);
      const diagnostics = JSON.stringify({ logged, stored });
      assert.equal(diagnostics.includes(token), false);
      assert.equal(diagnostics.includes("wss://"), false);
      assert.ok(diagnostics.includes("10015"));
    } finally {
      apiConfiguration.TRANSCRIPTION_MEDIA_STREAM_PUBLIC_URL = previous;
    }
  });
});
