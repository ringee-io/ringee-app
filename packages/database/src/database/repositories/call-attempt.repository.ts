import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { CallAttempt, CallAttemptStatus, Prisma } from "@prisma/client";

/** An attempt with no provider leg yet: assigned, or handed to the browser. */
const UNDIALED_ATTEMPT_STATUSES: CallAttemptStatus[] = [
  CallAttemptStatus.created,
  CallAttemptStatus.dialing,
];

/** Every status in which the attempt's call may still be going on. */
const LIVE_ATTEMPT_STATUSES: CallAttemptStatus[] = [
  ...UNDIALED_ATTEMPT_STATUSES,
  CallAttemptStatus.ringing,
  CallAttemptStatus.answered,
  CallAttemptStatus.in_call,
];

export interface CallAttemptWithRelations extends CallAttempt {
  campaignLead: {
    id: string;
    contactId: string;
    contact: {
      id: string;
      name: string | null;
      phoneNumber: string;
      email: string | null;
      company: string | null;
    };
  };
  disposition: {
    id: string;
    code: string;
    label: string;
    category: string;
  } | null;
}

@Injectable()
export class CallAttemptRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    campaignId: string;
    campaignLeadId: string;
    agentSessionId: string;
    agentUserId: string;
    attemptNumber: number;
  }): Promise<CallAttempt> {
    return this.prisma.callAttempt.create({
      data: {
        campaign: { connect: { id: data.campaignId } },
        campaignLead: { connect: { id: data.campaignLeadId } },
        agentSession: { connect: { id: data.agentSessionId } },
        agentUserId: data.agentUserId,
        attemptNumber: data.attemptNumber,
        status: CallAttemptStatus.created,
      },
    });
  }

  async findById(id: string): Promise<CallAttempt | null> {
    return this.prisma.callAttempt.findUnique({ where: { id } });
  }

  async findByIdWithRelations(
    id: string,
  ): Promise<CallAttemptWithRelations | null> {
    return this.prisma.callAttempt.findFirst({
      where: { id },
      include: {
        campaignLead: {
          include: {
            contact: {
              select: {
                id: true,
                name: true,
                phoneNumber: true,
                email: true,
                company: true,
              },
            },
          },
        },
        disposition: {
          select: { id: true, code: true, label: true, category: true },
        },
      },
    }) as Promise<CallAttemptWithRelations | null>;
  }

  async findByIdWithCampaignOrganization(
    id: string,
  ): Promise<
    (CallAttempt & { campaign: { organizationId: string | null } }) | null
  > {
    return this.prisma.callAttempt.findUnique({
      where: { id },
      include: { campaign: { select: { organizationId: true } } },
    });
  }

  async findByCallId(callId: string): Promise<CallAttempt | null> {
    return this.prisma.callAttempt.findFirst({ where: { callId } });
  }

  async linkCall(attemptId: string, callId: string): Promise<CallAttempt> {
    return this.prisma.callAttempt.update({
      where: { id: attemptId },
      data: { callId, status: CallAttemptStatus.dialing },
    });
  }

  /**
   * The browser has just been told to place this attempt's call. `initiatedAt`
   * moves to this moment: a preview lead can sit on screen for minutes before
   * anyone presses Dial, and the stalled-dial sweep measures from the dial.
   */
  async markDialing(id: string): Promise<boolean> {
    const result = await this.prisma.callAttempt.updateMany({
      where: { id, callId: null, status: CallAttemptStatus.created },
      data: { status: CallAttemptStatus.dialing, initiatedAt: new Date() },
    });
    return result.count === 1;
  }

  /** Bind the provider leg. Only an attempt that has no leg yet accepts one. */
  async linkCallIfUnlinked(id: string, callId: string): Promise<boolean> {
    const result = await this.prisma.callAttempt.updateMany({
      where: { id, callId: null, status: { in: UNDIALED_ATTEMPT_STATUSES } },
      data: { callId, status: CallAttemptStatus.dialing },
    });
    return result.count === 1;
  }

  /** Answered — by the leg the attempt is bound to, and only once. */
  async markAnsweredIf(id: string, callId: string): Promise<boolean> {
    const result = await this.prisma.callAttempt.updateMany({
      where: {
        id,
        callId,
        status: {
          in: [...UNDIALED_ATTEMPT_STATUSES, CallAttemptStatus.ringing],
        },
      },
      data: { status: CallAttemptStatus.answered, answeredAt: new Date() },
    });
    return result.count === 1;
  }

  /**
   * End an attempt that is still live. With `callId`, only the leg the attempt
   * is bound to may end it.
   *
   * The hangup webhook and the agent's disposition both end attempts and
   * routinely arrive together. Exactly one of them wins here, and only the
   * winner may count the attempt against the lead.
   */
  async markEndedIf(
    id: string,
    options: { callId?: string } = {},
  ): Promise<boolean> {
    const result = await this.prisma.callAttempt.updateMany({
      where: {
        id,
        status: { in: LIVE_ATTEMPT_STATUSES },
        ...(options.callId ? { callId: options.callId } : {}),
      },
      data: { status: CallAttemptStatus.ended, endedAt: new Date() },
    });
    return result.count === 1;
  }

  /**
   * What the provider measured about the attempt's call. `durationSec` doubles
   * as the written-once marker, so a redelivered hangup reports false and
   * cannot add the same talk time twice.
   */
  async recordCallMetricsOnce(
    id: string,
    callId: string,
    data: { durationSec: number; hangupCause: string | null },
  ): Promise<boolean> {
    const result = await this.prisma.callAttempt.updateMany({
      where: { id, callId, durationSec: null },
      data,
    });
    return result.count === 1;
  }

  /**
   * Remove an attempt that never produced a provider leg: a dial that was
   * refused, abandoned by the browser, or a preview lead that was skipped.
   * It was not an attempt to reach anyone, and left behind it would count in
   * every campaign rate.
   */
  async deleteUndialed(id: string): Promise<boolean> {
    const result = await this.prisma.callAttempt.deleteMany({
      where: { id, callId: null, status: { in: UNDIALED_ATTEMPT_STATUSES } },
    });
    return result.count === 1;
  }

  /** The not-yet-dialed attempt an agent session holds for its current lead. */
  async findUndialedForSession(
    agentSessionId: string,
    campaignLeadId: string,
  ): Promise<CallAttempt | null> {
    return this.prisma.callAttempt.findFirst({
      where: {
        agentSessionId,
        campaignLeadId,
        callId: null,
        status: { in: UNDIALED_ATTEMPT_STATUSES },
      },
      orderBy: { initiatedAt: "desc" },
    });
  }

  async updateStatus(
    id: string,
    status: CallAttemptStatus,
    extra?: Partial<
      Pick<
        CallAttempt,
        | "ringStartedAt"
        | "answeredAt"
        | "endedAt"
        | "hangupCause"
        | "durationSec"
      >
    >,
  ): Promise<CallAttempt> {
    return this.prisma.callAttempt.update({
      where: { id },
      data: { status, ...extra },
    });
  }

  /**
   * Conditionally set disposition only if attempt is in 'ended' status.
   * Returns null if no rows matched (already dispositioned or wrong state).
   */
  async setDisposition(
    attemptId: string,
    data: {
      dispositionId: string;
      dispositionCode: string;
      dispositionNote?: string;
    },
  ): Promise<CallAttempt | null> {
    const result = await this.prisma.callAttempt.updateMany({
      where: { id: attemptId, status: CallAttemptStatus.ended },
      data: {
        status: CallAttemptStatus.dispositioned,
        dispositionId: data.dispositionId,
        dispositionCode: data.dispositionCode,
        dispositionNote: data.dispositionNote,
        dispositionedAt: new Date(),
      },
    });
    if (result.count === 0) return null;
    return this.prisma.callAttempt.findUnique({ where: { id: attemptId } });
  }

  async findByCampaignLead(campaignLeadId: string): Promise<CallAttempt[]> {
    return this.prisma.callAttempt.findMany({
      where: { campaignLeadId },
      orderBy: { initiatedAt: "desc" },
    });
  }

  async findByAgentSession(agentSessionId: string): Promise<CallAttempt[]> {
    return this.prisma.callAttempt.findMany({
      where: { agentSessionId },
      orderBy: { initiatedAt: "desc" },
    });
  }

  async countByCampaign(campaignId: string): Promise<number> {
    return this.prisma.callAttempt.count({ where: { campaignId } });
  }
}
