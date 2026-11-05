import type { VoiceAgentTool } from "@ringee/platform";
import type { VoiceAgentToolContext } from "../voice-agent.types";
import { voiceAgentWebhookHeaders } from "./human-support.tool";

/**
 * The tools of one agent continuing another's call (AGENT-021).
 *
 * The provider's own handoff tool moves the conversation; these are the
 * Ringee halves on either side of it. The handing agent stores the request
 * before it may hand over, and the agent that takes over reads it back — from
 * the call the provider names in the header, never from the model.
 */

/** Reminders: store the reschedule request before handing the call over. */
export function buildPrepareRescheduleHandoffTool(
  ctx: VoiceAgentToolContext,
): VoiceAgentTool {
  return {
    kind: "webhook",
    name: "prepare_reschedule_handoff",
    description:
      "Call this when the person cannot attend the scheduled meeting and agreed to look for another time now. Ringee records the request, checks the scheduling assistant can take the call, and tells you whether to hand over. Never use the handoff tool before this returns success on this call.",
    url: `${ctx.toolBaseUrl}/${ctx.agentId}/prepare-reschedule-handoff`,
    method: "POST",
    headers: voiceAgentWebhookHeaders(ctx),
    parameters: {
      type: "object",
      properties: {
        person_said: {
          type: "string",
          description:
            "A short note of what the person said about not being able to attend.",
        },
        preferences: {
          type: "string",
          description:
            "When they would prefer the new time, in their words, e.g. 'tomorrow afternoon'. Leave it out when they did not say.",
        },
        identity_confirmed: {
          type: "boolean",
          description:
            "True when you already confirmed you are speaking with the person the meeting is for.",
        },
        language: {
          type: "string",
          description:
            "Only when the person asked to switch language during the call: the language you are now speaking, e.g. 'en'. Leave it out otherwise.",
        },
      },
      required: [],
    },
  };
}

/**
 * Reminders: a callback by the scheduling assistant, when the handoff did not
 * go through or the person would rather be called later.
 */
export function buildRescheduleCallbackTool(
  ctx: VoiceAgentToolContext,
): VoiceAgentTool {
  return {
    kind: "webhook",
    name: "schedule_reschedule_callback",
    description:
      "Schedule the scheduling assistant to call the person back to find a new time for the meeting, at the exact future date and time they agreed to. Use it when the handoff did not go through or they would rather be called later. Only promise the call after this returns success.",
    url: `${ctx.toolBaseUrl}/${ctx.agentId}/schedule-reschedule-callback`,
    method: "POST",
    headers: voiceAgentWebhookHeaders(ctx),
    parameters: {
      type: "object",
      properties: {
        scheduled_at: {
          type: "string",
          description:
            "The agreed time as an ISO 8601 timestamp with an explicit offset, e.g. 2026-09-09T14:30:00-04:00.",
        },
        why: {
          type: "string",
          enum: ["handoff_failed", "person_prefers_callback"],
          description:
            '"handoff_failed" when handing the call over did not work; "person_prefers_callback" when they would rather be called later.',
        },
        note: {
          type: "string",
          description: "A short note for the team about what they want.",
        },
        person_said: {
          type: "string",
          description:
            "What the person said about not being able to attend, when you have not called prepare_reschedule_handoff.",
        },
        preferences: {
          type: "string",
          description:
            "When they would prefer the new time, when you have not called prepare_reschedule_handoff.",
        },
      },
      required: ["scheduled_at"],
    },
  };
}

/** Scheduling: what a handed-over call, or a callback about one, continues. */
export function buildHandoffContextTool(
  ctx: VoiceAgentToolContext,
): VoiceAgentTool {
  return {
    kind: "webhook",
    name: "get_handoff_context",
    description:
      "Read what you are continuing when another assistant handed you this call, or when you are calling back about moving a meeting: the meeting, why it must move, what the person already said and how to continue. Call it before you say anything in such a call.",
    url: `${ctx.toolBaseUrl}/${ctx.agentId}/handoff-context`,
    method: "POST",
    headers: voiceAgentWebhookHeaders(ctx),
    parameters: { type: "object", properties: {}, required: [] },
  };
}

/**
 * Scheduling: move the meeting it was handed to the time the person agreed.
 * Only the time comes from the model — the meeting, its version and its
 * calendar come from the request the call carries.
 */
export function buildMoveMeetingTool(
  ctx: VoiceAgentToolContext,
): VoiceAgentTool {
  return {
    kind: "webhook",
    name: "move_meeting",
    description:
      "Commit the offered time the person explicitly accepted. Ringee moves the same future appointment or creates one linked replacement if the original is historical or cancelled and the request remains open. Only say it is booked or moved after success.",
    url: `${ctx.toolBaseUrl}/${ctx.agentId}/move-meeting`,
    method: "POST",
    headers: voiceAgentWebhookHeaders(ctx),
    parameters: {
      type: "object",
      properties: {
        time_confirmed: { type: "boolean", description: "True only after repeating the specific offered time and receiving an explicit yes in this conversation." },
        start: {
          type: "string",
          description:
            "The agreed new start, exactly as get_available_slots returned it: an ISO 8601 timestamp with an explicit offset, e.g. 2026-09-04T14:30:00-04:00.",
        },
      },
      required: ["start", "time_confirmed"],
    },
  };
}

/**
 * The provider's handoff, to the destinations the workspace authorizes now.
 *
 * `own`: the agent that takes over speaks with its own configured voice. The
 * person was just told they are being passed to it by name, so hearing a
 * different voice is what makes that true. With the voice kept (`shared`),
 * the provider continues "without announcing the transition", and on real
 * calls the destination then spoke as the agent it replaced (2026-11-03).
 */
export function buildHandoffTool(
  ctx: VoiceAgentToolContext,
): VoiceAgentTool | null {
  const targets = ctx.handoffTargets ?? [];
  if (targets.length === 0) return null;
  return { kind: "handoff", voice: "own", targets };
}
