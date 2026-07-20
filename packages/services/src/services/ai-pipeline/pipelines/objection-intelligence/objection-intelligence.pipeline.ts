import { Injectable, Logger } from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import {
  AiConfidenceLevel,
  AiPipelineType,
  ObjectionInsightRepository,
  ObjectionInsightUpsertData,
  PendingActionPriority,
  PendingActionSource,
  PendingActionType,
} from "@ringee/database";
import {
  AiPipelineDefinition,
  AnalyzedCall,
  ConfidenceLevel,
  PendingActionDraft,
  PipelineRunInput,
  PipelineRunResult,
} from "../../ai-pipeline.types";
import {
  contextKey,
  contextOwnerColumns,
  toContextTypeEnum,
} from "../../pipeline-context";
import {
  CuratedObjection,
  ObjectionAiBatchOutput,
  ObjectionAiBatchService,
} from "./objection-ai-batch.service";
import {
  ObjectionType,
  isConverted,
  isKilled,
  objectionLabel,
  toCanonicalObjection,
} from "./objection-taxonomy";

/** AI-depth / cost knobs. Turn these up or down per the data volume. */
const TOP_OBJECTIONS_COUNT = 5;
const EXCERPTS_PER_OBJECTION = 8;
const OTHER_SAMPLE_SIZE = 12;
/** Promote a discovered cluster to a first-class dynamic objection at this count. */
const DYNAMIC_MIN_COUNT = 2;
/** A discovered objection is "strong" (worth a heads-up action) at this count. */
const EMERGING_MIN_COUNT = 3;

export interface ObjectionResultItem {
  type: string; // canonical bucket, or `dynamic:<slug>` when discovered
  label?: string; // display label for dynamic objections (AI-named)
  dynamic: boolean; // discovered outside the canonical taxonomy
  count: number; // from code
  appearanceRate: number; // from code
  convertedRate: number | null; // from code; correlational; null below medium
  underlyingObjection: string; // AI
  winningPattern: string; // AI
  losingPattern: string; // AI
  recommendedResponse: string; // AI
  examples: { excerpt: string; outcome?: "handled" | "killed" }[];
}

export interface ObjectionResult {
  /** Canonical + AI-discovered objections, ranked by prevalence. */
  objections: ObjectionResultItem[];
  /** True once the Step B AI pass ran (false when gated off / no data). */
  aiApplied: boolean;
  model?: string;
  eligibleCount: number;
}

/** Internal per-type accumulator (Step A). */
interface ObjectionBucket {
  type: ObjectionType;
  count: number;
  convertedCount: number;
  handledExcerpts: string[];
  killedExcerpts: string[];
  /** Representative owned call → anchors a grouped pending action. */
  anchor: { callId: string; contactId: string | null; userId: string } | null;
}

/**
 * Objection Intelligence — "Discover what blocks your prospects and how to
 * respond."
 *
 * Code does the arithmetic (Step A) so the numbers are trustworthy and trend
 * cleanly across runs; AI does the reasoning on a bounded curated sample
 * (Step B). Per-call objection detection is NOT re-run here — it already
 * happened once in the shared CallAnalysis pass and is read from
 * AnalyzedCall.objections.
 */
