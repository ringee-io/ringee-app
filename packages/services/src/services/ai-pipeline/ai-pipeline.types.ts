import {
  AiPipelineType,
  PendingActionPriority,
  PendingActionSource,
  PendingActionType,
} from "@ringee/database";
import { PipelineContext } from "./pipeline-context";

export { AiPipelineType };

export type PipelineType =
  | "follow_up_recommendations"
  | "script_optimization"
  | "objection_intelligence";

export type ConfidenceLevel = "low" | "medium" | "high";

export type DurationBucket = "too_short" | "short" | "normal" | "long";

/**
 * One structured extraction per call, computed once and shared by every
 * pipeline. Pipelines read this instead of re-parsing transcripts.
 */
export interface AnalyzedCall {
  callId: string;
  context: PipelineContext;
  outcomeClass: string; // normalized from the existing CallOutcome
  hasUsableTranscript: boolean;
  durationBucket: DurationBucket;
  objections: { type: string; evidenceExcerpt: string }[];
  intentSignals: string[];
  notablePhrases: string[];
  language?: string;
  /** Convenience passthroughs the rule layer needs without a re-query. */
  contactId: string | null;
  durationSeconds: number | null;
  /** Owning agent of the call — becomes PendingAction.userId. */
  userId: string | null;
}

/**
 * A pipeline's proposed action, before it is stamped with context/ownership and
 * persisted as a PendingAction. groupKey dedupes (4.6 / invariant 6).
 */
export interface PendingActionDraft {
  type: PendingActionType;
  priority: PendingActionPriority;
  source: PendingActionSource;
  title: string;
  reason?: string;
  suggestedMessage?: string;
  nextBestAction?: string;
  dueAt?: Date | null;
  expiresAt?: Date | null;
  countsTowardBadge?: boolean;
  contactId?: string | null;
  callId?: string | null;
  /** Dedupe key; stamped with context by the persistence layer if omitted. */
  groupKey?: string | null;
}

export interface PipelineRunInput {
  context: PipelineContext;
  eligibleCalls: AnalyzedCall[];
  previousResultJson?: unknown;
  trigger: "manual" | "scheduled";
}

export interface PipelineRunResult<TResult = unknown> {
  result: TResult;
  confidence: ConfidenceLevel;
  pendingActions: PendingActionDraft[];
  eligibleCount: number;
}

/**
 * The extensibility contract. Adding a pipeline = implement this once, register
 * it (one line in PIPELINE_DEFINITIONS), and build its results screen. Nothing
 * in the core (context, counters, fan-out, runs/locking, Pending Actions)
 * changes.
 */
export interface AiPipelineDefinition<TResult = unknown> {
  type: PipelineType;
  pipelineEnum: AiPipelineType;
  name: string;
  valueProposition: string;
  detailRoute: string;
  /** False until the pipeline's runner ships (renders a "coming soon" card). */
  implemented: boolean;

  /** Does this call count toward this pipeline in this context? */
  isEligible(call: AnalyzedCall, ctx: PipelineContext): boolean;

  cadence: {
    byTimeMs: number; // auto-run if this much time passed since lastRunAt
    byNewEligible: number; // or this many new eligible since last run
    minEligibleForAuto: number; // initial volume trigger + low-data threshold
    /** Run on the time cadence even with fewer new calls than the threshold. */
    runOnTimeWithoutNewEligible?: boolean;
  };

  confidence(eligibleCount: number): ConfidenceLevel;

  /**
   * Optional cheap, synchronous per-call rule signals (NO AI). Runs on call
   * finalized. Follow-up's Layer 1 uses this; other pipelines omit it.
   */
  onCallFinalized?(
    call: AnalyzedCall,
    ctx: PipelineContext,
  ): PendingActionDraft[];

  /** The (possibly expensive) batch analysis. Output MUST be validated. */
  run(input: PipelineRunInput): Promise<PipelineRunResult<TResult>>;
}

/** Multi-provider token: every AiPipelineDefinition is registered here. */
export const PIPELINE_DEFINITIONS = Symbol("PIPELINE_DEFINITIONS");
