/// <reference types="node" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException } from "@nestjs/common";
import type { CustomIntegrationApiRequest } from "../guards/custom-integration-api-key.guard";
import { PublicAiVoiceAgentController } from "./public-api.controller";

const CTX = { userId: "user-1", organizationId: "org-1" };
const AGENT_ID = "11111111-1111-4111-8111-111111111111";
const NUMBER_ID = "22222222-2222-4222-8222-222222222222";

const request = {
  customIntegrationAuth: { integration: { id: "integration-1" }, ctx: CTX },
} as unknown as CustomIntegrationApiRequest;

/** An agent row as the database holds it, provider handles included. */
const agentRow = {
  id: AGENT_ID,
  name: "Sofia",
  type: "reminders_notifications",
  status: "active",
  voiceLabel: "Aria",
  callCount: 7,
  callerNumberId: NUMBER_ID,
  createdAt: new Date("2026-11-01T10:00:00Z"),
  updatedAt: new Date("2026-11-02T10:00:00Z"),
  providerAssistantId: "assistant-secret",
  providerTexmlAppId: "texml-secret",
  callbackTokenHash: "hash-secret",
};

function build(
  overrides: {
    startResult?: { id: string; status: string; replayed: boolean };
  } = {},
) {
  const started: Array<{
    ctx: unknown;
    agentId: string;
    input: unknown;
    client: { scope: string; idempotencyKey?: string };
  }> = [];
  const controller = new PublicAiVoiceAgentController(
    {
      getWithCallCount: async () => agentRow,
      listCallerNumbers: async () => [
        { id: NUMBER_ID, phoneNumber: "+13055550001" },
      ],
      listTypes: () => [
        {
          type: "reminders_notifications",
          variables: [{ key: "first_name", required: true }],
        },
        { type: "appointment_booking", variables: [] },
      ],
    } as never,
    {
      startCallForClient: async (
        ctx: unknown,
        agentId: string,
        input: unknown,
        client: { scope: string; idempotencyKey?: string },
      ) => {
        started.push({ ctx, agentId, input, client });
        return (
          overrides.startResult ?? {
            id: "agent-call-1",
            status: "initiating",
            replayed: false,
          }
        );
      },
    } as never,
    {} as never,
  );
  const response = {
    statusCode: undefined as number | undefined,
    headers: {} as Record<string, string>,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name] = value;
      return this;
    },
  };
  return { controller, started, response };
}

const dto = {
  to: "+13055559999",
  from_number_id: NUMBER_ID,
  variables: { first_name: "Ada" },
  metadata: { external_id: "crm-1" },
};

describe("public API: get agent", () => {
  it("returns the public projection with the agent's variables", async () => {
    const { controller } = build();

    const agent = await controller.getAgent(request, AGENT_ID);

    assert.deepEqual(agent, {
      id: AGENT_ID,
      name: "Sofia",
      type: "reminders_notifications",
      status: "active",
      voice: "Aria",
      callCount: 7,
      callerNumberId: NUMBER_ID,
      callsFrom: "+13055550001",
      createdAt: agentRow.createdAt,
      updatedAt: agentRow.updatedAt,
      variables: [{ key: "first_name", required: true }],
    });
  });

  it("never leaks provider handles or callback hashes", async () => {
    const { controller } = build();

    const serialized = JSON.stringify(
      await controller.getAgent(request, AGENT_ID),
    );

    for (const secret of ["assistant-secret", "texml-secret", "hash-secret"]) {
      assert.equal(serialized.includes(secret), false);
    }
  });
});

describe("public API: start call idempotency (HOOK-008)", () => {
  it("answers exactly as before when the client sends no key", async () => {
    const { controller, started, response } = build();

    const result = await controller.startCall(
      request,
      AGENT_ID,
      dto as never,
      undefined,
      response as never,
    );

    assert.deepEqual(result, { id: "agent-call-1", status: "initiating" });
    assert.equal(started[0]!.client.idempotencyKey, undefined);
    assert.equal(response.statusCode, undefined);
  });

  it("scopes the key to the authenticated integration, never to the request", async () => {
    const { controller, started, response } = build();

    const result = await controller.startCall(
      request,
      AGENT_ID,
      dto as never,
      "crm-lead-42",
      response as never,
    );

    assert.deepEqual(result, {
      id: "agent-call-1",
      status: "initiating",
      idempotent_replayed: false,
    });
    assert.deepEqual(started[0]!.client, {
      scope: "integration-1",
      idempotencyKey: "crm-lead-42",
    });
    assert.equal(started[0]!.ctx, CTX);
    assert.equal(response.statusCode, undefined);
    assert.deepEqual(response.headers, {});
  });

  it("marks a repeat as a replay: 200 and Idempotent-Replayed", async () => {
    const { controller, response } = build({
      startResult: { id: "agent-call-1", status: "ringing", replayed: true },
    });

    const result = await controller.startCall(
      request,
      AGENT_ID,
      dto as never,
      "crm-lead-42",
      response as never,
    );

    assert.deepEqual(result, {
      id: "agent-call-1",
      status: "ringing",
      idempotent_replayed: true,
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["Idempotent-Replayed"], "true");
  });

  it("passes the call's fields through by name", async () => {
    const { controller, started, response } = build();

    await controller.startCall(
      request,
      AGENT_ID,
      dto as never,
      undefined,
      response as never,
    );

    assert.deepEqual(started[0]!.input, {
      to: dto.to,
      fromNumberId: NUMBER_ID,
      variables: dto.variables,
      metadata: dto.metadata,
    });
    assert.equal(started[0]!.agentId, AGENT_ID);
  });

  it("treats a blank header as no key", async () => {
    const { controller, started, response } = build();

    const result = await controller.startCall(
      request,
      AGENT_ID,
      dto as never,
      "   ",
      response as never,
    );

    assert.deepEqual(result, { id: "agent-call-1", status: "initiating" });
    assert.equal(started[0]!.client.idempotencyKey, undefined);
  });

  it("refuses a malformed or repeated key before anything is started", async () => {
    for (const bad of [
      "has space",
      "emoji-🙂",
      "x".repeat(256),
      ["a", "b"] as string[],
    ]) {
      const { controller, started, response } = build();
      await assert.rejects(
        controller.startCall(
          request,
          AGENT_ID,
          dto as never,
          bad,
          response as never,
        ),
        BadRequestException,
      );
      assert.deepEqual(started, []);
    }
  });

  it("accepts the longest key and the usual separators", async () => {
    const { controller, started, response } = build();
    const key = `n8n:wf-1/exec-9~item_0=${"a".repeat(255 - 23)}`;
    assert.equal(key.length, 255);

    await controller.startCall(
      request,
      AGENT_ID,
      dto as never,
      key,
      response as never,
    );

    assert.equal(started[0]!.client.idempotencyKey, key);
  });
});
