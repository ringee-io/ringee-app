/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException } from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import { VoiceAgentService } from "./voice-agent.service";
import { handoffTargetName } from "./automations/voice-agent-handoff.service";

const CTX = { userId: "user-1", organizationId: "org-1" };
const AGENT = {
  id: "agent-1",
  type: "reminders_notifications",
  providerAssistantId: "assistant-1",
};

function supportToolUrl(): string {
  const base = apiConfiguration.PUBLIC_BACKEND_URL!.replace(/\/+$/, "");
  return `${base}/api/ai-voice-agents/tools/agent-1/request-human-support`;
}

function build(currentWebhookUrls: string[], runtimeContextConfigured = true) {
  const syncs: string[] = [];
  const service = new VoiceAgentService(
    {} as never,
    {
      require: () => ({
        buildTools: (ctx: {
          agentId: string;
          toolBaseUrl: string;
          toolSecretRef: string;
        }) => [
          {
            kind: "webhook",
            name: "request_human_support",
            description: "Notify an administrator.",
            url: `${ctx.toolBaseUrl}/${ctx.agentId}/request-human-support`,
            method: "POST",
            headers: [
              {
                name: "X-Ringee-Tool-Secret",
                secretRef: ctx.toolSecretRef,
              },
            ],
          },
          { kind: "hangup", description: "End the call." },
        ],
      }),
    } as never,
    {} as never,
    {
      getAssistant: async () => ({
        assistantId: "assistant-1",
        callingAppId: "calling-app-1",
        unauthenticatedWebCallsEnabled: false,
        runtimeContextConfigured,
        toolWebhookUrls: currentWebhookUrls,
        handoffAssistantIds: [],
      }),
    } as never,
    {} as never,
    {} as never,
    {
      resolveCalendar: async () => ({
        calendar: { id: "cal-global", timezone: "UTC", isDefault: true },
        scope: { calendarId: "cal-global", isDefault: true },
        timezone: "UTC",
        destination: null,
      }),
    } as never,
    {} as never,
    {} as never,
    { listByDestination: async () => [] } as never,
    {
      handoffTargetsFor: async () => [],
      acceptsHandoffs: () => false,
      resolveDestination: async () => ({
        ok: false,
        reason: "automations_disabled",
      }),
    } as never,
  );

  (
    service as unknown as {
      syncToProvider: (
        ctx: typeof CTX,
        agentId: string,
      ) => Promise<typeof AGENT>;
    }
  ).syncToProvider = async (_ctx, agentId) => {
    syncs.push(agentId);
    return AGENT;
  };

  return { service, syncs };
}

describe("VoiceAgentService tool delivery", () => {
  it("re-syncs an older assistant when a required webhook tool is missing", async () => {
    const { service, syncs } = build([]);

    await service.ensureToolEndpoints(CTX, AGENT as never);

    assert.deepEqual(syncs, ["agent-1"]);
  });

  it("does not rewrite an assistant whose webhook set is current", async () => {
    const { service, syncs } = build([supportToolUrl()]);

    await service.ensureToolEndpoints(CTX, AGENT as never);

    assert.deepEqual(syncs, []);
  });

  it("re-syncs an older assistant whose prompt has no call-time clock", async () => {
    const { service, syncs } = build([supportToolUrl()], false);

    await service.ensureToolEndpoints(CTX, AGENT as never);

    assert.deepEqual(syncs, ["agent-1"]);
  });

  it("re-syncs webhook tools that still point to an old backend", async () => {
    const { service, syncs } = build([
      "https://old-api.example/api/ai-voice-agents/tools/agent-1/request-human-support",
    ]);

    await service.ensureToolEndpoints(CTX, AGENT as never);

    assert.deepEqual(syncs, ["agent-1"]);
  });
});

