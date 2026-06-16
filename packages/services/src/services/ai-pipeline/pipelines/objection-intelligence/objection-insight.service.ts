import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AiPipelineRunRepository,
  AiPipelineType,
  ObjectionInsight,
  ObjectionInsightRepository,
  ObjectionInsightStatus,
  PendingActionPriority,
  PendingActionSource,
  PendingActionType,
} from "@ringee/database";
import { OwnershipContext } from "@ringee/platform";
import { PendingActionService } from "../../pending-action.service";
import {
  ContextDescriptor,
  PipelineActivationService,
} from "../../pipeline-activation.service";
import { PipelineContext, contextKey } from "../../pipeline-context";
import { ObjectionResult } from "./objection-intelligence.pipeline";
import { objectionLabel } from "./objection-taxonomy";

/** One run's snapshot reduced to per-objection counts, for the trend sparkline. */
export interface ObjectionTrendPoint {
  runAt: string;
  counts: Record<string, number>;
}

export interface ObjectionInsightsView {
  contextKey: string;
  confidence: string | null;
  /** Eligible calls behind the latest run (0 before the first run). */
  eligibleCount: number;
  lastRunAt: string | null;
  /** True once the latest run actually applied the Step B AI pass. */
  aiApplied: boolean;
  insights: ObjectionInsight[];
  trend: ObjectionTrendPoint[];
}

/**
 * UI-facing reads/mutations for Objection Intelligence results. Ownership is
 * enforced through the same resolveDescriptor path the rest of the pipeline
 * uses, and every insight mutation re-checks that the row belongs to the
 * resolved context — so results never cross workspaces or contexts.
 */
@Injectable()
export class ObjectionInsightService {
  private readonly pipelineEnum = AiPipelineType.objection_intelligence;

  constructor(
    private readonly activationService: PipelineActivationService,
    private readonly insightRepo: ObjectionInsightRepository,
    private readonly runRepo: AiPipelineRunRepository,
    private readonly pendingActions: PendingActionService,
  ) {}

  /** Ranked insights for one context, plus the trend from run snapshots. */
  async listForContext(
    ctx: OwnershipContext,
    descriptor: ContextDescriptor,
  ): Promise<ObjectionInsightsView> {
    const context = await this.activationService.resolveDescriptor(
      ctx,
      descriptor,
    );
    const key = contextKey(context);
    const [insights, runs] = await Promise.all([
      this.insightRepo.findManyByContextKey(key),
      this.runRepo.findRecentCompleted(this.pipelineEnum, key, 12),
    ]);

    // Oldest → newest so the FE can draw a left-to-right trend.
    const trend: ObjectionTrendPoint[] = [...runs].reverse().map((run) => {
      const result = run.resultJson as ObjectionResult | null;
      const counts: Record<string, number> = {};
      for (const t of result?.objections ?? []) {
        counts[t.type] = t.count;
      }
      return { runAt: run.startedAt.toISOString(), counts };
    });

    const latest = runs[0];
    const latestResult = latest?.resultJson as ObjectionResult | null;

    return {
      contextKey: key,
      confidence: insights[0]?.confidence ?? latest?.confidence ?? null,
      eligibleCount: latest?.eligibleCount ?? 0,
      lastRunAt: latest?.startedAt.toISOString() ?? null,
      aiApplied: latestResult?.aiApplied ?? false,
      insights,
      trend,
    };
  }

  /** Save a user-edited/accepted recommended response (status → saved). */
  async saveResponse(
    ctx: OwnershipContext,
    descriptor: ContextDescriptor,
    insightId: string,
    response: string,
  ): Promise<ObjectionInsight> {
    const text = (response ?? "").trim();
    if (!text) throw new BadRequestException("Response text is required");
    if (text.length > 600) {
      throw new BadRequestException("Response is too long");
    }
    const insight = await this.requireOwnedInsight(ctx, descriptor, insightId);
    return this.insightRepo.saveResponse(insight.id, text);
  }

