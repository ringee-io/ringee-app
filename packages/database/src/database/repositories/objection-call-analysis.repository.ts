import { Injectable } from "@nestjs/common";
import {
  AiPipelineContextType,
  ObjectionCallAnalysis,
  ObjectionCallAnalysisStatus,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../prisma.service";

export interface ObjectionCallAnalysisClaim {
  callId: string;
  contextType: AiPipelineContextType;
  contextKey: string;
  campaignId?: string | null;
  organizationId?: string | null;
  userId?: string | null;
  outcomeClass?: string | null;
}

/**
 * Durable at-most-once claims for semantic objection extraction. The unique
 * callId is intentionally global: moving a call between contexts must never
 * cause its full transcript to be sent to the model a second time.
 */
@Injectable()
export class ObjectionCallAnalysisRepository {
  constructor(private readonly prisma: PrismaService) {}

  findManyByCallIds(callIds: string[]): Promise<ObjectionCallAnalysis[]> {
    if (callIds.length === 0) return Promise.resolve([]);
    return this.prisma.objectionCallAnalysis.findMany({
      where: { callId: { in: callIds } },
    });
  }

  findCompletedByContextKey(
    contextKey: string,
  ): Promise<ObjectionCallAnalysis[]> {
    return this.prisma.objectionCallAnalysis.findMany({
      where: {
        contextKey,
        status: ObjectionCallAnalysisStatus.completed,
      },
      orderBy: { completedAt: "asc" },
    });
  }

  /**
   * Claim a call before invoking the external model. Null means another run or
   * a previous attempt already claimed it; callers must not invoke AI again.
   */
  async claim(
    input: ObjectionCallAnalysisClaim,
  ): Promise<ObjectionCallAnalysis | null> {
    try {
      return await this.prisma.objectionCallAnalysis.create({
        data: {
          callId: input.callId,
          contextType: input.contextType,
          contextKey: input.contextKey,
          campaignId: input.campaignId ?? null,
          organizationId: input.organizationId ?? null,
          userId: input.userId ?? null,
          outcomeClass: input.outcomeClass ?? null,
          status: ObjectionCallAnalysisStatus.processing,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return null;
      }
      throw error;
    }
  }

  complete(
    id: string,
    data: {
      language?: string | null;
      model?: string | null;
      objections: Prisma.InputJsonValue;
    },
  ): Promise<ObjectionCallAnalysis> {
    return this.prisma.objectionCallAnalysis.update({
      where: { id },
      data: {
        status: ObjectionCallAnalysisStatus.completed,
        language: data.language ?? null,
        model: data.model ?? null,
        objections: data.objections,
        error: null,
        completedAt: new Date(),
      },
    });
  }

  fail(id: string, error: string): Promise<ObjectionCallAnalysis> {
    return this.prisma.objectionCallAnalysis.update({
      where: { id },
      data: {
        status: ObjectionCallAnalysisStatus.failed,
        error: error.slice(0, 2000),
        completedAt: new Date(),
      },
    });
  }
}
