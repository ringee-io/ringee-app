/// <reference types="node" />

import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ConflictException } from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import { VoiceAgentAutomationService } from "./voice-agent-automation.service";

/**
 * The rail (AGENT-018). Pinned here: a quick setup creates one agent however
 * many times it is clicked, a state is computed from what actually works —
 * not from `status` — and pausing a receptionist never leaves a number
 * unanswered.
 */

const config = apiConfiguration as unknown as Record<string, unknown>;
config.AI_VOICE_AGENT_AUTOMATIONS_ORG_IDS = ["org-1"];
config.TELNYX_CALL_CONTROL_APP_ID = "call-control-app";
config.TELNYX_CONNECTION_ID = "webrtc-connection";

const CTX = { userId: "admin-1", organizationId: "org-1" };

type Row = Record<string, any>;

const AGENT = (over: Row = {}) => ({
  id: "agent-1",
  name: "Sofia",
  type: "reminders_notifications",
  status: "active",
  providerAssistantId: "assistant-1",
  callerNumberId: "number-1",
  calendarId: null,
  voiceLabel: null,
  voiceLanguage: "es",
  lastError: null,
  deletedAt: null,
  ...over,
});

function build(
  over: {
    automation?: Row | null;
    claim?: Row;
    agent?: Row | null;
    numbers?: Row[];
    balance?: number;
    routes?: Row[];
    released?: Row;
    members?: string[];
  } = {},
) {
  const calls: Row[] = [];
  const created: Row[] = [];
  const statuses: Row[] = [];
  const automationUpdates: Row[] = [];
  const releasedClaims: string[] = [];
  const agent = over.agent === undefined ? AGENT() : over.agent;

  const service = new VoiceAgentAutomationService(
    {
      findForOwner: async () =>
        over.automation === undefined
          ? {
              id: "automation-1",
              capability: "reminders_notifications",
              agentId: "agent-1",
              enabled: true,
              settings: null,
            }
          : over.automation,
      listForOwner: async () =>
        over.automation === null ? [] : [over.automation ?? {}],
      claim: async () =>
        over.claim ?? { claimed: true, row: { id: "automation-1" } },
      completeClaim: async (_id: string, _token: string, data: Row) => {
        calls.push({ completeClaim: data.agentId });
        return true;
      },
      releaseClaim: async (id: string) => {
        releasedClaims.push(id);
      },
      clearAgent: async () => true,
      upsertForOwner: async (_ctx: Row, _type: string, data: Row) => {
        automationUpdates.push(data);
        return data;
      },
      updateForOwner: async (_ctx: Row, _id: string, data: Row) => {
        automationUpdates.push(data);
        return data;
      },
    } as never,
    {
      findByIdForOwner: async () => agent,
      listForOwner: async () => ({ data: agent ? [agent] : [] }),
    } as never,
    { listRecentForAgents: async () => [] } as never,
    {
      listForOwner: async () => [
        { id: "policy-1", calendarId: "calendar-1", offsetsMinutes: [1440] },
      ],
      findForCalendar: async () => null,
      upsertForCalendar: async (_ctx: Row, input: Row) => ({
        id: "policy-1",
        ...input,
      }),
      deleteForOwner: async () => 0,
      setEnabled: async (_ctx: Row, ids: string[], enabled: boolean) =>
        ids.map((id) => ({ id, enabled })),
    } as never,
    {
      countUpcomingForOwner: async () => 4,
      listFinishedForOwner: async () => [],
    } as never,
    { listAttentionForOwner: async () => [] } as never,
    { listByDestination: async () => over.routes ?? [] } as never,
    {
      findAdminMembersWithEmails: async () => [{ id: "admin-1" }],
      isMember: async (id: string) =>
        (over.members ?? ["admin-1", "member-1"]).includes(id),
    } as never,
    {
      findById: async (id: string) => ({ id, firstName: "Carlos" }),
    } as never,
    {
      require: async () => agent,
      create: async (_ctx: Row, input: Row) => {
        created.push(input);
        return AGENT({ id: "agent-new", name: input.name, type: input.type });
      },
      update: async (_ctx: Row, _id: string, patch: Row) => ({
        ...agent,
        ...patch,
      }),
      setStatus: async (_ctx: Row, id: string, status: string) => {
        statuses.push({ id, status });
        return { ...agent, status };
      },
      listVoices: async () => [
        { id: "voice-en", language: "en" },
        { id: "voice-es", language: "es" },
      ],
      listCallerNumbers: async () =>
        over.numbers ?? [{ id: "number-1", phoneNumber: "+13055550001" }],
    } as never,
    {
      startCall: async (_ctx: Row, agentId: string, input: Row) => {
        calls.push({ startCall: agentId, ...input });
        return { id: "agent-call-1", status: "initiating" };
      },
    } as never,
    {
      getCalendar: async (_ctx: Row, id: string) => ({
        id,
        name: "Ventas",
        timezone: "America/New_York",
        archivedAt: null,
      }),
      resolveCalendar: async () => ({
        calendar: { id: "calendar-1", name: "Ventas" },
        timezone: "America/New_York",
      }),
    } as never,
    {
      findContactByIdForOwner: async () => ({
        id: "contact-1",
        firstName: "Elena",
        lastName: "Ruiz",
        phoneNumber: "+13055550123",
        email: "Elena@Lead.test",
      }),
    } as never,
    { getBalance: async () => over.balance ?? 25 } as never,
    { resolveForAgent: async () => ({ name: "Acme" }) } as never,
    {
      releaseReceptionist: async () =>
        over.released ?? { restored: 1, failed: [] },
      saveForNumber: async () => ({}),
      getForNumber: async () => null,
    } as never,
    {
      planPolicyCalls: async () => {
        calls.push({ planned: true });
        return 1;
      },
      cancelPolicyCalls: async (id: string, reason: string) => {
        calls.push({ cancelled: id, reason });
        return 0;
      },
      previewPolicyCalls: async () => ({ meetings: 3, calls: 2 }),
    } as never,
    {} as never,
    {} as never,
    { previousInteractions: async () => "" } as never,
  );
  return {
    service,
    calls,
    created,
    statuses,
    automationUpdates,
    releasedClaims,
  };
}