  /** Dismiss a recommendation (status → dismissed). */
  async dismiss(
    ctx: OwnershipContext,
    descriptor: ContextDescriptor,
    insightId: string,
  ): Promise<ObjectionInsight> {
    const insight = await this.requireOwnedInsight(ctx, descriptor, insightId);
    return this.insightRepo.updateStatus(
      insight.id,
      ObjectionInsightStatus.dismissed,
    );
  }

  /**
   * Create the grouped "review recommended response" pending action for an
   * objection (one per objection type per context — deduped by groupKey).
   */
  async createReviewAction(
    ctx: OwnershipContext,
    descriptor: ContextDescriptor,
    insightId: string,
  ): Promise<{ created: number; updated: number }> {
    const context = await this.activationService.resolveDescriptor(
      ctx,
      descriptor,
    );
    const insight = await this.assertInsightInContext(context, insightId);
    const message = insight.savedResponse ?? insight.recommendedResponse;

    return this.pendingActions.persistDrafts(context, this.pipelineEnum, [
      {
        ownerUserId: ctx.userId,
        draft: {
          type: PendingActionType.review_objection_response,
          priority: PendingActionPriority.medium,
          source: PendingActionSource.manual,
          title: `Review recommended response for objection: "${this.displayLabel(
            insight,
          )}"`,
          reason: `This objection appeared in ${insight.count} of your recent conversations.`,
          suggestedMessage: message ?? undefined,
          nextBestAction:
            "Review the response, then save it or add it to your script.",
          groupKey: `objection:${insight.contextKey}:${insight.objectionType}`,
        },
      },
    ]);
  }

  /**
   * Create an "add objection response to script" pending action. Reuses the
   * existing call-script concepts via a pending action — it never auto-modifies
   * the active script. One per objection type per context.
   */
  async addToScript(
    ctx: OwnershipContext,
    descriptor: ContextDescriptor,
    insightId: string,
  ): Promise<{ created: number; updated: number }> {
    const context = await this.activationService.resolveDescriptor(
      ctx,
      descriptor,
    );
    const insight = await this.assertInsightInContext(context, insightId);
    const message = insight.savedResponse ?? insight.recommendedResponse;
    if (!message) {
      throw new BadRequestException(
        "No recommended response to add — run analysis first.",
      );
    }

    return this.pendingActions.persistDrafts(context, this.pipelineEnum, [
      {
        ownerUserId: ctx.userId,
        draft: {
          type: PendingActionType.add_objection_response_to_script,
          priority: PendingActionPriority.medium,
          source: PendingActionSource.manual,
          title: `Add objection response to script: "${this.displayLabel(
            insight,
          )}"`,
          reason:
            "Add the reviewed objection response to your call script. The active script is never changed automatically.",
          suggestedMessage: message,
          nextBestAction:
            "Open your call script and add this response to the objection section.",
          groupKey: `objection_to_script:${insight.contextKey}:${insight.objectionType}`,
        },
      },
    ]);
  }

  /** Display label: the AI-named label for dynamic objections, else taxonomy. */
  private displayLabel(insight: ObjectionInsight): string {
    return insight.label ?? objectionLabel(insight.objectionType);
  }

  // ── ownership ──

  private async requireOwnedInsight(
    ctx: OwnershipContext,
    descriptor: ContextDescriptor,
    insightId: string,
  ): Promise<ObjectionInsight> {
    const context = await this.activationService.resolveDescriptor(
      ctx,
      descriptor,
    );
    return this.assertInsightInContext(context, insightId);
  }

  /**
   * Load the insight and assert it belongs to the (already ownership-verified)
   * resolved context. resolveDescriptor has already proven the caller owns the
   * context; matching contextKey then guarantees the row is in-scope.
   */
  private async assertInsightInContext(
    context: PipelineContext,
    insightId: string,
  ): Promise<ObjectionInsight> {
    const insight = await this.insightRepo.findById(insightId);
    if (!insight) throw new NotFoundException("Objection insight not found");
    if (insight.contextKey !== contextKey(context)) {
      throw new ForbiddenException("Access denied");
    }
    return insight;
  }
}
