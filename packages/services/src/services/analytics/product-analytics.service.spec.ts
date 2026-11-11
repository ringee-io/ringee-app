/// <reference types="node" />

import "reflect-metadata";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  FollowUpActivationRepository,
  ProductAnalyticsRepository,
} from "@ringee/database";
import type {
  AnalyticsDeliveryResult,
  ProductAnalyticsProvider,
} from "@ringee/platform";
import {
  ProductAnalyticsService,
  analyticsEventUuid,
} from "./product-analytics.service";
import {
  captureJourneyException,
  registerJourneyExceptionSink,
} from "./journey-exceptions";

type Row = Record<string, any>;

const PERSONAL = {
  userId: "11111111-1111-4111-8111-111111111111",
  organizationId: null,
};
const ORG = {
  userId: "22222222-2222-4222-8222-222222222222",
  organizationId: "33333333-3333-4333-8333-333333333333",
};

function build(
  options: {
    enabled?: boolean;
    delivery?: AnalyticsDeliveryResult[];
    claimed?: Row[];
    earlierConnected?: boolean;
  } = {},
) {
  const recorded: Row[] = [];
  const marks: Row[] = [];
  const batches: Row[][] = [];
  const exceptions: Row[] = [];
  let claimCalls = 0;
  const deliveries = [...(options.delivery ?? [{ ok: true }])];
  const provider: ProductAnalyticsProvider = {
    enabled: options.enabled ?? true,
    errorTrackingEnabled: options.enabled ?? true,
    sendBatch: async (events) => {
      batches.push(events as unknown as Row[]);
      return deliveries.shift() ?? { ok: true };
    },
    captureException: (error, context) => {
      exceptions.push({ error, context });
    },
    shutdown: async () => undefined,
  };
  const repo = {
    recordMany: async (rows: Row[]) => {
      recorded.push(...rows);
      return rows.length;
    },
    claimDue: async () => {
      claimCalls += 1;
      return claimCalls === 1 ? (options.claimed ?? []) : [];
    },
    markSent: async (ids: string[]) => {
      marks.push({ kind: "sent", ids });
      return ids.length;
    },
    markAttemptFailed: async (ids: string[], _token: string, input: Row) => {
      marks.push({ kind: "failed", ids, ...input });
      return ids.length;
    },
    skipDue: async () => 7,
    pruneSettled: async () => 0,
    hadEarlierConnectedHumanCall: async () => options.earlierConnected ?? false,
  } as unknown as ProductAnalyticsRepository;
  const service = new ProductAnalyticsService(
    repo,
    {} as unknown as FollowUpActivationRepository,
    provider,
  );
  return { service, recorded, marks, batches, exceptions };
}

function call(overrides: Row = {}) {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    userId: PERSONAL.userId,
    organizationId: null,
    direction: "outbound",
    fromNumber: "+13055550190",
    toNumber: "+17865550193",
    answeredAt: new Date("2026-11-11T10:00:00Z"),
    durationSeconds: 95,
    outcome: null,
    outcomeRevision: 0,
    clientState: null,
    source: "web",
    ...overrides,
  } as never;
}