describe("VoiceAgentAutomationService quick setup", () => {
  it("creates the agent once, under the card's claim, with a voice in the person's language", async () => {
    const { service, created, calls } = build({ automation: null });

    await service.setupReminders(CTX, {
      name: "Sofía",
      language: "es",
      calendarIds: ["calendar-1"],
      offsetMinutes: 1440,
    });

    assert.equal(created.length, 1);
    assert.equal(created[0]!.type, "reminders_notifications");
    assert.equal(created[0]!.voiceId, "voice-es");
    assert.ok(calls.some((call) => call.completeClaim === "agent-new"));
    assert.ok(calls.some((call) => call.planned));
  });

  it("does not create a second agent while another window is setting one up", async () => {
    const { service, created } = build({
      automation: null,
      claim: {
        claimed: false,
        row: { id: "automation-1", agentId: null, claimToken: "other" },
      },
    });

    await assert.rejects(
      () =>
        service.setupReminders(CTX, {
          calendarIds: ["calendar-1"],
          offsetMinutes: 1440,
        }),
      ConflictException,
    );
    assert.equal(created.length, 0);
  });

  it("reuses the agent a concurrent setup already created", async () => {
    const { service, created } = build({
      automation: null,
      claim: {
        claimed: false,
        row: { id: "automation-1", agentId: "agent-1" },
      },
    });

    await service.setupReminders(CTX, {
      calendarIds: ["calendar-1"],
      offsetMinutes: 1440,
    });
    assert.equal(created.length, 0);
  });

  it("refuses an agent that does a different job", async () => {
    const { service } = build({ agent: AGENT({ type: "receptionist" }) });
    await assert.rejects(
      () =>
        service.setupReminders(CTX, {
          agentId: "agent-1",
          calendarIds: ["calendar-1"],
          offsetMinutes: 1440,
        }),
      /different job/,
    );
  });

  it("sets a card up again after the agent it drove was deleted", async () => {
    // The row still names the deleted agent. Until it is forgotten the claim
    // sees a card that is already set up, and every setup is refused.
    const { service, created, calls } = build({ agent: null });
    const automations = (service as unknown as { automations: Row })
      .automations;
    let cleared = false;
    automations.clearAgent = async (_ctx: Row, id: string, agentId: string) => {
      calls.push({ clearAgent: id, agentId });
      cleared = true;
      return true;
    };
    automations.claim = async () =>
      cleared
        ? { claimed: true, row: { id: "automation-1" } }
        : { claimed: false, row: { id: "automation-1", agentId: "agent-1" } };

    await service.setupReminders(CTX, {
      calendarIds: ["calendar-1"],
      offsetMinutes: 1440,
    });

    assert.ok(
      calls.some(
        (call) =>
          call.clearAgent === "automation-1" && call.agentId === "agent-1",
      ),
    );
    assert.equal(created.length, 1);
  });

  it("withdraws what the card's previous agent watched when it moves to another", async () => {
    const { service, calls } = build({
      automation: {
        id: "automation-1",
        capability: "reminders_notifications",
        agentId: "agent-old",
        enabled: true,
        settings: null,
      },
    });
    const policies = (service as unknown as { policies: Row }).policies;
    const deleted: string[][] = [];
    policies.listForOwner = async (_ctx: Row, options: Row) =>
      options.agentId === "agent-old"
        ? [{ id: "policy-old", calendarId: "calendar-2", offsetsMinutes: [60] }]
        : [];
    policies.deleteForOwner = async (_ctx: Row, ids: string[]) => {
      deleted.push(ids);
      return ids.length;
    };

    await service.setupReminders(CTX, {
      agentId: "agent-1",
      calendarIds: ["calendar-1"],
      offsetMinutes: 1440,
    });

    assert.ok(
      calls.some(
        (call) =>
          call.cancelled === "policy-old" && call.reason === "policy_removed",
      ),
    );
    assert.deepEqual(deleted, [["policy-old"]]);
  });

  it("hands back the numbers the previous receptionist answered when the card moves to another", async () => {
    const { service } = build({
      agent: AGENT({ type: "receptionist" }),
      automation: {
        id: "automation-1",
        capability: "receptionist",
        agentId: "agent-old",
        enabled: true,
        settings: {
          numbers: [
            { kind: "ringee", id: "number-1" },
            { kind: "ringee", id: "number-2" },
          ],
          fallback: null,
        },
      },
    });
    const releases: Row[] = [];
    (
      service as unknown as { inboundRoutes: Row }
    ).inboundRoutes.releaseReceptionist = async (
      _ctx: Row,
      agentId: string,
      only: Row[],
    ) => {
      releases.push({ agentId, only });
      return { restored: only.length, failed: [] };
    };

    await service.setupReceptionist(CTX, {
      agentId: "agent-1",
      numbers: [{ kind: "ringee", id: "number-1" }],
    });

    assert.deepEqual(releases, [
      { agentId: "agent-old", only: [{ kind: "ringee", id: "number-2" }] },
    ]);
  });
});

