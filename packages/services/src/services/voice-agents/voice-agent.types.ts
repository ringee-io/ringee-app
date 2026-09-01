import { AiVoiceAgentOutcome, AiVoiceAgentType } from "@ringee/database";
import type {
  VoiceAgentInsightDefinition,
  VoiceAgentTool,
} from "@ringee/platform";

/**
 * The shapes a pre-built voice agent is made of.
 *
 * V1 ships two agent types, and a user configures neither the prompt nor the
 * tools. A blueprint is where that intelligence lives: given the workspace's
 * company context and the user's few choices, it produces the instructions,
 * the greeting, the tools and the post-call analysis for one agent type.
 */

/** A dynamic variable a caller may supply when starting a call. */
export interface VoiceAgentVariableDefinition {
  /** Snake-case name used inside the instructions, e.g. `first_name`. */
  key: string;
  label: string;
  required: boolean;
  description: string;
}

/** The types a user-defined extraction field can have (§15). */
export type VoiceAgentExtractionFieldType =
  | "text"
  | "number"
  | "boolean"
  | "select";

export interface VoiceAgentExtractionField {
  key: string;
  label: string;
  type: VoiceAgentExtractionFieldType;
  description: string;
  /** Allowed values, for `select` fields. */
  options?: string[];
}

/**
 * Which post-call analyses run, and the provider insight ids they were
 * registered under. The ids are stored so an edit updates the existing
 * insight instead of leaving orphans behind.
 */
export interface VoiceAgentAnalysisSettings {
  summary: boolean;
  outcome: boolean;
  sentiment: boolean;
  insightIds: {
    summary?: string;
    outcome?: string;
    sentiment?: string;
    extraction?: string;
  };
}

export const DEFAULT_ANALYSIS_SETTINGS: VoiceAgentAnalysisSettings = {
  summary: true,
  outcome: true,
  sentiment: false,
  insightIds: {},
};

/** The company context every agent in a workspace shares (§6). */
export interface VoiceAgentCompanyContext {
  name: string;
  description: string;
  website: string;
}

/** Everything a blueprint needs to write an agent's prompt. */
export interface VoiceAgentPromptContext {
  /** The name the agent introduces itself with. */
  agentName: string;
  company: VoiceAgentCompanyContext;
  /** Base language of the selected voice, e.g. "es". */
  language: string;
  /** Appointment booking only. */
  timezone?: string | null;
  meetingDurationMinutes?: number;
  meetingTitle?: string | null;
}

/** Everything a blueprint needs to wire an agent's tools. */
export interface VoiceAgentToolContext {
  agentId: string;
  /** Absolute base URL the provider calls Ringee back on. */
  toolBaseUrl: string;
  /** Provider secret reference proving a tool call came from this agent. */
  toolSecretRef: string;
  /** Knowledge stores to attach, when the agent has any. */
  knowledgeBucketIds: string[];
}

export interface VoiceAgentInsightContext {
  analysis: VoiceAgentAnalysisSettings;
  extractionFields: VoiceAgentExtractionField[];
}

/**
 * One pre-built agent type. Adding a third type means writing a blueprint and
 * registering it — nothing in the agent service changes.
 */
export interface VoiceAgentBlueprint {
  type: AiVoiceAgentType;
  /** Card copy on the "create an agent" screen. */
  title: string;
  summary: string;
  /** Variables this agent type accepts per call (§11). */
  variables: VoiceAgentVariableDefinition[];
  /** The closed set of outcomes this agent can conclude with. */
  outcomes: AiVoiceAgentOutcome[];
  /** Whether a connected calendar is required before the agent can go active. */
  requiresCalendar: boolean;

  buildInstructions(ctx: VoiceAgentPromptContext): string;
  buildGreeting(ctx: VoiceAgentPromptContext): string;
  buildTools(ctx: VoiceAgentToolContext): VoiceAgentTool[];
  buildInsights(ctx: VoiceAgentInsightContext): VoiceAgentBlueprintInsights;
}

/** Insight definitions keyed by the slot they fill, so ids can be tracked. */
export interface VoiceAgentBlueprintInsights {
  summary?: VoiceAgentInsightDefinition;
  outcome?: VoiceAgentInsightDefinition;
  sentiment?: VoiceAgentInsightDefinition;
  extraction?: VoiceAgentInsightDefinition;
}

/**
 * `Call.source` for a call an agent placed. Server-originated and never
 * caller-supplied, which is what lets the concurrency guard trust it.
 */
export const AI_VOICE_AGENT_CALL_SOURCE = "ai_voice_agent";

/**
 * `Contact.source` for a contact first seen because an agent dialed it.
 *
 * Hyphenated, unlike `AI_VOICE_AGENT_CALL_SOURCE`: `Contact.source` is a free
 * text attribution alongside `dialer`, `campaign` and `lead-search:*`, while
 * `Call.source` is matched exactly by the concurrency guard.
 */
export const AI_VOICE_AGENT_CONTACT_SOURCE = "ai-voice-agent";

/**
 * The variables that describe the *person* rather than the call.
 *
 * Every blueprint asks for these under the same keys, and they are the only
 * thing Ringee knows about someone an agent is told to dial — so they are what
 * the contact left behind in the workspace is named from. A blueprint that does
 * not declare one simply has nothing to contribute here.
 */
export const CONTACT_IDENTITY_VARIABLES = {
  firstName: "first_name",
  lastName: "last_name",
  email: "email",
} as const;

/**
 * Reads the person's identity out of a call's variables.
 *
 * Takes `unknown` because the same values are read twice: freshly validated
 * when the call is placed, and back out of the call row's JSON column later.
 * Anything that is not a string is dropped rather than trusted.
 */
export function contactIdentityFromVariables(variables: unknown): {
  firstName?: string;
  lastName?: string;
  email?: string;
} {
  const read = (key: string): string | undefined => {
    const value = (variables as Record<string, unknown> | null)?.[key];
    return typeof value === "string" ? value : undefined;
  };
  return {
    firstName: read(CONTACT_IDENTITY_VARIABLES.firstName),
    lastName: read(CONTACT_IDENTITY_VARIABLES.lastName),
    email: read(CONTACT_IDENTITY_VARIABLES.email),
  };
}

/**
 * Name of the provider-side store holding one agent's knowledge. Shared so the
 * knowledge service and the agent's own teardown agree on what to delete.
 */
export function voiceAgentKnowledgeStoreName(agentId: string): string {
  return `ringee-agent-${agentId}`;
}

/**
 * DI token collecting every blueprint. Adding an agent type means implementing
 * a blueprint and adding it to this factory — the registry and the agent
 * service stay untouched.
 */
export const VOICE_AGENT_BLUEPRINTS = Symbol("VOICE_AGENT_BLUEPRINTS");

/** Variables Ringee always supplies, on top of the per-type ones (§11). */
export const RINGEE_DYNAMIC_VARIABLES = [
  "agent_name",
  "company_name",
  "company_description",
  "company_website",
] as const;
