import type { VoiceAgentTool } from "@ringee/platform";
import type { VoiceAgentToolContext } from "../voice-agent.types";

/**
 * Headers shared by every webhook tool an AI voice agent calls.
 *
 * The secret proves which stored agent made the request. The provider fills
 * the call id from a system variable, so the model cannot attach a support
 * request (or a booking) to a call it invented.
 */
export function voiceAgentWebhookHeaders(ctx: VoiceAgentToolContext) {
  return [
    { name: "X-Ringee-Tool-Secret", secretRef: ctx.toolSecretRef },
    { name: "X-Ringee-Call-Control-Id", value: "{{call_control_id}}" },
  ];
}

/** The same human-escalation capability is present on every agent type. */
export function buildHumanSupportTool(
  ctx: VoiceAgentToolContext,
): VoiceAgentTool {
  return {
    kind: "webhook",
    name: "request_human_support",
    description:
      "Notify the workspace administrators that this person needs human follow-up. Use it when the person explicitly asks for a human, or when another tool fails and a person must finish the request. Ringee attaches the current contact, call and agent automatically.",
    url: `${ctx.toolBaseUrl}/${ctx.agentId}/request-human-support`,
    method: "POST",
    headers: voiceAgentWebhookHeaders(ctx),
    parameters: {
      type: "object",
      properties: {
        subject: {
          type: "string",
          description:
            "A short subject naming the concrete problem or requested follow-up.",
        },
        message: {
          type: "string",
          description:
            "A concise explanation of what happened, what the person needs and any relevant detail from the conversation.",
        },
      },
      required: ["subject", "message"],
    },
  };
}
