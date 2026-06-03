import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import {
  AgentSessionRepository,
  CampaignLeadRepository,
  AgentSessionStatus,
  CampaignLeadStatus,
} from "@ringee/database";
const HEARTBEAT_STALE_MS = 30_000; // 30 seconds

@Injectable()
export class AgentSessionService {
  private readonly logger = new Logger(AgentSessionService.name);

  constructor(
    private readonly sessionRepo: AgentSessionRepository,
    private readonly campaignLeadRepo: CampaignLeadRepository,
  ) {}

  async startSession(data: {
    campaignId: string;
    userId: string;
    organizationId: string;
  }) {
    const session = await this.sessionRepo.upsert(data);

    this.logger.log(
      `Agent ${data.userId} started session ${session.id} for campaign ${data.campaignId}`
    );
    return session;
  }

  async endSession(sessionId: string) {
    const session = await this.getSession(sessionId);

    // Release any locked lead
    if (session.currentLeadId) {
      await this.campaignLeadRepo.releaseLock(session.currentLeadId);
    }

    return this.sessionRepo.markOffline(sessionId);
  }

  async pause(sessionId: string) {
    const session = await this.getSession(sessionId);

    if (
      session.status !== AgentSessionStatus.ready &&
      session.status !== AgentSessionStatus.wrap_up
    ) {
      throw new ConflictException(
        `Cannot pause session in ${session.status} state`
      );
    }

    return this.sessionRepo.updateStatus(sessionId, AgentSessionStatus.paused);
  }

  async resume(sessionId: string) {
    const session = await this.getSession(sessionId);

    if (session.status !== AgentSessionStatus.paused) {
      throw new ConflictException("Session is not paused");
    }

    return this.sessionRepo.updateStatus(
      sessionId,
      AgentSessionStatus.ready
    );
  }

  async heartbeat(sessionId: string) {
    return this.sessionRepo.heartbeat(sessionId);
  }

  async transitionTo(
    sessionId: string,
    status: AgentSessionStatus,
    currentLeadId?: string | null
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

  async incrementStats(
    sessionId: string,
    stats: {
      callsAttempted?: number;
      callsConnected?: number;
      totalTalkSec?: number;
    }
  ) {
    return this.sessionRepo.incrementStats(sessionId, stats);
  }

  async findReadyByCampaign(campaignId: string) {
    return this.sessionRepo.findReadyByCampaign(campaignId);
  }

  async findActiveByCampaign(campaignId: string) {
    return this.sessionRepo.findActiveByCampaign(campaignId);
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
        "Session does not belong to your organization"
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
      // Release any locked lead
      if (session.currentLeadId) {
        try {
          await this.campaignLeadRepo.releaseLock(session.currentLeadId);
        } catch {
          // Lead may already be unlocked
        }
      }

      await this.sessionRepo.markOffline(session.id);
      count++;
      this.logger.warn(
        `Stale session ${session.id} for agent ${session.userId} marked offline`
      );
    }

    return count;
  }

  private async getSession(sessionId: string) {
    const session = await this.sessionRepo.findById(sessionId);
    if (!session) throw new NotFoundException("Session not found");
    return session;
  }
}
