/// <reference types="node" />

import "reflect-metadata";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CallStatus } from "@ringee/database";
import { CustomIntegrationOutboundService } from "./custom-integration-outbound.service";
import {
  buildCallDetailData,
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

/** No call the event's workspace can read. */
const NO_CALLS_STUB = { findEventDetailForOwner: async () => null } as never;

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
      NO_CALLS_STUB,
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
      NO_CALLS_STUB,
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
      NO_CALLS_STUB,
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
      NO_CALLS_STUB,
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
      NO_CALLS_STUB,
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
      NO_CALLS_STUB,
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
      NO_CALLS_STUB,
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
      NO_CALLS_STUB,
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
      NO_CALLS_STUB,
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
      NO_CALLS_STUB,
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
      NO_CALLS_STUB,
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
  it("still delivers when the agent-call lookup fails", async () => {
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
        findByCallId: async () => {
          throw new Error("database is down");
        },
      } as never,
      USERS_STUB,
      NO_AGENTS_STUB,
      NO_CALLS_STUB,
    );

    await service.enqueue({
      ctx: { userId: "user-1", organizationId: "org-1" },
      eventEnum: "recording_ready",
      subjectId: "recording-1",
      data: { callId: "call-1", recordingId: "recording-1" },
    });

    // The annotation is lost; the delivery — and its retries — are not.
    assert.equal(deliveries.length, 1);
    assert.equal("agent" in deliveries[0]!.payload.data, false);
    assert.equal("externalId" in deliveries[0]!.payload.data, false);
    assert.equal(deliveries[0]!.payload.data.user.id, "user-1");
  });

  it("still delivers when the agent name cannot be read", async () => {
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
          agentId: "agent-1",
          metadata: { external_id: "crm-contact-42" },
        }),
      } as never,
      USERS_STUB,
      {
        findRefForOwner: async () => {
          throw new Error("database is down");
        },
      } as never,
      NO_CALLS_STUB,
    );

    await service.enqueue({
      ctx: { userId: "user-1", organizationId: "org-1" },
      eventEnum: "recording_ready",
      subjectId: "recording-1",
      data: { callId: "call-1", recordingId: "recording-1" },
    });

    assert.equal(deliveries.length, 1);
    assert.equal("agent" in deliveries[0]!.payload.data, false);
    // Everything the failing lookup did not own still made it through.
    assert.equal(deliveries[0]!.payload.data.externalId, "crm-contact-42");
    assert.equal(deliveries[0]!.payload.data.user.id, "user-1");
  });
});

/** A finished AI voice-agent call with every artifact Ringee stores for one. */
const CALL_EVENT_DETAIL = {
  id: "call-1",
  userId: "user-1",
  organizationId: "org-1",
  fromNumber: "+14155550100",
  toNumber: "+14155550123",
  status: CallStatus.completed,
  direction: "outbound",
  source: "ai_voice_agent",
  startedAt: new Date("2026-05-23T14:39:56.000Z"),
  answeredAt: new Date("2026-05-23T14:40:02.000Z"),
  endedAt: new Date("2026-05-23T14:42:18.000Z"),
  durationSeconds: 142,
  totalCost: 0.42,
  callControlId: "v3:provider-control-id",
  outcome: "meeting_booked",
  outcomeNote: "Wants a demo for the whole team",
  createdAt: new Date("2026-05-23T14:39:50.000Z"),
  contact: {
    id: "contact-1",
    name: "Ada",
    fullName: "Ada Lovelace",
    phoneNumber: "+14155550123",
    email: "ada@example.com",
    company: "Babbage Engines",
    jobTitle: "Founder",
  },
  user: {
    id: "user-1",
    firstName: "Grace",
    lastName: "Hopper",
    imageUrl: null,
  },
  recordings: [
    {
      id: "recording-1",
      url: "https://storage.example/organizations/org-1/recordings/call-1/1.bin",
      format: "mp3",
      status: "completed",
      durationSec: 136,
      createdAt: new Date("2026-05-23T14:42:30.000Z"),
    },
  ],
  publicRecordings: [
    {
      url: "https://storage.example/organizations/org-1/recordings/call-1/public-1.mp3",
      createdAt: new Date("2026-05-23T14:42:29.000Z"),
    },
  ],
  callTranscriptions: [
    {
      source: "realtime",
      status: "completed",
      text: "realtime text",
      language: "en",
      confidence: 0.8,
      completedAt: new Date("2026-05-23T14:42:19.000Z"),
      segments: [],
    },
    {
      source: "recording",
      status: "completed",
      text: "Hi Ada. Hi!",
      language: "en",
      confidence: 0.97,
      completedAt: new Date("2026-05-23T14:43:10.000Z"),
      segments: [
        {
          text: "Hi Ada.",
          speaker: 0,
          track: "outbound",
          startMs: 0,
          endMs: 900,
        },
        {
          text: "Hi!",
          speaker: 1,
          track: "inbound",
          startMs: 1000,
          endMs: null,
        },
      ],
    },
  ],
  aiVoiceAgentCall: {
    id: "agent-call-1",
    status: "completed",
    outcome: "appointment_booked",
    summary: "Booked a demo for Tuesday.",
    sentiment: "positive",
    extractedData: { teamSize: 12 },
    variables: { first_name: "Ada" },
    metadata: { external_id: "crm-123" },
    aiCostUsd: 0.31,
    aiChargedCredits: 0.62,
    lastError: null,
    createdAt: new Date("2026-05-23T14:39:50.000Z"),
    agent: { id: "agent-1", name: "Sofia" },
    meeting: null,
  },
  meetings: [
    {
      id: "meeting-1",
      title: "Demo",
      scheduledAt: new Date("2026-05-26T16:00:00.000Z"),
      duration: 30,
      location: null,
      status: "scheduled",
      notes: "Bring pricing",
    },
  ],
  callbacks: [
    {
      id: "callback-1",
      scheduledAt: new Date("2026-05-27T10:00:00.000Z"),
      note: "Confirm attendees",
      status: "scheduled",
    },
  ],
  callAttempts: [
    {
      id: "attempt-1",
      attemptNumber: 2,
      status: "completed",
      dispositionCode: "demo",
      dispositionNote: "Second try got through",
      campaign: { id: "campaign-1", name: "Q2 founders", status: "running" },
      disposition: {
        id: "d-1",
        code: "demo",
        label: "Demo booked",
        color: null,
      },
    },
  ],
} as never;