describe("ProductAnalyticsService — the stored fact", () => {
  it("keeps only allowlisted properties and adds the workspace group", () => {
    const { service } = build();
    const row = service.toRow({
      event: "followup_configuration_saved",
      key: "activation-1:r2",
      occurredAt: new Date("2026-11-11T10:00:00Z"),
      workspace: ORG,
      humanUserId: ORG.userId,
      properties: {
        entry_source: "meeting_booked",
        missing_requirements: ["get_number", "Valeria +1 786 555 0193"],
        contact_phone: "+17865550193",
        note: "call me at maria@example.com",
      },
    });
    const properties = row.properties as Row;
    assert.equal(row.distinctId, ORG.userId);
    assert.equal(properties.entry_source, "meeting_booked");
    assert.deepEqual(properties.missing_requirements, ["get_number"]);
    assert.equal(properties.contact_phone, undefined);
    assert.equal(properties.note, undefined);
    assert.equal(
      properties.workspace_key,
      `organization:${ORG.organizationId}`,
    );
    assert.equal(properties.workspace_type, "organization");
    assert.deepEqual(properties.$groups, {
      workspace: `organization:${ORG.organizationId}`,
    });
    assert.equal(properties.actor_type, "human");
    assert.equal(properties.occurred_at, "2026-11-11T10:00:00.000Z");
  });

  it("derives one stable UUID per evidence key, so a resend deduplicates", () => {
    const { service } = build();
    const fact = {
      event: "credit_topup_confirmed" as const,
      key: "topup-1",
      occurredAt: new Date(),
      workspace: PERSONAL,
    };
    const first = service.toRow(fact);
    const again = service.toRow({ ...fact, occurredAt: new Date(0) });
    assert.equal(first.id, again.id);
    assert.equal(first.eventKey, "credit_topup_confirmed:topup-1");
    assert.match(
      first.id!,
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    assert.notEqual(analyticsEventUuid("a:1"), analyticsEventUuid("a:2"));
  });

  it("never reports an AI or system fact as a human's", () => {
    const { service } = build();
    const ai = service.toRow({
      event: "followup_business_result_recorded",
      key: "action-1",
      occurredAt: new Date(),
      workspace: PERSONAL,
      humanUserId: PERSONAL.userId,
    });
    assert.equal(ai.distinctId, `ai:personal:${PERSONAL.userId}`);
    assert.equal((ai.properties as Row).actor_type, "ai");
    // A human fact without a known human is the system's.
    const orphan = service.toRow({
      event: "credit_checkout_started",
      key: "cs_1",
      occurredAt: new Date(),
      workspace: PERSONAL,
    });
    assert.equal(orphan.distinctId, `system:personal:${PERSONAL.userId}`);
    assert.equal((orphan.properties as Row).actor_type, "system");
  });

  it("keeps a personal workspace and an organization in disjoint keys", () => {
    const { service } = build();
    const own = service.identity({ userId: ORG.userId, organizationId: null });
    const team = service.identity(ORG);
    assert.equal(own.workspace.key, `personal:${ORG.userId}`);
    assert.equal(team.workspace.key, `organization:${ORG.organizationId}`);
    assert.equal(own.distinctId, team.distinctId);
  });
});

describe("ProductAnalyticsService — producers", () => {
  it("records a connected human call once, with whether it is the first", async () => {
    const { service, recorded } = build({ earlierConnected: false });
    await service.callEnded(call());
    assert.equal(recorded.length, 1);
    assert.equal(recorded[0]!.event, "human_call_connected");
    assert.equal(
      recorded[0]!.eventKey,
      `human_call_connected:${(call() as Row).id}`,
    );
    assert.equal(recorded[0]!.properties.is_first_for_workspace, true);
    assert.equal(recorded[0]!.properties.duration_bucket, "30s-2m");
  });

  it("skips AI legs, unanswered calls and voicemail outcomes", async () => {
    const { service, recorded } = build();
    await service.callEnded(call({ source: "ai_voice_agent" }));
    await service.callEnded(call({ answeredAt: null }));
    await service.callEnded(call({ outcome: "voicemail" }));
    assert.equal(recorded.length, 0);
  });

  it("keys an outcome by its revision, so saving it again is the same fact", async () => {
    const { service, recorded } = build();
    await service.outcomeRecorded(
      PERSONAL,
      call({ outcome: "interested", outcomeRevision: 3 }),
      "scheduled",
    );
    assert.equal(
      recorded[0]!.eventKey,
      `call_outcome_recorded:${(call() as Row).id}:r3`,
    );
    assert.equal(recorded[0]!.properties.follow_up_state, "scheduled");
    assert.equal(recorded[0]!.properties.conversation, true);
  });

  it("bounds a checkout's entry point", async () => {
    const { service, recorded } = build();
    await service.checkoutStarted(PERSONAL, {
      reference: "pi_123",
      amountUsd: 25,
      kind: "payment_intent",
      entryPoint: "https://evil.example/?phone=+17865550193",
    });
    assert.equal(recorded[0]!.properties.entry_point, "other");
    assert.equal(recorded[0]!.eventKey, "credit_checkout_started:pi_123");
  });

  it("stores and sends nothing while analytics is off", async () => {
    const { service, recorded } = build({ enabled: false });
    await service.callEnded(call());
    await service.firstListCompleted(PERSONAL, {
      contactCount: 1,
      rewardOffered: true,
      rewardGranted: 1,
    });
    assert.equal(recorded.length, 0);
  });
});

describe("ProductAnalyticsService — delivery", () => {
  const due = [
    {
      id: "55555555-5555-5555-8555-555555555555",
      event: "signup_completed",
      distinctId: PERSONAL.userId,
      occurredAt: new Date("2026-11-11T09:00:00Z"),
      properties: { schema_version: 1 },
      attemptCount: 1,
    },
  ];

  it("ships due facts with their stable id and original time", async () => {
    const { service, batches, marks } = build({ claimed: due });
    const result = await service.drain(new Date("2026-11-11T10:00:00Z"));
    assert.equal(result.sent, 1);
    assert.equal(batches[0]![0]!.uuid, due[0]!.id);
    assert.equal(
      (batches[0]![0]!.timestamp as Date).toISOString(),
      "2026-11-11T09:00:00.000Z",
    );
    assert.equal(marks[0]!.kind, "sent");
  });

  it("backs off on a retryable failure and never blocks the caller", async () => {
    const { service, marks } = build({
      claimed: due,
      delivery: [{ ok: false, retryable: true, code: "http_503" }],
    });
    const result = await service.drain(new Date("2026-11-11T10:00:00Z"));
    assert.equal(result.retried, 1);
    assert.equal(marks[0]!.kind, "failed");
    assert.equal(marks[0]!.giveUp, false);
    assert.equal(marks[0]!.errorCode, "http_503");
  });

  it("gives up on a payload the provider refuses as invalid", async () => {
    const { service, marks } = build({
      claimed: due,
      delivery: [{ ok: false, retryable: false, code: "http_400" }],
    });
    const result = await service.drain();
    assert.equal(result.failed, 1);
    assert.equal(marks[0]!.giveUp, true);
  });

  it("skips due facts instead of sending them when analytics is off", async () => {
    const { service, batches } = build({ enabled: false, claimed: due });
    const result = await service.drain();
    assert.equal(result.skipped, 7);
    assert.equal(batches.length, 0);
  });
});

describe("Journey exception capture", () => {
  it("is a no-op without a sink and never throws through a failing one", () => {
    registerJourneyExceptionSink(null);
    captureJourneyException(new Error("x"), {
      component: "Test",
      operation: "test.op",
      journeyStep: "test",
    });
    registerJourneyExceptionSink(() => {
      throw new Error("sink down");
    });
    assert.doesNotThrow(() =>
      captureJourneyException(new Error("x"), {
        component: "Test",
        operation: "test.op",
        journeyStep: "test",
      }),
    );
    registerJourneyExceptionSink(null);
  });

  it("hands the SDK a sanitized copy with bounded context", () => {
    const { service, exceptions } = build();
    service.captureException(
      new Error("Telnyx refused +17865550193 for maria@example.com"),
      {
        component: "NumberPurchasedService",
        operation: "numbers.lookup",
        journeyStep: "number_lookup",
        workspace: PERSONAL,
        correlation: {
          meeting: "66666666-6666-4666-8666-666666666666",
          "bad key": "x",
        },
      },
    );
    const captured = exceptions[0]!;
    assert.doesNotMatch(
      captured.error.message,
      /7865550193|maria@example\.com/,
    );
    assert.equal(captured.context.properties.operation, "numbers.lookup");
    assert.equal(
      captured.context.properties.correlation_meeting,
      "66666666-6666-4666-8666-666666666666",
    );
    assert.equal(captured.context.properties["correlation_bad key"], undefined);
    assert.deepEqual(captured.context.groups, {
      workspace: `personal:${PERSONAL.userId}`,
    });
  });
});
