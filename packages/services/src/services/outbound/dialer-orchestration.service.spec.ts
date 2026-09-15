/// <reference types="node" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AgentSessionService } from "./agent-session.service";
import { CallAttemptService } from "./call-attempt.service";
import { DialerOrchestrationService } from "./dialer-orchestration.service";
import { LeadQueueService } from "./lead-queue.service";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** Let every other pending async writer run, the way a DB round-trip does. */
const roundTrip = () => new Promise((resolve) => setImmediate(resolve));

interface SessionRow {
  id: string;
  campaignId: string;
  userId: string;
  organizationId: string;
  status: string;
  currentLeadId: string | null;
  lastHeartbeat: Date;
  startedAt: Date;
  endedAt: Date | null;
  callsAttempted: number;
  callsConnected: number;
  totalTalkSec: number;
}

interface LeadRow {
  id: string;
  campaignId: string;
  status: string;
  lockedBy: string | null;
  lockedAt: Date | null;
  attempts: number;
  priority: number;
  nextCallAt: Date | null;
  lastCallAt: Date | null;
  createdAt: Date;
  metadata: null;
  contact: { id: string; name: string; phoneNumber: string };
}

interface AttemptRow {
  id: string;
  campaignId: string;
  campaignLeadId: string;
  agentSessionId: string | null;
  agentUserId: string;
  attemptNumber: number;
  status: string;
  callId: string | null;
  initiatedAt: Date;
  answeredAt: Date | null;
  endedAt: Date | null;
  durationSec: number | null;
  hangupCause: string | null;
  dispositionId: string | null;
  dispositionCode: string | null;
  dispositionNote: string | null;
  dispositionedAt: Date | null;
}

const LIVE_ATTEMPT = ["created", "dialing", "ringing", "answered", "in_call"];
const UNDIALED_ATTEMPT = ["created", "dialing"];
const RELEASABLE_LEAD = ["locked", "dialing", "in_call", "wrap_up"];

/**
 * The real orchestrator, session, attempt and queue services over in-memory
 * repositories that keep Prisma's semantics: every compare-and-set checks and
 * writes in one step, and every call yields first, like a round-trip would.
 */
