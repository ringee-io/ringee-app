/// <reference types="node" />

import "reflect-metadata";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CallStatus } from "@ringee/database";
import { CustomIntegrationOutboundService } from "./custom-integration-outbound.service";
import {
  buildCallOutcomeData,
  buildVoiceAgentCallOutcomeData,
} from "./custom-integration-event-builders";

describe("call outcome event data", () => {
  const call = {
    id: "call-1",
    userId: "user-1",
    organizationId: "org-1",
    fromNumber: "+14155550100",
    toNumber: "+14155550123",
    status: CallStatus.completed,
    direction: "outbound",
    startedAt: new Date("2026-05-23T14:39:56.000Z"),
    answeredAt: new Date("2026-05-23T14:40:02.000Z"),
    endedAt: new Date("2026-05-23T14:42:18.000Z"),
    durationSeconds: 142,
    outcome: "meeting_booked",
    outcomeNote: "Demo scheduled",
    updatedAt: new Date("2026-05-23T14:50:00.000Z"),
  } as never;

  const callDetail = {
    callId: "call-1",
    fromNumber: "+14155550100",
    toNumber: "+14155550123",
    status: CallStatus.completed,
    direction: "outbound",
    startedAt: "2026-05-23T14:39:56.000Z",
    answeredAt: "2026-05-23T14:40:02.000Z",
    endedAt: "2026-05-23T14:42:18.000Z",
    durationSeconds: 142,
  };

  it("carries the call detail beside the call id", () => {
    assert.deepEqual(buildCallOutcomeData(call), {
      callId: "call-1",
      call: callDetail,
      outcome: "meeting_booked",
      outcomeNote: "Demo scheduled",
      updatedAt: "2026-05-23T14:50:00.000Z",
    });
  });

  it("carries the same call detail for an AI voice-agent outcome", () => {
    const data = buildVoiceAgentCallOutcomeData(
      {
        id: "agent-call-1",
        agentId: "agent-1",
        callId: "call-1",
        outcome: "appointment_booked",
        metadata: { external_id: "crm-123" },
        updatedAt: new Date("2026-05-23T14:50:00.000Z"),
      } as never,
      call,
    );

    assert.deepEqual(data.call, callDetail);
    assert.equal(data.callId, "call-1");
    assert.equal(data.outcome, "meeting_booked");
  });

  it("omits the call detail when the telephony row cannot be resolved", () => {
    const data = buildVoiceAgentCallOutcomeData(
      {
        id: "agent-call-1",
        agentId: "agent-1",
        callId: "call-1",
        outcome: "not_interested",
        metadata: null,
        updatedAt: new Date("2026-05-23T14:50:00.000Z"),
      } as never,
      null,
    );

    assert.equal(data.call, undefined);
  });
});

/** The responsible user, with a non-primary address ahead of the primary. */
const USERS_STUB = {
  findById: async (id: string) => ({
    id,
    firstName: "Ada",
    lastName: "Lovelace",
    emails: [
      { email: "ada+old@example.com", isPrimary: false },
      { email: "ada@example.com", isPrimary: true },
    ],
  }),
} as never;

/** No AI voice agent behind the event. */
const NO_AGENTS_STUB = { findRefForOwner: async () => null } as never;

