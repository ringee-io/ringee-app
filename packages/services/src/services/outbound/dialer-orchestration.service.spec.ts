/// <reference types="node" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { AgentSessionService } from "./agent-session.service";
import { CallAttemptService } from "./call-attempt.service";
import { DialerOrchestrationService } from "./dialer-orchestration.service";
import { LeadQueueService } from "./lead-queue.service";
import type { NumberPurchased, PoolMemberWithNumber } from "@ringee/database";
import { CallerIdRotationService } from "../caller-id-rotation/caller-id-rotation.service";
import { NumberPurchasedService } from "../number.purchased.service";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** Let every other pending async writer run, the way a DB round-trip does. */
const roundTrip = () => new Promise((resolve) => setImmediate(resolve));

async function within<T>(pending: Promise<T>): Promise<T> {
  let timer!: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      pending,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error("Timed out waiting for activation")),
          1_000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

interface SessionRow {
  id: string;
  campaignId: string;
  userId: string;
  organizationId: string;
  status: string;
  currentLeadId: string | null;
  lastHeartbeat: Date;
  startedAt: Date;
  reservedAt: Date | null;
  endedAt: Date | null;
  callsAttempted: number;
  callsConnected: number;
  totalTalkSec: number;
  updatedAt: Date;
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
  sessionStartedAt: Date | null;
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
  dispositionOutcome?: string | null;
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
    /** Exercise the real selector instead of the dial-gate stub. */
    callerIds?: Array<{ id: string; phoneNumber: string }>;
  } = {},
) {
  const campaign = {
    id: "campaign-1",
    organizationId: "org-1",
    callerIdId: null,
    numberPurchasedId: "number-1" as string | null,
    externalNumberId: null as string | null,
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
    reservedAt: null,
    endedAt: null,
    callsAttempted: 0,
    callsConnected: 0,
    totalTalkSec: 0,
    updatedAt: new Date(),
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
  /** The external carrier pre-flight (`CallService`). */
  const carrier = {
    error: null as Error | null,
    prepared: [] as Array<{
      ctx: { userId: string; organizationId: string | null };
      numberId: string;
      destination: string;
      callAttemptId?: string;
    }>,
    abandoned: [] as string[],
    prepareExternalOutbound: async (
      ctx: { userId: string; organizationId: string | null },
      numberId: string,
      destination: string,
      opts: { callAttemptId?: string } = {},
    ) => {
      await roundTrip();
      if (carrier.error) throw carrier.error;
      carrier.prepared.push({
        ctx,
        numberId,
        destination,
        callAttemptId: opts.callAttemptId,
      });
      return {
        phoneNumber: "+34910000000",
        numberId: null,
        rotated: false,
        reason: "external_carrier",
        destinationUri: "sip:rco-key@ringee.sip.telnyx.com",
        callToken: `token-${carrier.prepared.length}`,
      };
    },
    abandonExternalOutbound: async (_ctx: unknown, token: string) => {
      carrier.abandoned.push(token);
    },
    issueDialAuthorization: () => "dial-token",
  };
  const rotation = {
    enabled: true,
    selections: 0,
    phoneNumber: "+12125559999" as string | null,
    reason: "rotated",
    selectForDial: async (
      _ctx: unknown,
      _destination: string,
      fixed: { phoneNumber: string | null },
    ) => {
      rotation.selections += 1;
      return {
        phoneNumber: rotation.enabled
          ? rotation.phoneNumber
          : fixed.phoneNumber,
        numberId: null,
        rotated: !!rotation.phoneNumber,
        reason: rotation.reason,
      };
    },
  };
  const callerPool = (options.callerIds ?? []).map(
    (n) =>
      ({
        numberId: n.id,
        number: {
          ...n,
          userId: "user-1",
          organizationId: "org-1",
          kind: "purchased",
          status: "active",
          isoCountry: "US",
          allowedOutboundSources: [],
          allowedOutboundUserIds: [],
        } as unknown as NumberPurchased,
        participating: true,
        rotationStatus: "active",
        healthScore: 100,
        dailyCap: null,
        lastUsedAt: null,
      }) as PoolMemberWithNumber,
  );
  const rotationRepo = {
    findSettings: async () => ({
      enabled: true,
      strategy: "local_presence",
      defaultDailyCap: 50,
    }),
    listPoolMembers: async () => callerPool,
    findEligibleMembers: async () =>
      callerPool
        .filter((m) => m.participating && m.rotationStatus === "active")
        .map((m) => ({ ...m })),
    usageForNumbers: async () => new Map(),
    markUsed: async (id: string, previous: Date | null) => {
      await roundTrip();
      const current = callerPool.find((m) => m.numberId === id)!;
      if (current.lastUsedAt?.getTime() !== previous?.getTime()) return false;
      current.lastUsedAt = new Date(
        Math.max(Date.now(), (previous?.getTime() ?? 0) + 1),
      );
      return true;
    },
  };
  const numberRepo = {
    findRotatable: async () => callerPool.map((m) => m.number),
  };
  const realRotation = new CallerIdRotationService(
    rotationRepo as never,
    numberRepo as never,
    {
      listOutboundCallerIds:
        NumberPurchasedService.prototype.listOutboundCallerIds,
      numberPurchasedRepository: numberRepo,
    } as never,
  );
  const credit = { balance: 50, getBalance: async () => credit.balance };
  /** Calls the database shows as up for the agent. */
  const liveCalls: Array<{ id: string; toNumber: string }> = [];
  const user = { canCall: true, freeCallTrial: false };

  const copySession = (s: SessionRow) => ({ ...s });
  const liveForSession = (id: string) =>
    [...attempts.values()].some(
      (a) =>
        a.agentSessionId === id && a.callId && LIVE_ATTEMPT.includes(a.status),
    );
  const sameSnapshot = (s: SessionRow, previous: SessionRow) =>
    s.startedAt.getTime() === previous.startedAt.getTime() &&
    s.lastHeartbeat.getTime() === previous.lastHeartbeat.getTime() &&
    s.status === previous.status &&
    s.currentLeadId === previous.currentLeadId &&
    s.reservedAt?.getTime() === previous.reservedAt?.getTime();
  const releaseAssignments = (id: string) => {
    for (const [key, a] of attempts) {
      if (
        a.agentSessionId === id &&
        !a.callId &&
        UNDIALED_ATTEMPT.includes(a.status)
      )
        attempts.delete(key);
    }
    for (const l of leads.values()) {
      if (l.lockedBy === id && RELEASABLE_LEAD.includes(l.status))
        Object.assign(l, { status: "queued", lockedBy: null, lockedAt: null });
    }
  };
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
        .map((s) => ({
          ...copySession(s),
          leadLockedAt: leads.get(s.currentLeadId ?? "")?.lockedAt ?? null,
        }));
    },
    findActiveByUser: async (userId: string) =>
      [...sessions.values()]
        .filter(
          (s) => s.userId === userId && (s.status !== "offline" || !s.endedAt),
        )
        .map(copySession),
    transitionIf: async (
      id: string,
      expected: {
        from: string[];
        currentLeadId?: string | null;
        startedAt?: Date;
        endedAt?: Date | null;
        reservedAt?: Date | null;
        undialedAttemptId?: string | null;
      },
      status: string,
      extra: Partial<SessionRow> = {},
    ) => {
      await roundTrip();
      const s = sessions.get(id);
      if (!s || !expected.from.includes(s.status)) return false;
      if (status === "ready" && !user.canCall) return false;
      if (
        expected.startedAt &&
        s.startedAt.getTime() !== expected.startedAt.getTime()
      )
        return false;
      if (expected.endedAt !== undefined && s.endedAt !== expected.endedAt)
        return false;
      if (
        expected.currentLeadId !== undefined &&
        s.currentLeadId !== expected.currentLeadId
      ) {
        return false;
      }
      if (
        expected.reservedAt !== undefined &&
        s.reservedAt?.getTime() !== expected.reservedAt?.getTime()
      )
        return false;
      if (expected.undialedAttemptId !== undefined) {
        if (expected.undialedAttemptId) {
          const attempt = attempts.get(expected.undialedAttemptId);
          if (
            !attempt ||
            attempt.callId ||
            !UNDIALED_ATTEMPT.includes(attempt.status) ||
            attempt.agentSessionId !== id ||
            attempt.campaignLeadId !== expected.currentLeadId ||
            attempt.sessionStartedAt?.getTime() !==
              expected.startedAt?.getTime()
          )
            return false;
          attempts.delete(attempt.id);
        } else if (
          liveForSession(id) ||
          [...attempts.values()].some(
            (attempt) =>
              attempt.agentSessionId === id &&
              attempt.campaignLeadId === expected.currentLeadId &&
              attempt.sessionStartedAt?.getTime() ===
                expected.startedAt?.getTime() &&
              !attempt.callId &&
              UNDIALED_ATTEMPT.includes(attempt.status),
          )
        )
          return false;
      }
      Object.assign(s, { status, updatedAt: new Date() }, extra);
      if (status === "reserved")
        s.reservedAt = new Date(
          Math.max(Date.now(), (s.reservedAt?.getTime() ?? 0) + 1),
        );
      return true;
    },
    restartIfUnchanged: async (
      data: { campaignId: string; userId: string },
      previous: SessionRow | null,
      status: string,
    ) => {
      await roundTrip();
      const s = [...sessions.values()].find(
        (row) =>
          row.campaignId === data.campaignId && row.userId === data.userId,
      )!;
      if (!previous || !sameSnapshot(s, previous) || liveForSession(s.id))
        return null;
      if (
        previous.status === "offline" &&
        previous.endedAt &&
        previous.currentLeadId
      )
        return null;
      releaseAssignments(s.id);
      Object.assign(s, {
        status,
        currentLeadId: null,
        lastHeartbeat: new Date(),
        startedAt: new Date(
          Math.max(Date.now(), previous.startedAt.getTime() + 1),
        ),
        endedAt: null,
        callsAttempted: 0,
        callsConnected: 0,
        totalTalkSec: 0,
        updatedAt: new Date(),
      });
      return copySession(s);
    },
    endIfUnchanged: async (
      previous: SessionRow,
      preserve = false,
      options: {
        rejectLiveCalls?: boolean;
        assignmentRetry?: {
          leadId: string;
          attempts: number;
          status: "queued" | "exhausted";
          nextCallAt?: Date;
          deadAt?: Date;
        };
      } = {},
    ) => {
      await roundTrip();
      const s = sessions.get(previous.id)!;
      if (
        !sameSnapshot(s, previous) ||
        ((!preserve || options.rejectLiveCalls) && liveForSession(s.id))
      )
        return null;
      const retry = options.assignmentRetry;
      if (retry) {
        const lead = leads.get(retry.leadId)!;
        if (
          lead.attempts !== retry.attempts ||
          [...attempts.values()].some(
            (a) =>
              a.agentSessionId === s.id &&
              a.campaignLeadId === lead.id &&
              a.callId &&
              LIVE_ATTEMPT.includes(a.status),
          )
        )
          return null;
        if (lead.lockedBy === s.id && RELEASABLE_LEAD.includes(lead.status))
          Object.assign(lead, {
            status: retry.status,
            lockedBy: null,
            lockedAt: null,
            ...(retry.nextCallAt ? { nextCallAt: retry.nextCallAt } : {}),
          });
      }
      Object.assign(s, {
        status: "offline",
        endedAt: new Date(),
        updatedAt: new Date(),
      });
      if (!preserve) {
        s.currentLeadId = null;
        releaseAssignments(s.id);
      }
      return copySession(s);
    },
    endForAccountDisable: async (previous: SessionRow, preserve: boolean) => {
      await roundTrip();
      if (user.canCall) return { outcome: "calling_enabled" as const };
      const s = sessions.get(previous.id)!;
      if (
        !sameSnapshot(s, { ...previous, lastHeartbeat: s.lastHeartbeat }) ||
        (!preserve && liveForSession(s.id))
      )
        return { outcome: "changed" as const };
      Object.assign(s, { status: "offline", endedAt: new Date() });
      if (!preserve) {
        s.currentLeadId = null;
        releaseAssignments(s.id);
      }
      return { outcome: "ended" as const, session: copySession(s) };
    },
    heartbeat: async (id: string, startedAt?: Date) => {
      await roundTrip();
      const s = sessions.get(id)!;
      if (startedAt && s.startedAt.getTime() !== startedAt.getTime())
        return null;
      s.lastHeartbeat = new Date(
        Math.max(Date.now(), s.lastHeartbeat.getTime() + 1),
      );
      return copySession(s);
    },
    findStale: async (threshold: number) =>
      [...sessions.values()]
        .filter(
          (s) =>
            s.lastHeartbeat.getTime() < Date.now() - threshold &&
            (s.status !== "offline" || !s.endedAt || s.currentLeadId !== null),
        )
        .map(copySession),
    findStalledReservations: async (cutoff: Date) =>
      [...sessions.values()]
        .filter(
          (s) =>
            campaign.dialerMode === "progressive" &&
            s.status === "reserved" &&
            s.reservedAt !== null &&
            s.reservedAt < cutoff &&
            !liveForSession(s.id),
        )
        .map((s) => ({
          ...copySession(s),
          leadLockedAt: leads.get(s.currentLeadId ?? "")?.lockedAt ?? null,
        })),
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
      startedAt?: Date,
    ) => {
      await roundTrip();
      const s = sessions.get(id)!;
      if (startedAt && s.startedAt.getTime() !== startedAt.getTime())
        return null;
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
      opts: {
        lockedBy?: string;
        lockedAt?: Date | null;
        nextCallAt?: Date;
      } = {},
    ) => {
      await roundTrip();
      const l = leads.get(id);
      if (!l || !RELEASABLE_LEAD.includes(l.status)) return 0;
      if (opts.lockedBy && l.lockedBy !== opts.lockedBy) return 0;
      if (
        opts.lockedAt !== undefined &&
        l.lockedAt?.getTime() !== opts.lockedAt?.getTime()
      )
        return 0;
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
    findUnconfirmedDialForSession: async (id: string) => {
      await roundTrip();
      const pending = [...attempts.values()]
        .filter(
          (a) =>
            a.agentSessionId === id &&
            !a.callId &&
            a.status === "dialing" &&
            Date.now() - a.initiatedAt.getTime() < 90_000,
        )
        .sort((a, b) => b.initiatedAt.getTime() - a.initiatedAt.getTime());
      return pending[0] ? { ...pending[0] } : null;
    },
    hasLiveCallForSession: async (id: string) => {
      await roundTrip();
      return liveForSession(id);
    },
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
    findByIdWithRelations: async (id: string) => {
      const a = attempts.get(id);
      return a ? { ...a, campaignLead: leads.get(a.campaignLeadId) } : null;
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
      const lead = leads.get(a.campaignLeadId)!;
      lead.attempts++;
      lead.lastCallAt = new Date();
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
    isRelayReady: async () => true,
    emit: (channel: string, type: string, data: unknown) =>
      events.push({ channel, type, data }),
  };
  const dispositionService = {
    listByCampaign: async () => [],
  };
  /** What the attempt's disposition wrote onto its Call. */
  const outcomeWrites: unknown[][] = [];
  const dncWrites: unknown[] = [];
  const complianceService = {
    isWithinCallingWindow: () => true,
    addToDNC: async (input: unknown) => {
      dncWrites.push(input);
    },
  };
  const userService = { getCachedUserById: async () => ({ ...user }) };
  const setupLeases = new Map<string, string>();
  const redis = {
    setIfAbsent: async (key: string, value: string) => {
      if (setupLeases.has(key)) return false;
      setupLeases.set(key, value);
      return true;
    },
    renewLease: async (key: string, value: string) =>
      setupLeases.get(key) === value,
    compareAndSwap: async (key: string, value: string) => {
      if (setupLeases.get(key) !== value) return false;
      setupLeases.delete(key);
      return true;
    },
  };

  const agentSessionService = new AgentSessionService(
    sessionRepo as never,
    userService as never,
    sseBridge as never,
    attemptRepo as never,
    { listMemberUserIds: async (_c: string, ids: string[]) => ids } as never,
    { listAdminUserIds: async () => [] } as never,
    redis as never,
    { findById: async () => campaign } as never,
    leadRepo as never,
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
      recordOutcome: async (...args: unknown[]) => {
        outcomeWrites.push(["recordOutcome", ...args]);
        return { call: null, changed: false };
      },
      recordDispositionWithoutOutcome: async (...args: unknown[]) => {
        outcomeWrites.push(["recordDispositionWithoutOutcome", ...args]);
        return null;
      },
      findActiveByUserId: async () => liveCalls,
    } as never,
    { enqueueOutcomeUpdate: async () => undefined } as never,
    { handleCallFinalized: () => undefined } as never,
    guard as never,
    { enqueueCallOutcomeUpdated: async () => undefined } as never,
    { addCallNote: async () => null } as never,
    {
      recordHumanOutcome: async (
        _ctx: unknown,
        id: string,
        input: { outcome: string; note?: string; disposition?: unknown },
      ) => {
        outcomeWrites.push([
          "recordOutcome",
          id,
          input.outcome,
          input.note,
          input.disposition,
        ]);
        return { call: { id, outcomeRevision: 1 }, changed: false };
      },
    } as never,
  );
  const orchestrator = new DialerOrchestrationService(
    {
      findActiveForDialer: async () => [campaign],
      findById: async () => campaign,
    } as never,
    {
      findById: async (id: string) => ({
        phoneNumber: id === "new-number" ? "+14155559998" : "+12125559998",
      }),
      findOne: async () => ({ phoneNumber: "+12125559998" }),
    } as never,
    new LeadQueueService(leadRepo as never),
    agentSessionService,
    callAttemptService,
    complianceService as never,
    {} as never,
    sseBridge as never,
    dispositionService as never,
    (options.callerIds ? realRotation : rotation) as never,
    guard as never,
    userService as never,
    credit as never,
    carrier as never,
  );
  const internals = orchestrator as unknown as {
    runTick(): Promise<void>;
    cooldownUntil: Map<string, number>;
    lastStalledDialSweepAt: number;
  };

  return {
    campaign,
    failures,
    outcomeWrites,
    dncWrites,
    liveCalls,
    guard,
    rotation,
    callerPool,
    carrier,
    credit,
    complianceService,
    sseBridge,
    user,
    events,
    leaseReleases,
    sessions,
    leads,
    attempts,
    sessionRepo,
    leadRepo,
    attemptRepo,
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
  describe("progressive caller-ID fallback with the real selector", () => {
    const callerIds = [
      { id: "number-ny", phoneNumber: "+12125559876" },
      { id: "number-ca", phoneNumber: "+14155559876" },
      { id: "number-wy", phoneNumber: "+13075559876" },
    ];
    const start = (world: ReturnType<typeof createWorld>) =>
      world.agentSessionService.startSession({
        campaignId: world.campaign.id,
        userId: "user-1",
        organizationId: "org-1",
        waitForEvents: true,
      });

    it("delivers a random nonlocal caller ID after SSE activation and continues through repeated stop/start cycles", async (t) => {
      const random = t.mock.method(Math, "random", () => 0.999999);
      const world = createWorld({ callerIds, leads: 3 });
      // Exclude the local WY number even though the workspace owns it.
      world.campaign.rotationNumberIds = ["number-ny", "number-ca"];
      for (const lead of world.leads.values())
        lead.contact.phoneNumber = "+13075551234";

      for (let cycle = 0; cycle < 3; cycle++) {
        random.mock.mockImplementation(() => (cycle % 2 === 0 ? 0.999999 : 0));
        const next = await start(world);
        await world.runTick();
        assert.equal(world.of("call.initiate").length, cycle);
        assert.equal(world.session().currentLeadId, null);
        await world.agentSessionService.activateAfterEvents(
          next.id,
          next.startedAt,
        );
        // Two API polls cannot turn a random fallback into duplicate dials.
        await Promise.all([
          world.orchestrator.tick(),
          world.orchestrator.tick(),
        ]);
        const dials = world.of("call.initiate");
        assert.equal(dials.length, cycle + 1);
        assert.equal(
          dials[cycle].data.callerIdNumber,
          callerIds[cycle % 2 === 0 ? 1 : 0].phoneNumber,
        );
        assert.equal(dials[cycle].data.dialToken, "dial-token");
        assert.equal(
          dials[cycle].data.sessionStartedAt,
          next.startedAt.toISOString(),
        );
        assert.equal(world.session().status, "dialing");
        assert.equal(world.of("call.blocked").length, 0);

        // Provider callbacks and disposition use the real attempt lifecycle.
        const attempt = world.attempts.get(dials[cycle].data.attemptId)!;
        const call = {
          id: `call-${cycle}`,
          userId: "user-1",
          answeredAt: null,
          endedAt: null,
          hangupCause: null,
        };
        await world.callAttemptService.handleWebhookEvent(
          attempt.id,
          "call.initiated",
          call,
        );
        await world.callAttemptService.handleWebhookEvent(
          attempt.id,
          "call.hangup",
          { ...call, endedAt: new Date() },
        );
        await world.callAttemptService.submitDisposition({
          callAttemptId: attempt.id,
          disposition: {
            id: "not-interested",
            campaignId: null,
            organizationId: "org-1",
            code: "not_interested",
            canonicalOutcome: "not_interested",
            isActive: true,
          } as never,
          organizationId: "org-1",
          campaignDefaults: { maxAttempts: 3, retryDelayMin: 60 },
        });
        await world.agentSessionService.endSession(next.id, next.startedAt);
        assert.equal(world.session().status, "offline");
        assert.ok([...world.leads.values()].every((l) => l.lockedBy === null));
      }
      assert.equal(
        new Set(world.of("call.initiate").map((e) => e.data.attemptId)).size,
        3,
      );
    });

    it("pauses with an actionable caller-ID error, releases reservations without deferring leads, and recovers on resume", async () => {
      const world = createWorld({ callerIds });
      for (const m of world.callerPool) m.rotationStatus = "disabled";
      await world.runTick();
      assert.equal(world.session().status, "paused");
      assert.equal(world.session().currentLeadId, null);
      assert.equal(world.attempts.size, 0);
      assert.equal(world.lead("lead-1").lockedBy, null);
      assert.equal(world.lead("lead-1").nextCallAt, null);
      assert.ok(world.leaseReleases.includes("campaign-agent:session-1"));
      assert.match(world.of("call.blocked")[0].data.message, /resume/i);
      world.callerPool[0].rotationStatus = "active";
      await world.agentSessionService.resume(
        "session-1",
        world.session().startedAt,
      );
      await world.runTick();
      assert.equal(world.of("call.initiate").length, 1);
    });

    it("reports an empty configured pool without leaving the session waiting or holding a lead", async () => {
      const world = createWorld({ callerIds: [] });
      await world.runTick();
      assert.equal(world.session().status, "paused");
      assert.equal(world.attempts.size, 0);
      assert.equal(world.lead("lead-1").lockedBy, null);
      assert.equal(world.lead("lead-1").nextCallAt, null);
      assert.match(world.of("call.blocked")[0].data.message, /configured/i);
    });
  });
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
    it("confirms a dispatch cleanup only after the lead unlock succeeds", async () => {
      for (const fails of [false, true]) {
        const world = createWorld();
        world.credit.getBalance = async () => {
          throw new Error("lookup failed");
        };
        const unlock = world.leadRepo.releaseLock;
        world.leadRepo.releaseLock = async (...args) => {
          assert.equal(world.of("call.blocked").length, 0);
          if (fails) throw new Error("unlock failed");
          return unlock(...args);
        };
        await world.runTick();
        const message = world.of("call.blocked")[0].data.message as string;
        assert.equal(message.includes("released safely"), !fails);
        assert.equal(message.includes("could not be prepared"), true);
      }
    });

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

    it("hands the lead back and retries after the cooldown when the balance cannot be read", async () => {
      const world = createWorld();
      world.credit.getBalance = async () => {
        throw new Error("database unavailable");
      };

      await world.runTick();

      // A failed lookup is not an empty balance. It is reported as a dispatch
      // failure and the assignment is released, rather than pausing for credit.
      assert.equal(world.of("call.initiate").length, 0);
      assert.equal(world.of("call.blocked")[0].data.reason, "DISPATCH_FAILED");
      assert.equal(world.attempts.size, 0);
      assert.equal(world.session().status, "ready");
      assert.equal(world.session().currentLeadId, null);
      assert.equal(world.lead("lead-1").status, "queued");

      world.credit.getBalance = async () => world.credit.balance;
      await world.runTick();
      assert.equal(world.of("call.initiate").length, 0);
      world.endCooldowns();
      await world.runTick();
      assert.equal(world.of("call.initiate").length, 1);
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

  describe("a campaign on the workspace's own carrier", () => {
    it("pre-dials the lead through the carrier and hands the browser its route", async () => {
      const world = createWorld();
      world.campaign.externalNumberId = "external-1";

      await world.runTick();

      const attempt = [...world.attempts.values()][0];
      assert.equal(world.carrier.prepared.length, 1);
      assert.deepEqual(world.carrier.prepared[0], {
        ctx: { userId: "user-1", organizationId: "org-1" },
        numberId: "external-1",
        destination: world.lead("lead-1").contact.phoneNumber,
        callAttemptId: attempt.id,
      });
      // The PBX presents its own caller ID: rotation is never consulted.
      assert.equal(world.rotation.selections, 0);
      const [dial] = world.of("call.initiate");
      assert.equal(dial.data.attemptId, attempt.id);
      assert.equal(dial.data.callerIdNumber, "+34910000000");
      assert.deepEqual(dial.data.carrierRoute, {
        destinationUri: "sip:rco-key@ringee.sip.telnyx.com",
        callToken: "token-1",
      });
      assert.equal(world.session().status, "dialing");
    });

    it("dials an ordinary campaign without a carrier route", async () => {
      const world = createWorld();

      await world.runTick();

      assert.equal(world.carrier.prepared.length, 0);
      const [dial] = world.of("call.initiate");
      assert.equal(dial.data.callerIdNumber, "+12125559999");
      assert.equal("carrierRoute" in dial.data, false);
    });

    it("pauses, and hands everything back, when the carrier is not available", async () => {
      const world = createWorld();
      world.campaign.externalNumberId = "external-1";
      world.carrier.error = new ConflictException("not registered");

      await world.runTick();
      await world.runTick();

      assert.equal(world.of("call.initiate").length, 0);
      assert.equal(world.attempts.size, 0);
      assert.equal(world.session().status, "paused");
      assert.equal(world.session().currentLeadId, null);
      assert.equal(world.lead("lead-1").status, "queued");
      assert.ok(world.leaseReleases.includes("campaign-agent:session-1"));
      const blocked = world.of("call.blocked");
      assert.equal(blocked.length, 1);
      assert.equal(blocked[0].data.reason, "CARRIER_UNAVAILABLE");
      // The provider's own words never reach the agent.
      assert.doesNotMatch(blocked[0].data.message, /not registered/);
    });

    it("moves a lead the carrier cannot dial behind the queue and keeps going", async () => {
      const world = createWorld();
      world.campaign.externalNumberId = "external-1";
      world.carrier.error = new BadRequestException("invalid number");

      await world.runTick();

      assert.equal(
        world.of("call.blocked")[0].data.reason,
        "INVALID_DESTINATION",
      );
      assert.equal(world.session().status, "ready");
      assert.equal(world.attempts.size, 0);
      assert.ok(world.lead("lead-1").nextCallAt);

      world.carrier.error = null;
      world.endCooldowns();
      await world.runTick();
      assert.equal(
        world.of("call.initiate")[0].data.phoneNumber,
        "+12125550002",
      );
    });

    it("closes the pre-dial when the browser could not place it", async () => {
      const world = createWorld();
      world.campaign.externalNumberId = "external-1";
      await world.runTick();
      const attempt = [...world.attempts.values()][0];

      const result = await world.orchestrator.abandonDial(
        { userId: "user-1", organizationId: "org-1" },
        "session-1",
        attempt.id,
        "line_not_connected",
        "token-1",
      );

      assert.deepEqual(result, { released: true });
      assert.deepEqual(world.carrier.abandoned, ["token-1"]);
      assert.equal(world.session().status, "paused");
    });

    it("pre-dials a preview lead when the agent presses Dial", async () => {
      const world = createWorld({ dialerMode: "preview" });
      world.campaign.externalNumberId = "external-1";
      await world.runTick();
      assert.equal(world.carrier.prepared.length, 0);

      await world.orchestrator.manualDial(
        { userId: "user-1", organizationId: "org-1" },
        "session-1",
        "campaign-1",
      );

      const attempt = [...world.attempts.values()][0];
      assert.equal(world.carrier.prepared[0].callAttemptId, attempt.id);
      assert.equal(
        world.of("call.initiate")[0].data.carrierRoute.callToken,
        "token-1",
      );
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

  /** A workspace disposition of the campaign's organization. */
  const notInterested = {
    id: "disposition-1",
    campaignId: null,
    userId: "user-1",
    organizationId: "org-1",
    code: "not_interested",
    label: "Not interested",
    description: null,
    category: "negative",
    canonicalOutcome: "not_interested",
    color: null,
    sortOrder: 0,
    triggersCompletion: false,
    triggersDnc: false,
    triggersCallback: false,
    triggersRetry: false,
    isActive: true,
    isSystem: true,
    isDefault: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as const;

  const dispose = (
    world: ReturnType<typeof createWorld>,
    attemptId: string,
    closeSession = false,
  ) =>
    world.callAttemptService.submitDisposition({
      callAttemptId: attemptId,
      disposition: notInterested as never,
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

  it("releases a completed call's lead when its expired session cannot prompt for disposition", async () => {
    const { world, attemptId } = await dialedAndAnswered();
    world.session().lastHeartbeat = new Date(Date.now() - 60_000);
    await world.agentSessionService.cleanupStaleSessions();
    assert.equal(world.session().status, "offline");
    assert.equal(
      world.lead("lead-1").lockedBy,
      "session-1",
      "the live call keeps its lead",
    );
    const beforeHangup = Date.now();
    await hangup(world, attemptId);
    const afterHangup = Date.now();
    await hangup(world, attemptId);
    assert.equal(world.session().status, "offline");
    assert.equal(world.session().currentLeadId, null);
    assert.equal(world.lead("lead-1").status, "queued");
    assert.equal(world.lead("lead-1").attempts, 1);
    const retryAt = world.lead("lead-1").nextCallAt!.getTime();
    const delay = world.campaign.retryDelayMin * 60_000;
    assert.ok(
      retryAt >= beforeHangup + delay && retryAt <= afterHangup + delay,
    );
    assert.equal(world.session().totalTalkSec, 42);
    assert.equal(world.of("disposition.required").length, 0);
  });

  it("releases the lead when stale cleanup wins between hangup and the wrap-up transition", async () => {
    const { world, attemptId } = await dialedAndAnswered();
    world.session().lastHeartbeat = new Date(Date.now() - 60_000);
    const transition = world.sessionRepo.transitionIf;
    world.sessionRepo.transitionIf = async (...args) => {
      if (args[2] === "wrap_up")
        await world.agentSessionService.cleanupStaleSessions();
      return transition(...args);
    };
    await hangup(world, attemptId);
    assert.equal(world.session().status, "offline");
    assert.equal(world.session().currentLeadId, null);
    assert.equal(world.lead("lead-1").lockedBy, null);
    assert.equal(world.lead("lead-1").status, "queued");
  });

  it("waits for the persisted hangup count before exhausting a disconnected lead", async () => {
    const { world, attemptId } = await dialedAndAnswered();
    world.lead("lead-1").attempts = 2;
    world.attempts.get(attemptId)!.attemptNumber = 3;
    world.session().lastHeartbeat = new Date(Date.now() - 60_000);
    await world.agentSessionService.cleanupStaleSessions();
    assert.equal(world.lead("lead-1").lockedBy, "session-1");
    assert.equal(world.lead("lead-1").attempts, 2);
    await hangup(world, attemptId);
    assert.equal(world.lead("lead-1").attempts, 3);
    assert.equal(world.lead("lead-1").status, "exhausted");
    assert.equal(world.lead("lead-1").lockedBy, null);
    assert.equal(world.session().currentLeadId, null);
  });

  it("recomputes disconnected retry policy when the persisted count changes before cleanup commits", async () => {
    const { world, attemptId } = await dialedAndAnswered();
    world.lead("lead-1").attempts = 1;
    world.session().lastHeartbeat = new Date(Date.now() - 60_000);
    await world.agentSessionService.cleanupStaleSessions();
    const end = world.sessionRepo.endIfUnchanged;
    let raced = false;
    world.sessionRepo.endIfUnchanged = async (...args) => {
      if (args[2]?.assignmentRetry && !raced) {
        raced = true;
        world.lead("lead-1").attempts = 3;
      }
      return end(...args);
    };
    await hangup(world, attemptId);
    assert.equal(raced, true);
    assert.equal(world.lead("lead-1").status, "exhausted");
    assert.equal(world.session().currentLeadId, null);
  });

  it("retries disconnected assignment cleanup after a transient policy read failure", async () => {
    const { world, attemptId } = await dialedAndAnswered();
    await hangup(world, attemptId);
    world.session().lastHeartbeat = new Date(Date.now() - 60_000);
    const find = world.leadRepo.findByIdWithContact;
    let failed = false;
    world.leadRepo.findByIdWithContact = async (id) => {
      if (!failed) {
        failed = true;
        throw new Error("temporary policy read failure");
      }
      return find(id);
    };
    await assert.rejects(
      world.agentSessionService.cleanupStaleSessions(),
      /temporary policy read failure/,
    );
    assert.equal(world.session().status, "offline");
    assert.equal(world.session().currentLeadId, "lead-1");
    assert.equal(await world.agentSessionService.cleanupStaleSessions(), 1);
    assert.equal(world.session().currentLeadId, null);
    assert.equal(world.lead("lead-1").status, "queued");
  });

  it("settles a disconnected completed assignment before replacing its session", async () => {
    for (const count of [1, 3]) {
      const { world, attemptId } = await dialedAndAnswered();
      world.lead("lead-1").attempts = count - 1;
      world.attempts.get(attemptId)!.attemptNumber = count;
      world.session().lastHeartbeat = new Date(Date.now() - 60_000);
      await world.agentSessionService.cleanupStaleSessions();
      await world.attemptRepo.markEndedIf(attemptId, { callId: "call-1" });
      const before = Date.now();
      const replacement = await world.agentSessionService.startSession({
        campaignId: "campaign-1",
        userId: "user-1",
        organizationId: "org-1",
        waitForEvents: true,
      });
      assert.equal(
        world.session().startedAt.getTime(),
        replacement.startedAt.getTime(),
      );
      assert.equal(world.session().currentLeadId, null);
      assert.equal(
        world.lead("lead-1").status,
        count === 3 ? "exhausted" : "queued",
      );
      if (count < 3)
        assert.ok(
          world.lead("lead-1").nextCallAt!.getTime() >=
            before + world.campaign.retryDelayMin * 60_000,
        );
    }
  });

  it("resumes a paused wrap-up on the same lead until its outcome is recorded", async () => {
    const { world, attemptId } = await dialedAndAnswered();
    await hangup(world, attemptId);
    await world.agentSessionService.pause("session-1");
    await world.agentSessionService.pause("session-1");
    await world.agentSessionService.resume("session-1");
    await world.agentSessionService.resume("session-1");
    await world.runTick();
    assert.equal(world.session().status, "wrap_up");
    assert.equal(world.of("call.initiate").length, 1);
    await dispose(world, attemptId);
    await world.runTick();
    assert.equal(world.of("call.initiate").length, 2);
  });

  it("does not let a late disposition close a replacement session", async () => {
    const { world, attemptId } = await dialedAndAnswered();
    await hangup(world, attemptId);
    await world.agentSessionService.endSession("session-1");
    world.lead("lead-1").nextCallAt = new Date(Date.now() + 60_000);
    const next = await world.agentSessionService.startSession({
      campaignId: "campaign-1",
      userId: "user-1",
      organizationId: "org-1",
      waitForEvents: true,
    });
    const result = await dispose(world, attemptId, true);
    assert.equal(result.sessionClosed, false);
    assert.equal(world.session().endedAt, null);
    await world.agentSessionService.activateAfterEvents(
      next.id,
      next.startedAt,
    );
    await world.runTick();
    assert.equal(world.session().currentLeadId, "lead-2");
  });

  it("settles a late hangup without moving or charging talk time to the next incarnation", async () => {
    const { world, attemptId } = await dialedAndAnswered();
    await dispose(world, attemptId);
    await world.agentSessionService.endSession("session-1");
    const next = await world.agentSessionService.startSession({
      campaignId: "campaign-1",
      userId: "user-1",
      organizationId: "org-1",
      waitForEvents: true,
    });
    await hangup(world, attemptId);
    assert.equal(world.attempts.get(attemptId)!.durationSec, 42);
    assert.equal(world.session().callsAttempted, 0);
    assert.equal(world.session().totalTalkSec, 0);
    assert.equal(world.session().startedAt.getTime(), next.startedAt.getTime());
    assert.equal(world.session().status, "offline");
  });

  for (const mode of ["rotated", "disabled"]) {
    it(`dials eligible leads through repeated stop/start cycles with caller ID ${mode}`, async () => {
      const world = createWorld({ leads: 8 });
      world.session().status = "offline";
      world.rotation.reason = mode;
      world.rotation.enabled = mode !== "disabled";
      for (let cycle = 0; cycle < 3; cycle++) {
        const session = await world.agentSessionService.startSession({
          campaignId: "campaign-1",
          userId: "user-1",
          organizationId: "org-1",
          waitForEvents: true,
        });
        await world.runTick();
        assert.equal(
          world.session().currentLeadId,
          null,
          "no lead can be sent before its event stream is attached",
        );
        await world.agentSessionService.activateAfterEvents(
          session.id,
          session.startedAt,
        );
        for (let n = 0; n < 2; n++) {
          const before = world.of("call.initiate").length;
          await world.runTick();
          assert.equal(world.of("call.initiate").length, before + 1);
          const attemptId = world.of("call.initiate").at(-1)!.data.attemptId;
          assert.equal(
            world.of("call.initiate").at(-1)!.data.callerIdNumber,
            mode === "disabled" ? "+12125559998" : "+12125559999",
          );
          await world.callAttemptService.handleWebhookEvent(
            attemptId,
            "call.initiated",
            call(),
          );
          await world.callAttemptService.handleWebhookEvent(
            attemptId,
            "call.answered",
            call(),
          );
          await hangup(world, attemptId);
          await dispose(world, attemptId);
        }
        await world.agentSessionService.endSession(
          session.id,
          session.startedAt,
        );
        await world.agentSessionService.endSession(
          session.id,
          session.startedAt,
        );
        assert.equal(world.session().status, "offline");
        assert.ok([...world.leads.values()].every((l) => !l.lockedBy));
      }
      assert.equal(world.of("call.initiate").length, 6);
      assert.equal(
        new Set(world.of("call.initiate").map((e) => e.data.attemptId)).size,
        6,
      );
      assert.equal(
        [...world.leads.values()].filter((l) => l.status === "queued").length,
        2,
      );
    });
  }

  it("refuses to end a live call and retains its lead even when the heartbeat is stale", async () => {
    const { world, attemptId } = await dialedAndAnswered();
    await assert.rejects(
      world.agentSessionService.endSession("session-1"),
      /active call/,
    );
    world.session().lastHeartbeat = new Date(Date.now() - 60_000);
    assert.equal(await world.agentSessionService.cleanupStaleSessions(), 1);
    assert.equal(world.session().status, "offline");
    assert.equal(world.lead("lead-1").lockedBy, "session-1");
    await assert.rejects(
      world.agentSessionService.startSession({
        campaignId: "campaign-1",
        userId: "user-1",
        organizationId: "org-1",
      }),
      /on a call/,
    );
    await hangup(world, attemptId);
    await world.agentSessionService.startSession({
      campaignId: "campaign-1",
      userId: "user-1",
      organizationId: "org-1",
    });
    await world.runTick();
    assert.equal(world.session().status, "dialing");
  });

  it("rejects invalid callback dates before accepting any callback-triggering outcome", async () => {
    for (const outcome of ["interested", "follow_up", "callback_scheduled"]) {
      const { world, attemptId } = await dialedAndAnswered();
      await hangup(world, attemptId);
      await assert.rejects(
        world.callAttemptService.submitDisposition({
          callAttemptId: attemptId,
          disposition: {
            ...notInterested,
            code: outcome,
            canonicalOutcome: outcome,
            triggersCallback: true,
          } as never,
          callback: { scheduledAt: new Date(NaN) },
          campaignDefaults: { maxAttempts: 3, retryDelayMin: 60 },
          organizationId: "org-1",
        }),
        BadRequestException,
      );
      assert.deepEqual(world.outcomeWrites, []);
      assert.equal(world.attempts.get(attemptId)!.status, "ended");
    }
  });
  it("makes a stop request DNC even when the disposition would otherwise schedule or complete", async () => {
    const { world, attemptId } = await dialedAndAnswered();
    await hangup(world, attemptId);
    const result = await world.callAttemptService.submitDisposition({
      callAttemptId: attemptId,
      disposition: {
        ...notInterested,
        code: "interested",
        canonicalOutcome: "interested",
        triggersCallback: true,
        triggersCompletion: true,
      } as never,
      callback: { scheduledAt: new Date(Date.now() + 86400000) },
      stopRequested: true,
      campaignDefaults: { maxAttempts: 3, retryDelayMin: 60 },
      organizationId: "org-1",
    });
    assert.equal(result.action, "dnc");
    assert.equal(world.lead("lead-1").status, "dnc");
    assert.equal(
      world.dncWrites.length,
      0,
      "accepted outcome owns the DNC write",
    );
  });

  it("persists a stop request when there is no linked call or canonical outcome", async () => {
    for (const without of ["call", "outcome"]) {
      const { world, attemptId } = await dialedAndAnswered();
      await hangup(world, attemptId);
      if (without === "call") world.attempts.get(attemptId)!.callId = null;
      const result = await world.callAttemptService.submitDisposition({
        callAttemptId: attemptId,
        disposition: {
          ...notInterested,
          ...(without === "outcome"
            ? { code: "custom_result", canonicalOutcome: null }
            : {}),
          triggersCompletion: true,
        } as never,
        stopRequested: true,
        campaignDefaults: { maxAttempts: 3, retryDelayMin: 60 },
        organizationId: "org-1",
      });
      assert.equal(result.action, "dnc");
      assert.equal(world.lead("lead-1").status, "dnc");
      assert.deepEqual(world.dncWrites, [
        {
          phoneNumber: world.lead("lead-1").contact.phoneNumber,
          userId: "user-1",
          organizationId: "org-1",
          reason: "Disposition: Not interested",
          source: "disposition",
          addedByUserId: "user-1",
        },
      ]);
    }
  });

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

  it("records a workspace disposition's canonical outcome on the call and the attempt", async () => {
    const { world, attemptId } = await dialedAndAnswered();
    await hangup(world, attemptId);
    const demoBooked = {
      ...notInterested,
      id: "disposition-demo",
      code: "demo_booked",
      label: "Demo booked",
      category: "positive",
      canonicalOutcome: "meeting_booked",
      triggersCompletion: true,
    };

    const result = await world.callAttemptService.submitDisposition({
      callAttemptId: attemptId,
      disposition: demoBooked as never,
      note: "Friday 10am",
      campaignDefaults: { maxAttempts: 3, retryDelayMin: 60 },
      organizationId: "org-1",
    });

    assert.equal(result.action, "completed");
    const stored = world.attempts.get(attemptId)!;
    assert.equal(stored.dispositionCode, "demo_booked");
    assert.equal(stored.dispositionOutcome, "meeting_booked");
    assert.deepEqual(world.outcomeWrites, [
      [
        "recordOutcome",
        "call-1",
        "meeting_booked",
        "Friday 10am",
        { id: "disposition-demo", name: "Demo booked" },
      ],
    ]);
  });

  it("records a custom-code campaign disposition without inventing an outcome", async () => {
    const { world, attemptId } = await dialedAndAnswered();
    await hangup(world, attemptId);
    const busy = {
      ...notInterested,
      id: "legacy-busy",
      campaignId: "campaign-1",
      organizationId: null,
      userId: null,
      code: "busy",
      label: "Busy",
      canonicalOutcome: null,
    };

    await world.callAttemptService.submitDisposition({
      callAttemptId: attemptId,
      disposition: busy as never,
      campaignDefaults: { maxAttempts: 3, retryDelayMin: 60 },
      organizationId: "org-1",
    });

    assert.equal(world.attempts.get(attemptId)!.dispositionOutcome, null);
    assert.deepEqual(world.outcomeWrites, [
      [
        "recordDispositionWithoutOutcome",
        "call-1",
        { id: "legacy-busy", name: "Busy" },
        undefined,
      ],
    ]);
  });

  it("refuses another organization's disposition and leaves the lead as it was", async () => {
    const { world, attemptId } = await dialedAndAnswered();
    await hangup(world, attemptId);

    await assert.rejects(
      world.callAttemptService.submitDisposition({
        callAttemptId: attemptId,
        disposition: { ...notInterested, organizationId: "org-2" } as never,
        campaignDefaults: { maxAttempts: 3, retryDelayMin: 60 },
        organizationId: "org-1",
      }),
      ForbiddenException,
    );
    assert.equal(world.attempts.get(attemptId)!.status, "ended");
    assert.equal(world.lead("lead-1").status, "wrap_up");
    assert.deepEqual(world.outcomeWrites, []);
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
  it("does not attribute late metrics or close requests to a replacement using dispatch time", async () => {
    const { world, attemptId } = await dialedAndAnswered();
    await hangup(world, attemptId);
    const next = await world.agentSessionService.startSession({
      campaignId: "campaign-1",
      userId: "user-1",
      organizationId: "org-1",
      waitForEvents: true,
    });
    await world.agentSessionService.activateAfterEvents(
      next.id,
      next.startedAt,
    );
    world.attempts.get(attemptId)!.initiatedAt = new Date(Date.now() + 100_000);
    world.attempts.get(attemptId)!.durationSec = null;
    await world.callAttemptService.handleWebhookEvent(
      attemptId,
      "call.hangup",
      call({ answeredAt: new Date(Date.now() - 42_000), endedAt: new Date() }),
    );
    assert.equal(world.session().totalTalkSec, 0);
    const result = await dispose(world, attemptId, true);
    assert.equal(result.sessionClosed, false);
    assert.equal(world.session().status, "ready");
  });
});

describe("AgentSessionService.startSession", () => {
  const start = (world: ReturnType<typeof createWorld>) =>
    world.agentSessionService.startSession({
      campaignId: "campaign-1",
      userId: "user-1",
      organizationId: "org-1",
      waitForEvents: true,
    });

  it(
    "ends an activation that commits after its stream has disconnected",
    { timeout: 5_000 },
    async () => {
      for (const dispatchBeforeCommitReturns of [false, true]) {
        const world = createWorld();
        const pending = await start(world);
        let attached = true;
        let written!: () => void;
        let release!: () => void;
        const readyWritten = new Promise<void>((resolve) => {
          written = resolve;
        });
        const commit = new Promise<void>((resolve) => {
          release = resolve;
        });
        const transition = world.sessionRepo.transitionIf;
        world.sessionRepo.transitionIf = async (...args) => {
          const moved = await transition(...args);
          if (args[2] === "ready") {
            written();
            await commit;
          }
          return moved;
        };
        const activating = world.agentSessionService.activateAfterEvents(
          pending.id,
          pending.startedAt,
          () => attached,
        );
        try {
          await within(
            Promise.race([
              readyWritten,
              activating.then(() => {
                throw new Error(
                  "Activation settled before readiness was written",
                );
              }),
            ]),
          );
          attached = false;
          if (dispatchBeforeCommitReturns) await world.runTick();
          release();
          await within(activating);
          assert.equal(world.session().status, "offline");
          assert.ok(world.session().endedAt);
          assert.equal(
            world.session().currentLeadId,
            dispatchBeforeCommitReturns ? "lead-1" : null,
          );
        } finally {
          release();
          await within(activating);
        }
      }
    },
  );

  it("does not activate a stream that closes before the readiness write", async (t) => {
    const world = createWorld();
    const pending = await start(world);
    const attached = false;
    const successfulReadyWhileDetached: boolean[] = [];
    const transition = world.sessionRepo.transitionIf;
    t.mock.method(
      world.sessionRepo,
      "transitionIf",
      async (...args: Parameters<typeof transition>) => {
        const moved = await transition(...args);
        if (moved && args[2] === "ready")
          successfulReadyWhileDetached.push(!attached);
        return moved;
      },
    );
    await world.agentSessionService.activateAfterEvents(
      pending.id,
      pending.startedAt,
      () => attached,
    );
    assert.deepEqual(successfulReadyWhileDetached, []);
    assert.equal(world.session().status, "offline");
  });

  it(
    "leaves a still-served incarnation running after losing stream setup ownership",
    { timeout: 3_000 },
    async () => {
      const world = createWorld();
      const pending = await start(world);
      let attached = true;
      let owned = true;
      let written!: () => void;
      let release!: () => void;
      const ready = new Promise<void>((resolve) => {
        written = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const transition = world.sessionRepo.transitionIf;
      world.sessionRepo.transitionIf = async (...args) => {
        const moved = await transition(...args);
        if (moved && args[2] === "ready") {
          written();
          await gate;
        }
        return moved;
      };
      const activating = world.agentSessionService.activateAfterEvents(
        pending.id,
        pending.startedAt,
        () => attached,
        async () => owned,
      );
      try {
        await within(
          Promise.race([
            ready,
            activating.then(() => {
              throw new Error("Activation settled before readiness");
            }),
          ]),
        );
        attached = false;
        owned = false;
        release();
        await within(activating);
        assert.equal(world.session().status, "ready");
        assert.equal(world.session().endedAt, null);
      } finally {
        release();
        await within(activating);
      }
    },
  );

  it("keeps a provider leg's assignment when it links before timeout cancellation", async () => {
    const world = createWorld();
    await world.runTick();
    const attempt = [...world.attempts.values()][0];
    attempt.initiatedAt = new Date(Date.now() - 100_000);
    const transition = world.sessionRepo.transitionIf;
    world.sessionRepo.transitionIf = async (...args) => {
      if (args[1].undialedAttemptId)
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
      return transition(...args);
    };
    const releases = world.leaseReleases.length;
    world.forceStalledSweep();
    await world.runTick();
    assert.equal(world.session().status, "dialing");
    assert.equal(world.session().currentLeadId, "lead-1");
    assert.equal(world.lead("lead-1").lockedBy, "session-1");
    assert.equal(world.attempts.get(attempt.id)!.callId, "call-1");
    assert.equal(world.leaseReleases.length, releases);
  });

  it("fences disconnect compensation when a successor attaches after lease renewal", async () => {
    const world = createWorld();
    const pending = await start(world);
    let attached = true;
    const transition = world.sessionRepo.transitionIf;
    world.sessionRepo.transitionIf = async (...args) => {
      const moved = await transition(...args);
      if (moved && args[2] === "ready") attached = false;
      return moved;
    };
    const end = world.sessionRepo.endIfUnchanged;
    let successors = 0;
    world.sessionRepo.endIfUnchanged = async (...args) => {
      successors++;
      const successor = await world.agentSessionService.claimEventStreamSetup(
        pending.id,
        pending.startedAt,
      );
      try {
        return await end(...args);
      } finally {
        await successor.release();
      }
    };
    await world.agentSessionService.activateAfterEvents(
      pending.id,
      pending.startedAt,
      () => attached,
    );
    assert.equal(successors, 1);
    assert.equal(world.session().status, "ready");
    assert.equal(world.session().endedAt, null);
  });

  it("fences a delayed timeout release from a restarted session's replacement lead lock", async () => {
    for (const reserved of [false, true]) {
      const world = createWorld({
        leads: 1,
        dialerMode: reserved ? "preview" : "progressive",
      });
      await world.runTick();
      world.campaign.dialerMode = "progressive";
      if (reserved) world.session().reservedAt = new Date(Date.now() - 100_000);
      else
        [...world.attempts.values()][0].initiatedAt = new Date(
          Date.now() - 100_000,
        );
      const originalLock = world.lead("lead-1").lockedAt!;
      const release = world.leadRepo.releaseLock;
      world.leadRepo.releaseLock = async (...args) => {
        const replacement = await world.agentSessionService.startSession({
          campaignId: "campaign-1",
          userId: "user-1",
          organizationId: "org-1",
        });
        const lead = await world.leadRepo.lockNextLead(
          "campaign-1",
          "session-1",
          3,
        );
        assert.ok(lead);
        world.lead("lead-1").lockedAt = new Date(originalLock.getTime() + 1);
        assert.ok(
          await world.agentSessionService.claimForLead(
            "session-1",
            lead.id,
            replacement.startedAt,
          ),
        );
        return release(...args);
      };
      world.forceStalledSweep();
      await world.runTick();
      assert.equal(world.session().status, "reserved");
      assert.equal(world.lead("lead-1").lockedBy, "session-1");
      assert.ok(world.lead("lead-1").lockedAt! > originalLock);
    }
  });

  it("keeps a reservation when an undialed attempt appears after the sweep observed none", async () => {
    const world = createWorld({ dialerMode: "preview" });
    await world.runTick();
    world.attempts.clear();
    world.campaign.dialerMode = "progressive";
    world.session().reservedAt = new Date(Date.now() - 100_000);
    const find = world.attemptRepo.findUndialedForSession;
    world.attemptRepo.findUndialedForSession = async (...args) => {
      const observed = await find(...args);
      await world.callAttemptService.createAttempt({
        campaignId: "campaign-1",
        campaignLeadId: "lead-1",
        agentSessionId: "session-1",
        agentUserId: "user-1",
        sessionStartedAt: world.session().startedAt,
        attemptNumber: 1,
      });
      return observed;
    };
    world.forceStalledSweep();
    await world.runTick();
    assert.equal(world.session().status, "reserved");
    assert.equal(world.session().currentLeadId, "lead-1");
    assert.equal(world.lead("lead-1").lockedBy, "session-1");
    assert.equal(world.attempts.size, 1);
  });

  it("keeps a restored account's session and stops account-disable retries", async () => {
    const world = createWorld();
    world.user.canCall = false;
    const end = world.sessionRepo.endForAccountDisable;
    let calls = 0;
    world.sessionRepo.endForAccountDisable = async (...args) => {
      calls++;
      world.user.canCall = true;
      return end(...args);
    };
    assert.equal(await world.agentSessionService.disableForUser("user-1"), 0);
    assert.equal(calls, 1);
    assert.equal(world.session().status, "ready");
    assert.equal(
      world
        .of("session.state")
        .filter((e) => e.data.reason === "account_disabled").length,
      0,
    );
  });

  it("rechecks explicit-stop live legs even when an unconfirmed dispatch was observed", async () => {
    const world = createWorld();
    await world.runTick();
    const attempt = [...world.attempts.values()][0];
    const end = world.sessionRepo.endIfUnchanged;
    const preservation: boolean[] = [];
    world.sessionRepo.endIfUnchanged = async (...args) => {
      preservation.push(args[1] === true);
      attempt.callId = "call-1";
      return end(...args);
    };
    await assert.rejects(
      world.agentSessionService.endSession("session-1"),
      ConflictException,
    );
    assert.equal(preservation[0], true);
    assert.equal(world.session().status, "dialing");
    assert.equal(world.session().currentLeadId, "lead-1");
    assert.equal(world.lead("lead-1").lockedBy, "session-1");
    assert.equal(world.attempts.get(attempt.id)!.callId, "call-1");
  });

  it("does not time out a newer dialing reservation for the same lead", async () => {
    const world = createWorld();
    await world.runTick();
    const attempt = [...world.attempts.values()][0];
    attempt.initiatedAt = new Date(Date.now() - 100_000);
    const originalReservedAt = world.session().reservedAt!.getTime();
    const find = world.attemptRepo.findUndialedForSession;
    world.attemptRepo.findUndialedForSession = async (...args) => {
      world.session().reservedAt = new Date(
        world.session().reservedAt!.getTime() + 1,
      );
      return find(...args);
    };
    world.forceStalledSweep();
    await world.runTick();
    assert.ok(world.session().reservedAt!.getTime() > originalReservedAt);
    assert.equal(world.session().status, "dialing");
    assert.equal(world.lead("lead-1").lockedBy, "session-1");
    assert.equal(world.attempts.size, 1);
  });

  it("rechecks the live event relay before activating a pending session", async () => {
    const world = createWorld();
    const pending = await start(world);
    world.sseBridge.isRelayReady = async () => false;
    await assert.rejects(
      world.agentSessionService.activateAfterEvents(
        pending.id,
        pending.startedAt,
      ),
      /relay is unavailable/,
    );
    assert.equal(world.session().status, "offline");
    assert.equal(world.session().endedAt, null);
    await world.runTick();
    assert.equal(world.of("call.initiate").length, 0);
    assert.equal(world.session().currentLeadId, null);
  });

  it("fences delayed stops, heartbeats and poller claims from the previous incarnation", async () => {
    const world = createWorld();
    const old = await start(world);
    await world.agentSessionService.endSession(old.id, old.startedAt);
    const next = await start(world);
    await world.agentSessionService.activateAfterEvents(
      next.id,
      next.startedAt,
    );
    await world.agentSessionService.endSession(old.id, old.startedAt);
    await assert.rejects(
      world.agentSessionService.heartbeat(old.id, old.startedAt),
      /replaced/,
    );
    await assert.rejects(
      world.agentSessionService.pause(old.id, old.startedAt),
      /replaced/,
    );
    assert.equal(
      await world.agentSessionService.claimForLead(
        old.id,
        "lead-1",
        old.startedAt,
      ),
      false,
    );
    await world.runTick();
    assert.equal(world.of("call.initiate").length, 1);
    assert.equal(world.session().status, "dialing");
  });

  it("does not let a stale-session sweep terminate a newly heartbeating session", async () => {
    const world = createWorld();
    world.session().lastHeartbeat = new Date(Date.now() - 60_000);
    const stale = { ...world.session() };
    world.sessionRepo.findStale = async () => [stale];
    await world.agentSessionService.heartbeat(stale.id, stale.startedAt);
    assert.equal(await world.agentSessionService.cleanupStaleSessions(), 0);
    assert.equal(world.session().status, "ready");
  });

  it("retains an uncertain sent dial until reconciliation, including legacy missing currentLeadId", async () => {
    const world = createWorld();
    await world.runTick();
    const pending = [...world.attempts.values()][0];
    world.session().currentLeadId = null;
    await world.agentSessionService.endSession("session-1");
    assert.equal(world.lead("lead-1").lockedBy, "session-1");
    await assert.rejects(start(world), /on a call/);
    pending.initiatedAt = new Date(Date.now() - 100_000);
    const next = await start(world);
    assert.equal(world.attempts.size, 0);
    assert.equal(world.lead("lead-1").lockedBy, null);
    await world.agentSessionService.activateAfterEvents(
      next.id,
      next.startedAt,
    );
    await world.runTick();
    assert.equal(world.of("call.initiate").length, 2);
  });

  it("releases a reserved lead on stop and honors changed settings when restarted", async () => {
    const world = createWorld({ dialerMode: "preview" });
    world.rotation.enabled = false;
    await world.runTick();
    await world.agentSessionService.endSession("session-1");
    assert.equal(world.lead("lead-1").lockedBy, null);
    assert.equal(world.attempts.size, 0);
    world.campaign.dialerMode = "progressive";
    world.campaign.numberPurchasedId = "new-number";
    const next = await start(world);
    await world.agentSessionService.activateAfterEvents(
      next.id,
      next.startedAt,
    );
    await world.runTick();
    assert.equal(world.of("call.initiate").length, 1);
    assert.equal(
      world.of("call.initiate")[0].data.callerIdNumber,
      "+14155559998",
    );
  });

  it("recovers a progressive worker interrupted after reservation, with or without an attempt", async () => {
    for (const withAttempt of [false, true]) {
      const world = createWorld({ dialerMode: "preview" });
      await world.runTick();
      if (!withAttempt) world.attempts.clear();
      world.campaign.dialerMode = "progressive";
      world.session().reservedAt = new Date(Date.now() - 100_000);
      world.forceStalledSweep();
      await world.runTick();
      assert.equal(world.session().status, "paused");
      assert.equal(world.lead("lead-1").lockedBy, null);
      assert.equal(world.attempts.size, 0);
      await world.agentSessionService.resume("session-1");
      await world.agentSessionService.resume("session-1");
      await world.runTick();
      assert.equal(world.of("call.initiate").length, 1);
    }
  });

  it("does not recover a newer reservation for the same lead selected by an older sweep", async () => {
    const world = createWorld({ dialerMode: "preview" });
    await world.runTick();
    world.campaign.dialerMode = "progressive";
    world.session().reservedAt = new Date(Date.now() - 100_000);
    const find = world.attemptRepo.findUndialedForSession;
    world.attemptRepo.findUndialedForSession = async (...args) => {
      world.session().reservedAt = new Date();
      return find(...args);
    };
    world.forceStalledSweep();
    await world.runTick();
    assert.equal(world.session().status, "reserved");
    assert.equal(world.lead("lead-1").lockedBy, "session-1");
    assert.equal(world.attempts.size, 1);
  });

  it("ends pending and active disabled sessions despite heartbeat-only changes", async () => {
    for (const pending of [true, false]) {
      const world = createWorld();
      if (pending) await start(world);
      world.user.canCall = false;
      const end = world.sessionRepo.endForAccountDisable;
      world.sessionRepo.endForAccountDisable = async (...args) => {
        world.session().lastHeartbeat = new Date(
          world.session().lastHeartbeat.getTime() + 1,
        );
        return end(...args);
      };
      assert.equal(await world.agentSessionService.disableForUser("user-1"), 1);
      assert.equal(world.session().status, "offline");
      assert.ok(world.session().endedAt);
      await assert.rejects(
        world.agentSessionService.activateAfterEvents(
          "session-1",
          world.session().startedAt,
        ),
      );
      assert.equal(world.session().status, "offline");
    }
  });

  it("reloads a changed assignment and recomputes preservation during account disable", async () => {
    const world = createWorld({ dialerMode: "preview" });
    await world.runTick();
    const attempt = [...world.attempts.values()][0];
    world.user.canCall = false;
    const end = world.sessionRepo.endForAccountDisable;
    const decisions: boolean[] = [];
    world.sessionRepo.endForAccountDisable = async (previous, preserve) => {
      decisions.push(preserve);
      if (decisions.length === 1) {
        Object.assign(world.session(), {
          status: "dialing",
          currentLeadId: "lead-2",
          reservedAt: new Date(),
        });
        Object.assign(attempt, {
          campaignLeadId: "lead-2",
          status: "dialing",
          initiatedAt: new Date(),
        });
        Object.assign(world.lead("lead-2"), {
          status: "locked",
          lockedBy: "session-1",
        });
      }
      return end(previous, preserve);
    };
    await world.agentSessionService.disableForUser("user-1");
    assert.deepEqual(decisions, [false, true]);
    assert.equal(world.session().status, "offline");
    assert.equal(world.session().currentLeadId, "lead-2");
    assert.equal(world.lead("lead-2").lockedBy, "session-1");
  });

  it("keeps a refused old attempt from pausing a replacement even if dispatch time changed", async () => {
    const world = createWorld();
    await world.runTick();
    const old = { ...[...world.attempts.values()][0] };
    const claimedAt = old.sessionStartedAt;
    world.session().lastHeartbeat = new Date(Date.now() - 60_000);
    world.attempts.get(old.id)!.initiatedAt = new Date(Date.now() - 100_000);
    const next = await start(world);
    await world.agentSessionService.activateAfterEvents(
      next.id,
      next.startedAt,
    );
    await world.runTick();
    world.attemptRepo.findById = async () => ({
      ...old,
      initiatedAt: new Date(Date.now() + 100_000),
    });
    await world.callAttemptService.handleDialRefused(old.id, "user-1", {
      reason: "CALLING_DISABLED",
      message: "refused",
    });
    assert.equal(claimedAt!.getTime() < next.startedAt.getTime(), true);
    assert.equal(world.session().status, "dialing");
    assert.equal(world.lead("lead-1").lockedBy, "session-1");
  });

  it("throttles closed-hours lookups while refreshing waiting reasons for reconnects", async (t) => {
    const world = createWorld({ leads: 0 });
    let now = Date.now();
    t.mock.method(Date, "now", () => now);
    world.complianceService.isWithinCallingWindow = () => false;
    const find = t.mock.method(world.sessionRepo, "findReadyByCampaign");
    await world.runTick();
    await world.runTick();
    assert.equal(find.mock.callCount(), 1);
    assert.equal(world.of("session.waiting").length, 1);
    const next = await start(world);
    await world.agentSessionService.activateAfterEvents(
      next.id,
      next.startedAt,
    );
    now += 5_001;
    await world.runTick();
    assert.equal(find.mock.callCount(), 2);
    assert.equal(
      world.of("session.waiting").length,
      2,
      "a new incarnation receives its waiting reason",
    );
    now += 5_001;
    await world.runTick();
    assert.equal(
      world.of("session.waiting").length,
      2,
      "unchanged reasons remain suppressed",
    );
    now += 15_001;
    await world.runTick();
    assert.equal(
      world.of("session.waiting").length,
      3,
      "reconnecting streams receive a periodic refresh",
    );
  });

  it("preserves healthy preview reservations and reports when no eligible leads exist", async () => {
    const preview = createWorld({ dialerMode: "preview" });
    await preview.runTick();
    preview.session().reservedAt = new Date(Date.now() - 100_000);
    preview.forceStalledSweep();
    await preview.runTick();
    assert.equal(preview.session().status, "reserved");
    assert.equal(preview.lead("lead-1").lockedBy, "session-1");

    const empty = createWorld({ leads: 0 });
    const next = await start(empty);
    await empty.agentSessionService.activateAfterEvents(
      next.id,
      next.startedAt,
    );
    await empty.runTick();
    assert.equal(empty.of("call.initiate").length, 0);
    assert.equal(
      empty.of("session.waiting")[0].data.reason,
      "no_eligible_leads",
    );
  });

  it("does not dispatch a lead between starting and attaching the event stream", async () => {
    const world = createWorld();
    world.session().status = "offline";
    await world.agentSessionService.startSession({
      campaignId: "campaign-1",
      userId: "user-1",
      organizationId: "org-1",
      waitForEvents: true,
    } as Parameters<AgentSessionService["startSession"]>[0]);

    // The start HTTP response, ticket request and SSE connection can take any
    // amount of time. A tick in that interval must not consume the only copy
    // of lead.assigned/call.initiate before the browser can receive it.
    await world.runTick();
    assert.equal(world.of("call.initiate").length, 0);
    assert.equal(world.session().currentLeadId, null);
    assert.equal(world.lead("lead-1").status, "queued");
  });

  it("allows only one concurrent start to replace a session", async () => {
    const world = createWorld();
    const results = await Promise.allSettled(
      Array.from({ length: 3 }, () =>
        world.agentSessionService.startSession({
          campaignId: "campaign-1",
          userId: "user-1",
          organizationId: "org-1",
        }),
      ),
    );
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  });

  it("takes over a session left open in another tab, handing its lead back", async () => {
    const world = createWorld({ dialerMode: "preview" });
    await world.runTick();
    assert.equal(world.session().status, "reserved");
    world.events.length = 0;
    const oldStartedAt = world.session().startedAt.toISOString();

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
    assert.equal(offline.data.status, "offline");
    assert.equal(offline.data.reason, "taken_over");
    assert.equal(offline.data.sessionStartedAt, oldStartedAt);
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
