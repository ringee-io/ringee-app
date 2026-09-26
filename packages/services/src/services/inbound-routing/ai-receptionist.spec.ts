import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { hashApiKey } from "@ringee/platform";
import { VoiceAgentToolService } from "../voice-agents/voice-agent-tool.service";
import { VoiceAgentCallService } from "../voice-agents/voice-agent-call.service";
import { AiReceptionistDestinationHandler } from "./destinations/ai-receptionist.destination";
import {
  buildReceptionistTools,
  RECEPTIONIST_INSTRUCTIONS,
} from "../voice-agents/blueprints/receptionist.tools";

const AGENT = "00000000-0000-4000-8000-000000000001";
const GROUP = "00000000-0000-4000-8000-000000000002";
const PERSON = "00000000-0000-4000-8000-000000000003";
const ctx = { userId: PERSON, organizationId: "organization-a" };
function setup() {
  const call = {
    id: "logical-call",
    callControlId: "original-leg",
    organizationId: ctx.organizationId,
    userId: PERSON,
    direction: "inbound",
    fromNumber: "+12125550199",
    toNumber: "+13055550101",
    endedAt: null,
    inboundDestinationType: "ai_receptionist",
    inboundDestinationId: AGENT,
    inboundTransferState: null as string | null,
    inboundTransferDestinationType: null as string | null,
    inboundTransferDestinationId: null as string | null,
  };
  const agent = {
    id: AGENT,
    userId: PERSON,
    organizationId: ctx.organizationId,
    toolSecretHash: hashApiKey("test-secret"),
    deletedAt: null,
  };
  const state = {
    exists: true,
    available: true,
    scope: ctx.organizationId,
    destinations: [
      { destinationType: "ring_group", destinationId: GROUP, label: "Sales" },
    ],
  };
  const seen: Record<string, boolean> = {};
  const stops: string[] = [];
  const routes: unknown[] = [];
  const log: string[] = [];
  const routing = { result: { status: "ringing", targets: 1 } as object };
  const service = Object.assign(
    Object.create(VoiceAgentToolService.prototype),
    {
      agents: { findByIdForToolCallback: async () => agent },
      agentCalls: {
        findByCallControlId: async (id: string) =>
          id === call.callControlId
            ? { agentId: AGENT, callId: call.id }
            : null,
      },
      calls: {
        findById: async () => ({ ...call, organizationId: state.scope }),
        beginInboundTransfer: async (
          _ctx: unknown,
          id: string,
          destination: { type: string; id: string },
        ) => {
          assert.equal(id, call.id);
          if (!call.inboundTransferState)
            Object.assign(call, {
              inboundTransferState: "preparing",
              inboundTransferDestinationType: destination.type,
              inboundTransferDestinationId: destination.id,
            });
          return { ...call };
        },
        markTransferRinging: async () => {
          const transitioned = call.inboundTransferState === "preparing";
          if (transitioned) call.inboundTransferState = "ringing";
          return { call: { ...call }, transitioned };
        },
        resetInboundTransfer: async () => {
          log.push("reset");
          Object.assign(call, {
            inboundTransferState: null,
            inboundTransferDestinationType: null,
            inboundTransferDestinationId: null,
          });
          return true;
        },
      },
      directory: {
        searchDirectory: async (owner: unknown) => {
          assert.deepEqual(owner, ctx);
          return { destinations: state.destinations, hasMore: false };
        },
        resolveDestination: async (owner: unknown) => {
          assert.deepEqual(owner, ctx);
          return state.exists
            ? {
                type: "ring_group",
                ringGroupId: GROUP,
                name: "Sales",
                memberUserIds: [PERSON],
                ringSeconds: 30,
              }
            : { reason: "destination_deleted" };
        },
      },
      ring: {
        controlledTargets: async () => (state.available ? [{}] : []),
        cancelRinging: async () => {
          log.push("cancel");
          return 0;
        },
      },
      provider: {
        stopInboundAssistant: async (id: string) => {
          log.push("stop");
          stops.push(id);
        },
      },
      router: {
        routeInboundCall: async (request: unknown) => {
          log.push("route");
          routes.push(request);
          if (routing.result instanceof Error) throw routing.result;
          return routing.result;
        },
      },
      redis: {
        hashSet: async (_key: string, field: string) => {
          seen[field] = true;
        },
        hashGetAll: async () => seen,
      },
      logger: { warn: () => {} },
    },
  ) as VoiceAgentToolService;
  const search = () =>
    service.searchDirectory(AGENT, "test-secret", call.callControlId, {
      query: "Sales",
    });
  const transfer = (id = GROUP) =>
    service.transferToDestination(AGENT, "test-secret", call.callControlId, {
      destination_type: "ring_group",
      destination_id: id,
    });
  return {
    service,
    call,
    state,
    stops,
    routes,
    log,
    routing,
    search,
    transfer,
  };
}