describe("VoiceAgentService handoff destinations (AGENT-021)", () => {
  const DESTINATION = {
    id: "agent-sched",
    name: "Carmen",
    type: "appointment_booking",
    providerAssistantId: "asst-sched",
  };
  const TARGET = {
    assistantId: "asst-sched",
    name: handoffTargetName({ name: "Carmen" }),
  };
  const toolUrl = (agentId: string) =>
    `${apiConfiguration.PUBLIC_BACKEND_URL!.replace(/\/+$/, "")}/api/ai-voice-agents/tools/${agentId}/request-human-support`;

  /** What the blueprint stub leads a scheduling agent's prompt with. */
  const leadingFor = (agentName: string) =>
    `## When a call is handed to you\n\nYou are ${agentName}.`;

  /**
   * A reminders agent whose assistant is current, handing to `DESTINATION`.
   * `syncedName` is the name its handoff tool was saved with (undefined: the
   * provider reports none); `destination` is what reading the destination's
   * own assistant does. `sourceVoice` and `destinationInstructions` are what
   * the provider reports for each (undefined: it reports nothing).
   */
  function handoffBuild(options: {
    syncedName?: string;
    destination?: "current" | "missing" | "unreadable" | "sync_fails";
    sourceVoice?: "shared" | "own";
    destinationInstructions?: string | null;
  }) {
    const syncs: Array<{ agentId: string; withoutHandoff: boolean }> = [];
    const service = new VoiceAgentService(
      {} as never,
      {
        require: () => ({
          buildTools: (ctx: {
            agentId: string;
            toolBaseUrl: string;
            handoffTargets?: unknown[];
          }) => [
            {
              kind: "webhook",
              name: "request_human_support",
              description: "Notify an administrator.",
              url: `${ctx.toolBaseUrl}/${ctx.agentId}/request-human-support`,
              method: "POST",
              headers: [],
            },
            ...(ctx.handoffTargets?.length
              ? [{ kind: "handoff", voice: "own", targets: ctx.handoffTargets }]
              : []),
          ],
          buildLeadingInstructions: (ctx: {
            agentName: string;
            acceptsHandoffs?: boolean;
          }) => (ctx.acceptsHandoffs ? leadingFor(ctx.agentName) : null),
        }),
      } as never,
      {} as never,
      {
        getAssistant: async (assistantId: string) => {
          if (assistantId === "assistant-1") {
            return {
              assistantId,
              callingAppId: "calling-app-1",
              unauthenticatedWebCallsEnabled: false,
              runtimeContextConfigured: true,
              toolWebhookUrls: [toolUrl("agent-1")],
              handoffAssistantIds: ["asst-sched"],
              handoffAssistantNames:
                options.syncedName === undefined
                  ? {}
                  : { "asst-sched": options.syncedName },
              ...(options.sourceVoice
                ? { handoffVoice: options.sourceVoice }
                : {}),
            };
          }
          if (options.destination === "unreadable") {
            throw new Error("provider unavailable");
          }
          if (options.destination === "missing") return null;
          return {
            assistantId,
            callingAppId: "calling-app-2",
            unauthenticatedWebCallsEnabled: false,
            runtimeContextConfigured: true,
            // Stale when its re-sync is the thing that fails.
            toolWebhookUrls:
              options.destination === "sync_fails"
                ? []
                : [toolUrl("agent-sched")],
            handoffAssistantIds: [],
            ...(options.destinationInstructions !== undefined
              ? { instructions: options.destinationInstructions }
              : {}),
          };
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { listByDestination: async () => [] } as never,
      {
        handoffTargetsFor: async (_ctx: unknown, agent: { type: string }) =>
          agent.type === "reminders_notifications" ? [TARGET] : [],
        acceptsHandoffs: (agent: { type: string }) =>
          agent.type === "appointment_booking",
        resolveDestination: async () => ({
          ok: true,
          agent: DESTINATION,
          automationId: "auto-1",
        }),
      } as never,
    );
    (
      service as unknown as {
        syncToProvider: (
          ctx: typeof CTX,
          agentId: string,
          options?: { withoutHandoff?: boolean },
        ) => Promise<Record<string, unknown>>;
      }
    ).syncToProvider = async (_ctx, agentId, syncOptions) => {
      syncs.push({
        agentId,
        withoutHandoff: syncOptions?.withoutHandoff === true,
      });
      return agentId === "agent-sched" && options.destination === "sync_fails"
        ? { ...DESTINATION, status: "error" }
        : { ...AGENT, status: "active" };
    };
    return { service, syncs };
  }

  it("re-syncs a reminders assistant still announcing its destination's old name", async () => {
    const renamed = handoffBuild({
      syncedName: handoffTargetName({ name: "Carla" }),
      destination: "current",
    });
    await renamed.service.ensureToolEndpoints(CTX, AGENT as never);
    assert.deepEqual(renamed.syncs, [
      { agentId: "agent-1", withoutHandoff: false },
    ]);

    // The current name, or a name the provider does not report, is no drift.
    for (const syncedName of [TARGET.name, undefined]) {
      const current = handoffBuild({ syncedName, destination: "current" });
      await current.service.ensureToolEndpoints(CTX, AGENT as never);
      assert.deepEqual(current.syncs, []);
    }
  });

  it("re-syncs a reminders assistant whose handoff keeps the caller's voice", async () => {
    const stale = handoffBuild({
      syncedName: TARGET.name,
      destination: "current",
      sourceVoice: "shared",
    });
    await stale.service.ensureToolEndpoints(CTX, AGENT as never);
    assert.deepEqual(stale.syncs, [
      { agentId: "agent-1", withoutHandoff: false },
    ]);

    // The voice it hands over with now, or one the provider does not
    // report, is no drift.
    for (const sourceVoice of ["own", undefined] as const) {
      const current = handoffBuild({
        syncedName: TARGET.name,
        destination: "current",
        sourceVoice,
      });
      await current.service.ensureToolEndpoints(CTX, AGENT as never);
      assert.deepEqual(current.syncs, []);
    }
  });

  // The destination dials nothing itself, so the reminders agent's dial is
  // the only thing that brings its prompt up to date.
  it("re-syncs a destination whose prompt does not lead with its continuation", async () => {
    for (const destinationInstructions of [
      "## Rol\n\nEres {{agent_name}}.",
      // The section names the agent: one saved under an old name is stale.
      `${leadingFor("Carla")}\n\n## Rol`,
      null,
    ]) {
      const stale = handoffBuild({
        syncedName: TARGET.name,
        destination: "current",
        destinationInstructions,
      });
      await stale.service.ensureToolEndpoints(CTX, AGENT as never);
      assert.deepEqual(
        stale.syncs,
        [{ agentId: "agent-sched", withoutHandoff: false }],
        String(destinationInstructions),
      );
    }

    for (const destinationInstructions of [
      `${leadingFor("Carmen")}\n\n## Rol\n\nEres {{agent_name}}.`,
      undefined,
    ]) {
      const current = handoffBuild({
        syncedName: TARGET.name,
        destination: "current",
        destinationInstructions,
      });
      await current.service.ensureToolEndpoints(CTX, AGENT as never);
      assert.deepEqual(current.syncs, []);
    }
  });

  it("hands nothing to a destination whose own assistant cannot be verified", async () => {
    for (const destination of [
      "unreadable",
      "missing",
      "sync_fails",
    ] as const) {
      const { service, syncs } = handoffBuild({
        syncedName: TARGET.name,
        destination,
      });
      await service.ensureToolEndpoints(CTX, AGENT as never);
      assert.deepEqual(
        syncs.filter((sync) => sync.agentId === "agent-1"),
        [{ agentId: "agent-1", withoutHandoff: true }],
        destination,
      );
    }
  });
});

describe("VoiceAgentService inbound-only activation", () => {
  it("activates an existing configured agent without requiring an outbound caller ID", async () => {
    const agent = { ...AGENT, callerNumberId: null };
    let checkedCaller = false;
    const service = Object.assign(Object.create(VoiceAgentService.prototype), {
      require: async () => agent,
      assertReadyForCalls: () => {},
      assertCallerNumberReady: async () => {
        checkedCaller = true;
      },
      agents: {
        update: async (_id: string, data: unknown) => ({
          ...agent,
          ...(data as object),
        }),
      },
    }) as VoiceAgentService;
    assert.equal(
      (await service.setStatus(CTX, AGENT.id, "active")).status,
      "active",
    );
    assert.equal(checkedCaller, false);
    (agent as { callerNumberId: string | null }).callerNumberId =
      "assigned-number";
    await service.setStatus(CTX, AGENT.id, "active");
    assert.equal(checkedCaller, true);
  });
});

describe("VoiceAgentService inbound receptionist config", () => {
  function inboundService(type: string) {
    const agent = {
      ...AGENT,
      type,
      status: "active",
      toolSecretHash: "hash",
      timezone: "Europe/Madrid",
      providerInsightGroupId: "insights",
    };
    return Object.assign(Object.create(VoiceAgentService.prototype), {
      require: async () => agent,
      assertReadyForCalls: () => {},
      ensureInsightGroup: async () => {},
      composeConfig: async () => ({
        instructions: "Help",
        tools: [],
        dynamicVariables: { agent_timezone: "America/New_York" },
      }),
    }) as VoiceAgentService;
  }

  it("uses the config composed for this call", async () => {
    const config = await inboundService("receptionist").inboundConfig(
      CTX,
      AGENT.id,
    );
    assert.equal(config.dynamicVariables?.agent_timezone, "America/New_York");
    assert.equal(config.instructions, "Help");
  });

  it("refuses to answer with an agent that is not a receptionist", async () => {
    for (const type of ["appointment_booking", "reminders_notifications"])
      await assert.rejects(
        inboundService(type).inboundConfig(CTX, AGENT.id),
        BadRequestException,
      );
  });
});
