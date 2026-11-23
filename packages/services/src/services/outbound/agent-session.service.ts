import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  AgentSession,
  AgentSessionRepository,
  CallAttemptRepository,
  CampaignMemberRepository,
  OrganizationRepository,
  CampaignRepository,
  CampaignLeadRepository,
  AgentSessionStatus,
  DIAL_DISPATCH_TIMEOUT_MS,
} from "@ringee/database";
import { RedisService } from "@ringee/platform";
import { randomUUID } from "node:crypto";
import { UserService } from "../user.service";
import { SSEBridgeService } from "./sse-bridge.service";
const HEARTBEAT_STALE_MS = 30_000; // 30 seconds
const STREAM_SETUP_LEASE_SECONDS = 120;
export { DIAL_DISPATCH_TIMEOUT_MS };

@Injectable()
export class AgentSessionService {
  private readonly logger = new Logger(AgentSessionService.name);

  constructor(
    private readonly sessionRepo: AgentSessionRepository,
    private readonly userService: UserService,
    private readonly sseBridge: SSEBridgeService,
    private readonly attemptRepo: CallAttemptRepository,
    private readonly campaignMembers: CampaignMemberRepository,
    private readonly organizations: OrganizationRepository,
    private readonly redis: RedisService,
    private readonly campaigns: CampaignRepository,
    private readonly leads: CampaignLeadRepository,
  ) {}

  /** Reusable stream tickets must not admit overlapping setup/compensation. */
  async claimEventStreamSetup(
    sessionId: string,
    startedAt: Date,
    allowLegacyFallback = false,
  ) {
    const key = `dialer:stream-setup:${sessionId}:${startedAt.toISOString()}`;
    const token = randomUUID();
    let leased: boolean | null;
    try {
      leased = await this.redis.setIfAbsent(
        key,
        token,
        STREAM_SETUP_LEASE_SECONDS,
      );
    } catch (error) {
      const session = allowLegacyFallback
        ? await this.getSession(sessionId)
        : null;
      if (
        !session ||
        session.status === AgentSessionStatus.offline ||
        session.startedAt.getTime() !== startedAt.getTime()
      )
        throw error;
      leased = null;
    }
    if (leased === false)
      throw new ConflictException(
        "This dialer event stream is already connecting.",
      );
    const ownership = {
      renew: () =>
        leased
          ? this.redis.renewLease(key, token, STREAM_SETUP_LEASE_SECONDS)
          : Promise.resolve(false),
      release: () =>
        leased
          ? this.redis.compareAndSwap(key, token, null)
          : Promise.resolve(false),
    };
    try {
      const session = await this.sessionRepo.heartbeat(sessionId, startedAt);
      if (!session)
        throw new ConflictException("This dialer session has been replaced.");
      return { ...ownership, lastHeartbeat: session.lastHeartbeat };
    } catch (error) {
      await ownership.release().catch(() => false);
      throw error;
    }
  }

  async startSession(data: {
    campaignId: string;
    userId: string;
    organizationId: string;
    /** Opt-in for clients that wait for their SSE stream before dialing. */
    waitForEvents?: boolean;
  }) {
    await this.assertDialerEnabled(data.userId);

    // An agent has one session row per campaign, so opening the dialer again —
    // a second tab, another computer, a reload — lands on the same row. The
    // incarnation it replaces has to let go first: otherwise every tab still
    // attached to it receives the same `call.initiate`, and each one places the
    // call.
    let existing = await this.sessionRepo.findByCampaignAndUser(
      data.campaignId,
      data.userId,
    );
    if (
      existing?.status === AgentSessionStatus.offline &&
      existing.endedAt &&
      existing.currentLeadId
    ) {
      await this.releaseEndedAssignment(
        existing.id,
        existing.startedAt,
        existing.currentLeadId,
      );
      existing = await this.sessionRepo.findByCampaignAndUser(
        data.campaignId,
        data.userId,
      );
    }
    if (existing) await this.assertCanReplace(existing);
    // offline + no endedAt means created, awaiting its event stream. This is
    // opt-in so previously released clients keep their start contract.
    const session = await this.sessionRepo.restartIfUnchanged(
      {
        campaignId: data.campaignId,
        userId: data.userId,
        organizationId: data.organizationId,
      },
      existing,
      data.waitForEvents
        ? AgentSessionStatus.offline
        : AgentSessionStatus.ready,
    );
    if (!session) {
      throw new ConflictException(
        "The dialer session changed while starting. Try starting again.",
      );
    }
    if (existing && existing.status !== AgentSessionStatus.offline) {
      this.sseBridge.emit(`agent:${existing.id}`, "session.state", {
        status: AgentSessionStatus.offline,
        reason: "taken_over",
        sessionStartedAt: existing.startedAt.toISOString(),
      });
    }

    this.logger.log(
      `Agent ${data.userId} started session ${session.id} for campaign ${data.campaignId}`,
    );
    return { ...session, awaitingEvents: data.waitForEvents === true };
  }