describe("AI receptionist live directory and handoff", () => {
  it("does not transfer merely because the caller asked a question", async () => {
    const s = setup();
    await s.search();
    assert.deepEqual(s.stops, []);
    assert.deepEqual(s.routes, []);
    assert.match(
      RECEPTIONIST_INSTRUCTIONS,
      /successful conversation does not require a transfer/,
    );
  });
  it("requires a call bound to this agent and workspace, not just a valid tool secret", async () => {
    const s = setup();
    await assert.rejects(
      s.service.searchDirectory(AGENT, "wrong", s.call.callControlId, {}),
      UnauthorizedException,
    );
    await assert.rejects(
      s.service.searchDirectory(AGENT, "test-secret", "invented-call", {}),
      UnauthorizedException,
    );
    s.state.scope = "another-organization";
    await assert.rejects(s.search(), UnauthorizedException);
    assert.deepEqual(s.routes, []);
  });
  it("rejects invented identifiers and arbitrary SIP targets before any provider command", async () => {
    const s = setup();
    assert.equal((await s.transfer()).ok, false);
    await s.search();
    assert.equal((await s.transfer(PERSON)).ok, false);
    assert.equal((await s.transfer("sip:someone@example.com")).ok, false);
    assert.deepEqual(s.stops, []);
  });
  it("revalidates deleted destinations and availability while AI can still help", async () => {
    const s = setup();
    await s.search();
    s.state.exists = false;
    assert.equal((await s.transfer()).ok, false);
    s.state.exists = true;
    s.state.available = false;
    assert.equal((await s.transfer()).ok, false);
    assert.deepEqual(s.stops, []);
    assert.equal(s.call.inboundTransferState, null);
  });
  it("returns no match rather than inventing a department", async () => {
    const s = setup();
    s.state.destinations = [];
    assert.deepEqual((await s.search()).destinations, []);
    assert.equal((await s.transfer()).ok, false);
  });
  it("reuses the original call, caller and called number when routing to a group", async () => {
    const s = setup();
    await s.search();
    assert.equal((await s.transfer()).ok, true);
    const request = s.routes[0] as {
      call: typeof s.call;
      origin: { transport: string };
      destination: { ringGroupId: string };
    };
    assert.equal(request.call.id, s.call.id);
    assert.equal(request.call.fromNumber, s.call.fromNumber);
    assert.equal(request.call.toNumber, s.call.toNumber);
    assert.equal(request.destination.ringGroupId, GROUP);
    assert.equal(request.origin.transport, "call_control");
    assert.deepEqual(s.stops, [s.call.callControlId]);
  });
  it("stops the assistant only once the destination is ringing", async () => {
    const s = setup();
    await s.search();
    assert.equal((await s.transfer()).ok, true);
    assert.deepEqual(s.log, ["route", "stop"]);
  });
  for (const outcome of ["refused", "lost"] as const)
    it(`hands the caller back to the assistant when nothing rings (${outcome})`, async () => {
      const s = setup();
      await s.search();
      s.routing.result =
        outcome === "refused"
          ? {
              status: "failed",
              reason: "user_unavailable",
              detail: "No registered endpoint is available",
            }
          : new Error("socket hang up");
      const result = await s.transfer();
      assert.equal(result.ok, false);
      assert.match(String(result.error), /Ask the caller/);
      assert.deepEqual(s.stops, []);
      assert.deepEqual(s.log, ["route", "cancel", "reset"]);
      assert.equal(s.call.inboundTransferState, null);
      // The assistant can still try somewhere else.
      s.routing.result = { status: "ringing", targets: 1 };
      assert.equal((await s.transfer()).ok, true);
      assert.deepEqual(s.stops, [s.call.callControlId]);
    });
  it("rings the destination once when the assistant repeats the transfer", async () => {
    const s = setup();
    await s.search();
    const results = await Promise.all([s.transfer(), s.transfer()]);
    assert.ok(results.every((result) => result.ok));
    assert.equal(s.routes.length, 1);
    assert.deepEqual(await s.transfer(), {
      ok: true,
      transferred: false,
      ringing: true,
    });
    assert.equal(s.routes.length, 1);
    assert.ok(!s.log.includes("cancel"));
  });
  it("does not re-route a completed transfer on a duplicate callback", async () => {
    const s = setup();
    await s.search();
    await s.transfer();
    s.call.inboundTransferState = "connected";
    s.state.available = false;
    s.state.exists = false;
    assert.deepEqual(await s.transfer(), { ok: true, transferred: true });
    assert.equal(s.routes.length, 1);
  });
  it("exposes only logical destination arguments to the model", () => {
    const tools = buildReceptionistTools({
      agentId: AGENT,
      toolBaseUrl: "https://ringee.example/api/ai-voice-agents/tools",
      toolSecretRef: "secret-reference",
      knowledgeBucketIds: [],
    });
    const transfer = tools.find(
      (tool) =>
        tool.kind === "webhook" && tool.name === "transfer_to_destination",
    );
    assert.ok(transfer && transfer.kind === "webhook" && transfer.parameters);
    assert.deepEqual(
      Object.keys(transfer.parameters.properties as object).sort(),
      ["destination_id", "destination_type"],
    );
    assert.doesNotMatch(
      JSON.stringify(transfer.parameters),
      /sip|credential|api_key/,
    );
  });
});

