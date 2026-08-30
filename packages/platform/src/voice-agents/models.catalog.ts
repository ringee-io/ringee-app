import { apiConfiguration } from "@ringee/configuration";
import type { VoiceAgentLlmProvider } from "./interfaces/voice-agent.provider";

/**
 * Which model runs behind each user-facing choice.
 *
 * The product deliberately does not expose model ids: a user picks "Ringee AI"
 * or a provider they already pay for, and Ringee decides which model that is.
 * That indirection lives here so upgrading a model is a config change, not a
 * migration of every stored agent.
 */
export interface VoiceAgentModelOption {
  provider: VoiceAgentLlmProvider;
  /** Provider-side model id. Internal — never rendered to the user. */
  modelId: string;
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
      requiresApiKey: false,
    },
    {
      provider: "openai",
      modelId: apiConfiguration.AI_VOICE_AGENT_OPENAI_MODEL,
      requiresApiKey: true,
    },
    {
      provider: "anthropic",
      modelId: apiConfiguration.AI_VOICE_AGENT_ANTHROPIC_MODEL,
      requiresApiKey: true,
    },
    {
      provider: "google",
      modelId: apiConfiguration.AI_VOICE_AGENT_GOOGLE_MODEL,
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
