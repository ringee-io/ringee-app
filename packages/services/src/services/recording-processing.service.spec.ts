/// <reference types="node" />

import "reflect-metadata";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RecordingProcessingService } from "./recording-processing.service";

describe("RecordingProcessingService custom integration delivery", () => {
  it("publishes recording.ready with the Recording row created for an agent call", async () => {
    const published: Array<{
      callId: string;
      recordingId: string;
      publicUrl: string;
    }> = [];
    let uploadCount = 0;

    const service = new RecordingProcessingService(
      { encryptBuffer: (buffer: Buffer) => buffer } as never,
      {
        downloadRecording: async () =>
          Uint8Array.from([1, 2, 3]).buffer as ArrayBuffer,
      } as never,
      {
        findByControlId: async () => ({
          id: "call-1",
          userId: "user-1",
          organizationId: "org-1",
          callControlId: "cc-1",
        }),
      } as never,
      {
        findRecordingsByCallId: async () => [],
        createRecording: async () => ({
          id: "recording-1",
          callId: "call-1",
          status: "completed",
          format: "mp3",
          url: "encrypted-url",
          durationSec: null,
          createdAt: new Date("2026-09-08T05:30:45.000Z"),
          updatedAt: new Date("2026-09-08T05:30:45.000Z"),
        }),
      } as never,
      {} as never,
      {
        findById: async () => ({ encryptionKey: "workspace-key" }),
      } as never,
      {
        findLatestByCallId: async () => null,
        create: async () => ({ id: "public-recording-1" }),
      } as never,
      { enqueueRecordingNote: async () => undefined } as never,
      {
        enqueueRecordingUpload: async (
          callId: string,
          recordingId: string,
          publicUrl: string,
        ) => {
          published.push({ callId, recordingId, publicUrl });
        },
      } as never,
      {} as never,
      { resolve: async () => ({ transcribeRecordings: false }) } as never,
    );

    (
      service as unknown as {
        uploadService: {
          uploadBuffer: () => Promise<string>;
        };
      }
    ).uploadService = {
      uploadBuffer: async () => {
        uploadCount += 1;
        return uploadCount === 1 ? "public-url" : "encrypted-url";
      },
    };

    await service.processCallRecording({
      callControlId: "cc-1",
      recording: {
        publicUrl: "provider-url",
        privateUrl: "provider-url",
        recordingStartedAt: "2026-09-08T05:29:45.000Z",
        recordingEndedAt: "2026-09-08T05:30:45.000Z",
      },
    });

    assert.deepEqual(published, [
      {
        callId: "call-1",
        recordingId: "recording-1",
        publicUrl: "public-url",
      },
    ]);
  });
});