  async endSession(sessionId: string, startedAt?: Date) {
    const session = await this.getSession(sessionId);
    if (startedAt && session.startedAt.getTime() !== startedAt.getTime())
      return session;
    if (session.status === AgentSessionStatus.offline && session.endedAt)
      return session;
    if (await this.attemptRepo.hasLiveCallForSession(sessionId)) {
      throw new ConflictException(
        "End the active call before ending this dialer session.",
      );
    }
    // An emitted dial may still be reaching the provider. Keep its reservation
    // until reconciliation rather than making that prospect callable twice.
    const preserve = await this.hasUnconfirmedDial(session);
    const ended = await this.sessionRepo.endIfUnchanged(session, preserve, {
      rejectLiveCalls: true,
    });
    if (!ended)
      throw new ConflictException("The dialer session changed while stopping.");
    this.sseBridge.emit(`agent:${sessionId}`, "session.state", {
      status: AgentSessionStatus.offline,
      sessionStartedAt: session.startedAt.toISOString(),
    });
    this.logger.log(
      `Session ${sessionId} for campaign ${session.campaignId} ended`,
    );
    return ended;
  }

  async pause(sessionId: string, startedAt?: Date) {
    const session = await this.getSession(sessionId);
    this.assertIncarnation(session, startedAt);
    if (session.status === AgentSessionStatus.paused) return session;

    if (
      session.status !== AgentSessionStatus.ready &&
      session.status !== AgentSessionStatus.wrap_up
    ) {
      throw new ConflictException(
        `Cannot pause session in ${session.status} state`,
      );
    }

    const moved = await this.transitionIf(
      sessionId,
      {
        from: [session.status],
        currentLeadId: session.currentLeadId,
        startedAt: session.startedAt,
      },
      AgentSessionStatus.paused,
    );
    if (!moved)
      throw new ConflictException("The dialer session changed while pausing.");
    return this.getSession(sessionId);
  }

  async resume(sessionId: string, startedAt?: Date) {
    const session = await this.getSession(sessionId);
    this.assertIncarnation(session, startedAt);
    await this.assertDialerEnabled(session.userId);
    if (
      session.status === AgentSessionStatus.ready ||
      session.status === AgentSessionStatus.wrap_up
    )
      return session;

    if (session.status !== AgentSessionStatus.paused) {
      throw new ConflictException("Session is not paused");
    }

    const nextStatus = session.currentLeadId
      ? AgentSessionStatus.wrap_up
      : AgentSessionStatus.ready;
    const moved = await this.transitionIf(
      sessionId,
      {
        from: [AgentSessionStatus.paused],
        currentLeadId: session.currentLeadId,
        startedAt: session.startedAt,
      },
      nextStatus,
    );
    if (!moved)
      throw new ConflictException("The dialer session changed while resuming.");
    return this.getSession(sessionId);
  }

  async heartbeat(sessionId: string, startedAt?: Date) {
    const session = await this.sessionRepo.heartbeat(sessionId, startedAt);
    if (!session)
      throw new ConflictException("This dialer session has been replaced.");
    return session;
  }

