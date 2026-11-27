import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CustomIntegrationOutboundService } from "./custom-integration-outbound.service";

const CTX = { userId: "user-1", organizationId: "org-1" };

/**
 * The service over stubs that answer only for the workspace they were built
 * for: a lookup with another context finds nothing, as the real repositories do.
 */
function setup(
  options: {
    calls?: Record<string, { id: string }>;
    agentCalls?: Record<string, { id: string; callId: string | null }>;
    detail?: Record<string, unknown>;
  } = {},
) {
  const reads: string[] = [];
  const forCtx = <T>(table: Record<string, T> | undefined, label: string) => ({
    async findByIdForOwner(ctx: typeof CTX, id: string) {
      reads.push(`${label}:${id}`);
      return ctx.organizationId === CTX.organizationId
        ? ((table ?? {})[id] ?? null)
        : null;
    },
  });
  const service = Object.assign(
    Object.create(CustomIntegrationOutboundService.prototype),
    {
      calls: {
        ...forCtx(options.calls, "call"),
        async findEventDetailForOwner(_ctx: typeof CTX, id: string) {
          reads.push(`detail:${id}`);
          return options.detail ?? null;
        },
      },
      agentCalls: forCtx(options.agentCalls, "agent-call"),
    },
  ) as CustomIntegrationOutboundService;
  return { service, reads };
}

describe("CustomIntegrationOutboundService public call reads (HOOK-010)", () => {
  it("resolves the id an event carries to that call", async () => {
    const { service } = setup({ calls: { "call-1": { id: "call-1" } } });

    assert.equal(await service.resolveCallId(CTX, "call-1"), "call-1");
  });

  it("resolves the id Start Call returned to the call it placed", async () => {
    const { service } = setup({
      agentCalls: { "agent-call-1": { id: "agent-call-1", callId: "call-9" } },
    });

    assert.equal(await service.resolveCallId(CTX, "agent-call-1"), "call-9");
  });

  it("prefers a call over an agent call, and stops looking once it has one", async () => {
    const { service, reads } = setup({
      calls: { "same-id": { id: "same-id" } },
      agentCalls: { "same-id": { id: "same-id", callId: "other" } },
    });

    assert.equal(await service.resolveCallId(CTX, "same-id"), "same-id");
    assert.deepEqual(reads, ["call:same-id"]);
  });

  it("finds nothing for an agent call that never reached telephony", async () => {
    const { service } = setup({
      agentCalls: { "agent-call-1": { id: "agent-call-1", callId: null } },
    });

    assert.equal(await service.resolveCallId(CTX, "agent-call-1"), null);
  });

  it("finds nothing for an id in another workspace, whichever table holds it", async () => {
    const { service } = setup({
      calls: { "call-1": { id: "call-1" } },
      agentCalls: { "agent-call-1": { id: "agent-call-1", callId: "call-1" } },
    });
    const elsewhere = { userId: "user-2", organizationId: "org-2" };

    assert.equal(await service.resolveCallId(elsewhere, "call-1"), null);
    assert.equal(await service.resolveCallId(elsewhere, "agent-call-1"), null);
  });

  it("returns no detail, and reads none, for an id that resolves to nothing", async () => {
    const { service, reads } = setup({ detail: { callId: "leak" } });

    assert.equal(await service.getCallDetail(CTX, "nobody"), null);
    assert.equal(
      reads.some((read) => read.startsWith("detail:")),
      false,
    );
  });
});