function createWorld(
  options: {
    dialerMode?: string;
    leads?: number;
    preCheckDelayMs?: number;
  } = {},
) {
  const campaign = {
    id: "campaign-1",
    organizationId: "org-1",
    callerIdId: null,
    numberPurchasedId: null,
    rotationNumberIds: [] as string[],
    maxAttempts: 3,
    retryDelayMin: 60,
    timezone: "UTC",
    workStartMin: 0,
    workEndMin: 1440,
    workDays: [0, 1, 2, 3, 4, 5, 6],
    dialerMode: options.dialerMode ?? "progressive",
    status: "active",
  };

  const sessions = new Map<string, SessionRow>();
  const leads = new Map<string, LeadRow>();
  const attempts = new Map<string, AttemptRow>();
  const events: Array<{ channel: string; type: string; data: any }> = [];
  const leaseReleases: string[] = [];
  let attemptSeq = 0;

  sessions.set("session-1", {
    id: "session-1",
    campaignId: campaign.id,
    userId: "user-1",
    organizationId: "org-1",
    status: "ready",
    currentLeadId: null,
    lastHeartbeat: new Date(),
    startedAt: new Date(),
    endedAt: null,
    callsAttempted: 0,
    callsConnected: 0,
    totalTalkSec: 0,
  });
  for (let i = 1; i <= (options.leads ?? 2); i++) {
    leads.set(`lead-${i}`, {
      id: `lead-${i}`,
      campaignId: campaign.id,
      status: "queued",
      lockedBy: null,
      lockedAt: null,
      attempts: 0,
      priority: 0,
      nextCallAt: null,
      lastCallAt: null,
      createdAt: new Date(Date.now() - 10_000 + i),
      metadata: null,
      contact: {
        id: `contact-${i}`,
        name: `Lead ${i}`,
        phoneNumber: `+1212555000${i}`,
      },
    });
  }

  const guard = {
    busy: null as { id: string } | null,
    allow: true,
    preChecks: 0,
    findOccupyingCall: async () => {
      guard.preChecks += 1;
      await sleep(options.preCheckDelayMs ?? 0);
      return guard.busy;
    },
    requestDial: async () =>
      guard.allow
        ? { allowed: true }
        : { allowed: false, message: "You already have a call in progress." },
    releasePending: async (_userId: string, deviceId: string) => {
      leaseReleases.push(deviceId);
    },
  };
  const rotation = {
    phoneNumber: "+12125559999" as string | null,
    reason: "rotated",
    selectForDial: async () => ({
      phoneNumber: rotation.phoneNumber,
      numberId: null,
      rotated: !!rotation.phoneNumber,
      reason: rotation.reason,
    }),
  };
  const credit = { balance: 50, getBalance: async () => credit.balance };
  /** Calls the database shows as up for the agent. */
  const liveCalls: Array<{ id: string; toNumber: string }> = [];
  const user = { canCall: true, freeCallTrial: false };

  const copySession = (s: SessionRow) => ({ ...s });
  const sessionRepo = {
    findById: async (id: string) => {
      await roundTrip();
      const s = sessions.get(id);
      return s ? copySession(s) : null;
    },
    findByCampaignAndUser: async (campaignId: string, userId: string) => {
      await roundTrip();
      const s = [...sessions.values()].find(
        (row) => row.campaignId === campaignId && row.userId === userId,
      );
      return s ? copySession(s) : null;
    },
    findReadyByCampaign: async (campaignId: string) => {
      await roundTrip();
      return [...sessions.values()]
        .filter((s) => s.campaignId === campaignId && s.status === "ready")
        .map(copySession);
    },
    findByStatus: async (status: string) => {
      await roundTrip();
      return [...sessions.values()]
        .filter((s) => s.status === status)
        .map(copySession);
    },
    transitionIf: async (
      id: string,
      expected: { from: string[]; currentLeadId?: string | null },
      status: string,
      extra: Partial<SessionRow> = {},
    ) => {
      await roundTrip();
      const s = sessions.get(id);
      if (!s || !expected.from.includes(s.status)) return false;
      if (
        expected.currentLeadId !== undefined &&
        s.currentLeadId !== expected.currentLeadId
      ) {
        return false;
      }
      Object.assign(s, { status }, extra);
      return true;
    },
    upsert: async (data: { campaignId: string; userId: string }) => {
      await roundTrip();
      const s = [...sessions.values()].find(
        (row) =>
          row.campaignId === data.campaignId && row.userId === data.userId,
      )!;
      Object.assign(s, {
        status: "ready",
        currentLeadId: null,
        lastHeartbeat: new Date(),
        startedAt: new Date(),
        endedAt: null,
        callsAttempted: 0,
        callsConnected: 0,
        totalTalkSec: 0,
      });
      return copySession(s);
    },
    incrementStats: async (
      id: string,
      stats: {
        callsAttempted?: number;
        callsConnected?: number;
        totalTalkSec?: number;
      },
    ) => {
      await roundTrip();
      const s = sessions.get(id)!;
      s.callsAttempted += stats.callsAttempted ?? 0;
      s.callsConnected += stats.callsConnected ?? 0;
      s.totalTalkSec += stats.totalTalkSec ?? 0;
      return copySession(s);
    },
    markOffline: async (id: string) => {
      await roundTrip();
      const s = sessions.get(id)!;
      Object.assign(s, {
        status: "offline",
        currentLeadId: null,
        endedAt: new Date(),
      });
      return copySession(s);
    },
  };

  const copyLead = (l: LeadRow) => ({ ...l, contact: { ...l.contact } });
  const leadRepo = {
    lockNextLead: async (
      campaignId: string,
      sessionId: string,
      max: number,
    ) => {
      await roundTrip();
      const now = Date.now();
      const [lead] = [...leads.values()]
        .filter(
          (l) =>
            l.campaignId === campaignId &&
            l.status === "queued" &&
            !l.lockedBy &&
            (!l.nextCallAt || l.nextCallAt.getTime() <= now) &&
            l.attempts < max,
        )
        .sort((a, b) => {
          if (b.priority !== a.priority) return b.priority - a.priority;
          if (!a.nextCallAt !== !b.nextCallAt) return a.nextCallAt ? 1 : -1;
          const byNext =
            (a.nextCallAt?.getTime() ?? 0) - (b.nextCallAt?.getTime() ?? 0);
          return byNext || a.createdAt.getTime() - b.createdAt.getTime();
        });
      if (!lead) return null;
      Object.assign(lead, {
        status: "locked",
        lockedBy: sessionId,
        lockedAt: new Date(),
      });
      return copyLead(lead);
    },
    findByIdWithContact: async (id: string) => {
      await roundTrip();
      const l = leads.get(id);
      return l ? copyLead(l) : null;
    },
    releaseLock: async (
      id: string,
      opts: { lockedBy?: string; nextCallAt?: Date } = {},
    ) => {
      await roundTrip();
      const l = leads.get(id);
      if (!l || !RELEASABLE_LEAD.includes(l.status)) return 0;
      if (opts.lockedBy && l.lockedBy !== opts.lockedBy) return 0;
      Object.assign(l, { status: "queued", lockedBy: null, lockedAt: null });
      if (opts.nextCallAt) l.nextCallAt = opts.nextCallAt;
      return 1;
    },
    advanceIfHeldBy: async (id: string, lockedBy: string, status: string) => {
      await roundTrip();
      const l = leads.get(id);
      const from =
        status === "wrap_up"
          ? ["locked", "dialing", "in_call"]
          : ["locked", "dialing"];
      if (!l || l.lockedBy !== lockedBy || !from.includes(l.status)) {
        return false;
      }
      l.status = status;
      return true;
    },
    incrementAttempt: async (id: string) => {
      await roundTrip();
      const l = leads.get(id)!;
      l.attempts += 1;
      l.lastCallAt = new Date();
      return copyLead(l);
    },
    updateStatus: async (
      id: string,
      status: string,
      extra: Partial<LeadRow> = {},
    ) => {
      await roundTrip();
      const l = leads.get(id)!;
      Object.assign(l, { status }, extra);
      return copyLead(l);
    },
    markAsDead: async (id: string) => {
      await roundTrip();
      const l = leads.get(id)!;
      l.status = "exhausted";
      return copyLead(l);
    },
  };

  const copyAttempt = (a: AttemptRow) => ({ ...a });
  const failures = { createAttempt: false };
  const attemptRepo = {
    create: async (data: Omit<AttemptRow, "id" | "status" | "callId">) => {
      await roundTrip();
      if (failures.createAttempt) throw new Error("database unavailable");
      const id = `attempt-${++attemptSeq}`;
      attempts.set(id, {
        id,
        ...data,
        status: "created",
        callId: null,
        initiatedAt: new Date(),
        answeredAt: null,
        endedAt: null,
        durationSec: null,
        hangupCause: null,
        dispositionId: null,
        dispositionCode: null,
        dispositionNote: null,
        dispositionedAt: null,
      } as AttemptRow);
      return copyAttempt(attempts.get(id)!);
    },
    findById: async (id: string) => {
      await roundTrip();
      const a = attempts.get(id);
      return a ? copyAttempt(a) : null;
    },
    findByIdWithCampaignOrganization: async (id: string) => {
      await roundTrip();
      const a = attempts.get(id);
      return a
        ? { ...a, campaign: { organizationId: campaign.organizationId } }
        : null;
    },
    findByCampaignLead: async (leadId: string) => {
      await roundTrip();
      return [...attempts.values()]
        .filter((a) => a.campaignLeadId === leadId)
        .sort((a, b) => b.initiatedAt.getTime() - a.initiatedAt.getTime())
        .map(copyAttempt);
    },
    findUndialedForSession: async (sessionId: string, leadId: string) => {
      await roundTrip();
      const a = [...attempts.values()].find(
        (row) =>
          row.agentSessionId === sessionId &&
          row.campaignLeadId === leadId &&
          !row.callId &&
          UNDIALED_ATTEMPT.includes(row.status),
      );
      return a ? copyAttempt(a) : null;
    },
    markDialing: async (id: string) => {
      await roundTrip();
      const a = attempts.get(id);
      if (!a || a.callId || a.status !== "created") return false;
      Object.assign(a, { status: "dialing", initiatedAt: new Date() });
      return true;
    },
    linkCallIfUnlinked: async (id: string, callId: string) => {
      await roundTrip();
      const a = attempts.get(id);
      if (!a || a.callId || !UNDIALED_ATTEMPT.includes(a.status)) return false;
      Object.assign(a, { callId, status: "dialing" });
      return true;
    },
    markAnsweredIf: async (id: string, callId: string) => {
      await roundTrip();
      const a = attempts.get(id);
      if (
        !a ||
        a.callId !== callId ||
        !["created", "dialing", "ringing"].includes(a.status)
      ) {
        return false;
      }
      Object.assign(a, { status: "answered", answeredAt: new Date() });
      return true;
    },
    markEndedIf: async (id: string, opts: { callId?: string } = {}) => {
      await roundTrip();
      const a = attempts.get(id);
      if (!a || !LIVE_ATTEMPT.includes(a.status)) return false;
      if (opts.callId && a.callId !== opts.callId) return false;
      Object.assign(a, { status: "ended", endedAt: new Date() });
      return true;
    },
    recordCallMetricsOnce: async (
      id: string,
      callId: string,
      data: { durationSec: number; hangupCause: string | null },
    ) => {
      await roundTrip();
      const a = attempts.get(id);
      if (!a || a.callId !== callId || a.durationSec !== null) return false;
      Object.assign(a, data);
      return true;
    },
    deleteUndialed: async (id: string) => {
      await roundTrip();
      const a = attempts.get(id);
      if (!a || a.callId || !UNDIALED_ATTEMPT.includes(a.status)) return false;
      attempts.delete(id);
      return true;
    },
    setDisposition: async (
      id: string,
      data: { dispositionId: string; dispositionCode: string },
    ) => {
      await roundTrip();
      const a = attempts.get(id);
      if (!a || a.status !== "ended") return null;
      Object.assign(a, data, {
        status: "dispositioned",
        dispositionedAt: new Date(),
      });
      return copyAttempt(a);
    },
  };

  const sseBridge = {
    emit: (channel: string, type: string, data: unknown) =>
      events.push({ channel, type, data }),
  };
  const dispositionService = {
    listByCampaign: async () => [],
    getById: async () => ({
      id: "disposition-1",
      code: "not_interested",
      label: "Not interested",
      category: "negative",
      triggersCompletion: false,
      triggersDnc: false,
      triggersCallback: false,
      triggersRetry: false,
    }),
  };
  const complianceService = { isWithinCallingWindow: () => true };
  const userService = { getCachedUserById: async () => ({ ...user }) };

  const agentSessionService = new AgentSessionService(
    sessionRepo as never,
    leadRepo as never,
    userService as never,
    sseBridge as never,
    attemptRepo as never,
  );
  const callAttemptService = new CallAttemptService(
    attemptRepo as never,
    leadRepo as never,
    agentSessionService,
    dispositionService as never,
    {} as never,
    {} as never,
    complianceService as never,
    sseBridge as never,
    {
      updateOutcome: async () => undefined,
      updateOutcomeNote: async () => undefined,
      findActiveByUserId: async () => liveCalls,
    } as never,
    { enqueueOutcomeUpdate: async () => undefined } as never,
    { handleCallFinalized: () => undefined } as never,
    guard as never,
  );
  const orchestrator = new DialerOrchestrationService(
    {
      findActiveForDialer: async () => [campaign],
      findById: async () => campaign,
    } as never,
    { findById: async () => null, findOne: async () => null } as never,
    new LeadQueueService(leadRepo as never),
    agentSessionService,
    callAttemptService,
    complianceService as never,
    {} as never,
    sseBridge as never,
    dispositionService as never,
    rotation as never,
    guard as never,
    userService as never,
    credit as never,
  );
  const internals = orchestrator as unknown as {
    runTick(): Promise<void>;
    cooldownUntil: Map<string, number>;
    lastStalledDialSweepAt: number;
  };

  return {
    campaign,
    failures,
    liveCalls,
    guard,
    rotation,
    credit,
    user,
    events,
    leaseReleases,
    sessions,
    leads,
    attempts,
    agentSessionService,
    callAttemptService,
    orchestrator,
    runTick: () => internals.runTick(),
    endCooldowns: () => internals.cooldownUntil.clear(),
    forceStalledSweep: () => {
      internals.lastStalledDialSweepAt = 0;
    },
    session: () => sessions.get("session-1")!,
    lead: (id: string) => leads.get(id)!,
    of: (type: string) => events.filter((e) => e.type === type),
  };
}

