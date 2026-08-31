import { apiConfiguration } from "@ringee/configuration";
import type { VoiceAgentLlmProvider } from "./interfaces/voice-agent.provider";

/**
 * Which model runs behind each user-facing choice.
 *
 * A user picks a family — "Ringee AI", or a provider they already pay for — and
 * Ringee decides which model that is. The indirection lives here so upgrading a
 * model is a config change, not a migration of every stored agent.
 *
 * The chosen model is **shown**, not hidden: someone deciding between Ringee AI
 * and their own OpenAI key is deciding between two concrete models, and the
 * version is what tells them whether the upgrade they read about has landed.
 * Which model a provider maps to is still Ringee's call, not the user's.
 */
export interface VoiceAgentModelOption {
  provider: VoiceAgentLlmProvider;
  /** Provider-side model id, e.g. `moonshotai/Kimi-K2.6`. Shown to the user. */
  modelId: string;
  /** The name of the choice itself, e.g. "Ringee AI". */
  displayName: string;
  /**
   * Where the model runs. `ringee` is hosted by our voice provider and included
   * in the call price; `byok` bills to the customer's own account.
   */
  hosting: "ringee" | "byok";
  /** The default choice, and the only one that needs no setup. */
  recommended: boolean;
  /** One line on when to pick this one. */
  summary: string;
  /**
   * Whether the customer must supply their own credential. Only the Ringee
   * option runs on a model our voice provider hosts itself.
   */
  requiresApiKey: boolean;
}

export function listVoiceAgentModels(): VoiceAgentModelOption[] {
  return [
    {
      provider: "ringee",
      modelId: apiConfiguration.AI_VOICE_AGENT_RINGEE_MODEL,
      displayName: "Ringee AI",
      hosting: "ringee",
      recommended: true,
      summary: "Included in the call price. Nothing to set up.",
      requiresApiKey: false,
    },
    {
      provider: "openai",
      modelId: apiConfiguration.AI_VOICE_AGENT_OPENAI_MODEL,
      displayName: "OpenAI",
      hosting: "byok",
      recommended: false,
      summary: "Runs on your OpenAI account and bills there.",
      requiresApiKey: true,
    },
    {
      provider: "anthropic",
      modelId: apiConfiguration.AI_VOICE_AGENT_ANTHROPIC_MODEL,
      displayName: "Claude",
      hosting: "byok",
      recommended: false,
      summary: "Runs on your Anthropic account and bills there.",
      requiresApiKey: true,
    },
    {
      provider: "google",
      modelId: apiConfiguration.AI_VOICE_AGENT_GOOGLE_MODEL,
      displayName: "Gemini",
      hosting: "byok",
      recommended: false,
      summary: "Runs on your Google AI account and bills there.",
      requiresApiKey: true,
    },
  ];
}

export function resolveVoiceAgentModel(
  provider: VoiceAgentLlmProvider,
): VoiceAgentModelOption {
  const option = listVoiceAgentModels().find((m) => m.provider === provider);
  if (!option) {
    throw new Error(`No voice agent model configured for provider ${provider}`);
  }
  return option;
}
