/// <reference types="node" />
import "reflect-metadata";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { AddressInfo } from "node:net";
import {
  Module,
  UnauthorizedException,
  ValidationPipe,
  type INestApplication,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { RedisService } from "@ringee/platform";
import {
  CallService,
  ContactService,
  CustomIntegrationAuthService,
  CustomIntegrationOutboundService,
  RecordingService,
  VoiceAgentCallService,
  VoiceAgentResultService,
  VoiceAgentService,
} from "@ringee/services";
import { CustomIntegrationApiKeyGuard } from "../guards/custom-integration-api-key.guard";
import { PublicApiRateLimitGuard } from "../guards/public-api-rate-limit.guard";
import { validationExceptionFactory } from "../validation-error";
import { PublicCallsController } from "./public-calls.controller";
import { PublicCapabilitiesController } from "./public-capabilities.controller";
import { PublicContactsController } from "./public-contacts.controller";
import { PublicAiVoiceAgentController } from "./public-api.controller";

/**
 * The three public controllers mounted in a small Nest app over real HTTP, with
 * the same global prefix and validation pipe as production but stub services.
 * The unit specs call handlers directly; this proves the wiring they cannot:
 * route order, UUID and DTO validation, status codes, response headers and the
 * guard chain. It does not start AppModule (that would start the dial loop).
 */
const KEY = `cik_live_${"a".repeat(64)}`;
const AGENT = "11111111-1111-4111-8111-111111111111";
const CONTACT = "33333333-3333-4333-8333-333333333333";
const CALL = "44444444-4444-4444-8444-444444444444";
const CTX = { userId: "user-1", organizationId: "org-1" };

const state = {
  redisCount: 1,
  redisDown: false,
  replay: false,
  startStatus: "initiating" as string,
  cancelled: [] as string[],
  upsertCreated: true,
  recording: Buffer.from("ID3-recording") as Buffer | null,
  contactDeletedWith: undefined as string | undefined,
  contactPatches: [] as unknown[],
  started: [] as unknown[],
};

const contactRow = {
  id: CONTACT,
  userId: "user-1",
  organizationId: "org-1",
  name: "Ada Lovelace",
  firstName: "Ada",
  lastName: "Lovelace",
  phoneNumber: "+14155550100",
  email: "ada@example.com",
  company: null,
  jobTitle: null,
  locationRegion: null,
  websiteUrl: null,
  revenue: null,
  companySize: null,
  source: "api",
  lastCallAt: null,
  createdAt: new Date("2026-11-01T00:00:00Z"),
  updatedAt: new Date("2026-11-02T00:00:00Z"),
};

@Module({
  controllers: [
    PublicAiVoiceAgentController,
    PublicContactsController,
    PublicCallsController,
    PublicCapabilitiesController,
  ],
  providers: [
    CustomIntegrationApiKeyGuard,
    PublicApiRateLimitGuard,
    {
      provide: CustomIntegrationAuthService,
      useValue: {
        resolveApiKey: async (key?: string) => {
          if (key !== KEY) throw new UnauthorizedException("Invalid API key");
          return { integration: { id: "integration-1" }, ctx: CTX };
        },
      },
    },
    {
      provide: RedisService,
      useValue: {
        incrementWithExpiry: async () => {
          if (state.redisDown) throw new Error("redis down");
          return state.redisCount;
        },
      },
    },
    {
      provide: VoiceAgentService,
      useValue: {
        list: async () => ({ data: [], total: 0, page: 1, limit: 20 }),
        listCallerNumbers: async () => [
          {
            id: "n1",
            phoneNumber: "+13055550101",
            isoCountry: "US",
            kind: "purchased",
          },
        ],
        listTypes: () => [
          {
            type: "reminders_notifications",
            variables: [{ key: "first_name" }],
          },
        ],
        getWithCallCount: async () => ({
          id: AGENT,
          name: "Sofia",
          type: "reminders_notifications",
          status: "active",
          voiceLabel: "Aria",
          callCount: 2,
          callerNumberId: null,
          createdAt: new Date("2026-11-01T00:00:00Z"),
          updatedAt: new Date("2026-11-02T00:00:00Z"),
        }),
      },
    },
    {
      provide: VoiceAgentCallService,
      useValue: {
        startCallForClient: async (
          _ctx: unknown,
          _agent: string,
          input: unknown,
          client: unknown,
        ) => {
          state.started.push({ input, client });
          return {
            id: "agent-call-1",
            status: state.startStatus,
            replayed: state.replay,
            ...(state.startStatus === "queued"
              ? {
                  queue: {
                    queuedAt: new Date("2026-12-01T14:00:00.000Z"),
                    expiresAt: new Date("2026-12-01T16:00:00.000Z"),
                  },
                }
              : {}),
          };
        },
        cancelQueued: async (_ctx: unknown, id: string) => {
          state.cancelled.push(id);
          return { id, status: "cancelled" };
        },
        requireCall: async () => ({}),
        listCalls: async () => ({ data: [], total: 0, page: 1, limit: 20 }),
      },
    },
    { provide: VoiceAgentResultService, useValue: { toResult: () => ({}) } },
    {
      provide: ContactService,
      useValue: {
        listContacts: async () => ({
          data: [contactRow],
          meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
        }),
        getContactById: async () => contactRow,
        createContact: async () => contactRow,
        upsertContact: async () => ({
          contact: contactRow,
          created: state.upsertCreated,
        }),
        updateContact: async (_ctx: unknown, _id: string, dto: unknown) => {
          state.contactPatches.push(dto);
          return contactRow;
        },
        deleteConfirmed: async (
          _ctx: unknown,
          id: string,
          confirm?: string,
        ) => {
          state.contactDeletedWith = confirm;
          return { id };
        },
      },
    },
    {
      provide: CallService,
      useValue: {
        listByOwnerPaginated: async () => ({
          data: [],
          total: 0,
          page: 1,
          totalPages: 1,
        }),
      },
    },
    {
      provide: CustomIntegrationOutboundService,
      useValue: {
        resolveCallId: async () => CALL,
        getCallDetail: async () => ({
          callId: CALL,
          outcome: "meeting_booked",
        }),
      },
    },
    {
      provide: RecordingService,
      useValue: { getPlaybackAudio: async () => state.recording },
    },
  ],
})
class PublicApiTestModule {}

let app: INestApplication;
let base = "";

before(async () => {
  app = await NestFactory.create(PublicApiTestModule, { logger: false });
  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );
  await app.listen(0, "127.0.0.1");
  base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api`;
});
after(async () => {
  await app.close();
});

const call = (
  path: string,
  init: RequestInit & { key?: string | null } = {},
) => {
  const { key = KEY, ...rest } = init;
  return fetch(`${base}${path}`, {
    ...rest,
    headers: {
      ...(key ? { "X-Ringee-Api-Key": key } : {}),
      ...(rest.body ? { "Content-Type": "application/json" } : {}),
      ...(rest.headers as Record<string, string>),
    },
  });
};

describe("public API over HTTP: authentication and pacing", () => {
  it("refuses a missing or wrong key on every group, before any handler", async () => {
    for (const path of [
      "/v1/contacts",
      "/v1/calls",
      "/v1/capabilities",
      "/v1/ai-voice-agents",
    ]) {
      assert.equal((await call(path, { key: null })).status, 401, path);
      assert.equal(
        (await call(path, { key: "cik_live_nope" })).status,
        401,
        path,
      );
    }
  });

  it("accepts the same key as a Bearer token", async () => {
    const response = await call("/v1/contacts", {
      key: null,
      headers: { Authorization: `Bearer ${KEY}` },
    });
    assert.equal(response.status, 200);
  });

  it("paces contacts, calls and capabilities per integration, with Retry-After", async () => {
    state.redisCount = 601;
    try {
      for (const path of ["/v1/contacts", "/v1/calls", "/v1/capabilities"]) {
        const response = await call(path);
        assert.equal(response.status, 429, path);
        assert.equal(response.headers.get("retry-after"), "60");
      }
    } finally {
      state.redisCount = 1;
    }
  });

  it("keeps answering when the pacing store is down", async () => {
    state.redisDown = true;
    try {
      assert.equal((await call("/v1/contacts")).status, 200);
    } finally {
      state.redisDown = false;
    }
  });
});

describe("public API over HTTP: capabilities (HOOK-011)", () => {
  it("tells a client which guarantees this deployment gives", async () => {
    const response = await call("/v1/capabilities");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      apiVersion: 1,
      capabilities: {
        agentDetail: true,
        contacts: true,
        calls: true,
        idempotentCalls: true,
        queuedCalls: true,
      },
    });
  });
});

describe("public API over HTTP: calls that wait for capacity (CPS-006)", () => {
  const body = JSON.stringify({ to: "+14155550123" });

  it("answers 202 with the queue times, and never mistakes it for a started call", async () => {
    state.startStatus = "queued";
    try {
      const response = await call(`/v1/ai-voice-agents/${AGENT}/calls`, {
        method: "POST",
        body,
        headers: { "Idempotency-Key": "lead-9" },
      });
      assert.equal(response.status, 202);
      assert.deepEqual(await response.json(), {
        id: "agent-call-1",
        status: "queued",
        idempotent_replayed: false,
        queued_at: "2026-12-01T14:00:00.000Z",
        expires_at: "2026-12-01T16:00:00.000Z",
      });
    } finally {
      state.startStatus = "initiating";
    }
  });

  it("cancels a waiting call, only for a caller with a valid key", async () => {
    const path = "/v1/ai-voice-agents/calls";
    assert.equal(
      (await call(`${path}/${CALL}/cancel`, { method: "POST", key: null }))
        .status,
      401,
    );
    assert.equal(
      (await call(`${path}/not-a-uuid/cancel`, { method: "POST" })).status,
      400,
    );
    const response = await call(`${path}/${CALL}/cancel`, { method: "POST" });
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { id: CALL, status: "cancelled" });
    assert.deepEqual(state.cancelled, [CALL]);
  });

  it("does not let the cancel route swallow, or be swallowed by, the start route", async () => {
    // `calls/:id` reads; `:agentId/calls` starts; `calls/:id/cancel` cancels.
    assert.equal(
      (
        await call(`/v1/ai-voice-agents/${AGENT}/calls`, {
          method: "POST",
          body,
        })
      ).status,
      201,
    );
    assert.equal((await call(`/v1/ai-voice-agents/calls/${CALL}`)).status, 200);
  });
});

describe("public API over HTTP: AI voice agents", () => {
  it("serves caller numbers instead of reading them as an agent id", async () => {
    const response = await call("/v1/ai-voice-agents/phone-numbers");
    assert.equal(response.status, 200);
    assert.ok(Array.isArray(await response.json()));
  });

  it("returns an agent with its variables, and refuses a malformed id", async () => {
    const response = await call(`/v1/ai-voice-agents/${AGENT}`);
    assert.equal(response.status, 200);
    const agent = (await response.json()) as {
      name: string;
      variables: unknown[];
    };
    assert.equal(agent.name, "Sofia");
    assert.equal(agent.variables.length, 1);
    assert.equal((await call("/v1/ai-voice-agents/not-a-uuid")).status, 400);
  });

  it("starts a call as it always did, and idempotently when asked", async () => {
    const body = JSON.stringify({
      to: "+14155550123",
      variables: { first_name: "Ada" },
    });
    const plain = await call(`/v1/ai-voice-agents/${AGENT}/calls`, {
      method: "POST",
      body,
    });
    assert.equal(plain.status, 201);
    assert.deepEqual(await plain.json(), {
      id: "agent-call-1",
      status: "initiating",
    });

    const first = await call(`/v1/ai-voice-agents/${AGENT}/calls`, {
      method: "POST",
      body,
      headers: { "Idempotency-Key": "reminder-1" },
    });
    assert.equal(first.status, 201);
    assert.equal(
      ((await first.json()) as { idempotent_replayed: boolean })
        .idempotent_replayed,
      false,
    );

    state.replay = true;
    try {
      const again = await call(`/v1/ai-voice-agents/${AGENT}/calls`, {
        method: "POST",
        body,
        headers: { "Idempotency-Key": "reminder-1" },
      });
      assert.equal(again.status, 200);
      assert.equal(again.headers.get("idempotent-replayed"), "true");
      assert.equal(
        ((await again.json()) as { idempotent_replayed: boolean })
          .idempotent_replayed,
        true,
      );
    } finally {
      state.replay = false;
    }
    const sent = state.started.at(-1) as {
      client: { scope: string; idempotencyKey: string };
    };
    assert.deepEqual(sent.client, {
      scope: "integration-1",
      integrationId: "integration-1",
      idempotencyKey: "reminder-1",
    });
  });

  it("refuses a bad key, a missing number and a bad variables body", async () => {
    const start = (body: unknown, key?: string) =>
      call(`/v1/ai-voice-agents/${AGENT}/calls`, {
        method: "POST",
        body: JSON.stringify(body),
        headers: key ? { "Idempotency-Key": key } : {},
      });
    assert.equal(
      (await start({ to: "+14155550123" }, "has space")).status,
      400,
    );
    assert.equal((await start({}, undefined)).status, 400);
    assert.equal(
      (await start({ to: "+14155550123", variables: "nope" })).status,
      400,
    );
  });
});

describe("public API over HTTP: contacts", () => {
  it("lists with paging and refuses nonsense paging", async () => {
    const response = await call("/v1/contacts?query=ada&page=1&limit=20");
    assert.equal(response.status, 200);
    const page = (await response.json()) as {
      data: Array<Record<string, unknown>>;
      totalPages: number;
    };
    assert.equal(page.totalPages, 1);
    assert.equal(page.data[0]!.phoneNumber, "+14155550100");
    assert.equal("userId" in page.data[0]!, false);
    assert.equal((await call("/v1/contacts?limit=500")).status, 400);
  });

  it("validates a create and refuses an invalid email or a missing number", async () => {
    const create = (body: unknown) =>
      call("/v1/contacts", { method: "POST", body: JSON.stringify(body) });
    assert.equal(
      (await create({ phoneNumber: "+14155550100", email: "ada@example.com" }))
        .status,
      201,
    );
    assert.equal((await create({ email: "ada@example.com" })).status, 400);
    assert.equal(
      (await create({ phoneNumber: "+14155550100", email: "not-an-email" }))
        .status,
      400,
    );
  });

  it("answers an upsert 201 when it created and 200 when it found", async () => {
    const upsert = () =>
      call("/v1/contacts", {
        method: "PUT",
        body: JSON.stringify({ phoneNumber: "+14155550100" }),
      });
    state.upsertCreated = true;
    assert.equal((await upsert()).status, 201);
    state.upsertCreated = false;
    const found = await upsert();
    assert.equal(found.status, 200);
    assert.equal(((await found.json()) as { created: boolean }).created, false);
    state.upsertCreated = true;
  });

  it("patches without requiring the phone number, and validates what it is given", async () => {
    const patch = (body: unknown) =>
      call(`/v1/contacts/${CONTACT}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    assert.equal((await patch({ jobTitle: "Founder" })).status, 200);
    assert.equal((await patch({ email: "not-an-email" })).status, 400);
    assert.equal((await patch({ phoneNumber: "" })).status, 400);
    assert.equal(
      (await call("/v1/contacts/not-a-uuid", { method: "PATCH", body: "{}" }))
        .status,
      400,
    );
  });

  it("deletes only with the confirmation in the query", async () => {
    const response = await call(
      `/v1/contacts/${CONTACT}?confirm_phone_number=%2B14155550100`,
      {
        method: "DELETE",
      },
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { deleted: true, id: CONTACT });
    assert.equal(state.contactDeletedWith, "+14155550100");
  });
});

