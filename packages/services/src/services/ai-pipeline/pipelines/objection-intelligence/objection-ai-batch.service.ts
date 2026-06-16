import { Injectable, Logger } from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import {
  AiProviderRegistry,
  AiStreamEvent,
  AiStreamRequest,
} from "@ringee/platform";
import { PipelineContext } from "../../pipeline-context";
import { ObjectionType, objectionLabel } from "./objection-taxonomy";

/** One top objection's curated evidence (built deterministically in Step A). */
export interface CuratedObjection {
  type: ObjectionType;
  count: number;
  appearanceRate: number;
  convertedRate: number;
  /** Short excerpts from calls where the objection appeared and converted. */
  handledExcerpts: string[];
  /** Short excerpts from calls where the objection appeared and the call died. */
  killedExcerpts: string[];
}

export interface ObjectionAiBatchInput {
  context: PipelineContext;
  objections: CuratedObjection[];
  /** Sample of the `other` bucket for emerging-objection discovery. */
  otherExcerpts: string[];
}

/** AI reasoning for one top objection. */
export interface ObjectionAnalysis {
  underlyingObjection: string;
  winningPattern: string;
  losingPattern: string;
  recommendedResponse: string;
}

export interface EmergingObjection {
  label: string;
  approxCount: number;
  sampleExcerpt: string;
  /** AI: what the discovered objection really means (optional, best-effort). */
  underlyingObjection?: string;
  /** AI: a short recommended response for the discovered objection. */
  recommendedResponse?: string;
}

export interface ObjectionAiBatchOutput {
  perObjection: Map<ObjectionType, ObjectionAnalysis>;
  emergingObjections: EmergingObjection[];
  model?: string;
}

const SYSTEM_PROMPT = `You are a B2B sales objection-handling analyst. You are
given the top recurring objections from many sales calls, each with a small
curated set of short transcript excerpts: some from calls that still converted
("handled") and some from calls that died ("killed"). For each objection,
explain the underlying objection beneath the surface phrase, the pattern that
worked in the handled calls, the pattern that killed the lost calls, and one
short, practical, rep-editable recommended response. You also receive a sample
of uncategorised ("other") objections; intelligently DISCOVER any recurring
objection that is not in the named list, name it in plain language, and give it
the same depth (what it really means + a recommended response).

Rules:
- Use ONLY the excerpts, counts and outcomes provided. Do not invent facts.
- NEVER invent pricing, discounts, guarantees, legal claims or promises.
- Keep every field short and practical. The recommended response is 1-3
  sentences a rep could say verbatim or lightly edit.
- Base "emerging" clusters only on the "other" excerpts; do not duplicate the
  named objections. Only report a cluster that genuinely recurs (2+ calls), and
  give each a concise plain-language label, what it really means, and a
  recommended response.`;

/**
 * Step B of Objection Intelligence: the analytical AI pass. It runs on a
 * bounded, curated sample for the top objections only — never on full
 * transcripts of every eligible call. Output is validated before it is
 * returned. The counting/arithmetic is done in code (Step A) so the numbers are
 * trustworthy; this pass only does interpretation, pattern finding and
 * recommendations.
 */
@Injectable()
export class ObjectionAiBatchService {
  private readonly logger = new Logger(ObjectionAiBatchService.name);

  constructor(private readonly providers: AiProviderRegistry) {}