describe("AI receptionist that cannot answer", () => {
  const request = {
    call: { id: "logical-call" },
    ctx,
    destination: {
      type: "ai_receptionist",
      agentId: AGENT,
      ownerUserId: PERSON,
    },
    origin: { transport: "call_control" },
    callerName: null,
  };
  it("refuses the call at once when the refusal is definitive", async () => {
    const handler = new AiReceptionistDestinationHandler({
      startInbound: async () => {
        throw new ForbiddenException("Insufficient credits");
      },
    } as never);
    const result = await handler.execute(request as never);
    assert.equal(result.status, "failed");
    assert.equal(
      result.status === "failed" && result.reason,
      "agent_unavailable",
    );
  });
  it("lets an uncertain provider outcome be redelivered", async () => {
    const handler = new AiReceptionistDestinationHandler({
      startInbound: async () => {
        throw new ServiceUnavailableException("provider timeout");
      },
    } as never);
    await assert.rejects(
      handler.execute(request as never),
      ServiceUnavailableException,
    );
  });
});

describe("AI receptionist inbound call", () => {
  for (const kind of ["ringee", "external"] as const)
    it(`attaches the existing voice agent to a ${kind} caller leg once`, async () => {
      const s = setup();
      let attached: unknown;
      let starts = 0;
      let stored: { providerConversationId?: string } | null = null;
      const config = {
        instructions: "Use the company knowledge",
        tools: [{ kind: "retrieval" }],
        recordCalls: true,
      };
      const calls = Object.assign(
        Object.create(VoiceAgentCallService.prototype),
        {
          agents: {
            require: async () => ({
              providerAssistantId: "existing-assistant",
            }),
            inboundConfig: async () => config,
          },
          credits: { getBalance: async () => 10 },
          agentCalls: {
            findByCallId: async () => stored,
            createInboundOnce: async (input: unknown) => {
              attached = input;
              return { id: "ai-call" };
            },
            markInboundStarted: async () => {
              stored = {
                agentId: AGENT,
                providerConversationId: "conversation",
              } as typeof stored;
            },
          },
          provider: {
            startInboundCall: async (request: {
              callControlId: string;
              config: unknown;
            }) => {
              starts++;
              assert.equal(request.callControlId, s.call.callControlId);
              assert.equal(request.config, config);
              return { conversationId: "conversation" };
            },
          },
        },
      ) as VoiceAgentCallService;
      const handler = new AiReceptionistDestinationHandler(calls);
      const request = {
        call: s.call,
        ctx,
        destination: {
          type: "ai_receptionist",
          agentId: AGENT,
          ownerUserId: PERSON,
        },
        origin: { transport: "call_control", number: { kind, id: "number" } },
        callerName: null,
      };
      await handler.execute(request as never);
      await handler.execute(request as never);
      assert.equal(starts, 1);
      assert.equal((attached as { callId: string }).callId, s.call.id);
    });
});
