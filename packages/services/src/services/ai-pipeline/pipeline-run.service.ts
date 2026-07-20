import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import {
  AiConfidenceLevel,
  AiPipelineActivation,
  AiPipelineActivationRepository,
  AiPipelineContextType,
  AiPipelineRun,
  AiPipelineRunRepository,
  AiPipelineRunStatus,
  AiPipelineRunTrigger,
  CallAnalysisRepository,
  CallRepository,
  Prisma,
} from "@ringee/database";
import { OwnershipContext } from "@ringee/platform";
import {
  AiPipelineDefinition,
  AnalyzedCall,
  PipelineType,
} from "./ai-pipeline.types";
import { CallAnalysisService } from "./call-analysis.service";
import { PendingActionService } from "./pending-action.service";
import {
  ContextDescriptor,
  PipelineActivationService,
} from "./pipeline-activation.service";
import { PipelineContext, contextKey } from "./pipeline-context";
import { PipelineRegistry } from "./pipeline.registry";

export interface RunPreview {
  enabled: boolean;
  isRunning: boolean;
  eligibleCount: number;
  newEligibleSinceLastRun: number;
  estimatedConfidence: "low" | "medium" | "high";
  lowData: boolean;
  lastRunAt: Date | null;
}

export interface RunResultSummary {
  status: "completed" | "already_running";
  run?: AiPipelineRun | null;
  eligibleCount?: number;
  confidence?: "low" | "medium" | "high";
  created?: number;
  updated?: number;
}

/**
 * Owns pipeline runs: locking (one running per pipeline+context), cadence-based
 * scheduling, and execution (gather eligible AnalyzedCalls → def.run → persist
 * drafts → record results).
 */
@Injectable()
export class PipelineRunService {
  private readonly logger = new Logger(PipelineRunService.name);

  constructor(
    private readonly runRepo: AiPipelineRunRepository,
    private readonly activationRepo: AiPipelineActivationRepository,
    private readonly analysisRepo: CallAnalysisRepository,
    private readonly callRepo: CallRepository,
    private readonly analysisService: CallAnalysisService,
    private readonly pendingActions: PendingActionService,
    private readonly registry: PipelineRegistry,
    private readonly activationService: PipelineActivationService,
  ) {}

  /** Pre-flight info shown before a manual run (spec section 6). */
  async getRunPreview(
    ctx: OwnershipContext,
    type: PipelineType,
    descriptor: ContextDescriptor,
  ): Promise<RunPreview> {
    const def = this.registry.require(type);
    const context = await this.activationService.resolveDescriptor(
      ctx,
      descriptor,
    );
    const key = contextKey(context);
    const [activation, running, eligible] = await Promise.all([
      this.activationRepo.findOne(def.pipelineEnum, key),
      this.runRepo.findRunning(def.pipelineEnum, key),
      this.gatherEligible(def, context, key),
    ]);
    return {
      enabled: activation?.enabled ?? false,
      isRunning: !!running,
      eligibleCount: eligible.length,
      newEligibleSinceLastRun: activation?.newEligibleSinceLastRun ?? 0,
      estimatedConfidence: def.confidence(eligible.length),
      lowData: eligible.length < def.cadence.minEligibleForAuto,
      lastRunAt: activation?.lastRunAt ?? null,
    };
  }

  /** Manual run. Refuses to start a second run for the same context. */
  async startManualRun(
    ctx: OwnershipContext,
    type: PipelineType,
    descriptor: ContextDescriptor,
  ): Promise<RunResultSummary> {
    const def = this.registry.require(type);
    const context = await this.activationService.resolveDescriptor(
      ctx,
      descriptor,
    );
    const key = contextKey(context);

    const activation = await this.activationRepo.findOne(def.pipelineEnum, key);
    if (!activation?.enabled) {
      throw new BadRequestException(
        "Enable this context before running analysis.",
      );
    }

    let run: AiPipelineRun;
    try {
      run = await this.runRepo.createRunning({
        pipelineType: def.pipelineEnum,
        contextKey: key,
        trigger: AiPipelineRunTrigger.manual,
      });
    } catch (err) {
      if (this.runRepo.isUniqueViolation(err)) {
        const running = await this.runRepo.findRunning(def.pipelineEnum, key);
        return { status: "already_running", run: running };
      }
      throw err;
    }

    const summary = await this.execute(def, context, run.id, "manual");
    return { status: "completed", ...summary };
  }

