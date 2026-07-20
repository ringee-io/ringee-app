import { Injectable, Logger } from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import { PendingActionPriority } from "@ringee/database";
import {
  AiProviderRegistry,
  AiStreamEvent,
  AiStreamRequest,
  AiUsage,
} from "@ringee/platform";
import { AnalyzedCall, PipelineRunInput } from "../ai-pipeline.types";
import { AiPipelineCreditService } from "../ai-pipeline-credit.service";
import { PipelineContext } from "../pipeline-context";

export interface AiEnrichment {
  callId: string;
  priority?: PendingActionPriority;
  reason?: string;
  suggestedMessage?: string;
  nextBestAction?: string;
  dueInDays?: number;
  dismiss?: boolean;
}

export interface FollowUpAiBatchOutput {
  enrichment: Map<string, AiEnrichment>;
  model?: string;
  enrichedCount: number;
  chargedCredits: number;
}

const SYSTEM_PROMPT = `You are a sales follow-up assistant. You review completed
call outcomes and their transcript-derived signals and improve the suggested
next action for each. You ONLY use the data provided. You MUST NOT invent
pricing, discounts, guarantees, legal claims, or promises. Keep suggested
messages short, professional and specific to what was discussed. If a call has
no real opening, set dismiss=true for it.`;

/**
 * Layer 2 batch enrichment for Follow-up Recommendations. Gated by the pipeline
 * behind AI_FOLLOWUP_AI_ENABLED. Returns per-call enrichment that the pipeline
 * merges onto its rule drafts. Output is validated before it is returned.
 */
@Injectable()
export class FollowUpAiBatchService {
  private readonly logger = new Logger(FollowUpAiBatchService.name);

  constructor(
    private readonly providers: AiProviderRegistry,
    private readonly billing: AiPipelineCreditService,
  ) {}

  async enrich(input: PipelineRunInput): Promise<FollowUpAiBatchOutput> {
    // The AI layer only processes calls with a usable transcript.
    const calls = input.eligibleCalls.filter((c) => c.hasUsableTranscript);
    if (calls.length === 0) {
      return { enrichment: new Map(), enrichedCount: 0, chargedCredits: 0 };
    }

    const provider = this.providers.get(apiConfiguration.AI_PROVIDER);
    const req: AiStreamRequest = {
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: this.buildPrompt(input.context, calls),
        },
      ],
      tools: [
        {
          name: "emit_enrichment",
          description:
            "Emit improved follow-up guidance for each provided call.",
          parameters: {
            type: "object",
            properties: {
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    callId: { type: "string" },
                    priority: {
                      type: "string",
                      enum: ["low", "medium", "high"],
                    },
                    reason: { type: "string" },
                    suggestedMessage: { type: "string" },
                    nextBestAction: { type: "string" },
                    dueInDays: { type: "number" },
                    dismiss: { type: "boolean" },
                  },
                  required: ["callId"],
                },
              },
            },
            required: ["items"],
          },
        },
      ],
      toolChoice: "required",
      maxOutputTokens: 1200,
    };

    const { args, usage } = await this.collectToolCall(provider.stream(req));
    const chargedCredits = await this.billing.chargeUsage({
      context: input.context,
      fallbackUserId: calls.find((call) => call.userId)?.userId,
      usage,
      operation: "Follow-up Intelligence batch",
    });
    const enrichment = this.validate(args, new Set(calls.map((c) => c.callId)));
    return {
      enrichment,
      model: usage?.model,
      enrichedCount: enrichment.size,
      chargedCredits,
    };
  }

  private buildPrompt(ctx: PipelineContext, calls: AnalyzedCall[]): string {
    const lines = calls.map((c) => ({
      callId: c.callId,
      outcome: c.outcomeClass,
      durationBucket: c.durationBucket,
      objections: c.objections.map((o) => o.type),
      intentSignals: c.intentSignals,
      notablePhrases: c.notablePhrases.slice(0, 3),
    }));
    return [
      `Context: ${ctx.type}.`,
      "For each call below, return an enrichment item keyed by callId. Improve",
      "priority, reason, nextBestAction and suggestedMessage where the signals",
      "justify it. Set dismiss=true if there is no real follow-up opportunity.",
      "",
      JSON.stringify(lines),
    ].join("\n");
  }

  /** Consume the provider stream and return the first completed tool call. */
  private async collectToolCall(
    stream: AsyncIterable<AiStreamEvent>,
  ): Promise<{ args: unknown; usage?: AiUsage }> {
    let args: unknown = { items: [] };
    let usage: AiUsage | undefined;
    for await (const ev of stream) {
      if (ev.type === "tool_call_completed") {
        args = ev.arguments;
      } else if (ev.type === "completed") {
        usage = ev.usage;
      } else if (ev.type === "error") {
        throw new Error(ev.error);
      }
    }
    return { args, usage };
  }

  /** Hand-written validation (no zod dependency in this package). */
  private validate(
    raw: unknown,
    knownCallIds: Set<string>,
  ): Map<string, AiEnrichment> {
    const out = new Map<string, AiEnrichment>();
    if (!raw || typeof raw !== "object") return out;
    const items = (raw as { items?: unknown }).items;
    if (!Array.isArray(items)) return out;

    for (const entry of items) {
      if (!entry || typeof entry !== "object") continue;
      const item = entry as Record<string, unknown>;
      const callId = item.callId;
      if (typeof callId !== "string" || !knownCallIds.has(callId)) continue;

      const enrichment: AiEnrichment = { callId };
      if (
        item.priority === "low" ||
        item.priority === "medium" ||
        item.priority === "high"
      ) {
        enrichment.priority = item.priority as PendingActionPriority;
      }
      if (typeof item.reason === "string") {
        enrichment.reason = clamp(item.reason, 500);
      }
      if (typeof item.suggestedMessage === "string") {
        enrichment.suggestedMessage = clamp(item.suggestedMessage, 800);
      }
      if (typeof item.nextBestAction === "string") {
        enrichment.nextBestAction = clamp(item.nextBestAction, 300);
      }
      if (
        typeof item.dueInDays === "number" &&
        item.dueInDays >= 0 &&
        item.dueInDays <= 90
      ) {
        enrichment.dueInDays = Math.round(item.dueInDays);
      }
      if (typeof item.dismiss === "boolean") {
        enrichment.dismiss = item.dismiss;
      }

      out.set(callId, enrichment);
    }
    return out;
  }
}

function clamp(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s;
}
