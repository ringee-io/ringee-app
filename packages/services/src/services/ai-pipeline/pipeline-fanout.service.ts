import { Injectable, Logger } from "@nestjs/common";
import {
  AiPipelineActivationRepository,
  CallAnalysisRepository,
  CallRepository,
} from "@ringee/database";
import { CallAnalysisService } from "./call-analysis.service";
import { PendingActionService } from "./pending-action.service";
import { PipelineContextResolver } from "./pipeline-context.resolver";
import { PipelineRegistry } from "./pipeline.registry";
import { contextKey } from "./pipeline-context";

/**
 * Call-finalized fan-out (spec 4.4). Triggered when a call gets its outcome.
 *
 * 1. Resolve the call's context (campaign > org-outside > personal).
 * 2. Ensure CallAnalysis exists (compute once, shared by all pipelines).
 * 3. For each ENABLED pipeline whose isEligible() is true: increment the
 *    per-(pipeline,context) counter — idempotently, guarded by
 *    CallAnalysis.countedPipelines so a repeated outcome event never
 *    double-counts.
 * 4. Run the pipeline's cheap onCallFinalized (Layer 1, NO AI) and persist the
 *    drafts as pending actions (deduped by groupKey).
 *
 * This is best-effort: failures are logged and never propagated to the outcome
 * write path.
 */
@Injectable()
export class PipelineFanoutService {
  private readonly logger = new Logger(PipelineFanoutService.name);

  constructor(
    private readonly callRepo: CallRepository,
    private readonly resolver: PipelineContextResolver,
    private readonly analysisService: CallAnalysisService,
    private readonly analysisRepo: CallAnalysisRepository,
    private readonly activationRepo: AiPipelineActivationRepository,
    private readonly registry: PipelineRegistry,
    private readonly pendingActions: PendingActionService,
  ) {}

  /** Fire-and-forget entry point for outcome-write paths. */
  handleCallFinalized(callId: string): void {
    void this.run(callId).catch((err) =>
      this.logger.warn(
        `Pipeline fan-out failed for call ${callId}: ${(err as Error).message}`,
      ),
    );
  }

  /** Awaitable variant (used by tests / batch backfill). */
  async run(callId: string): Promise<void> {
    const call = await this.callRepo.findById(callId);
    if (!call || !call.outcome) return; // not finalized with an outcome

    const ctx = await this.resolver.resolveForCall(call);
    const analysisRow = await this.analysisService.ensureForCall(call, ctx);
    const analyzed = this.analysisService.toAnalyzedCall(
      analysisRow,
      ctx,
      call,
    );
    const key = contextKey(ctx);

    for (const def of this.registry.all()) {
      const activation = await this.activationRepo.findOne(
        def.pipelineEnum,
        key,
      );
      if (!activation?.enabled) continue; // isolation: only this context

      // Counter — idempotent per (call, pipeline).
      if (def.isEligible(analyzed, ctx)) {
        const counted = await this.analysisRepo.markCountedIfAbsent(
          callId,
          def.pipelineEnum,
        );
        if (counted) {
          await this.activationRepo.incrementNewEligible(
            def.pipelineEnum,
            key,
            1,
          );
        }
      }

      // Layer 1 — cheap rule drafts (self-gating on outcome).
      if (def.onCallFinalized && analyzed.userId) {
        const drafts = def.onCallFinalized(analyzed, ctx);
        if (drafts.length > 0) {
          await this.pendingActions.persistDrafts(
            ctx,
            def.pipelineEnum,
            drafts.map((draft) => ({ draft, ownerUserId: analyzed.userId! })),
          );
        }
      }
    }
  }
}