  /** Called only after the stream has subscribed, never from the start request. */
  async activateAfterEvents(
    sessionId: string,
    startedAt: Date,
    isAttached: () => boolean = () => true,
    ownsStreamSetup: () => Promise<boolean> = async () => true,
    attachedHeartbeat?: Date,
  ): Promise<void> {
    const session = await this.getSession(sessionId);
    const attachment = attachedHeartbeat ?? session.lastHeartbeat;
    this.assertIncarnation(session, startedAt);
    await this.assertDialerEnabled(session.userId);
    if (!(await this.sseBridge.isRelayReady()))
      throw new ServiceUnavailableException(
        "The dialer event relay is unavailable.",
      );
    if (!(await ownsStreamSetup()) || !isAttached()) return;
    const moved = await this.transitionIf(
      sessionId,
      {
        from: [AgentSessionStatus.offline],
        currentLeadId: null,
        endedAt: null,
        startedAt,
      },
      AgentSessionStatus.ready,
    );
    if (moved && !isAttached()) {
      // The stream may close while the ready write is in flight. End only the
      // incarnation we activated, retaining any leg that already reached it.
      let current = await this.getSession(sessionId);
      while (
        current.startedAt.getTime() === startedAt.getTime() &&
        !(current.status === AgentSessionStatus.offline && current.endedAt)
      ) {
        if (current.lastHeartbeat.getTime() !== attachment.getTime()) return;
        // A setup lease that expired may have admitted another API's stream.
        // Renew it before the DB transaction. The attachment's persisted
        // heartbeat also fences a successor admitted after this check.
        if (!(await ownsStreamSetup())) return;
        const preserve =
          current.currentLeadId !== null ||
          (await this.attemptRepo.hasLiveCallForSession(sessionId)) ||
          (await this.hasUnconfirmedDial(current));
        if (await this.sessionRepo.endIfUnchanged(current, preserve)) {
          this.sseBridge.emit(`agent:${sessionId}`, "session.state", {
            status: AgentSessionStatus.offline,
            reason: "events_disconnected",
            sessionStartedAt: startedAt.toISOString(),
          });
          if (preserve && current.currentLeadId)
            await this.releaseEndedAssignment(
              sessionId,
              startedAt,
              current.currentLeadId,
            );
          break;
        }
        current = await this.getSession(sessionId);
      }
      return;
    }
    if (moved)
      this.logger.log(
        `Session ${sessionId} for campaign ${session.campaignId} event stream attached; ready`,
      );
    else {
      const current = await this.getSession(sessionId);
      this.assertIncarnation(current, startedAt);
      if (current.status === AgentSessionStatus.offline)
        throw new ConflictException("This dialer session cannot be activated.");
    }
  }

  async transitionTo(
    sessionId: string,
    status: AgentSessionStatus,
    currentLeadId?: string | null,
  ) {
    // Distinguish "leave unchanged" (param omitted → undefined) from "clear"
    // (explicit null). Prisma ignores `undefined` but applies `null`, so only
    // include the key when the caller actually passed a value. Without this,
    // passing `undefined` to clear the lead silently left a stale currentLeadId
    // pointing at the finished lead — which could later be released back to the
    // queue (even after it was completed/DNC).
    const extra: { currentLeadId?: string | null } = {};
    if (currentLeadId !== undefined) {
      extra.currentLeadId = currentLeadId;
    }
    return this.sessionRepo.updateStatus(sessionId, status, extra);
  }

  /**
   * Compare-and-set transition (see `AgentSessionRepository.transitionIf`).
   * Anything that races the dialer poll loop moves a session through here.
   */
  async transitionIf(
    sessionId: string,
    expected: {
      from: AgentSessionStatus[];
      currentLeadId?: string | null;
      startedAt?: Date;
      endedAt?: Date | null;
      reservedAt?: Date | null;
      undialedAttemptId?: string | null;
    },
    status: AgentSessionStatus,
    extra?: Partial<Pick<AgentSession, "currentLeadId" | "endedAt">>,
  ): Promise<boolean> {
    return this.sessionRepo.transitionIf(sessionId, expected, status, extra);
  }

  /**
   * Claim a `ready` agent for one lead. Atomic: of every writer racing for the
   * same agent — overlapping poll ticks, a second API instance — exactly one
   * gets them, and each loser must hand its lead back.
   */
  async claimForLead(
    sessionId: string,
    leadId: string,
    startedAt?: Date,
  ): Promise<boolean> {
    return (await this.reserveForLead(sessionId, leadId, startedAt)) !== null;
  }

  async reserveForLead(sessionId: string, leadId: string, startedAt?: Date) {
    return this.sessionRepo.reserveForLead(sessionId, leadId, startedAt);
  }

  async incrementStats(
    sessionId: string,
    stats: {
      callsAttempted?: number;
      callsConnected?: number;
      totalTalkSec?: number;
    },
    startedAt?: Date,
  ) {
    return this.sessionRepo.incrementStats(sessionId, stats, startedAt);
  }

  /**
   * Ready sessions that may still take this campaign's leads: their agent is
   * assigned to it, or administers its organization — the rule a session is
   * started under. Someone removed since keeps no session that leads flow to.
   */
  async findReadyByCampaign(campaignId: string) {
    const sessions = await this.sessionRepo.findReadyByCampaign(campaignId);
    return this.stillAllowed(campaignId, sessions);
  }

  /** Whether the session's agent may still place this campaign's calls. */
  async mayDialCampaign(session: AgentSession): Promise<boolean> {
    const allowed = await this.stillAllowed(session.campaignId, [session]);
    return allowed.length === 1;
  }