@Injectable()
export class ObjectionIntelligencePipeline
  implements AiPipelineDefinition<ObjectionResult>
{
  private readonly logger = new Logger(ObjectionIntelligencePipeline.name);

  readonly type = "objection_intelligence" as const;
  readonly pipelineEnum = AiPipelineType.objection_intelligence;
  readonly name = "Objection Intelligence";
  readonly valueProposition =
    "Discover what blocks your prospects and how to respond.";
  readonly detailRoute = "/dashboard/ai-pipeline/objection-intelligence";
  readonly implemented = true;

  readonly cadence = {
    byTimeMs: 24 * 60 * 60 * 1000, // every day, independent of new-call volume
    byNewEligible: 50, // or after 50 new eligible, whichever happens first
    minEligibleForAuto: 25, // initial volume trigger + confidence threshold
    runOnTimeWithoutNewEligible: true,
  };

  constructor(
    private readonly aiBatch: ObjectionAiBatchService,
    private readonly insightRepo: ObjectionInsightRepository,
  ) {}

  /**
   * Eligible = a real conversation with a usable transcript. Whether an
   * objection actually appeared is discovered in the run, NOT an eligibility
   * gate.
   */
  isEligible(call: AnalyzedCall): boolean {
    return (
      call.hasUsableTranscript &&
      call.durationBucket !== "too_short" &&
      !["no_answer", "voicemail", "wrong_number"].includes(call.outcomeClass)
    );
  }

  confidence(eligibleCount: number): ConfidenceLevel {
    if (eligibleCount < 25) return "low";
    if (eligibleCount < 100) return "medium";
    return "high";
  }

  // No onCallFinalized: this pipeline creates no cheap per-call actions.

  async run(
    input: PipelineRunInput,
  ): Promise<PipelineRunResult<ObjectionResult>> {
    const { context } = input;
    const eligibleCount = input.eligibleCalls.length;
    const confidence = this.confidence(eligibleCount);

    if (eligibleCount === 0) {
      return {
        result: { objections: [], aiApplied: false, eligibleCount },
        confidence,
        pendingActions: [],
        eligibleCount,
      };
    }

    // ── Step A — measure (code, deterministic) ──
    const { buckets, otherExcerpts } = this.measure(input.eligibleCalls);
    const topBuckets = [...buckets.values()]
      .filter((b) => b.type !== "other" && b.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, TOP_OBJECTIONS_COUNT);

    // ── Step B — analyze (AI, gated; the core reasoning) ──
    let ai: ObjectionAiBatchOutput = {
      perObjection: new Map(),
      emergingObjections: [],
    };
    let aiApplied = false;
    if (apiConfiguration.AI_OBJECTION_AI_ENABLED && topBuckets.length > 0) {
      try {
        ai = await this.aiBatch.analyze({
          context,
          objections: topBuckets.map(
            (b): CuratedObjection => ({
              type: b.type,
              count: b.count,
              appearanceRate: b.count / eligibleCount,
              convertedRate: b.count ? b.convertedCount / b.count : 0,
              handledExcerpts: b.handledExcerpts.slice(
                0,
                EXCERPTS_PER_OBJECTION,
              ),
              killedExcerpts: b.killedExcerpts.slice(0, EXCERPTS_PER_OBJECTION),
            }),
          ),
          otherExcerpts: otherExcerpts.slice(0, OTHER_SAMPLE_SIZE),
        });
        aiApplied = true;
      } catch (err) {
        this.logger.error(
          `Objection AI batch failed: ${(err as Error).message}`,
        );
      }
    }

    // ── Step C — persist insights + grouped actions ──
    const showConverted = confidence !== "low"; // correlational; hidden at low
    const objections: ObjectionResultItem[] = [];
    const drafts: PendingActionDraft[] = [];
    const owner = contextOwnerColumns(context);
    const ctxType = toContextTypeEnum(context);
    const key = contextKey(context);
    const anyAnchor = topBuckets.find((b) => b.anchor)?.anchor ?? null;

    // Canonical top objections (measured + AI-analyzed).
    for (const b of topBuckets) {
      const appearanceRate = b.count / eligibleCount;
      const convertedRate = b.count ? b.convertedCount / b.count : 0;
      const analysis = ai.perObjection.get(b.type);
      const examples = this.buildExamples(b);

      objections.push({
        type: b.type,
        dynamic: false,
        count: b.count,
        appearanceRate,
        convertedRate: showConverted ? convertedRate : null,
        underlyingObjection: analysis?.underlyingObjection ?? "",
        winningPattern: analysis?.winningPattern ?? "",
        losingPattern: analysis?.losingPattern ?? "",
        recommendedResponse: analysis?.recommendedResponse ?? "",
        examples,
      });

      // Upsert the result row (preserves the user's saved/dismissed state).
      await this.persistInsight(key, b.type, {
        contextType: ctxType,
        campaignId: owner.campaignId,
        organizationId: owner.organizationId,
        userId: owner.userId,
        dynamic: false,
        count: b.count,
        appearanceRate,
        convertedRate: showConverted ? convertedRate : null,
        underlyingObjection: analysis?.underlyingObjection ?? null,
        winningPattern: analysis?.winningPattern ?? null,
        losingPattern: analysis?.losingPattern ?? null,
        recommendedResponse: analysis?.recommendedResponse ?? null,
        examples: examples as unknown as object,
        confidence: confidence as AiConfidenceLevel,
      });

      // One grouped review action per objection type — only when there is a
      // recommendation to review and an owned call to anchor it to.
      if (analysis?.recommendedResponse && b.anchor) {
        drafts.push(
          this.reviewDraft(
            key,
            b.type,
            objectionLabel(b.type),
            b.count,
            analysis.recommendedResponse,
            b.anchor,
          ),
        );
      }
    }

    // AI-discovered (dynamic) objections — promoted to first-class insights so
    // they get their own detail, response and actions, not just a heads-up.
    const seenSlugs = new Set<string>();
    for (const e of ai.emergingObjections) {
      if (e.approxCount < DYNAMIC_MIN_COUNT) continue;
      const slug = slugify(e.label);
      if (!slug || seenSlugs.has(slug)) continue;
      seenSlugs.add(slug);

      const type = `dynamic:${slug}`;
      const appearanceRate = e.approxCount / eligibleCount;
      const examples = e.sampleExcerpt ? [{ excerpt: e.sampleExcerpt }] : [];

      objections.push({
        type,
        label: e.label,
        dynamic: true,
        count: e.approxCount,
        appearanceRate,
        convertedRate: null, // discovered clusters are not outcome-correlated
        underlyingObjection: e.underlyingObjection ?? "",
        winningPattern: "",
        losingPattern: "",
        recommendedResponse: e.recommendedResponse ?? "",
        examples,
      });

      await this.persistInsight(key, type, {
        contextType: ctxType,
        campaignId: owner.campaignId,
        organizationId: owner.organizationId,
        userId: owner.userId,
        label: e.label,
        dynamic: true,
        count: e.approxCount,
        appearanceRate,
        convertedRate: null,
        underlyingObjection: e.underlyingObjection ?? null,
        winningPattern: null,
        losingPattern: null,
        recommendedResponse: e.recommendedResponse ?? null,
        examples: examples as unknown as object,
        confidence: confidence as AiConfidenceLevel,
      });
    }

    // A single heads-up action for the strongest discovered objection — a
    // higher-level "new pattern, decide whether to formalise it" nudge.
    const strongest = ai.emergingObjections
      .filter((e) => e.approxCount >= EMERGING_MIN_COUNT)
      .sort((a, b) => b.approxCount - a.approxCount)[0];
    if (strongest && anyAnchor) {
      drafts.push({
        type: PendingActionType.review_campaign_insight,
        priority: PendingActionPriority.medium,
        source: PendingActionSource.ai,
        title: `New objection emerging: "${strongest.label}"`,
        reason: `Roughly ${strongest.approxCount} recent calls raised an objection that isn't in your tracked list. Example: "${strongest.sampleExcerpt}"`,
        nextBestAction:
          "Review whether this objection is worth tracking and scripting a response.",
        callId: anyAnchor.callId,
        contactId: anyAnchor.contactId,
        groupKey: `objection_emerging:${key}`,
      });
    }

    // Keep the snapshot ranked by prevalence (trend source).
    objections.sort((a, b) => b.count - a.count);

    return {
      result: { objections, aiApplied, model: ai.model, eligibleCount },
      confidence,
      pendingActions: drafts,
      eligibleCount,
    };
  }

  // ── Step C helpers ──

  /** Upsert one insight, logging (not throwing) on failure. */
  private async persistInsight(
    key: string,
    type: string,
    data: ObjectionInsightUpsertData,
  ): Promise<void> {
    try {
      await this.insightRepo.upsertByContextObjection(key, type, data);
    } catch (err) {
      this.logger.warn(
        `Failed to persist objection insight ${type}: ${(err as Error).message}`,
      );
    }
  }

  /** The grouped "review recommended response" draft for one objection. */
  private reviewDraft(
    key: string,
    type: string,
    label: string,
    count: number,
    recommendedResponse: string,
    anchor: { callId: string; contactId: string | null },
  ): PendingActionDraft {
    return {
      type: PendingActionType.review_objection_response,
      priority: PendingActionPriority.medium,
      source: PendingActionSource.ai,
      title: `Review recommended response for objection: "${label}"`,
      reason: `This objection appeared in ${count} of your recent conversations. A recommended response is ready to review.`,
      suggestedMessage: recommendedResponse,
      nextBestAction:
        "Review the response, then save it or add it to your script.",
      callId: anchor.callId,
      contactId: anchor.contactId,
      groupKey: `objection:${key}:${type}`,
    };
  }

  // ── Step A helpers ──

  private measure(calls: AnalyzedCall[]): {
    buckets: Map<ObjectionType, ObjectionBucket>;
    otherExcerpts: string[];
  } {
    const buckets = new Map<ObjectionType, ObjectionBucket>();
    const otherExcerpts: string[] = [];

    const bucketFor = (type: ObjectionType): ObjectionBucket => {
      let b = buckets.get(type);
      if (!b) {
        b = {
          type,
          count: 0,
          convertedCount: 0,
          handledExcerpts: [],
          killedExcerpts: [],
          anchor: null,
        };
        buckets.set(type, b);
      }
      return b;
    };

    for (const call of calls) {
      // Canonicalise + dedupe the objection types within this one call, so a
      // call counts at most once per objection type.
      const seen = new Map<ObjectionType, string>(); // type → first excerpt
      for (const o of call.objections) {
        const type = toCanonicalObjection(o.type);
        if (!seen.has(type)) seen.set(type, o.evidenceExcerpt ?? "");
      }

      const converted = isConverted(call.outcomeClass);
      const killed = isKilled(call.outcomeClass);

      for (const [type, excerpt] of seen) {
        if (type === "other") {
          if (excerpt) otherExcerpts.push(clampExcerpt(excerpt));
          continue;
        }
        const b = bucketFor(type);
        b.count++;
        if (converted) b.convertedCount++;
        const short = clampExcerpt(excerpt);
        if (
          short &&
          converted &&
          b.handledExcerpts.length < EXCERPTS_PER_OBJECTION
        ) {
          b.handledExcerpts.push(short);
        } else if (
          short &&
          killed &&
          b.killedExcerpts.length < EXCERPTS_PER_OBJECTION
        ) {
          b.killedExcerpts.push(short);
        }
        if (!b.anchor && call.userId) {
          b.anchor = {
            callId: call.callId,
            contactId: call.contactId,
            userId: call.userId,
          };
        }
      }
    }

    return { buckets, otherExcerpts };
  }

  /** 1-2 short examples, preferring one handled and one killed. */
  private buildExamples(
    b: ObjectionBucket,
  ): { excerpt: string; outcome: "handled" | "killed" }[] {
    const out: { excerpt: string; outcome: "handled" | "killed" }[] = [];
    if (b.handledExcerpts[0]) {
      out.push({ excerpt: b.handledExcerpts[0], outcome: "handled" });
    }
    if (b.killedExcerpts[0]) {
      out.push({ excerpt: b.killedExcerpts[0], outcome: "killed" });
    }
    return out.slice(0, 2);
  }
}

function clampExcerpt(s: string): string {
  const t = s.trim();
  if (!t) return "";
  return t.length > 240 ? t.slice(0, 240) : t;
}

/** Stable slug for a dynamic objection's contextKey/objectionType uniqueness. */
function slugify(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}