describe("public API over HTTP: calls", () => {
  it("lists with filters and refuses the ones it does not define", async () => {
    assert.equal(
      (
        await call(
          `/v1/calls?contact_id=${CONTACT}&outcome=meeting_booked&status=completed`,
        )
      ).status,
      200,
    );
    assert.equal((await call("/v1/calls?outcome=great")).status, 400);
    assert.equal((await call("/v1/calls?contact_id=nope")).status, 400);
    assert.equal((await call("/v1/calls?date_from=yesterday")).status, 400);
  });

  it("returns the call as events carry it, and refuses a malformed id", async () => {
    const response = await call(`/v1/calls/${CALL}`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      callId: CALL,
      outcome: "meeting_booked",
    });
    assert.equal((await call("/v1/calls/not-a-uuid")).status, 400);
  });

  it("streams the recording as a private mp3 download", async () => {
    const response = await call(`/v1/calls/${CALL}/recording`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "audio/mpeg");
    assert.match(
      response.headers.get("content-disposition") ?? "",
      /attachment; filename="recording-/,
    );
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(
      Buffer.from(await response.arrayBuffer()).toString(),
      "ID3-recording",
    );
  });

  it("answers a missing recording 404", async () => {
    state.recording = null;
    try {
      assert.equal((await call(`/v1/calls/${CALL}/recording`)).status, 404);
    } finally {
      state.recording = Buffer.from("ID3-recording");
    }
  });
});
