import { Injectable, Logger } from "@nestjs/common";
import {
  AiConfidenceLevel,
  AiPipelineType,
  ObjectionInsight,
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
import { AiPipelineChargeError } from "../../ai-pipeline-credit.service";
import {
  IncrementalObjectionEvidence,
  ObjectionAiBatchOutput,
  ObjectionAiBatchService,
} from "./objection-ai-batch.service";
import { ObjectionCallExtractionService } from "./objection-call-extraction.service";
import {
  SemanticObjection,
  parseSemanticObjections,
} from "./objection-semantic";
import { isConverted } from "./objection-taxonomy";

export interface ObjectionResultItem {
  /** Dynamic semantic cluster key generated/reused by AI. */
  type: string;
  label: string;
  dynamic: true;
  count: number;
  appearanceRate: number;
  convertedRate: number | null;
  underlyingObjection: string;
  winningPattern: string;
  losingPattern: string;
  recommendedResponse: string;
  examples: { excerpt: string; outcome?: "handled" | "killed" }[];
}

export interface ObjectionResult {
  objections: ObjectionResultItem[];
  aiApplied: boolean;
  model?: string;
  /** Calls with a completed one-time semantic extraction. */
  eligibleCount: number;
  /** Actual token cost debited during this invocation. */
  chargedCredits: number;
}

interface DynamicBucket {
  clusterKey: string;
  label: string;
  count: number;
  convertedCount: number;
  handledExcerpts: string[];
  killedExcerpts: string[];
  allEvidence: IncrementalObjectionEvidence["newEvidence"];
  newEvidence: IncrementalObjectionEvidence["newEvidence"];
  anchor: { callId: string; contactId: string | null; userId: string } | null;
}

/**
 * Objection Intelligence performs a full semantic extraction exactly once per
 * eligible call, then recalculates dynamic cluster metrics from the persisted
 * extractions. There is no fixed taxonomy and old transcripts are never sent
 * to AI again on later runs.
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
    "Discover every recurring blocker from complete multilingual calls.";
  readonly detailRoute = "/dashboard/ai-pipeline/objection-intelligence";
  readonly implemented = true;

  readonly cadence = {
    byTimeMs: 24 * 60 * 60 * 1000,
    byNewEligible: 50,
    minEligibleForAuto: 25,
    runOnTimeWithoutNewEligible: true,
  };

  constructor(
    private readonly extraction: ObjectionCallExtractionService,
    private readonly aiBatch: ObjectionAiBatchService,
    private readonly insightRepo: ObjectionInsightRepository,
  ) {}

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

  async run(
    input: PipelineRunInput,
  ): Promise<PipelineRunResult<ObjectionResult>> {
    const { context } = input;
    const key = contextKey(context);
    const extracted = await this.extraction.analyzeNewCalls(
      input.eligibleCalls,
      context,
    );
    const eligibleCount = extracted.analyses.length;
    const confidence = this.confidence(eligibleCount);
    const callById = new Map(
      input.eligibleCalls.map((call) => [call.callId, call]),
    );
    const buckets = this.measure(
      extracted.analyses.map((analysis) => ({
        callId: analysis.callId,
        outcomeClass: analysis.outcomeClass ?? "unknown",
        objections: parseSemanticObjections(analysis.objections),
        isNew: extracted.newCallIds.has(analysis.callId),
        call: callById.get(analysis.callId),
      })),
    );

    const previousInsights = await this.insightRepo.findManyByContextKey(key);
    const previousByType = new Map(
      previousInsights.map((insight) => [insight.objectionType, insight]),
    );

    let ai: ObjectionAiBatchOutput = {
      perObjection: new Map(),
      chargedCredits: 0,
    };
    const evidence: IncrementalObjectionEvidence[] = [...buckets.values()].map(
      (bucket) => {
        const previous = previousByType.get(bucket.clusterKey);
        const previousAnalysis = previous
          ? analysisFromInsight(previous)
          : undefined;
        const needsBootstrap =
          !previousAnalysis ||
          (!previousAnalysis.underlyingObjection &&
            !previousAnalysis.recommendedResponse);
        return {
          clusterKey: bucket.clusterKey,
          label: bucket.label,
          count: bucket.count,
          appearanceRate: eligibleCount ? bucket.count / eligibleCount : 0,
          convertedRate: bucket.count
            ? bucket.convertedCount / bucket.count
            : 0,
          previousAnalysis,
          // Retry an omitted/failed new cluster from persisted semantic
          // evidence without ever reopening its complete transcripts.
          newEvidence: needsBootstrap ? bucket.allEvidence : bucket.newEvidence,
        };
      },
    );

    if (evidence.some((item) => item.newEvidence.length > 0)) {
      try {
        ai = await this.aiBatch.analyze({
          context,
          billingUserId:
            input.eligibleCalls.find((call) => call.userId)?.userId ?? null,
          objections: evidence,
        });
      } catch (error) {
        if (error instanceof AiPipelineChargeError) throw error;
        this.logger.error(
          `Incremental objection intelligence failed: ${errorMessage(error)}`,
        );
      }
    }

    const showConverted = confidence !== "low";
    const owner = contextOwnerColumns(context);
    const ctxType = toContextTypeEnum(context);
    const objections: ObjectionResultItem[] = [];
    const drafts: PendingActionDraft[] = [];

    for (const bucket of [...buckets.values()].sort(
      (a, b) => b.count - a.count,
    )) {
      const previous = previousByType.get(bucket.clusterKey);
      const analysis =
        ai.perObjection.get(bucket.clusterKey) ??
        (previous ? analysisFromInsight(previous) : emptyAnalysis());
      const appearanceRate = eligibleCount ? bucket.count / eligibleCount : 0;
      const convertedRate = bucket.count
        ? bucket.convertedCount / bucket.count
        : 0;
      const examples = buildExamples(bucket);

      objections.push({
        type: bucket.clusterKey,
        label: bucket.label,
        dynamic: true,
        count: bucket.count,
        appearanceRate,
        convertedRate: showConverted ? convertedRate : null,
        underlyingObjection: analysis.underlyingObjection,
        winningPattern: analysis.winningPattern,
        losingPattern: analysis.losingPattern,
        recommendedResponse: analysis.recommendedResponse,
        examples,
      });

      await this.persistInsight(key, bucket.clusterKey, {
        contextType: ctxType,
        campaignId: owner.campaignId,
        organizationId: owner.organizationId,
        userId: owner.userId,
        label: bucket.label,
        dynamic: true,
        count: bucket.count,
        appearanceRate,
        convertedRate: showConverted ? convertedRate : null,
        underlyingObjection: analysis.underlyingObjection || null,
        winningPattern: analysis.winningPattern || null,
        losingPattern: analysis.losingPattern || null,
        recommendedResponse: analysis.recommendedResponse || null,
        examples: examples as unknown as object,
        confidence: confidence as AiConfidenceLevel,
      });

      if (analysis.recommendedResponse && bucket.anchor) {
        drafts.push(
          this.reviewDraft(key, bucket, analysis.recommendedResponse),
        );
      }
    }

    await this.insightRepo.markMissingInactive(
      key,
      objections.map((objection) => objection.type),
    );

    return {
      result: {
        objections,
        aiApplied: extracted.aiApplied,
        model: ai.model ?? extracted.model,
        eligibleCount,
        chargedCredits: extracted.chargedCredits + ai.chargedCredits,
      },
      confidence,
      pendingActions: drafts,
      eligibleCount,
    };
  }

  private measure(
    calls: Array<{
      callId: string;
      outcomeClass: string;
      objections: SemanticObjection[];
      isNew: boolean;
      call?: AnalyzedCall;
    }>,
  ): Map<string, DynamicBucket> {
    const buckets = new Map<string, DynamicBucket>();

    for (const item of calls) {
      // Defensive per-call dedupe: a call contributes at most once per dynamic
      // semantic cluster, even if malformed legacy JSON contains duplicates.
      const seen = new Set<string>();
      for (const objection of item.objections) {
        if (seen.has(objection.clusterKey)) continue;
        seen.add(objection.clusterKey);

        let bucket = buckets.get(objection.clusterKey);
        if (!bucket) {
          bucket = {
            clusterKey: objection.clusterKey,
            label: objection.label,
            count: 0,
            convertedCount: 0,
            handledExcerpts: [],
            killedExcerpts: [],
            allEvidence: [],
            newEvidence: [],
            anchor: null,
          };
          buckets.set(objection.clusterKey, bucket);
        }

        bucket.count++;
        if (isConverted(item.outcomeClass)) bucket.convertedCount++;
        if (
          objection.resolution === "handled" &&
          bucket.handledExcerpts.length < 8
        ) {
          bucket.handledExcerpts.push(objection.evidenceExcerpt);
        } else if (
          objection.resolution === "killed" &&
          bucket.killedExcerpts.length < 8
        ) {
          bucket.killedExcerpts.push(objection.evidenceExcerpt);
        }
        const semanticEvidence = {
          underlyingConcern: objection.underlyingConcern,
          evidenceExcerpt: objection.evidenceExcerpt,
          sellerResponseExcerpt: objection.sellerResponseExcerpt,
          resolution: objection.resolution,
        };
        bucket.allEvidence.push(semanticEvidence);
        if (item.isNew) bucket.newEvidence.push(semanticEvidence);
        if (!bucket.anchor && item.call?.userId) {
          bucket.anchor = {
            callId: item.call.callId,
            contactId: item.call.contactId,
            userId: item.call.userId,
          };
        }
      }
    }
    return buckets;
  }

  private async persistInsight(
    key: string,
    type: string,
    data: ObjectionInsightUpsertData,
  ): Promise<void> {
    try {
      await this.insightRepo.upsertByContextObjection(key, type, data);
    } catch (error) {
      this.logger.warn(
        `Failed to persist objection insight ${type}: ${errorMessage(error)}`,
      );
    }
  }

  private reviewDraft(
    key: string,
    bucket: DynamicBucket,
    recommendedResponse: string,
  ): PendingActionDraft {
    return {
      type: PendingActionType.review_objection_response,
      priority: PendingActionPriority.medium,
      source: PendingActionSource.ai,
      title: `Review recommended response for objection: "${bucket.label}"`,
      reason: `This objection appeared in ${bucket.count} analyzed conversations.`,
      suggestedMessage: recommendedResponse,
      nextBestAction:
        "Review the response, then save it or add it to your script.",
      callId: bucket.anchor?.callId,
      contactId: bucket.anchor?.contactId,
      groupKey: `objection:${key}:${bucket.clusterKey}`,
    };
  }
}

function analysisFromInsight(insight: ObjectionInsight) {
  return {
    underlyingObjection: insight.underlyingObjection ?? "",
    winningPattern: insight.winningPattern ?? "",
    losingPattern: insight.losingPattern ?? "",
    recommendedResponse: insight.recommendedResponse ?? "",
  };
}

function emptyAnalysis() {
  return {
    underlyingObjection: "",
    winningPattern: "",
    losingPattern: "",
    recommendedResponse: "",
  };
}

function buildExamples(
  bucket: DynamicBucket,
): { excerpt: string; outcome: "handled" | "killed" }[] {
  const examples: { excerpt: string; outcome: "handled" | "killed" }[] = [];
  if (bucket.handledExcerpts[0]) {
    examples.push({ excerpt: bucket.handledExcerpts[0], outcome: "handled" });
  }
  if (bucket.killedExcerpts[0]) {
    examples.push({ excerpt: bucket.killedExcerpts[0], outcome: "killed" });
  }
  return examples;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