describe("VoiceAgentAutomationService state", () => {
  it("is active only when the agent can actually call", async () => {
    const { service } = build();
    const card = await service.card(CTX, "reminders");
    assert.equal(card.state, "active");
    assert.equal(card.reminders?.upcomingCalls, 4);
    assert.equal(card.reminders?.ccAdmins, 1);
  });

  it("needs attention, with the next step, when there is no number to call from", async () => {
    const { service } = build({ numbers: [] });
    const card = await service.card(CTX, "reminders");
    assert.equal(card.state, "needs_attention");
    assert.equal(card.nextStep?.code, "add_number");
  });

  it("never guesses between several numbers", async () => {
    const { service } = build({
      agent: AGENT({ callerNumberId: null }),
      numbers: [
        { id: "number-1", phoneNumber: "+13055550001" },
        { id: "number-2", phoneNumber: "+34910000002" },
      ],
    });
    const card = await service.card(CTX, "reminders");
    assert.equal(card.nextStep?.code, "choose_number");
  });

  it("says a receptionist that answers no number is not answering", async () => {
    const { service } = build({
      agent: AGENT({ type: "receptionist" }),
      automation: {
        id: "automation-1",
        capability: "receptionist",
        agentId: "agent-1",
        enabled: true,
      },
      routes: [],
    });
    const card = await service.card(CTX, "receptionist");
    assert.equal(card.state, "needs_attention");
    assert.equal(card.nextStep?.code, "answer_a_number");
  });

  it("offers the workspace's existing agents before creating one", async () => {
    const { service } = build({ automation: null });
    const card = await service.card(CTX, "reminders");
    assert.equal(card.state, "unconfigured");
    assert.deepEqual(
      card.candidates.map((candidate) => candidate.id),
      ["agent-1"],
    );
  });
});

