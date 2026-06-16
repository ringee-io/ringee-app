import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import {
  AiConfidenceLevel,
  AiPipelineContextType,
  ObjectionInsight,
  ObjectionInsightStatus,
  Prisma,
} from "@prisma/client";

export interface ObjectionInsightUpsertData {
  contextType: AiPipelineContextType;
  campaignId?: string | null;
  organizationId?: string | null;
  userId?: string | null;
  label?: string | null;
  dynamic?: boolean;
  count: number;
  appearanceRate: number;
  convertedRate?: number | null;
  underlyingObjection?: string | null;
  winningPattern?: string | null;
  losingPattern?: string | null;
  recommendedResponse?: string | null;
  examples?: Prisma.InputJsonValue | null;
  confidence: AiConfidenceLevel;
  lastRunId?: string | null;
}

/**
 * Pipeline-specific result store for Objection Intelligence. One row per
 * (contextKey, objectionType). Re-running a pipeline refreshes the measured
 * numbers and AI fields but preserves the user's state (savedResponse and a
 * saved/dismissed status are never silently reset by a re-run).
 */
@Injectable()
export class ObjectionInsightRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<ObjectionInsight | null> {
    return this.prisma.objectionInsight.findUnique({ where: { id } });
  }

  /** All insights for a resolved context, ranked by prevalence. */
  findManyByContextKey(contextKey: string): Promise<ObjectionInsight[]> {
    return this.prisma.objectionInsight.findMany({
      where: { contextKey },
      orderBy: [{ count: "desc" }, { appearanceRate: "desc" }],
    });
  }

  /**
   * Insert-or-refresh one insight keyed by (contextKey, objectionType). The
   * measured numbers and AI guidance are overwritten each run; savedResponse and
   * a saved/dismissed status are preserved so a re-run never discards the user's
   * accepted/edited response. Status only resets to `new` when refreshing a row
   * the user had not acted on.
   */
  async upsertByContextObjection(
    contextKey: string,
    objectionType: string,
    data: ObjectionInsightUpsertData,
  ): Promise<{ insight: ObjectionInsight; created: boolean }> {
    const existing = await this.prisma.objectionInsight.findUnique({
      where: { contextKey_objectionType: { contextKey, objectionType } },
    });

    const shared = {
      contextType: data.contextType,
      campaignId: data.campaignId ?? null,
      organizationId: data.organizationId ?? null,
      userId: data.userId ?? null,
      label: data.label ?? null,
      dynamic: data.dynamic ?? false,
      count: data.count,
      appearanceRate: data.appearanceRate,
      convertedRate: data.convertedRate ?? null,
      underlyingObjection: data.underlyingObjection ?? null,
      winningPattern: data.winningPattern ?? null,
      losingPattern: data.losingPattern ?? null,
      recommendedResponse: data.recommendedResponse ?? null,
      examples:
        data.examples === null || data.examples === undefined
          ? Prisma.DbNull
          : data.examples,
      confidence: data.confidence,
      lastRunId: data.lastRunId ?? null,
    };

    if (existing) {
      const insight = await this.prisma.objectionInsight.update({
        where: { id: existing.id },
        data: {
          ...shared,
          // Preserve user state: keep saved/dismissed rows in place; only a row
          // still in `new` is refreshed back to `new`.
          status:
            existing.status === ObjectionInsightStatus.new
              ? ObjectionInsightStatus.new
              : existing.status,
        },
      });
      return { insight, created: false };
    }

    const insight = await this.prisma.objectionInsight.create({
      data: {
        contextKey,
        objectionType,
        status: ObjectionInsightStatus.new,
        ...shared,
      },
    });
    return { insight, created: true };
  }

  updateStatus(
    id: string,
    status: ObjectionInsightStatus,
  ): Promise<ObjectionInsight> {
    return this.prisma.objectionInsight.update({
      where: { id },
      data: { status },
    });
  }

  /** Persist a user-edited/accepted response and mark the insight saved. */
  saveResponse(id: string, savedResponse: string): Promise<ObjectionInsight> {
    return this.prisma.objectionInsight.update({
      where: { id },
      data: { savedResponse, status: ObjectionInsightStatus.saved },
    });
  }
}
