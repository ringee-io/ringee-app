import type { VoiceAgentTool } from "@ringee/platform";
import type { VoiceAgentToolContext } from "../voice-agent.types";
import { voiceAgentWebhookHeaders } from "./human-support.tool";

/**
 * Records the lead's explicit answer about the meeting a reminder call is for
 * (AGENT-017). The model names neither the meeting nor the call: Ringee reads
 * both from the authenticated call, so the tool can only ever touch the
 * meeting this call was placed about.
 */
export function buildConfirmAttendanceTool(
  ctx: VoiceAgentToolContext,
): VoiceAgentTool {
  return {
    kind: "webhook",
    name: "confirm_meeting_attendance",
    description:
      'Record the person\'s explicit answer about attending the scheduled meeting this call is about. Ringee knows which meeting it is; you cannot choose another. Use "confirmed" only after a clear yes and "declined" after a clear no. Only say the answer is recorded after this returns success, then follow its speech_instruction.',
    url: `${ctx.toolBaseUrl}/${ctx.agentId}/confirm-attendance`,
    method: "POST",
    headers: voiceAgentWebhookHeaders(ctx),
    parameters: {
      type: "object",
      properties: {
        attendance: {
          type: "string",
          enum: ["confirmed", "declined"],
          description:
            '"confirmed" when the person clearly said they will attend; "declined" when they clearly said they will not.',
        },
        email: {
          type: "string",
          description:
            "Only when there is no email on file: the address the person dictated and then confirmed when you read it back. Leave it out otherwise.",
        },
        note: {
          type: "string",
          description:
            "A short note of what the person said, for example that they would like another time.",
        },
      },
      required: ["attendance"],
    },
  };
}