describe("VoiceAgentAutomationService pause", () => {
  const RECEPTIONIST_AUTOMATION = {
    id: "automation-1",
    capability: "receptionist",
    agentId: "agent-1",
    enabled: true,
    settings: { numbers: [{ kind: "ringee", id: "number-1" }] },
  };

  it("hands a receptionist's numbers back before switching it off", async () => {
    const { service, statuses, automationUpdates } = build({
      agent: AGENT({ type: "receptionist" }),
      automation: RECEPTIONIST_AUTOMATION,
    });
    await service.setEnabled(CTX, "receptionist", false);
    assert.deepEqual(statuses, [{ id: "agent-1", status: "disabled" }]);
    assert.deepEqual(automationUpdates.at(-1), { enabled: false });
  });

  it("keeps answering when a number cannot be handed back, and says why", async () => {
    const { service, statuses, automationUpdates } = build({
      agent: AGENT({ type: "receptionist" }),
      automation: RECEPTIONIST_AUTOMATION,
      released: {
        restored: 0,
        failed: [
          {
            number: { kind: "external", id: "x" },
            phoneNumber: "+18095551234",
            error:
              "Choose where calls to this number go before pausing the receptionist.",
          },
        ],
      },
    });
    await assert.rejects(
      () => service.setEnabled(CTX, "receptionist", false),
      ConflictException,
    );
    assert.deepEqual(statuses, []);
    assert.deepEqual(automationUpdates, []);
  });

  it("withdraws what reminders had planned when they are paused", async () => {
    const { service, calls } = build();
    await service.setEnabled(CTX, "reminders", false);
    assert.ok(
      calls.some(
        (call) =>
          call.cancelled === "policy-1" && call.reason === "policy_paused",
      ),
    );
  });
});

describe("VoiceAgentAutomationService.startSchedulingCall", () => {
  const SCHEDULING = {
    id: "automation-3",
    capability: "appointment_booking",
    agentId: "agent-1",
    enabled: true,
  };

  it("calls the lead for the member chosen, through the one execution path", async () => {
    const { service, calls } = build({
      agent: AGENT({ type: "appointment_booking" }),
      automation: SCHEDULING,
    });
    await service.startSchedulingCall(CTX, {
      contactId: "contact-1",
      responsibleUserId: "member-1",
    });
    const start = calls.find((call) => call.startCall);
    assert.equal(start?.to, "+13055550123");
    assert.equal(start?.responsibleUserId, "member-1");
    assert.equal(start?.variables.first_name, "Elena");
    assert.equal(start?.variables.email, "elena@lead.test");
    assert.match(start?.variables.reason, /with Carlos/);
  });

  it("never books a meeting for someone outside the organization", async () => {
    const { service, calls } = build({
      agent: AGENT({ type: "appointment_booking" }),
      automation: SCHEDULING,
    });
    await assert.rejects(
      () =>
        service.startSchedulingCall(CTX, {
          contactId: "contact-1",
          responsibleUserId: "stranger-1",
        }),
      /member of your organization/,
    );
    assert.equal(calls.filter((call) => call.startCall).length, 0);
  });

  it("does not dial while scheduling is switched off", async () => {
    const { service } = build({
      agent: AGENT({ type: "appointment_booking" }),
      automation: { ...SCHEDULING, enabled: false },
    });
    await assert.rejects(
      () => service.startSchedulingCall(CTX, { contactId: "contact-1" }),
      /Switch on Appointment scheduling/,
    );
  });
});

describe("VoiceAgentAutomationService pilot flag", () => {
  it("reports the rail off for an organization outside the pilot", async () => {
    const { service } = build();
    assert.deepEqual(
      await service.summary({ userId: "u", organizationId: "org-2" }),
      { enabled: false, operational: 0, attention: 0, capabilities: {} },
    );
    await assert.rejects(
      () =>
        service.setupReminders(
          { userId: "u", organizationId: "org-2" },
          { calendarIds: ["calendar-1"], offsetMinutes: 60 },
        ),
      /not enabled/,
    );
  });
});
