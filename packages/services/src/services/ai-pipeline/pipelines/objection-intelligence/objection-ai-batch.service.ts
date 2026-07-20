import { Injectable } from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import {
  AiProviderRegistry,
  AiStreamEvent,
  AiStreamRequest,
} from "@ringee/platform";
import { PipelineContext } from "../../pipeline-context";
import { ObjectionResolution } from "./objection-semantic";

export interface ObjectionAnalysis {
  underlyingObjection: string;
  winningPattern: string;
  losingPattern: string;
  recommendedResponse: string;
}

export interface IncrementalObjectionEvidence {
  clusterKey: string;
  label: string;
  count: number;
  appearanceRate: number;
  convertedRate: number;
  /** Rolling intelligence from prior calls; never the old transcripts. */
  previousAnalysis?: ObjectionAnalysis;
  /** Evidence extracted from calls analyzed for the first time in this run. */
  newEvidence: Array<{
    underlyingConcern: string;
    evidenceExcerpt: string;
    sellerResponseExcerpt?: string;
    resolution: ObjectionResolution;
  }>;
}

export interface ObjectionAiBatchInput {
  context: PipelineContext;
  objections: IncrementalObjectionEvidence[];
}

export interface ObjectionAiBatchOutput {
  perObjection: Map<string, ObjectionAnalysis>;
  model?: string;
}

const SYSTEM_PROMPT = `You maintain rolling objection intelligence for a B2B
sales context. Objection clusters are dynamic and were discovered semantically
from complete multilingual call transcripts. For each cluster, update its
analysis using the previous rolling analysis plus ONLY the new evidence from
calls processed for the first time in this run.

Synthesize what the objection really means, what seller approach worked, what
failed, and one short practical response. Evidence may be in any language;
write the analysis in the cluster label's language. Preserve useful prior
knowledge when new evidence does not contradict it. Never invent pricing,
discounts, guarantees, facts, promises, or claims not supported by the supplied
evidence. Keep the recommended response to 1-3 editable sentences.`;

/**
 * Incrementally refresh cluster guidance. Old calls are represented only by
 * the saved rolling analysis; their transcript excerpts are never resent.
 */
@Injectable()
export class ObjectionAiBatchService {
  constructor(private readonly providers: AiProviderRegistry) {}

  async analyze(input: ObjectionAiBatchInput): Promise<ObjectionAiBatchOutput> {
    const objections = input.objections.filter(
      (objection) => objection.newEvidence.length > 0,
    );
    if (objections.length === 0) {
      return { perObjection: new Map() };
    }

    const provider = this.providers.get(apiConfiguration.AI_PROVIDER);
    const knownKeys = new Set(
      objections.map((objection) => objection.clusterKey),
    );
    const req: AiStreamRequest = {
      system: SYSTEM_PROMPT,
      maxOutputTokens: 2400,
      messages: [
        {
          role: "user",
          content: [
            `Context: ${input.context.type}`,
            "Update each supplied objection cluster from its previous rolling",
            "analysis and new evidence. Return one item per clusterKey.",
            "",
            JSON.stringify({ objections }),
          ].join("\n"),
        },
      ],
      tools: [
        {
          name: "emit_objection_intelligence",
          description:
            "Emit updated rolling intelligence for every supplied dynamic objection cluster.",
          parameters: {
            type: "object",
            properties: {
              objections: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    clusterKey: { type: "string", enum: [...knownKeys] },
                    underlyingObjection: { type: "string" },
                    winningPattern: { type: "string" },
                    losingPattern: { type: "string" },
                    recommendedResponse: { type: "string" },
                  },
                  required: [
                    "clusterKey",
                    "underlyingObjection",
                    "winningPattern",
                    "losingPattern",
                    "recommendedResponse",
                  ],
                },
              },
            },
            required: ["objections"],
          },
        },
      ],
      toolChoice: "required",
    };

    const { args, model } = await collectToolCall(provider.stream(req));
    return { perObjection: validate(args, knownKeys), model };
  }
}

async function collectToolCall(
  stream: AsyncIterable<AiStreamEvent>,
): Promise<{ args: unknown; model?: string }> {
  let args: unknown = { objections: [] };
  let model: string | undefined;
  for await (const event of stream) {
    if (event.type === "tool_call_completed") args = event.arguments;
    else if (event.type === "completed") model = event.usage?.model;
    else if (event.type === "error") throw new Error(event.error);
  }
  return { args, model };
}

function validate(
  raw: unknown,
  knownKeys: Set<string>,
): Map<string, ObjectionAnalysis> {
  const output = new Map<string, ObjectionAnalysis>();
  if (!raw || typeof raw !== "object") return output;
  const entries = (raw as { objections?: unknown }).objections;
  if (!Array.isArray(entries)) return output;

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    const clusterKey = clampString(item.clusterKey, 80);
    if (!knownKeys.has(clusterKey) || output.has(clusterKey)) continue;
    const analysis: ObjectionAnalysis = {
      underlyingObjection: clampString(item.underlyingObjection, 500),
      winningPattern: clampString(item.winningPattern, 600),
      losingPattern: clampString(item.losingPattern, 600),
      recommendedResponse: clampString(item.recommendedResponse, 700),
    };
    if (!analysis.underlyingObjection && !analysis.recommendedResponse)
      continue;
    output.set(clusterKey, analysis);
  }
  return output;
}

function clampString(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const text = value.trim();
  return text.length > max ? text.slice(0, max) : text;
}