describe("CustomIntegrationOutboundService call fan-out", () => {
  it("queues a terminal call for every active subscribed integration", async () => {
    const lookups: Array<Record<string, unknown>> = [];
    const deliveries: Array<Record<string, any>> = [];
    const integrations = [
      {
        id: "integration-1",
        userId: "user-1",
        organizationId: "org-1",
        outboundUrl: "https://one.example/webhooks",
      },
      {
        id: "integration-2",
        userId: "user-2",
        organizationId: "org-1",
        outboundUrl: "https://two.example/webhooks",
      },
    ];

    const service = new CustomIntegrationOutboundService(
      {
        findActiveSubscribed: async (
          ctx: Record<string, unknown>,
          eventType: string,
        ) => {
          lookups.push({ ctx, eventType });
          return integrations;
        },
      } as never,
      {
        enqueue: async (delivery: Record<string, unknown>) => {
          deliveries.push(delivery);
          return delivery;
        },
      } as never,
      { findByCallId: async () => null } as never,
      USERS_STUB,
      NO_AGENTS_STUB,
    );

    await service.enqueueCallTerminal({
      id: "call-1",
      userId: "user-1",
      organizationId: "org-1",
      fromNumber: "+13055550100",
      toNumber: "+13055550123",
      direction: "outbound",
      status: CallStatus.completed,
      startedAt: new Date("2026-09-07T13:58:00.000Z"),
      answeredAt: new Date("2026-09-07T13:58:05.000Z"),
      endedAt: new Date("2026-09-07T14:00:00.000Z"),
      durationSeconds: 120,
    } as never);

    assert.deepEqual(lookups, [
      {
        ctx: { userId: "user-1", organizationId: "org-1" },
        eventType: "call_completed",
      },
    ]);
    assert.equal(deliveries.length, 2);
    assert.deepEqual(
      deliveries.map((delivery) => ({
        integrationId: delivery.integrationId,
        eventType: delivery.eventType,
        subjectId: delivery.subjectId,
        destinationUrl: delivery.destinationUrl,
        event: delivery.payload.event,
        occurredAt: delivery.payload.occurredAt,
        workspaceId: delivery.payload.workspaceId,
      })),
      [
        {
          integrationId: "integration-1",
          eventType: "call_completed",
          subjectId: "call-1",
          destinationUrl: "https://one.example/webhooks",
          event: "call.completed",
          occurredAt: "2026-09-07T14:00:00.000Z",
          workspaceId: "org-1",
        },
        {
          integrationId: "integration-2",
          eventType: "call_completed",
          subjectId: "call-1",
          destinationUrl: "https://two.example/webhooks",
          event: "call.completed",
          occurredAt: "2026-09-07T14:00:00.000Z",
          workspaceId: "org-1",
        },
      ],
    );
  });

  it("classifies a persisted provider failure as call.failed", async () => {
    const deliveries: Array<Record<string, any>> = [];
    const service = new CustomIntegrationOutboundService(
      {
        findActiveSubscribed: async () => [
          {
            id: "integration-1",
            userId: "user-1",
            organizationId: "org-1",
            outboundUrl: "https://one.example/webhooks",
          },
        ],
      } as never,
      {
        enqueue: async (delivery: Record<string, unknown>) => {
          deliveries.push(delivery);
          return delivery;
        },
      } as never,
      { findByCallId: async () => null } as never,
      USERS_STUB,
      NO_AGENTS_STUB,
    );

    await service.enqueueCallTerminal({
      id: "call-failed",
      userId: "user-1",
      organizationId: "org-1",
      fromNumber: "+13055550100",
      toNumber: "+13055550123",
      direction: "outbound",
      status: CallStatus.failed,
      endedAt: new Date("2026-09-07T14:00:00.000Z"),
    } as never);

    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0]!.eventType, "call_failed");
    assert.equal(deliveries[0]!.payload.event, "call.failed");
    assert.equal(deliveries[0]!.payload.data.status, CallStatus.failed);
  });

  it("keeps the subject id while deduplicating a specific event transition", async () => {
    const deliveries: Array<Record<string, any>> = [];
    const service = new CustomIntegrationOutboundService(
      {
        findActiveSubscribed: async () => [
          {
            id: "integration-1",
            userId: "user-1",
            organizationId: "org-1",
            outboundUrl: "https://one.example/webhooks",
          },
        ],
      } as never,
      {
        enqueue: async (delivery: Record<string, unknown>) => {
          deliveries.push(delivery);
          return delivery;
        },
      } as never,
      { findByCallId: async () => null } as never,
      USERS_STUB,
      NO_AGENTS_STUB,
    );

    await service.enqueue({
      ctx: { userId: "user-1", organizationId: "org-1" },
      eventEnum: "call_outcome_updated",
      subjectId: "call-1",
      dedupeKey: "call-1:outcome:not_interested:revision-2",
      data: { callId: "call-1", outcome: "not_interested" },
    });

    assert.equal(deliveries[0]!.subjectId, "call-1");
    assert.equal(
      deliveries[0]!.dedupeKey,
      "integration-1:call_outcome_updated:call-1:outcome:not_interested:revision-2:v1",
    );
  });

  it("adds the AI call external id to every call-linked event", async () => {
    const deliveries: Array<Record<string, any>> = [];
    const service = new CustomIntegrationOutboundService(
      {
        findActiveSubscribed: async () => [
          {
            id: "integration-1",
            userId: "user-1",
            organizationId: "org-1",
            outboundUrl: "https://one.example/webhooks",
          },
        ],
      } as never,
      {
        enqueue: async (delivery: Record<string, unknown>) => {
          deliveries.push(delivery);
          return delivery;
        },
      } as never,
      {
        findByCallId: async () => ({
          userId: "user-1",
          organizationId: "org-1",
          metadata: { external_id: "crm-contact-42" },
        }),
      } as never,
      USERS_STUB,
      NO_AGENTS_STUB,
    );

    await service.enqueue({
      ctx: { userId: "user-1", organizationId: "org-1" },
      eventEnum: "recording_ready",
      subjectId: "recording-1",
      data: { callId: "call-1", recordingId: "recording-1" },
    });

    assert.equal(deliveries[0]!.payload.data.externalId, "crm-contact-42");
  });

  it("never leaks the external id of another organization's call", async () => {
    const deliveries: Array<Record<string, any>> = [];
    const service = new CustomIntegrationOutboundService(
      {
        findActiveSubscribed: async () => [
          {
            id: "integration-1",
            userId: "user-1",
            organizationId: "org-1",
            outboundUrl: "https://one.example/webhooks",
          },
        ],
      } as never,
      {
        enqueue: async (delivery: Record<string, unknown>) => {
          deliveries.push(delivery);
          return delivery;
        },
      } as never,
      {
        findByCallId: async () => ({
          userId: "user-9",
          organizationId: "org-2",
          metadata: { external_id: "crm-contact-42" },
        }),
      } as never,
      USERS_STUB,
      NO_AGENTS_STUB,
    );

    await service.enqueue({
      ctx: { userId: "user-1", organizationId: "org-1" },
      eventEnum: "recording_ready",
      subjectId: "recording-1",
      data: { callId: "call-1", recordingId: "recording-1" },
    });

    assert.equal(deliveries.length, 1);
    assert.equal("externalId" in deliveries[0]!.payload.data, false);
  });

  it("never leaks the external id of another user's personal call", async () => {
    const deliveries: Array<Record<string, any>> = [];
    const service = new CustomIntegrationOutboundService(
      {
        findActiveSubscribed: async () => [
          {
            id: "integration-1",
            userId: "user-1",
            organizationId: null,
            outboundUrl: "https://one.example/webhooks",
          },
        ],
      } as never,
      {
        enqueue: async (delivery: Record<string, unknown>) => {
          deliveries.push(delivery);
          return delivery;
        },
      } as never,
      {
        findByCallId: async () => ({
          userId: "user-9",
          organizationId: null,
          metadata: { external_id: "crm-contact-42" },
        }),
      } as never,
      USERS_STUB,
      NO_AGENTS_STUB,
    );

    await service.enqueue({
      ctx: { userId: "user-1", organizationId: null },
      eventEnum: "recording_ready",
      subjectId: "recording-1",
      data: { callId: "call-1", recordingId: "recording-1" },
    });

    assert.equal(deliveries.length, 1);
    assert.equal("externalId" in deliveries[0]!.payload.data, false);
  });
  it("names the responsible user, with their primary email, on every event", async () => {
    const deliveries: Array<Record<string, any>> = [];
    const service = new CustomIntegrationOutboundService(
      {
        findActiveSubscribed: async () => [
          {
            id: "integration-1",
            userId: "user-1",
            organizationId: "org-1",
            outboundUrl: "https://one.example/webhooks",
          },
        ],
      } as never,
      {
        enqueue: async (delivery: Record<string, unknown>) => {
          deliveries.push(delivery);
          return delivery;
        },
      } as never,
      { findByCallId: async () => null } as never,
      USERS_STUB,
      NO_AGENTS_STUB,
    );

    // An event with no call at all still names who is behind it.
    await service.enqueue({
      ctx: { userId: "user-1", organizationId: "org-1" },
      eventEnum: "dnc_created",
      subjectId: "+14155550123",
      data: { phoneNumber: "+14155550123" },
    });

    assert.deepEqual(deliveries[0]!.payload.data.user, {
      id: "user-1",
      email: "ada@example.com",
      fullName: "Ada Lovelace",
    });
    assert.equal("agent" in deliveries[0]!.payload.data, false);
  });

  it("names the AI voice agent behind a call-linked event", async () => {
    const deliveries: Array<Record<string, any>> = [];
    const lookups: Array<Record<string, unknown>> = [];
    const service = new CustomIntegrationOutboundService(
      {
        findActiveSubscribed: async () => [
          {
            id: "integration-1",
            userId: "user-1",
            organizationId: "org-1",
            outboundUrl: "https://one.example/webhooks",
          },
        ],
      } as never,
      {
        enqueue: async (delivery: Record<string, unknown>) => {
          deliveries.push(delivery);
          return delivery;
        },
      } as never,
      {
        findByCallId: async () => ({
          userId: "user-1",
          organizationId: "org-1",
          agentId: "agent-1",
          metadata: null,
        }),
      } as never,
      USERS_STUB,
      {
        findRefForOwner: async (ctx: Record<string, unknown>, id: string) => {
          lookups.push({ ctx, id });
          return { id, name: "Sofia" };
        },
      } as never,
    );

    await service.enqueue({
      ctx: { userId: "user-1", organizationId: "org-1" },
      eventEnum: "meeting_created",
      subjectId: "meeting-1",
      data: { meetingId: "meeting-1", callId: "call-1" },
    });

    assert.deepEqual(deliveries[0]!.payload.data.agent, {
      id: "agent-1",
      name: "Sofia",
    });
    // The agent is read through the workspace-checked lookup, never by id alone.
    assert.deepEqual(lookups, [
      { ctx: { userId: "user-1", organizationId: "org-1" }, id: "agent-1" },
    ]);
  });

  it("never names an agent behind another workspace's call", async () => {
    const deliveries: Array<Record<string, any>> = [];
    let agentLookups = 0;
    const service = new CustomIntegrationOutboundService(
      {
        findActiveSubscribed: async () => [
          {
            id: "integration-1",
            userId: "user-1",
            organizationId: "org-1",
            outboundUrl: "https://one.example/webhooks",
          },
        ],
      } as never,
      {
        enqueue: async (delivery: Record<string, unknown>) => {
          deliveries.push(delivery);
          return delivery;
        },
      } as never,
      {
        findByCallId: async () => ({
          userId: "user-9",
          organizationId: "org-2",
          agentId: "agent-9",
          metadata: null,
        }),
      } as never,
      USERS_STUB,
      {
        findRefForOwner: async () => {
          agentLookups += 1;
          return { id: "agent-9", name: "Someone else's agent" };
        },
      } as never,
    );

    await service.enqueue({
      ctx: { userId: "user-1", organizationId: "org-1" },
      eventEnum: "recording_ready",
      subjectId: "recording-1",
      data: { callId: "call-1", recordingId: "recording-1" },
    });

    assert.equal("agent" in deliveries[0]!.payload.data, false);
    assert.equal(agentLookups, 0);
  });

  it("keeps the actor a producer already resolved", async () => {
    const deliveries: Array<Record<string, any>> = [];
    const service = new CustomIntegrationOutboundService(
      {
        findActiveSubscribed: async () => [
          {
            id: "integration-1",
            userId: "user-1",
            organizationId: "org-1",
            outboundUrl: "https://one.example/webhooks",
          },
        ],
      } as never,
      {
        enqueue: async (delivery: Record<string, unknown>) => {
          deliveries.push(delivery);
          return delivery;
        },
      } as never,
      { findByCallId: async () => null } as never,
      USERS_STUB,
      NO_AGENTS_STUB,
    );

    await service.enqueue({
      ctx: { userId: "user-1", organizationId: "org-1" },
      eventEnum: "note_created",
      subjectId: "note-1",
      data: { noteId: "note-1", user: { id: "user-7", fullName: "Grace" } },
    });

    assert.deepEqual(deliveries[0]!.payload.data.user, {
      id: "user-7",
      fullName: "Grace",
    });
  });

  it("still delivers when the responsible user cannot be read", async () => {
    const deliveries: Array<Record<string, any>> = [];
    const service = new CustomIntegrationOutboundService(
      {
        findActiveSubscribed: async () => [
          {
            id: "integration-1",
            userId: "user-1",
            organizationId: "org-1",
            outboundUrl: "https://one.example/webhooks",
          },
        ],
      } as never,
      {
        enqueue: async (delivery: Record<string, unknown>) => {
          deliveries.push(delivery);
          return delivery;
        },
      } as never,
      { findByCallId: async () => null } as never,
      {
        findById: async () => {
          throw new Error("database is down");
        },
      } as never,
      NO_AGENTS_STUB,
    );

    await service.enqueue({
      ctx: { userId: "user-1", organizationId: "org-1" },
      eventEnum: "dnc_created",
      subjectId: "+14155550123",
      data: { phoneNumber: "+14155550123" },
    });

    assert.equal(deliveries.length, 1);
    assert.equal("user" in deliveries[0]!.payload.data, false);
  });
});
