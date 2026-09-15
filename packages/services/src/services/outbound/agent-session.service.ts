import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import {
  AgentSession,
  AgentSessionRepository,
  CallAttemptRepository,
  CampaignLeadRepository,
  AgentSessionStatus,
} from "@ringee/database";
import { UserService } from "../user.service";
import { SSEBridgeService } from "./sse-bridge.service";
const HEARTBEAT_STALE_MS = 30_000; // 30 seconds

@Injectable()
export class AgentSessionService {
  private readonly logger = new Logger(AgentSessionService.name);

  constructor(
    private readonly sessionRepo: AgentSessionRepository,
    private readonly campaignLeadRepo: CampaignLeadRepository,
    private readonly userService: UserService,
    private readonly sseBridge: SSEBridgeService,
    private readonly attemptRepo: CallAttemptRepository,
  ) {}

  async startSession(data: {
    campaignId: string;
    userId: string;
    organizationId: string;
  }) {
    await this.assertDialerEnabled(data.userId);

    // An agent has one session row per campaign, so opening the dialer again —
    // a second tab, another computer, a reload — lands on the same row. The
    // incarnation it replaces has to let go first: otherwise every tab still
    // attached to it receives the same `call.initiate`, and each one places the
    // call.
    const existing = await this.sessionRepo.findByCampaignAndUser(
      data.campaignId,
      data.userId,
    );
    if (existing && existing.status !== AgentSessionStatus.offline) {
      await this.retire(existing);
    }

    const session = await this.sessionRepo.upsert(data);

    this.logger.log(
      `Agent ${data.userId} started session ${session.id} for campaign ${data.campaignId}`,
    );
    return session;
  }

  async endSession(sessionId: string) {
    const session = await this.getSession(sessionId);

    await this.releaseCurrentLead(session);

    return this.sessionRepo.markOffline(sessionId);
  }

  async pause(sessionId: string) {
    const session = await this.getSession(sessionId);

    if (
      session.status !== AgentSessionStatus.ready &&
      session.status !== AgentSessionStatus.wrap_up
    ) {
      throw new ConflictException(
        `Cannot pause session in ${session.status} state`,
      );
    }

    return this.sessionRepo.updateStatus(sessionId, AgentSessionStatus.paused);
  }

  async resume(sessionId: string) {
    const session = await this.getSession(sessionId);
    await this.assertDialerEnabled(session.userId);

    if (session.status !== AgentSessionStatus.paused) {
      throw new ConflictException("Session is not paused");
    }

    return this.sessionRepo.updateStatus(sessionId, AgentSessionStatus.ready);
  }

  async heartbeat(sessionId: string) {
    return this.sessionRepo.heartbeat(sessionId);
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
    expected: { from: AgentSessionStatus[]; currentLeadId?: string | null },
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
  async claimForLead(sessionId: string, leadId: string): Promise<boolean> {
    return this.sessionRepo.transitionIf(
      sessionId,
      { from: [AgentSessionStatus.ready] },
      AgentSessionStatus.reserved,
      { currentLeadId: leadId },
    );
  }

  async incrementStats(
    sessionId: string,
    stats: {
      callsAttempted?: number;
      callsConnected?: number;
      totalTalkSec?: number;
    },
  ) {
    return this.sessionRepo.incrementStats(sessionId, stats);
  }

  async findReadyByCampaign(campaignId: string) {
    return this.sessionRepo.findReadyByCampaign(campaignId);
  }

  async findActiveByCampaign(campaignId: string) {
    return this.sessionRepo.findActiveByCampaign(campaignId);
  }

  /** Every session the dialer has told a browser to place a call for. */
  async findDialing() {
    return this.sessionRepo.findByStatus(AgentSessionStatus.dialing);
  }

  /**
   * Immediately removes a user from every campaign dialer. Lead locks are
   * released best-effort, while marking the session offline is authoritative.
   */
  async disableForUser(userId: string): Promise<number> {
    const sessions = await this.sessionRepo.findActiveByUser(userId);
    for (const session of sessions) {
      await this.releaseCurrentLead(session).catch((error) =>
        this.logger.warn(
          `Could not release lead ${session.currentLeadId} while disabling agent ${userId}: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
      await this.sessionRepo.markOffline(session.id);
      this.sseBridge.emit(`agent:${session.id}`, "session.state", {
        status: "offline",
        reason: "account_disabled",
      });
      this.logger.warn(
        `Disabled dialer session ${session.id} for user ${userId}`,
      );
    }
    return sessions.length;
  }

  async getById(sessionId: string) {
    return this.getSession(sessionId);
  }

  /**
   * Load a session and assert it belongs to the given organization. Use this
   * for any request that acts on a session on behalf of an authenticated user,
   * so one tenant cannot drive another tenant's session by guessing its id.
   */
  async getByIdForOrg(sessionId: string, organizationId: string) {
    const session = await this.getSession(sessionId);
    if (session.organizationId !== organizationId) {
      throw new ForbiddenException(
        "Session does not belong to your organization",
      );
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
      try {
        await this.releaseCurrentLead(session);
      } catch {
        // Lead may already be unlocked
      }

      await this.sessionRepo.markOffline(session.id);
      count++;
      this.logger.warn(
        `Stale session ${session.id} for agent ${session.userId} marked offline`,
      );
    }

    return count;
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
  private async retire(existing: AgentSession): Promise<void> {
    const onCall =
      existing.status === AgentSessionStatus.dialing ||
      existing.status === AgentSessionStatus.in_call;
    const heartbeating =
      Date.now() - new Date(existing.lastHeartbeat).getTime() <
      HEARTBEAT_STALE_MS;
    if (onCall && heartbeating) {
      throw new ConflictException(
        "This campaign's dialer is on a call in another tab or device. End that call before starting the dialer here.",
      );
    }

    await this.releaseCurrentLead(existing);
    this.sseBridge.emit(`agent:${existing.id}`, "session.state", {
      status: AgentSessionStatus.offline,
      reason: "taken_over",
    });
    this.logger.log(
      `Session ${existing.id} (${existing.status}) was started again elsewhere — previous incarnation released`,
    );
  }

  /**
   * Hand a session's current lead back to the queue, together with the attempt
   * it was holding for it when that attempt never dialed. Only a lead this
   * session still holds is released.
   */
  private async releaseCurrentLead(session: AgentSession): Promise<void> {
    if (!session.currentLeadId) return;
    const undialed = await this.attemptRepo.findUndialedForSession(
      session.id,
      session.currentLeadId,
    );
    if (undialed) {
      await this.attemptRepo.deleteUndialed(undialed.id);
    }
    await this.campaignLeadRepo.releaseLock(session.currentLeadId, {
      lockedBy: session.id,
    });
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
