import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { CallAttempt, CallAttemptStatus, Prisma } from "@prisma/client";

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

  async findByCallId(callId: string): Promise<CallAttempt | null> {
    return this.prisma.callAttempt.findFirst({ where: { callId } });
  }

  async linkCall(attemptId: string, callId: string): Promise<CallAttempt> {
    return this.prisma.callAttempt.update({
      where: { id: attemptId },
      data: { callId, status: CallAttemptStatus.dialing },
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
