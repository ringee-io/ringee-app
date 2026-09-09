import type { VoiceAgentTool } from "@ringee/platform";
import type { VoiceAgentToolContext } from "../voice-agent.types";
import { voiceAgentWebhookHeaders } from "./human-support.tool";

/** A durable callback the same AI voice agent will place at the agreed time. */
export function buildScheduleCallbackTool(
  ctx: VoiceAgentToolContext,
): VoiceAgentTool {
  return {
    kind: "webhook",
    name: "schedule_callback",
    description:
      "Schedule this AI voice agent to call the person again at the exact future date and time they agreed to. Only promise the callback after this tool returns success.",
    url: `${ctx.toolBaseUrl}/${ctx.agentId}/schedule-callback`,
    method: "POST",
    headers: voiceAgentWebhookHeaders(ctx),
    parameters: {
      type: "object",
      properties: {
        scheduled_at: {
          type: "string",
          description:
            "The agreed callback time as an ISO 8601 timestamp with an explicit offset, e.g. 2026-09-09T14:30:00-04:00.",
        },
        note: {
          type: "string",
          description:
            "A concise note explaining why the person asked to be called back.",
        },
      },
      required: ["scheduled_at"],
    },
  };
}
