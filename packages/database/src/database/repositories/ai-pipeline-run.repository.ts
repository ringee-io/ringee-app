import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import {
  AiConfidenceLevel,
  AiPipelineRun,
  AiPipelineRunStatus,
  AiPipelineRunTrigger,
  AiPipelineType,
  Prisma,
} from "@prisma/client";

/**
 * Run records for pipeline analysis. At most one row with status=running per
 * (pipelineType, contextKey) — enforced by a partial unique index in the
 * migration, so createRunning can throw P2002 on a race.
 */
@Injectable()
export class AiPipelineRunRepository {
  constructor(private readonly prisma: PrismaService) {}

  findRunning(
    pipelineType: AiPipelineType,
    contextKey: string,
  ): Promise<AiPipelineRun | null> {
    return this.prisma.aiPipelineRun.findFirst({
      where: { pipelineType, contextKey, status: AiPipelineRunStatus.running },
    });
  }

  findLatest(
    pipelineType: AiPipelineType,
    contextKey: string,
  ): Promise<AiPipelineRun | null> {
    return this.prisma.aiPipelineRun.findFirst({
      where: { pipelineType, contextKey },
      orderBy: { startedAt: "desc" },
    });
  }

  findLatestCompleted(
    pipelineType: AiPipelineType,
    contextKey: string,
  ): Promise<AiPipelineRun | null> {
    return this.prisma.aiPipelineRun.findFirst({
      where: {
        pipelineType,
        contextKey,
        status: AiPipelineRunStatus.completed,
      },
      orderBy: { startedAt: "desc" },
    });
  }

  /**
   * Most recent completed runs for a context (newest first). Read-only helper
   * that drives the result-screen trend, sourced from each run's resultJson
   * snapshot. Does not touch run creation, completion or the running-lock.
   */
  findRecentCompleted(
    pipelineType: AiPipelineType,
    contextKey: string,
    take = 12,
  ): Promise<AiPipelineRun[]> {
    return this.prisma.aiPipelineRun.findMany({
      where: {
        pipelineType,
        contextKey,
        status: AiPipelineRunStatus.completed,
      },
      orderBy: { startedAt: "desc" },
      take,
    });
  }

  /**
   * Insert a running row. Throws Prisma P2002 if a run is already in progress
   * for this (pipelineType, contextKey) (partial unique index) — the caller
   * surfaces the running status instead of starting a second run.
   */
  createRunning(params: {
    pipelineType: AiPipelineType;
    contextKey: string;
    trigger: AiPipelineRunTrigger;
  }): Promise<AiPipelineRun> {
    return this.prisma.aiPipelineRun.create({
      data: {
        pipelineType: params.pipelineType,
        contextKey: params.contextKey,
        trigger: params.trigger,
        status: AiPipelineRunStatus.running,
      },
    });
  }

  complete(
    id: string,
    data: {
      status: AiPipelineRunStatus;
      eligibleCount?: number;
      confidence?: AiConfidenceLevel | null;
      resultJson?: Prisma.InputJsonValue | null;
      error?: string | null;
    },
  ): Promise<AiPipelineRun> {
    return this.prisma.aiPipelineRun.update({
      where: { id },
      data: {
        status: data.status,
        eligibleCount: data.eligibleCount,
        confidence: data.confidence ?? null,
        resultJson:
          data.resultJson === null
            ? Prisma.DbNull
            : (data.resultJson ?? undefined),
        error: data.error ?? null,
        finishedAt: new Date(),
      },
    });
  }

  isUniqueViolation(err: unknown): boolean {
    return (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    );
  }
}