describe("call detail event data", () => {
  it("carries the notes, transcript, recording and AI analysis of the call", () => {
    const data = buildCallDetailData(CALL_EVENT_DETAIL) as Record<string, any>;

    // Every key the outcome event already sent under data.call is unchanged.
    assert.equal(data.callId, "call-1");
    assert.equal(data.endedAt, "2026-05-23T14:42:18.000Z");
    assert.equal(data.durationSeconds, 142);

    assert.equal(data.outcome, "meeting_booked");
    assert.equal(data.outcomeNote, "Wants a demo for the whole team");
    assert.deepEqual(data.contact, {
      id: "contact-1",
      phoneNumber: "+14155550123",
      fullName: "Ada Lovelace",
      email: "ada@example.com",
    });
    assert.deepEqual(data.user, {
      id: "user-1",
      email: undefined,
      fullName: "Grace Hopper",
    });
    assert.deepEqual(data.voiceAgentCall, {
      id: "agent-call-1",
      agent: { id: "agent-1", name: "Sofia" },
      status: "completed",
      outcome: "meeting_booked",
      summary: "Booked a demo for Tuesday.",
      sentiment: "positive",
      extractedData: { teamSize: 12 },
      variables: { first_name: "Ada" },
      metadata: { external_id: "crm-123" },
    });
    assert.equal(data.meetings[0].notes, "Bring pricing");
    assert.equal(data.callbacks[0].note, "Confirm attendees");
    assert.deepEqual(data.campaignAttempts[0], {
      id: "attempt-1",
      attemptNumber: 2,
      status: "completed",
      campaign: { id: "campaign-1", name: "Q2 founders" },
      disposition: { code: "demo", label: "Demo booked" },
      dispositionNote: "Second try got through",
    });
  });

  it("prefers the finished post-call transcript, segments in order", () => {
    const data = buildCallDetailData(CALL_EVENT_DETAIL) as Record<string, any>;

    assert.equal(data.transcription.source, "recording");
    assert.equal(data.transcription.text, "Hi Ada. Hi!");
    assert.deepEqual(data.transcription.segments, [
      {
        text: "Hi Ada.",
        speaker: 0,
        track: "outbound",
        startMs: 0,
        endMs: 900,
      },
      {
        text: "Hi!",
        speaker: 1,
        track: "inbound",
        startMs: 1000,
        endMs: undefined,
      },
    ]);
  });

  it("sends the shareable recording, never the encrypted archive or the cost", () => {
    const data = buildCallDetailData(CALL_EVENT_DETAIL) as Record<string, any>;

    assert.deepEqual(data.recording, {
      recordingId: "recording-1",
      url: "https://storage.example/organizations/org-1/recordings/call-1/public-1.mp3",
      status: "completed",
      format: "mp3",
      durationSec: 136,
    });
    const serialized = JSON.stringify(data);
    assert.equal(serialized.includes(".bin"), false);
    assert.equal(serialized.includes("provider-control-id"), false);
    assert.equal("totalCost" in data, false);
    assert.equal("aiCostUsd" in data.voiceAgentCall, false);
  });
});

