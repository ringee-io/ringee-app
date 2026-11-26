/// <reference types="node" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { StreamableFile } from "@nestjs/common";
import type { CustomIntegrationApiRequest } from "../guards/custom-integration-api-key.guard";
import { PublicCallsController } from "./public-calls.controller";

const CTX = { userId: "user-1", organizationId: "org-1" };
const CALL_ID = "44444444-4444-4444-8444-444444444444";
const CONTACT_ID = "55555555-5555-4555-8555-555555555555";

const request = {
  customIntegrationAuth: { integration: { id: "integration-1" }, ctx: CTX },
} as unknown as CustomIntegrationApiRequest;

const callRow = {
  id: CALL_ID,
  direction: "outbound",
  status: "completed",
  source: "ai_voice_agent",
  fromNumber: "+13055550001",
  toNumber: "+14155550100",
  contactId: CONTACT_ID,
  startedAt: new Date("2026-11-20T10:00:00Z"),
  answeredAt: new Date("2026-11-20T10:00:05Z"),
  endedAt: new Date("2026-11-20T10:02:00Z"),
  createdAt: new Date("2026-11-20T10:00:00Z"),
  durationSeconds: 120,
  outcome: "meeting_booked",
  outcomeNote: "Booked for Tuesday",
  dispositionName: null,
  // Columns that must never reach an integration.
  totalCost: 0.42,
  costMeta: { provider: "secret" },
  callControlId: "v3:secret",
};

function build(
  options: {
    detail?: Record<string, unknown> | null;
    audio?: Buffer | null;
    /** The telephony call the id resolves to; `null` for an id that is nobody's. */
    resolved?: string | null;
  } = {},
) {
  const seen: Array<{ method: string; args: unknown[] }> = [];
  const controller = new PublicCallsController(
    {
      listByOwnerPaginated: async (...args: unknown[]) => {
        seen.push({ method: "list", args });
        return { data: [callRow], total: 1, page: 1, totalPages: 1 };
      },
    } as never,
    {
      resolveCallId: async (...args: unknown[]) => {
        seen.push({ method: "resolve", args });
        return options.resolved === undefined ? CALL_ID : options.resolved;
      },
      getCallDetail: async (...args: unknown[]) => {
        seen.push({ method: "detail", args });
        return options.detail === undefined
          ? { callId: CALL_ID, outcome: "meeting_booked" }
          : options.detail;
      },
    } as never,
    {
      getPlaybackAudio: async (...args: unknown[]) => {
        seen.push({ method: "audio", args });
        return options.audio === undefined ? Buffer.from("mp3") : options.audio;
      },
    } as never,
  );
  const headers: Record<string, string> = {};
  const response = {
    setHeader: (name: string, value: string) => {
      headers[name] = value;
    },
  };
  return { controller, seen, headers, response };
}

describe("public API: calls (HOOK-010)", () => {
  it("lists the workspace's calls as summaries, without cost or provider ids", async () => {
    const { controller, seen } = build();

    const page = await controller.list(request);

    assert.equal(page.total, 1);
    assert.equal(page.data[0]!.outcome, "meeting_booked");
    assert.equal(page.data[0]!.contactId, CONTACT_ID);
    const serialized = JSON.stringify(page);
    for (const hidden of ["totalCost", "costMeta", "callControlId", "secret"]) {
      assert.equal(serialized.includes(hidden), false, hidden);
    }
    assert.equal(seen[0]!.args[0], CTX);
  });

  it("translates filters into the repository's terms", async () => {
    const { controller, seen } = build();

    await controller.list(
      request,
      "2",
      "50",
      CONTACT_ID,
      "meeting_booked",
      "completed",
      "2026-11-01T00:00:00Z",
      "2026-11-30T23:59:59Z",
    );

    assert.deepEqual(seen[0]!.args[1], {
      page: 2,
      limit: 50,
      contactId: CONTACT_ID,
      outcome: ["meeting_booked"],
      status: ["completed"],
      dateFrom: "2026-11-01T00:00:00.000Z",
      dateTo: "2026-11-30T23:59:59.000Z",
      includeTranscriptions: false,
    });
  });

  it("refuses filters the API does not define", async () => {
    const { controller } = build();

    const attempts = [
      () => controller.list(request, undefined, undefined, "not-a-uuid"),
      () =>
        controller.list(request, undefined, undefined, undefined, "great_call"),
      () =>
        controller.list(
          request,
          undefined,
          undefined,
          undefined,
          undefined,
          "teleported",
        ),
      () =>
        controller.list(
          request,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          "yesterday",
        ),
      () => controller.list(request, undefined, "101"),
    ];
    for (const attempt of attempts) {
      await assert.rejects(attempt(), BadRequestException);
    }
  });

  it("returns the call as the events carry it", async () => {
    const { controller, seen } = build();

    const call = await controller.get(request, CALL_ID);

    assert.deepEqual(call, { callId: CALL_ID, outcome: "meeting_booked" });
    assert.deepEqual(seen[0]!.args, [CTX, CALL_ID]);
  });

  it("answers another workspace's call, or none at all, with 404", async () => {
    const { controller } = build({ detail: null });

    await assert.rejects(controller.get(request, CALL_ID), NotFoundException);
  });

  it("sends the decrypted recording as a private mp3 download", async () => {
    const { controller, headers, response, seen } = build();

    const file = await controller.recording(
      request,
      CALL_ID,
      response as never,
    );

    assert.ok(file instanceof StreamableFile);
    assert.equal(headers["Content-Type"], "audio/mpeg");
    assert.match(
      headers["Content-Disposition"]!,
      /attachment; filename="recording-/,
    );
    assert.deepEqual(
      seen.map((entry) => entry.method),
      ["resolve", "audio"],
    );
    assert.deepEqual(seen[1]!.args, [CTX, CALL_ID]);
  });

  it("plays the recording of the call an AI call id leads to", async () => {
    const telephonyCall = "66666666-6666-4666-8666-666666666666";
    const { controller, response, seen } = build({ resolved: telephonyCall });

    await controller.recording(request, CALL_ID, response as never);

    assert.deepEqual(seen[1]!.args, [CTX, telephonyCall]);
  });

  it("never touches storage for an id that belongs to nobody in the workspace", async () => {
    const { controller, response, seen } = build({ resolved: null });

    await assert.rejects(
      controller.recording(request, CALL_ID, response as never),
      NotFoundException,
    );
    assert.deepEqual(
      seen.map((entry) => entry.method),
      ["resolve"],
    );
  });

  it("answers a missing recording the same as a call that is not yours", async () => {
    const { controller, response } = build({ audio: null });

    await assert.rejects(
      controller.recording(request, CALL_ID, response as never),
      NotFoundException,
    );
  });
});
