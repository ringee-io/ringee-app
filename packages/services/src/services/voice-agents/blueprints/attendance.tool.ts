import type { VoiceAgentTool } from "@ringee/platform";
import type { VoiceAgentToolContext } from "../voice-agent.types";
import { voiceAgentWebhookHeaders } from "./human-support.tool";

export function buildFinishMeetingResponseTool(ctx: VoiceAgentToolContext): VoiceAgentTool {
  return {
    kind: "webhook", name: "finish_meeting_response", method: "POST",
    url: `${ctx.toolBaseUrl}/${ctx.agentId}/finish-meeting-response`, headers: voiceAgentWebhookHeaders(ctx),
    description: "After a person cannot attend and declines rescheduling, explicitly ask whether they want this appointment cancelled. Record their actual answer. Only cancellation=yes after an unambiguous yes to that question cancels. A no or unclear answer retains the reservation. Never infer cancellation from an attendance decline. Say it is cancelled only after success. If they still request another time, retain that separate request.",
    parameters: { type: "object", properties: {
      cancellation: { type: "string", enum: ["yes", "no", "unclear"], description: "The answer to the explicit cancellation question in this conversation." },
      rescheduling: { type: "string", enum: ["requested", "declined"] },
      response: { type: "string", description: "The person's actual words answering the cancellation question, not a summary or inferred intention." },
    }, required: ["cancellation", "rescheduling", "response"] },
  };
}

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