describe("DialerOrchestrationService", () => {
  describe("one dial per agent", () => {
    it("never runs two poll ticks at once, so a slow tick cannot dial the same agent twice", async () => {
      // A liveness round-trip to the provider inside the pre-check is what
      // makes a real tick outlast the 500ms interval.
      const world = createWorld({ preCheckDelayMs: 300 });

      await Promise.all([
        world.runTick(),
        sleep(100).then(() => world.runTick()),
        sleep(200).then(() => world.runTick()),
      ]);

      // The later ticks found one in flight and did nothing at all.
      assert.equal(world.guard.preChecks, 1);
      assert.equal(world.of("call.initiate").length, 1);
      assert.equal(world.attempts.size, 1);
      assert.equal(world.session().status, "dialing");
      assert.equal(world.lead("lead-2").status, "queued");
    });

    it("claims the agent atomically, so two API instances polling together still place one call", async () => {
      const world = createWorld({ preCheckDelayMs: 20 });

      // `tick` directly: two instances each have their own in-flight guard.
      await Promise.all([world.orchestrator.tick(), world.orchestrator.tick()]);

      const dials = world.of("call.initiate");
      assert.equal(dials.length, 1);
      assert.equal(world.of("lead.assigned").length, 1);
      assert.equal(world.attempts.size, 1);
      assert.equal(world.session().status, "dialing");
      // The lead the losing tick had locked is back in the queue, untouched.
      const locked = [...world.leads.values()].filter(
        (l) => l.status === "locked",
      );
      assert.equal(locked.length, 1);
      assert.equal(locked[0].contact.phoneNumber, dials[0].data.phoneNumber);
      const other = [...world.leads.values()].find((l) => l !== locked[0])!;
      assert.equal(other.status, "queued");
      assert.equal(other.lockedBy, null);
    });

    it("hands the assignment back when something fails after the agent was claimed", async () => {
      const world = createWorld();
      world.failures.createAttempt = true;

      await world.runTick();

      assert.equal(world.session().status, "ready");
      assert.equal(world.session().currentLeadId, null);
      assert.equal(world.lead("lead-1").status, "queued");
      assert.ok(world.leaseReleases.includes("campaign-agent:session-1"));
      assert.equal(world.of("call.initiate").length, 0);

      // And the poller does not hammer a failing database for that agent.
      world.failures.createAttempt = false;
      await world.runTick();
      assert.equal(world.of("call.initiate").length, 0);
      world.endCooldowns();
      await world.runTick();
      assert.equal(world.of("call.initiate").length, 1);
    });

    it("does not assign a lead to an agent who is already on a call", async () => {
      const world = createWorld();
      world.guard.busy = { id: "manual-call" };

      await world.runTick();

      assert.equal(world.of("lead.assigned").length, 0);
      assert.equal(world.attempts.size, 0);
      assert.equal(world.session().status, "ready");
    });
  });

  describe("a refused dial leaves nothing behind and does not spin", () => {
    it("pauses the session when the workspace has no credit", async () => {
      const world = createWorld();
      world.credit.balance = 0;

      await world.runTick();
      await world.runTick();

      assert.equal(world.of("call.initiate").length, 0);
      assert.equal(world.attempts.size, 0);
      assert.equal(world.session().status, "paused");
      assert.equal(world.session().currentLeadId, null);
      assert.equal(world.lead("lead-1").status, "queued");
      const blocked = world.of("call.blocked");
      assert.equal(blocked.length, 1);
      assert.equal(blocked[0].data.reason, "NO_CREDIT");
    });

    it("returns the agent to ready after a concurrent-call refusal, then leaves them alone for the cooldown", async () => {
      const world = createWorld();
      world.guard.allow = false;

      await world.runTick();
      await world.runTick();
      await world.runTick();

      assert.equal(world.of("call.blocked").length, 1);
      assert.equal(world.attempts.size, 0);
      assert.equal(world.session().status, "ready");
      assert.equal(world.lead("lead-1").status, "queued");
      assert.equal(world.lead("lead-1").nextCallAt, null);

      world.guard.allow = true;
      world.endCooldowns();
      await world.runTick();
      assert.equal(world.of("call.initiate").length, 1);
    });

    it("moves a lead with no caller ID for its country behind the queue, and dials the next one", async () => {
      const world = createWorld();
      world.rotation.phoneNumber = null;
      world.rotation.reason = "no_caller_id_for_country";

      await world.runTick();

      const deferred = world.lead("lead-1");
      assert.equal(deferred.status, "queued");
      assert.ok(
        deferred.nextCallAt && deferred.nextCallAt.getTime() > Date.now(),
      );
      assert.equal(world.session().status, "ready");
      assert.equal(world.attempts.size, 0);
      assert.ok(world.leaseReleases.includes("campaign-agent:session-1"));

      world.rotation.phoneNumber = "+12125559999";
      world.rotation.reason = "rotated";
      world.endCooldowns();
      await world.runTick();
      const [dial] = world.of("call.initiate");
      assert.equal(
        dial.data.phoneNumber,
        world.lead("lead-2").contact.phoneNumber,
      );
    });

    it("pauses the session when rotation is off and the agent may not present the campaign's number", async () => {
      const world = createWorld();
      world.rotation.phoneNumber = null;
      world.rotation.reason = "rotation_disabled";

      await world.runTick();

      assert.equal(world.session().status, "paused");
      assert.equal(world.lead("lead-1").nextCallAt, null);
    });

    it("takes the session offline when calling is disabled for the user", async () => {
      const world = createWorld();
      world.user.canCall = false;

      await world.runTick();

      assert.equal(world.session().status, "offline");
      const offline = world
        .of("session.state")
        .find((e) => e.data.status === "offline");
      assert.equal(offline?.data.reason, "account_disabled");
    });
  });

  describe("dials that never became calls", () => {
    it("pauses a session whose dial never reached the provider, and hands everything back", async () => {
      const world = createWorld();
      await world.runTick();
      const attempt = [...world.attempts.values()][0];
      assert.equal(attempt.status, "dialing");

      attempt.initiatedAt = new Date(Date.now() - 2 * 60_000);
      world.forceStalledSweep();
      await world.runTick();

      assert.equal(world.session().status, "paused");
      assert.equal(world.session().currentLeadId, null);
      assert.equal(world.attempts.size, 0);
      assert.equal(world.lead("lead-1").status, "queued");
      assert.ok(world.leaseReleases.includes("campaign-agent:session-1"));
      assert.equal(world.of("call.blocked")[0].data.reason, "DIAL_TIMEOUT");
    });

    it("leaves a dial alone while it is still young", async () => {
      const world = createWorld();
      await world.runTick();
      world.forceStalledSweep();
      await world.runTick();

      assert.equal(world.session().status, "dialing");
      assert.equal(world.attempts.size, 1);
    });

    it("pauses the session when the browser reports it could not place the call", async () => {
      const world = createWorld();
      await world.runTick();
      const attempt = [...world.attempts.values()][0];
      const ctx = { userId: "user-1", organizationId: "org-1" };

      await assert.rejects(
        world.orchestrator.abandonDial(
          { ...ctx, userId: "someone-else" },
          "session-1",
          attempt.id,
        ),
        /does not belong/,
      );

      const first = await world.orchestrator.abandonDial(
        ctx,
        "session-1",
        attempt.id,
        "microphone_unavailable",
      );
      assert.deepEqual(first, { released: true });
      assert.equal(world.session().status, "paused");
      assert.equal(world.attempts.size, 0);
      assert.equal(world.lead("lead-1").status, "queued");
      assert.match(world.of("call.blocked")[0].data.message, /microphone/i);

      await assert.rejects(
        world.orchestrator.abandonDial(ctx, "session-1", attempt.id),
        /not found/,
      );
    });

    it("does not abandon a dial the provider already reported", async () => {
      const world = createWorld();
      await world.runTick();
      const attempt = [...world.attempts.values()][0];
      await world.callAttemptService.handleWebhookEvent(
        attempt.id,
        "call.initiated",
        {
          id: "call-1",
          userId: "user-1",
          answeredAt: null,
          endedAt: null,
          hangupCause: null,
        },
      );

      const result = await world.orchestrator.abandonDial(
        { userId: "user-1", organizationId: "org-1" },
        "session-1",
        attempt.id,
      );

      assert.deepEqual(result, { released: false });
      assert.equal(world.session().status, "dialing");
      assert.equal(world.attempts.get(attempt.id)?.callId, "call-1");
    });

    it("releases the assignment and pauses when the call.initiated backstop hangs the leg up", async () => {
      const world = createWorld();
      await world.runTick();
      const attempt = [...world.attempts.values()][0];

      await world.callAttemptService.handleDialRefused(attempt.id, "user-1", {
        reason: "CONCURRENT_CALL",
        message: "busy",
      });

      assert.equal(world.session().status, "paused");
      assert.equal(world.attempts.size, 0);
      assert.equal(world.lead("lead-1").status, "queued");
      assert.equal(world.lead("lead-1").attempts, 0);

      // A second leg refused while the first leg to the same prospect is
      // already up (its call.initiated has not linked the attempt yet) must
      // not release the lead from under that call.
      const racing = createWorld();
      await racing.runTick();
      const racingAttempt = [...racing.attempts.values()][0];
      racing.liveCalls.push({
        id: "first-leg",
        toNumber: racing.lead("lead-1").contact.phoneNumber,
      });
      await racing.callAttemptService.handleDialRefused(
        racingAttempt.id,
        "user-1",
        { reason: "CONCURRENT_CALL", message: "busy" },
      );
      assert.equal(racing.session().status, "dialing");
      assert.equal(racing.attempts.size, 1);
      assert.equal(racing.lead("lead-1").status, "locked");

      // A refusal for someone else's attempt is ignored.
      const other = createWorld();
      await other.runTick();
      const theirs = [...other.attempts.values()][0];
      await other.callAttemptService.handleDialRefused(theirs.id, "intruder", {
        reason: "CONCURRENT_CALL",
        message: "busy",
      });
      assert.equal(other.session().status, "dialing");
    });
  });

  describe("preview", () => {
    it("skips a lead to the back of the queue and discards its undialed attempt", async () => {
      const world = createWorld({ dialerMode: "preview" });
      await world.runTick();
      assert.equal(world.session().status, "reserved");
      assert.equal(world.attempts.size, 1);

      await world.orchestrator.skipLead("session-1");

      assert.equal(world.session().status, "ready");
      assert.equal(world.attempts.size, 0);
      assert.equal(world.lead("lead-1").status, "queued");
      assert.ok(world.lead("lead-1").nextCallAt);

      await world.runTick();
      assert.equal(world.session().currentLeadId, "lead-2");
    });

    it("refuses to dial a lead that is no longer locked to the session", async () => {
      const world = createWorld({ dialerMode: "preview" });
      await world.runTick();
      // The orphaned-lock sweep handed it to another agent meanwhile.
      world.lead("lead-1").lockedBy = "session-2";

      await assert.rejects(
        world.orchestrator.manualDial(
          { userId: "user-1", organizationId: "org-1" },
          "session-1",
          "campaign-1",
        ),
        /no longer assigned/,
      );
      assert.equal(world.of("call.initiate").length, 0);
      assert.equal(world.session().status, "ready");
      assert.equal(world.lead("lead-1").lockedBy, "session-2");
    });
  });
});

