import { AiVoiceAgentOutcome } from "@ringee/database";
import type { VoiceAgentInsightDefinition } from "@ringee/platform";
import type {
  VoiceAgentBlueprintInsights,
  VoiceAgentExtractionField,
  VoiceAgentInsightContext,
} from "../voice-agent.types";

/**
 * The post-call analyses shared by every agent type.
 *
 * Summary and outcome are on by default (§15); sentiment is opt-in; the
 * extraction insight only exists once the user has defined a field. Each one is
 * a separate provider insight so a user turning sentiment off does not disturb
 * the others, and so a result maps back to exactly one slot.
 */

/**
 * Closes an insight's result schema the way the provider demands.
 *
 * A `json_schema` on an insight is validated as an OpenAI *strict* structured
 * output, which is stricter than JSON Schema: every object must set
 * `additionalProperties: false`, and `required` must name **every** key in
 * `properties` — a partial `required` is rejected outright. Getting either
 * wrong fails the insight write, which fails the whole agent sync, so no schema
 * here is written by hand.
 *
 * "Every key required" is not a semantic constraint, because a field that may
 * legitimately have no value declares `null` in its own type. The model always
 * emits the key; it emits `null` when the call did not establish a value.
 */
function strictObjectSchema(
  properties: Record<string, unknown>,
): Record<string, unknown> {
  return {
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

function summaryInsight(): VoiceAgentInsightDefinition {
  return {
    name: "Ringee call summary",
    instructions: [
      "Summarize this phone conversation for the person who scheduled the call.",
      "Cover what was communicated, how the other person responded, and anything",
      "they asked for or committed to. Three to five sentences, no pleasantries,",
      "no speculation about facts that were never said.",
    ].join(" "),
  };
}

/**
 * The outcome is a closed set, and the model must pick from it rather than
 * inventing a label — the whole point is that callers can branch on it.
 */
function outcomeInsight(
  outcomes: AiVoiceAgentOutcome[],
  guidance: string,
): VoiceAgentInsightDefinition {
  return {
    name: "Ringee call outcome",
    instructions: [
      "Decide what this conversation actually achieved and return it as one of",
      "the allowed outcome values. Judge only by what was said on the call.",
      guidance,
      `Use "${AiVoiceAgentOutcome.no_conversation}" when nobody engaged — voicemail,`,
      "an immediate hang-up, or a wrong number. Use",
      `"${AiVoiceAgentOutcome.unknown}" only when the transcript genuinely does not`,
      "support any other value.",
    ].join(" "),
    jsonSchema: strictObjectSchema({
      outcome: {
        type: "string",
        enum: outcomes,
        description: "The single outcome that best describes the call.",
      },
      reason: {
        type: "string",
        description: "One sentence quoting or paraphrasing what decided it.",
      },
    }),
  };
}

function sentimentInsight(): VoiceAgentInsightDefinition {
  return {
    name: "Ringee call sentiment",
    instructions: [
      "Judge how the person on the other end of this call felt about the",
      "interaction overall, from their tone and their words.",
    ].join(" "),
    jsonSchema: strictObjectSchema({
      sentiment: {
        type: "string",
        enum: ["positive", "neutral", "negative"],
      },
    }),
  };
}

/** Maps one user-defined field onto its JSON Schema property. */
function fieldSchema(
  field: VoiceAgentExtractionField,
): Record<string, unknown> {
  const base = { description: field.description };
  switch (field.type) {
    case "number":
      return { ...base, type: ["number", "null"] };
    case "boolean":
      return { ...base, type: ["boolean", "null"] };
    case "select":
      return {
        ...base,
        type: ["string", "null"],
        enum: [...(field.options ?? []), null],
      };
    case "text":
    default:
      return { ...base, type: ["string", "null"] };
  }
}

/**
 * One insight covering every custom field, rather than one insight per field:
 * the model reads the transcript once, and a single result maps cleanly onto
 * `extractedData`.
 */
function extractionInsight(
  fields: VoiceAgentExtractionField[],
): VoiceAgentInsightDefinition {
  const properties: Record<string, unknown> = {};
  for (const field of fields) {
    properties[field.key] = fieldSchema(field);
  }

  return {
    name: "Ringee extracted data",
    instructions: [
      "Extract the requested information from this conversation.",
      "Return null for any field the conversation does not actually establish —",
      "never guess, never infer a value from a similar-sounding statement.",
    ].join(" "),
    jsonSchema: strictObjectSchema(properties),
  };
}

export function buildSharedInsights(
  ctx: VoiceAgentInsightContext,
  outcomes: AiVoiceAgentOutcome[],
  outcomeGuidance: string,
): VoiceAgentBlueprintInsights {
  return {
    ...(ctx.analysis.summary ? { summary: summaryInsight() } : {}),
    ...(ctx.analysis.outcome
      ? { outcome: outcomeInsight(outcomes, outcomeGuidance) }
      : {}),
    ...(ctx.analysis.sentiment ? { sentiment: sentimentInsight() } : {}),
    ...(ctx.extractionFields.length
      ? { extraction: extractionInsight(ctx.extractionFields) }
      : {}),
  };
}
