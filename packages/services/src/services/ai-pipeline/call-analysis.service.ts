import { Injectable } from "@nestjs/common";
import {
  Call,
  CallAnalysis,
  CallAnalysisRepository,
  CallRepository,
  CallTranscriptionRepository,
  TranscriptionStatus,
} from "@ringee/database";
import { AnalyzedCall, DurationBucket } from "./ai-pipeline.types";
import {
  PipelineContext,
  contextKey,
  toContextTypeEnum,
} from "./pipeline-context";
import { extractSignals } from "./signal-extraction";

const MIN_USABLE_TRANSCRIPT_CHARS = 40;

export function bucketDuration(
  seconds: number | null | undefined,
): DurationBucket {
  const s = seconds ?? 0;
  if (s < 20) return "too_short";
  if (s < 90) return "short";
  if (s < 600) return "normal";
  return "long";
}

export function normalizeOutcome(outcome: string | null | undefined): string {
  return outcome ?? "unknown";
}

/**
 * Shared extraction layer. Computes one structured CallAnalysis per call (cheap,
 * rule-based, NO AI) and maps stored rows to AnalyzedCall. Every pipeline reads
 * this instead of re-parsing transcripts.
 */
@Injectable()
export class CallAnalysisService {
  constructor(
    private readonly callAnalysisRepo: CallAnalysisRepository,
    private readonly callRepo: CallRepository,
    private readonly transcriptionRepo: CallTranscriptionRepository,
  ) {}

  /** Compute (or refresh) and persist the analysis for a call in its context. */
  async ensureForCall(call: Call, ctx: PipelineContext): Promise<CallAnalysis> {
    const { text, language } = await this.getBestTranscript(call.id);
    const hasUsableTranscript =
      !!text && text.trim().length >= MIN_USABLE_TRANSCRIPT_CHARS;
    const signals = hasUsableTranscript
      ? extractSignals(text!)
      : { objections: [], intentSignals: [], notablePhrases: [] };

    return this.callAnalysisRepo.upsert(call.id, {
      contextType: toContextTypeEnum(ctx),
      contextKey: contextKey(ctx),
      outcomeClass: normalizeOutcome(call.outcome),
      durationBucket: bucketDuration(call.durationSeconds),
      hasUsableTranscript,
      objections: signals.objections,
      intentSignals: signals.intentSignals,
      notablePhrases: signals.notablePhrases,
      language: language ?? null,
      model: "rule-based-v1",
    });
  }

  /** Build an AnalyzedCall from a stored analysis row + its source call. */
  toAnalyzedCall(
    row: CallAnalysis,
    ctx: PipelineContext,
    call: Pick<Call, "id" | "contactId" | "durationSeconds" | "userId">,
  ): AnalyzedCall {
    return {
      callId: row.callId,
      context: ctx,
      outcomeClass: row.outcomeClass ?? "unknown",
      hasUsableTranscript: row.hasUsableTranscript,
      durationBucket: (row.durationBucket as DurationBucket) ?? "normal",
      objections: toObjectionArray(row.objections),
      intentSignals: toStringArray(row.intentSignals),
      notablePhrases: toStringArray(row.notablePhrases),
      language: row.language ?? undefined,
      contactId: call.contactId,
      durationSeconds: call.durationSeconds,
      userId: call.userId,
    };
  }

  /** Pick the most complete transcript across realtime/recording sources. */
  async getBestTranscript(
    callId: string,
  ): Promise<{ text: string | null; language: string | null }> {
    const headers = await this.transcriptionRepo.findHeadersByCall(callId);
    const completed = headers
      .filter(
        (h) => h.status === TranscriptionStatus.completed && !!h.text?.trim(),
      )
      .sort((a, b) => (b.text?.length ?? 0) - (a.text?.length ?? 0));
    const best = completed[0];
    if (!best) return { text: null, language: null };
    const attributed = renderTranscript(best.segments ?? []);
    return {
      text: attributed || best.text,
      language: best.language ?? null,
    };
  }
}

/** Preserve reliable Telnyx roles and neutral diarization labels for AI. */
function renderTranscript(
  segments: Array<{
    text: string;
    speaker?: number | null;
    track?: string | null;
  }>,
): string {
  return segments
    .map((segment) => {
      const text = segment.text.trim();
      if (!text) return "";
      if (segment.track === "outbound") return `Agent: ${text}`;
      if (segment.track === "inbound") return `Contact: ${text}`;
      if (segment.speaker != null) {
        return `Speaker ${segment.speaker + 1}: ${text}`;
      }
      return text;
    })
    .filter(Boolean)
    .join("\n");
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value))
    return value.filter((v): v is string => typeof v === "string");
  return [];
}

function toObjectionArray(
  value: unknown,
): { type: string; evidenceExcerpt: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((v) => {
    if (v && typeof v === "object" && "type" in v) {
      const obj = v as { type?: unknown; evidenceExcerpt?: unknown };
      if (typeof obj.type === "string") {
        return [
          {
            type: obj.type,
            evidenceExcerpt: String(obj.evidenceExcerpt ?? ""),
          },
        ];
      }
    }
    return [];
  });
}
