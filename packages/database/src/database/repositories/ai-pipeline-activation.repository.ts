import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import {
  AiPipelineActivation,
  AiPipelineContextType,
  AiPipelineType,
  AiConfidenceLevel,
} from "@prisma/client";

export interface ActivationOwnerColumns {
  campaignId?: string | null;
  organizationId?: string | null;
  userId?: string | null;
}

/**
 * One row per (pipelineType, contextKey). Rows are created lazily the first
 * time a context is toggled; absence of a row means "disabled". Counters here
 * are denormalized for the cadence decision and the UI.
 */
@Injectable()
export class AiPipelineActivationRepository {
  constructor(private readonly prisma: PrismaService) {}

  findOne(
    pipelineType: AiPipelineType,
    contextKey: string,
  ): Promise<AiPipelineActivation | null> {
    return this.prisma.aiPipelineActivation.findUnique({
      where: { pipelineType_contextKey: { pipelineType, contextKey } },
    });
  }

  findManyByKeys(
    pipelineType: AiPipelineType,
    contextKeys: string[],
  ): Promise<AiPipelineActivation[]> {
    if (contextKeys.length === 0) return Promise.resolve([]);
    return this.prisma.aiPipelineActivation.findMany({
      where: { pipelineType, contextKey: { in: contextKeys } },
    });
  }

  /** Every enabled activation (used by the scheduled cadence poller). */
  listEnabled(): Promise<AiPipelineActivation[]> {
    return this.prisma.aiPipelineActivation.findMany({
      where: { enabled: true },
    });
  }

  /** Upsert the enabled flag for a context, recording its owner columns. */
  setEnabled(params: {
    pipelineType: AiPipelineType;
    contextType: AiPipelineContextType;
    contextKey: string;
    owner: ActivationOwnerColumns;
    enabled: boolean;
  }): Promise<AiPipelineActivation> {
    const { pipelineType, contextType, contextKey, owner, enabled } = params;
    return this.prisma.aiPipelineActivation.upsert({
      where: { pipelineType_contextKey: { pipelineType, contextKey } },
      create: {
        pipelineType,
        contextType,
        contextKey,
        campaignId: owner.campaignId ?? null,
        organizationId: owner.organizationId ?? null,
        userId: owner.userId ?? null,
        enabled,
      },
      update: { enabled },
    });
  }

  /** Idempotency is enforced by the caller (CallAnalysis.countedPipelines). */
  async incrementNewEligible(
    pipelineType: AiPipelineType,
    contextKey: string,
    by = 1,
  ): Promise<void> {
    await this.prisma.aiPipelineActivation.updateMany({
      where: { pipelineType, contextKey },
      data: { newEligibleSinceLastRun: { increment: by } },
    });
  }

  async adjustPendingActionCount(
    pipelineType: AiPipelineType,
    contextKey: string,
    delta: number,
  ): Promise<void> {
    await this.prisma.aiPipelineActivation.updateMany({
      where: { pipelineType, contextKey },
      data: { pendingActionCount: { increment: delta } },
    });
  }

  /** On a successful run: stamp lastRunAt, reset the new-eligible counter. */
  async recordRunCompleted(
    pipelineType: AiPipelineType,
    contextKey: string,
    confidence: AiConfidenceLevel | null,
  ): Promise<void> {
    await this.prisma.aiPipelineActivation.updateMany({
      where: { pipelineType, contextKey },
      data: {
        lastRunAt: new Date(),
        newEligibleSinceLastRun: 0,
        lastConfidence: confidence,
      },
    });
  }
}
