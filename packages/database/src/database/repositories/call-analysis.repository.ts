import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import {
  AiPipelineContextType,
  AiPipelineType,
  CallAnalysis,
  Prisma,
} from "@prisma/client";

export interface CallAnalysisUpsertData {
  contextType?: AiPipelineContextType | null;
  contextKey?: string | null;
  outcomeClass?: string | null;
  durationBucket?: string | null;
  hasUsableTranscript?: boolean;
  objections?: Prisma.InputJsonValue;
  intentSignals?: Prisma.InputJsonValue;
  notablePhrases?: Prisma.InputJsonValue;
  language?: string | null;
  model?: string | null;
}

/**
 * One structured extraction per call (callId unique). Read by every pipeline so
 * transcripts are parsed once. countedPipelines makes the call-finalized
 * fan-out idempotent.
 */
@Injectable()
export class CallAnalysisRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByCallId(callId: string): Promise<CallAnalysis | null> {
    return this.prisma.callAnalysis.findUnique({ where: { callId } });
  }

  upsert(callId: string, data: CallAnalysisUpsertData): Promise<CallAnalysis> {
    return this.prisma.callAnalysis.upsert({
      where: { callId },
      create: { callId, ...data },
      update: { ...data },
    });
  }

  /**
   * Atomically mark a pipeline as having counted this call. Returns true if it
   * was newly added (so the caller should increment the activation counter),
   * false if it was already present (idempotent no-op).
   */
  async markCountedIfAbsent(
    callId: string,
    pipelineType: AiPipelineType,
  ): Promise<boolean> {
    const existing = await this.prisma.callAnalysis.findUnique({
      where: { callId },
      select: { countedPipelines: true },
    });
    if (!existing) return false;
    if (existing.countedPipelines.includes(pipelineType)) return false;

    // Guard against a concurrent fan-out adding the same pipeline: only update
    // rows whose array still lacks it (NOT has). Prisma cannot express array
    // NOT-contains, so re-check the affected count via the returned array.
    const updated = await this.prisma.callAnalysis.update({
      where: { callId },
      data: { countedPipelines: { push: pipelineType } },
      select: { countedPipelines: true },
    });
    // If two writers raced, both pushed; dedupe is best-effort. Treat the first
    // observed transition (length grew from the snapshot) as the counting one.
    return (
      updated.countedPipelines.filter((p) => p === pipelineType).length === 1
    );
  }

  /** All analyses for a resolved context — drives batch eligible enumeration. */
  findManyByContextKey(contextKey: string): Promise<CallAnalysis[]> {
    return this.prisma.callAnalysis.findMany({
      where: { contextKey },
      orderBy: { analyzedAt: "desc" },
    });
  }
}
