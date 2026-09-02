import type { VoiceAgentConversationSettings } from "./voice-agent.types";

const GREETING_MODES = new Set<VoiceAgentConversationSettings["greetingMode"]>([
  "assistant_speaks_first",
  "assistant_generates_greeting",
  "assistant_waits_for_user",
]);

/** Reads legacy or partially written JSON without trusting its shape. */
export function readVoiceAgentConversationSettings(
  raw: unknown,
  defaults: VoiceAgentConversationSettings,
): VoiceAgentConversationSettings {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return defaults;
  const value = raw as Record<string, unknown>;
  const mode = value.greetingMode;
  return {
    greetingMode:
      typeof mode === "string" &&
      GREETING_MODES.has(mode as VoiceAgentConversationSettings["greetingMode"])
        ? (mode as VoiceAgentConversationSettings["greetingMode"])
        : defaults.greetingMode,
    greeting:
      typeof value.greeting === "string" ? value.greeting : defaults.greeting,
    instructions:
      typeof value.instructions === "string" && value.instructions.trim()
        ? value.instructions
        : defaults.instructions,
    postConversationEnabled:
      typeof value.postConversationEnabled === "boolean"
        ? value.postConversationEnabled
        : defaults.postConversationEnabled,
    postConversationInstructions:
      typeof value.postConversationInstructions === "string"
        ? value.postConversationInstructions
        : defaults.postConversationInstructions,
  };
}

/**
 * User markdown is the main prompt. Telnyx's post-call turn shares the system
 * prompt, so its phase-specific instructions receive a hard boundary. The
 * blueprint safety block is last whenever the user customized either phase.
 */
export function composeVoiceAgentInstructions(
  settings: VoiceAgentConversationSettings,
  defaults: VoiceAgentConversationSettings,
  safetyInstructions: string,
): string {
  const sections = [settings.instructions.trim()];
  const hasCustomInstructions =
    settings.instructions.trim() !== defaults.instructions.trim();
  const hasPostInstructions =
    settings.postConversationEnabled &&
    Boolean(settings.postConversationInstructions.trim());
  if (
    settings.postConversationEnabled &&
    settings.postConversationInstructions.trim()
  ) {
    sections.push(
      [
        "## Post-conversation processing",
        "",
        "Only after the live conversation has ended, follow the instructions",
        "below. Do not run them during the call. Telephony-control tools are",
        "not available in this phase.",
        "",
        settings.postConversationInstructions.trim(),
      ].join("\n"),
    );
  }
  if (hasCustomInstructions || hasPostInstructions) {
    sections.push(safetyInstructions.trim());
  }
  return sections.filter(Boolean).join("\n\n");
}