  private async stillAllowed(
    campaignId: string,
    sessions: AgentSession[],
  ): Promise<AgentSession[]> {
    if (sessions.length === 0) return sessions;
    const userIds = [...new Set(sessions.map((session) => session.userId))];
    const [members, admins] = await Promise.all([
      this.campaignMembers.listMemberUserIds(campaignId, userIds),
      this.organizations.listAdminUserIds(sessions[0].organizationId, userIds),
    ]);
    const allowed = new Set([...members, ...admins]);
    return sessions.filter((session) => allowed.has(session.userId));
  }

  async findActiveByCampaign(campaignId: string) {
    return this.sessionRepo.findActiveByCampaign(campaignId);
  }

  /** Every session the dialer has told a browser to place a call for. */
  async findDialing() {
    return this.sessionRepo.findByStatus(AgentSessionStatus.dialing);
  }

  async findStalledReservations(cutoff: Date) {
    return this.sessionRepo.findStalledReservations(cutoff);
  }

  /**
   * Immediately removes a user from every campaign dialer. Lead locks are
   * released best-effort, while marking the session offline is authoritative.
   */
  async disableForUser(userId: string): Promise<number> {
    const sessions = await this.sessionRepo.findActiveByUser(userId);
    let count = 0;
    sessions: for (let session of sessions) {
      // A heartbeat cannot defeat account cleanup. A changed assignment must
      // be re-read so preservation is decided for the assignment actually ended.
      while (true) {
        const preserve =
          (await this.attemptRepo.hasLiveCallForSession(session.id)) ||
          (await this.hasUnconfirmedDial(session));
        const result = await this.sessionRepo.endForAccountDisable(
          session,
          preserve,
        );
        if (result.outcome === "calling_enabled") return count;
        if (result.outcome === "ended") {
          session = result.session;
          break;
        }
        const current = await this.sessionRepo.findById(session.id);
        if (!current || (current.status === "offline" && current.endedAt)) {
          continue sessions;
        }
        session = current;
      }
      this.sseBridge.emit(`agent:${session.id}`, "session.state", {
        status: "offline",
        reason: "account_disabled",
        sessionStartedAt: session.startedAt.toISOString(),
      });
      this.logger.warn(
        `Disabled dialer session ${session.id} for user ${userId}`,
      );
      count++;
    }
    return count;
  }

  async getById(sessionId: string) {
    return this.getSession(sessionId);
  }

  /**
   * Load a session and assert it is the caller's own, in their organization.
   * Use this for any request that acts on a session on behalf of an
   * authenticated user: a session is one agent's dialer, so neither another
   * tenant nor a teammate may drive it by knowing its id.
   */
  async getByIdForOrg(
    sessionId: string,
    organizationId: string,
    userId: string,
  ) {
    const session = await this.getSession(sessionId);
    if (session.organizationId !== organizationId) {
      throw new ForbiddenException(
        "Session does not belong to your organization",
      );
    }
    if (session.userId !== userId) {
      throw new ForbiddenException("Session belongs to another agent");
    }
    return session;
  }

  /**
   * Find and clean up stale sessions. Called by AgentHeartbeatChecker.
   */
  async cleanupStaleSessions(): Promise<number> {
    const staleSessions = await this.sessionRepo.findStale(HEARTBEAT_STALE_MS);
    let count = 0;

    for (const session of staleSessions) {
      if (
        session.status === AgentSessionStatus.offline &&
        session.endedAt &&
        session.currentLeadId
      ) {
        if (
          await this.releaseEndedAssignment(
            session.id,
            session.startedAt,
            session.currentLeadId,
          )
        )
          count++;
        continue;
      }
      const preserve =
        session.currentLeadId !== null ||
        (await this.attemptRepo.hasLiveCallForSession(session.id)) ||
        (await this.hasUnconfirmedDial(session));
      const ended = await this.sessionRepo.endIfUnchanged(session, preserve);
      if (!ended) continue;
      if (preserve && ended.currentLeadId)
        await this.releaseEndedAssignment(
          ended.id,
          ended.startedAt,
          ended.currentLeadId,
        );
      this.sseBridge.emit(`agent:${session.id}`, "session.state", {
        status: AgentSessionStatus.offline,
        reason: "heartbeat_expired",
        sessionStartedAt: session.startedAt.toISOString(),
      });
      count++;
      this.logger.warn(
        `Stale session ${session.id} for agent ${session.userId} marked offline`,
      );
    }

    return count;
  }