describe("CustomIntegrationOutboundService call detail", () => {
  const ONE_INTEGRATION = {
    findActiveSubscribed: async () => [
      {
        id: "integration-1",
        userId: "user-1",
        organizationId: "org-1",
        outboundUrl: "https://one.example/webhooks",
      },
    ],
  } as never;

  function serviceWith(calls: unknown, deliveries: Array<Record<string, any>>) {
    return new CustomIntegrationOutboundService(
      ONE_INTEGRATION,
      {
        enqueue: async (delivery: Record<string, unknown>) => {
          deliveries.push(delivery);
          return delivery;
        },
      } as never,
      { findByCallId: async () => null } as never,
      USERS_STUB,
      NO_AGENTS_STUB,
      calls as never,
    );
  }

  it("attaches the call detail to every call-linked event, read in the event's workspace", async () => {
    const deliveries: Array<Record<string, any>> = [];
    const lookups: Array<Record<string, unknown>> = [];
    const service = serviceWith(
      {
        findEventDetailForOwner: async (
          ctx: Record<string, unknown>,
          id: string,
        ) => {
          lookups.push({ ctx, id });
          return CALL_EVENT_DETAIL;
        },
      },
      deliveries,
    );

    await service.enqueue({
      ctx: { userId: "user-1", organizationId: "org-1" },
      eventEnum: "callback_created",
      subjectId: "callback-1",
      data: { callbackId: "callback-1", callId: "call-1" },
    });

    assert.deepEqual(lookups, [
      { ctx: { userId: "user-1", organizationId: "org-1" }, id: "call-1" },
    ]);
    const call = deliveries[0]!.payload.data.call;
    assert.equal(call.outcomeNote, "Wants a demo for the whole team");
    assert.equal(call.transcription.text, "Hi Ada. Hi!");
  });

  it("replaces a producer's call summary with the full detail", async () => {
    const deliveries: Array<Record<string, any>> = [];
    const service = serviceWith(
      { findEventDetailForOwner: async () => CALL_EVENT_DETAIL },
      deliveries,
    );

    await service.enqueue({
      ctx: { userId: "user-1", organizationId: "org-1" },
      eventEnum: "call_outcome_updated",
      subjectId: "call-1",
      data: {
        callId: "call-1",
        call: { callId: "call-1", status: CallStatus.completed },
        outcome: "meeting_booked",
      },
    });

    const call = deliveries[0]!.payload.data.call;
    assert.equal(call.status, CallStatus.completed);
    assert.equal(call.summary, undefined);
    assert.equal(call.voiceAgentCall.summary, "Booked a demo for Tuesday.");
  });

  it("keeps the producer's call summary when the detail cannot be read", async () => {
    const deliveries: Array<Record<string, any>> = [];
    const service = serviceWith(
      {
        findEventDetailForOwner: async () => {
          throw new Error("database is down");
        },
      },
      deliveries,
    );

    await service.enqueue({
      ctx: { userId: "user-1", organizationId: "org-1" },
      eventEnum: "call_outcome_updated",
      subjectId: "call-1",
      data: {
        callId: "call-1",
        call: { callId: "call-1", status: CallStatus.completed },
        outcome: "meeting_booked",
      },
    });

    assert.equal(deliveries.length, 1);
    assert.deepEqual(deliveries[0]!.payload.data.call, {
      callId: "call-1",
      status: CallStatus.completed,
    });
  });

  it("adds no call to an event that names none, and never looks one up", async () => {
    const deliveries: Array<Record<string, any>> = [];
    let callLookups = 0;
    const service = serviceWith(
      {
        findEventDetailForOwner: async () => {
          callLookups += 1;
          return CALL_EVENT_DETAIL;
        },
      },
      deliveries,
    );

    await service.enqueue({
      ctx: { userId: "user-1", organizationId: "org-1" },
      eventEnum: "dnc_created",
      subjectId: "+14155550123",
      data: { phoneNumber: "+14155550123" },
    });

    assert.equal("call" in deliveries[0]!.payload.data, false);
    assert.equal(callLookups, 0);
  });
});
