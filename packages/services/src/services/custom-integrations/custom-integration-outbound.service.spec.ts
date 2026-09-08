/// <reference types="node" />

import "reflect-metadata";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CallStatus } from "@ringee/database";
import { CustomIntegrationOutboundService } from "./custom-integration-outbound.service";

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
});
