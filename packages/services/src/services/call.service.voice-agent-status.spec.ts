/// <reference types="node" />

import "reflect-metadata";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CallStatus } from "@ringee/database";
import type { TelephonyEvent } from "@ringee/platform";
import { CallService } from "./call.service";

const BASE_EVENT: TelephonyEvent = {
  type: "call.status",
  provider: "telnyx",
  providerEventType: "completed",
  callControlId: "cc-1",
  callSessionId: "session-1",
  callLegId: "leg-1",
  clientState: null,
  direction: null,
  from: null,
  to: null,
  occurredAt: new Date("2026-09-07T14:00:00.000Z"),
  startedAt: null,
  customHeaders: [],
  conversation: null,
  callStatus: {
    callId: "call-1",
    status: "completed",
    answeredAt: null,
    endedAt: new Date("2026-09-07T14:00:00.000Z"),
    hangupCause: null,
  },
  payload: {},
};

function build(returnedStatus?: CallStatus) {
  const completions: CallStatus[] = [];
  const outbound: CallStatus[] = [];
  const call = {
    id: "call-1",
    callControlId: "cc-1",
    callSessionId: "session-1",
    status: CallStatus.answered,
  };

  const service = Object.assign(Object.create(CallService.prototype), {
    logger: { debug: () => undefined },
    callRepository: {
      findById: async () => call,
      attachTelephony: async () => call,
      completeCall: async (
        _callControlId: string,
        _startedAt: string | null,
        _endedAt: string,
        _hangupCause: string | undefined,
        terminalStatus: CallStatus,
      ) => {
        completions.push(terminalStatus);
        return { ...call, status: returnedStatus ?? terminalStatus };
      },
    },
    customIntegrationOutbound: {
      enqueueCallTerminal: async (terminalCall: { status: CallStatus }) => {
        outbound.push(terminalCall.status);
      },
    },
  }) as CallService;

  return { service, completions, outbound };
}

describe("CallService voice-agent terminal status", () => {
  it("persists and publishes a provider failure as call_failed", async () => {
    const { service, completions, outbound } = build();

    await service.handleTelephonyEvent({
      ...BASE_EVENT,
      providerEventType: "failed",
      callStatus: {
        ...BASE_EVENT.callStatus!,
        status: "failed",
        hangupCause: "normal_temporary_failure",
      },
    });

    assert.deepEqual(completions, [CallStatus.failed]);
    assert.deepEqual(outbound, [CallStatus.failed]);
  });

  it("preserves successful terminal behavior as call_completed", async () => {
    const { service, completions, outbound } = build();

    await service.handleTelephonyEvent(BASE_EVENT);

    assert.deepEqual(completions, [CallStatus.completed]);
    assert.deepEqual(outbound, [CallStatus.completed]);
  });

  it("publishes the persisted failed state when completion loses a race", async () => {
    const { service, completions, outbound } = build(CallStatus.failed);

    await service.handleTelephonyEvent(BASE_EVENT);

    assert.deepEqual(completions, [CallStatus.completed]);
    assert.deepEqual(outbound, [CallStatus.failed]);
  });
});