  /** A disconnected session has nobody to disposition its completed call. */
  async releaseEndedAssignment(
    sessionId: string,
    startedAt: Date,
    leadId: string,
  ): Promise<boolean> {
    while (true) {
      const session = await this.getSession(sessionId);
      if (
        session.startedAt.getTime() !== startedAt.getTime() ||
        session.status !== AgentSessionStatus.offline ||
        !session.endedAt ||
        session.currentLeadId !== leadId ||
        (await this.attemptRepo.hasLiveCallForSession(sessionId)) ||
        (await this.hasUnconfirmedDial(session))
      )
        return false;
      const [lead, campaign, attempts] = await Promise.all([
        this.leads.findByIdWithContact(leadId),
        this.campaigns.findById(session.campaignId),
        this.attemptRepo.findByCampaignLead(leadId),
      ]);
      if (!lead || !campaign || lead.campaignId !== campaign.id) return false;
      if (
        attempts.some(
          (attempt) =>
            attempt.agentSessionId === sessionId &&
            attempt.callId &&
            !["ended", "dispositioned"].includes(attempt.status),
        )
      )
        return false;
      const completedCall = attempts.some(
        (attempt) =>
          attempt.agentSessionId === sessionId &&
          (attempt.sessionStartedAt === null ||
            attempt.sessionStartedAt.getTime() === startedAt.getTime()) &&
          (attempt.sessionReservedAt !== null
            ? attempt.sessionReservedAt.getTime() ===
              session.reservedAt?.getTime()
            : ["in_call", "wrap_up"].includes(lead.status)) &&
          attempt.callId !== null &&
          ["ended", "dispositioned"].includes(attempt.status),
      );
      if (
        await this.sessionRepo.endIfUnchanged(session, false, {
          assignmentRetry: {
            leadId,
            attempts: lead.attempts,
            status:
              lead.attempts >= campaign.maxAttempts ? "exhausted" : "queued",
            ...(lead.attempts >= campaign.maxAttempts
              ? { deadAt: new Date() }
              : {
                  nextCallAt: completedCall
                    ? new Date(Date.now() + campaign.retryDelayMin * 60_000)
                    : undefined,
                }),
          },
        })
      )
        return true;
    }
  }

  /**
   * Let go of a session that is being started again somewhere else.
   *
   * Refused while it is on a call and its browser is still heartbeating:
   * resetting it then would strand that call without a hang-up button and put
   * its lead back in the queue while someone is still talking to them. Any
   * other state is handed over — its lead goes back to the queue, and every tab
   * still attached to the row is told it no longer owns it.
   */
  private async assertCanReplace(existing: AgentSession): Promise<void> {
    const onCall =
      existing.status === AgentSessionStatus.dialing ||
      existing.status === AgentSessionStatus.in_call;
    const heartbeating =
      Date.now() - new Date(existing.lastHeartbeat).getTime() <
      HEARTBEAT_STALE_MS;
    if (
      (onCall && heartbeating) ||
      (await this.attemptRepo.hasLiveCallForSession(existing.id)) ||
      (await this.hasUnconfirmedDial(existing))
    ) {
      throw new ConflictException(
        "This campaign's dialer is on a call in another tab or device. End that call before starting the dialer here.",
      );
    }
    if (
      existing.status === AgentSessionStatus.offline &&
      existing.endedAt &&
      existing.currentLeadId
    )
      throw new ConflictException(
        "The previous campaign call is still being settled. Try starting again.",
      );
  }

  /**
   * A sent dial may have placed a leg before its webhook arrived. Check every
   * unconfirmed dispatch, including legacy attempts missing from currentLeadId.
   */
  private async hasUnconfirmedDial(session: AgentSession): Promise<boolean> {
    const attempt = await this.attemptRepo.findUnconfirmedDialForSession(
      session.id,
    );
    return attempt !== null;
  }

  private assertIncarnation(session: AgentSession, startedAt?: Date) {
    if (startedAt && session.startedAt.getTime() !== startedAt.getTime()) {
      throw new ConflictException("This dialer session has been replaced.");
    }
  }

  private async getSession(sessionId: string) {
    const session = await this.sessionRepo.findById(sessionId);
    if (!session) throw new NotFoundException("Session not found");
    return session;
  }

  private async assertDialerEnabled(userId: string): Promise<void> {
    const user = await this.userService.getCachedUserById(userId);
    if (user?.canCall === false) {
      throw new ForbiddenException(
        "Outbound calling is disabled for this user",
      );
    }
  }
}
