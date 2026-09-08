import type { VoiceAgentConversationSettings } from "./voice-agent.types";

/**
 * Runtime values Ringee owns and refreshes when a conversation starts.
 *
 * Provider assistants are long-lived, so putting a literal timestamp in their
 * stored instructions would make it stale. The instructions reference these
 * dynamic variables instead; phone calls override them per dial and browser
 * test sessions refresh them when the session opens.
 */
export function voiceAgentRuntimeVariables(
  timezone: string | null | undefined,
  now = new Date(),
): Record<string, string> {
  const selectedTimezone = timezone?.trim() || "UTC";
  const format = (timeZone: string) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
      timeZoneName: "longOffset",
    }).format(now);

  try {
    return {
      agent_timezone: selectedTimezone,
      current_datetime: format(selectedTimezone),
    };
  } catch {
    // Older rows could predate IANA validation. A bad legacy value must not
    // prevent a call; UTC is explicit and deterministic rather than guessed.
    return {
      agent_timezone: "UTC",
      current_datetime: format("UTC"),
    };
  }
}

const RUNTIME_CONTEXT_INSTRUCTIONS = [
  "## Ringee runtime context",
  "",
  "At the start of this conversation, the local date and time is",
  "{{current_datetime}} in {{agent_timezone}}. Treat this value and time zone",
  "as authoritative when interpreting relative dates such as today, tomorrow",
  "or next week.",
].join("\n");

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
  sections.push(RUNTIME_CONTEXT_INSTRUCTIONS);
  if (hasCustomInstructions || hasPostInstructions) {
    sections.push(safetyInstructions.trim());
  }
  return sections.filter(Boolean).join("\n\n");
}