  /** Cadence poller entry point (called from the Temporal schedule). */
  async runDueScheduled(): Promise<number> {
    const enabled = await this.activationRepo.listEnabled();
    let triggered = 0;

    for (const activation of enabled) {
      const def = this.registry.getByEnum(activation.pipelineType);
      if (!def || !def.implemented) continue;
      if (!this.isDue(def, activation)) continue;

      const context = this.contextFromActivation(activation);
      if (!context) continue;

      let run: AiPipelineRun;
      try {
        run = await this.runRepo.createRunning({
          pipelineType: def.pipelineEnum,
          contextKey: activation.contextKey,
          trigger: AiPipelineRunTrigger.scheduled,
        });
      } catch (err) {
        if (this.runRepo.isUniqueViolation(err)) continue; // already running
        throw err;
      }

      try {
        await this.execute(def, context, run.id, "scheduled");
        triggered++;
      } catch (err) {
        this.logger.warn(
          `Scheduled run failed for ${def.type} ${activation.contextKey}: ${
            (err as Error).message
          }`,
        );
      }
    }
    return triggered;
  }

  // ── internals ──

  private isDue(def: AiPipelineDefinition, a: AiPipelineActivation): boolean {
    const newE = a.newEligibleSinceLastRun;

    // The volume trigger can always pull a run forward.
    if (newE >= def.cadence.byNewEligible) return true;

    // Preserve the initial low-data guard: a newly-enabled pipeline can run as
    // soon as it reaches its minimum useful sample, without waiting a full
    // cadence window.
    if (!a.lastRunAt && newE >= def.cadence.minEligibleForAuto) return true;

    const timeReference = a.lastRunAt ?? a.createdAt;
    const timeDue =
      Date.now() - timeReference.getTime() >= def.cadence.byTimeMs;
    if (!timeDue) return false;

    // Some analyses (Objection Intelligence) are periodic snapshots and must
    // refresh on schedule even during quiet periods. Others retain the minimum
    // new-call gate to avoid spending AI tokens without enough fresh data.
    return (
      def.cadence.runOnTimeWithoutNewEligible === true ||
      newE >= def.cadence.minEligibleForAuto
    );
  }

  private contextFromActivation(
    a: AiPipelineActivation,
  ): PipelineContext | null {
    switch (a.contextType) {
      case AiPipelineContextType.campaign:
        return a.campaignId
          ? {
              type: "campaign",
              campaignId: a.campaignId,
              organizationId: a.organizationId,
            }
          : null;
      case AiPipelineContextType.organization_outside_campaign:
        return a.organizationId
          ? {
              type: "organization_outside_campaign",
              organizationId: a.organizationId,
            }
          : null;
      case AiPipelineContextType.personal:
        return a.userId ? { type: "personal", userId: a.userId } : null;
      default:
        return null;
    }
  }

  private async gatherEligible(
    def: AiPipelineDefinition,
    context: PipelineContext,
    key: string,
  ): Promise<AnalyzedCall[]> {
    const analyses = await this.analysisRepo.findManyByContextKey(key);
    if (analyses.length === 0) return [];
    const calls = await this.callRepo.findManyByIds(
      analyses.map((a) => a.callId),
    );
    const callMap = new Map(calls.map((c) => [c.id, c]));

    const eligible: AnalyzedCall[] = [];
    for (const a of analyses) {
      const call = callMap.get(a.callId);
      if (!call) continue;
      const analyzed = this.analysisService.toAnalyzedCall(a, context, call);
      if (def.isEligible(analyzed, context)) eligible.push(analyzed);
    }
    return eligible;
  }

  private async execute(
    def: AiPipelineDefinition,
    context: PipelineContext,
    runId: string,
    trigger: "manual" | "scheduled",
  ): Promise<{
    eligibleCount: number;
    confidence: "low" | "medium" | "high";
    created: number;
    updated: number;
  }> {
    const key = contextKey(context);
    try {
      const eligible = await this.gatherEligible(def, context, key);
      const previous = await this.runRepo.findLatestCompleted(
        def.pipelineEnum,
        key,
      );

      const result = await def.run({
        context,
        eligibleCalls: eligible,
        previousResultJson: previous?.resultJson ?? undefined,
        trigger,
      });

      const ownerByCall = new Map(eligible.map((a) => [a.callId, a.userId]));
      const items = result.pendingActions
        .filter((d) => d.callId && ownerByCall.get(d.callId))
        .map((d) => ({
          draft: d,
          ownerUserId: ownerByCall.get(d.callId!)!,
        }));
      const persisted = await this.pendingActions.persistDrafts(
        context,
        def.pipelineEnum,
        items,
      );

      const confidenceEnum = result.confidence as AiConfidenceLevel;
      await this.runRepo.complete(runId, {
        status: AiPipelineRunStatus.completed,
        eligibleCount: result.eligibleCount,
        confidence: confidenceEnum,
        resultJson: (result.result ?? null) as Prisma.InputJsonValue | null,
      });
      await this.activationRepo.recordRunCompleted(
        def.pipelineEnum,
        key,
        confidenceEnum,
      );

      return {
        eligibleCount: result.eligibleCount,
        confidence: result.confidence,
        created: persisted.created,
        updated: persisted.updated,
      };
    } catch (err) {
      await this.runRepo.complete(runId, {
        status: AiPipelineRunStatus.failed,
        error: (err as Error).message,
      });
      throw err;
    }
  }
}