  async analyze(input: ObjectionAiBatchInput): Promise<ObjectionAiBatchOutput> {
    if (input.objections.length === 0 && input.otherExcerpts.length === 0) {
      return { perObjection: new Map(), emergingObjections: [] };
    }

    const provider = this.providers.get(apiConfiguration.AI_PROVIDER);
    const knownTypes = new Set<string>(input.objections.map((o) => o.type));

    const req: AiStreamRequest = {
      system: SYSTEM_PROMPT,
      temperature: apiConfiguration.AI_TEMPERATURE,
      maxOutputTokens: 2000,
      messages: [{ role: "user", content: this.buildPrompt(input) }],
      tools: [
        {
          name: "emit_objection_analysis",
          description:
            "Emit the interpretation, patterns and recommended response for " +
            "each provided objection, plus any emerging objection clusters.",
          parameters: {
            type: "object",
            properties: {
              objections: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    type: { type: "string", enum: [...knownTypes] },
                    underlyingObjection: { type: "string" },
                    winningPattern: { type: "string" },
                    losingPattern: { type: "string" },
                    recommendedResponse: { type: "string" },
                  },
                  required: [
                    "type",
                    "underlyingObjection",
                    "winningPattern",
                    "losingPattern",
                    "recommendedResponse",
                  ],
                },
              },
              emergingObjections: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    label: { type: "string" },
                    approxCount: { type: "number" },
                    sampleExcerpt: { type: "string" },
                    underlyingObjection: { type: "string" },
                    recommendedResponse: { type: "string" },
                  },
                  required: ["label", "approxCount", "sampleExcerpt"],
                },
              },
            },
            required: ["objections"],
          },
        },
      ],
      toolChoice: "required",
    };

    const { args, model } = await this.collectToolCall(provider.stream(req));
    const { perObjection, emergingObjections } = this.validate(
      args,
      knownTypes,
      input.otherExcerpts.length,
    );
    return { perObjection, emergingObjections, model };
  }

  private buildPrompt(input: ObjectionAiBatchInput): string {
    const objections = input.objections.map((o) => ({
      type: o.type,
      label: objectionLabel(o.type),
      count: o.count,
      handledExcerpts: o.handledExcerpts,
      killedExcerpts: o.killedExcerpts,
    }));
    return [
      `Context: ${input.context.type}.`,
      "Top objections with curated excerpts (handled = call converted, killed =",
      "call died). Return one analysis item per objection, keyed by its `type`.",
      "",
      JSON.stringify({ objections }, null, 0),
      "",
      "Uncategorised ('other') objection excerpts — cluster recurring ones into",
      "emergingObjections (label them in plain language, never reuse the named",
      "objection types):",
      "",
      JSON.stringify({ otherExcerpts: input.otherExcerpts }, null, 0),
    ].join("\n");
  }

  /** Consume the provider stream and return the first completed tool call. */
  private async collectToolCall(
    stream: AsyncIterable<AiStreamEvent>,
  ): Promise<{ args: unknown; model?: string }> {
    let args: unknown = { objections: [] };
    let model: string | undefined;
    for await (const ev of stream) {
      if (ev.type === "tool_call_completed") {
        args = ev.arguments;
      } else if (ev.type === "completed") {
        model = ev.usage?.model;
      } else if (ev.type === "error") {
        throw new Error(ev.error);
      }
    }
    return { args, model };
  }

  /** Hand-written validation (no zod dependency in this package). */
  private validate(
    raw: unknown,
    knownTypes: Set<string>,
    otherCount: number,
  ): {
    perObjection: Map<ObjectionType, ObjectionAnalysis>;
    emergingObjections: EmergingObjection[];
  } {
    const perObjection = new Map<ObjectionType, ObjectionAnalysis>();
    const emergingObjections: EmergingObjection[] = [];
    if (!raw || typeof raw !== "object") {
      return { perObjection, emergingObjections };
    }

    const items = (raw as { objections?: unknown }).objections;
    if (Array.isArray(items)) {
      for (const entry of items) {
        if (!entry || typeof entry !== "object") continue;
        const item = entry as Record<string, unknown>;
        const type = item.type;
        if (typeof type !== "string" || !knownTypes.has(type)) continue;
        if (perObjection.has(type as ObjectionType)) continue; // first wins

        const analysis: ObjectionAnalysis = {
          underlyingObjection: clampStr(item.underlyingObjection, 400),
          winningPattern: clampStr(item.winningPattern, 500),
          losingPattern: clampStr(item.losingPattern, 500),
          recommendedResponse: clampStr(item.recommendedResponse, 600),
        };
        // Drop an item the model returned empty — nothing to show or act on.
        if (!analysis.recommendedResponse && !analysis.underlyingObjection) {
          continue;
        }
        perObjection.set(type as ObjectionType, analysis);
      }
    }

    const emerging = (raw as { emergingObjections?: unknown })
      .emergingObjections;
    if (Array.isArray(emerging)) {
      for (const entry of emerging) {
        if (!entry || typeof entry !== "object") continue;
        const item = entry as Record<string, unknown>;
        const label = clampStr(item.label, 120);
        if (!label) continue;
        const approx =
          typeof item.approxCount === "number" && item.approxCount >= 0
            ? // Never report more than the sample size we actually sent.
              Math.min(Math.round(item.approxCount), otherCount)
            : 0;
        const underlying = clampStr(item.underlyingObjection, 400);
        const recommended = clampStr(item.recommendedResponse, 600);
        emergingObjections.push({
          label,
          approxCount: approx,
          sampleExcerpt: clampStr(item.sampleExcerpt, 280),
          underlyingObjection: underlying || undefined,
          recommendedResponse: recommended || undefined,
        });
      }
    }

    return { perObjection, emergingObjections };
  }
}

function clampStr(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const s = value.trim();
  return s.length > max ? s.slice(0, max) : s;
}