describe("CallAttemptService lifecycle", () => {
  const call = (
    overrides: Partial<{
      userId: string;
      answeredAt: Date | null;
      endedAt: Date | null;
      hangupCause: string | null;
    }> = {},
  ) => ({
    id: "call-1",
    userId: "user-1",
    answeredAt: null as Date | null,
    endedAt: null as Date | null,
    hangupCause: null as string | null,
    ...overrides,
  });

  async function dialedAndAnswered() {
    const world = createWorld();
    await world.runTick();
    const attempt = [...world.attempts.values()][0];
    await world.callAttemptService.handleWebhookEvent(
      attempt.id,
      "call.initiated",
      call(),
    );
    await world.callAttemptService.handleWebhookEvent(
      attempt.id,
      "call.answered",
      call(),
    );
    assert.equal(world.session().status, "in_call");
    assert.equal(world.lead("lead-1").status, "in_call");
    return { world, attemptId: attempt.id };
  }

  const dispose = (
    world: ReturnType<typeof createWorld>,
    attemptId: string,
    closeSession = false,
  ) =>
    world.callAttemptService.submitDisposition({
      callAttemptId: attemptId,
      dispositionId: "disposition-1",
      campaignDefaults: { maxAttempts: 3, retryDelayMin: 60 },
      organizationId: "org-1",
      closeSession,
    });

  const hangup = (world: ReturnType<typeof createWorld>, attemptId: string) =>
    world.callAttemptService.handleWebhookEvent(
      attemptId,
      "call.hangup",
      call({
        answeredAt: new Date(Date.now() - 42_000),
        endedAt: new Date(),
        hangupCause: "normal_clearing",
      }),
    );

  it("counts the attempt once and sends the agent on when the disposition and the hangup webhook race", async () => {
    for (const order of ["together", "hangup-first", "dispose-first"]) {
      const { world, attemptId } = await dialedAndAnswered();

      if (order === "together") {
        await Promise.all([
          dispose(world, attemptId),
          hangup(world, attemptId),
        ]);
      } else if (order === "hangup-first") {
        await hangup(world, attemptId);
        await dispose(world, attemptId);
      } else {
        await dispose(world, attemptId);
        await hangup(world, attemptId);
      }

      const lead = world.lead("lead-1");
      assert.equal(lead.attempts, 1, `${order}: attempts`);
      assert.equal(lead.status, "completed", `${order}: lead status`);
      assert.equal(world.session().status, "ready", `${order}: session status`);
      assert.equal(world.session().currentLeadId, null, `${order}: lead ref`);
      assert.equal(world.session().callsAttempted, 1, `${order}: stats`);
      assert.equal(world.session().totalTalkSec, 42, `${order}: talk time`);
      const stored = world.attempts.get(attemptId)!;
      assert.equal(stored.status, "dispositioned", `${order}: attempt`);
      assert.equal(stored.durationSec, 42, `${order}: duration`);
    }
  });

  it("emits the agent's next state before anything else, so it cannot land behind the next lead", async () => {
    const { world, attemptId } = await dialedAndAnswered();
    await hangup(world, attemptId);
    world.events.length = 0;

    await dispose(world, attemptId);

    const [first] = world.of("session.state");
    assert.equal(first.data.status, "ready");
    assert.equal(first.data.attemptId, attemptId);
  });

  it("ignores a redelivered hangup", async () => {
    const { world, attemptId } = await dialedAndAnswered();
    await hangup(world, attemptId);
    await hangup(world, attemptId);

    assert.equal(world.lead("lead-1").attempts, 1);
    assert.equal(world.session().callsAttempted, 1);
    assert.equal(world.session().totalTalkSec, 42);
    assert.equal(world.of("disposition.required").length, 1);
  });

  it("ignores lifecycle events from a leg that belongs to another user", async () => {
    const world = createWorld();
    await world.runTick();
    const attempt = [...world.attempts.values()][0];

    await world.callAttemptService.handleWebhookEvent(
      attempt.id,
      "call.initiated",
      call({ userId: "intruder" }),
    );
    await world.callAttemptService.handleWebhookEvent(
      attempt.id,
      "call.hangup",
      call({ userId: "intruder" }),
    );

    const stored = world.attempts.get(attempt.id)!;
    assert.equal(stored.callId, null);
    assert.equal(stored.status, "dialing");
    assert.equal(world.session().status, "dialing");
    assert.equal(world.lead("lead-1").attempts, 0);
  });

  it("closes the session after the lead when asked to", async () => {
    const { world, attemptId } = await dialedAndAnswered();
    await hangup(world, attemptId);

    const result = await dispose(world, attemptId, true);

    assert.equal(result.sessionClosed, true);
    assert.equal(world.session().status, "offline");
    await world.runTick();
    assert.equal(world.of("call.initiate").length, 1);
  });

  it("refuses an outcome for an attempt whose lead has been dialed again since", async () => {
    const { world, attemptId } = await dialedAndAnswered();
    await hangup(world, attemptId);
    // The session was ended mid-wrap-up; the lead went back and was dialed again.
    await world.agentSessionService.endSession("session-1");
    world.session().status = "ready";
    await world.runTick();
    assert.equal(world.attempts.size, 2);

    await assert.rejects(dispose(world, attemptId), /dialed again/);
  });
});

describe("AgentSessionService.startSession", () => {
  it("takes over a session left open in another tab, handing its lead back", async () => {
    const world = createWorld({ dialerMode: "preview" });
    await world.runTick();
    assert.equal(world.session().status, "reserved");
    world.events.length = 0;

    await world.agentSessionService.startSession({
      campaignId: "campaign-1",
      userId: "user-1",
      organizationId: "org-1",
    });

    assert.equal(world.session().status, "ready");
    assert.equal(world.session().currentLeadId, null);
    assert.equal(world.attempts.size, 0);
    assert.equal(world.lead("lead-1").status, "queued");
    const [offline] = world.of("session.state");
    assert.deepEqual(offline.data, { status: "offline", reason: "taken_over" });
  });

  it("refuses to take over a session that is on a call in another tab", async () => {
    const world = createWorld();
    await world.runTick();
    assert.equal(world.session().status, "dialing");

    await assert.rejects(
      world.agentSessionService.startSession({
        campaignId: "campaign-1",
        userId: "user-1",
        organizationId: "org-1",
      }),
      /on a call in another tab/,
    );
    assert.equal(world.session().status, "dialing");
  });
});
