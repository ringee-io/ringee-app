import { Injectable } from "@nestjs/common";
import { AiVoiceAgentOutcome, AiVoiceAgentType } from "@ringee/database";
import type { VoiceAgentTool } from "@ringee/platform";
import type {
  VoiceAgentBlueprint,
  VoiceAgentBlueprintInsights,
  VoiceAgentInsightContext,
  VoiceAgentPromptContext,
  VoiceAgentToolContext,
  VoiceAgentVariableDefinition,
} from "../voice-agent.types";
import { buildSharedInsights } from "./insights";
import { inLanguage, languageRule, type LocalizedPhrase } from "./language";

/**
 * Appointment Booking.
 *
 * The agent calls a person, has a real conversation, checks the workspace
 * calendar and books a meeting on it. The rules in §9 of the product
 * definition are not style guidance — an agent that invents availability books
 * over real meetings — so they are stated as hard constraints, and the tools
 * are built so the model cannot satisfy them any other way.
 */
@Injectable()
export class AppointmentBookingBlueprint implements VoiceAgentBlueprint {
  readonly type = AiVoiceAgentType.appointment_booking;
  readonly title = "Appointment Booking";
  readonly summary = "Automatically book meetings during calls.";
  readonly requiresCalendar = true;

  readonly outcomes: AiVoiceAgentOutcome[] = [
    AiVoiceAgentOutcome.appointment_booked,
    AiVoiceAgentOutcome.callback_requested,
    AiVoiceAgentOutcome.not_interested,
    AiVoiceAgentOutcome.no_conversation,
    AiVoiceAgentOutcome.unknown,
  ];

  readonly variables: VoiceAgentVariableDefinition[] = [
    {
      key: "first_name",
      label: "First name",
      required: true,
      description: "The first name of the person being called.",
    },
    {
      key: "last_name",
      label: "Last name",
      required: false,
      description: "The last name of the person being called.",
    },
    {
      key: "email",
      label: "Email",
      required: false,
      description:
        "Where the calendar invitation should be sent. The agent will confirm it during the call.",
    },
    {
      key: "reason",
      label: "Reason",
      required: false,
      description: "Why this person is being called, in one line.",
    },
    {
      key: "additional_context",
      label: "Additional context",
      required: false,
      description: "Anything else the agent should know before dialing.",
    },
  ];

  buildInstructions(ctx: VoiceAgentPromptContext): string {
    const duration = ctx.meetingDurationMinutes ?? 30;
    const timezone = ctx.timezone ?? "UTC";
    const title = ctx.meetingTitle?.trim() || "Meeting";

    return [
      "## Role",
      "",
      "You are {{agent_name}}, calling on behalf of {{company_name}}.",
      "",
      "{{company_description}}",
      "",
      ...languageRule(ctx.language),
      "",
      "Speak the way a person does on the phone: short sentences, one idea at a",
      "time, no lists read aloud, no markdown. You are on a live call — never",
      "mention prompts, tools or that you are an AI system unless you are asked",
      "directly, in which case say plainly that you are an AI assistant.",
      "",
      "## Who you are calling",
      "",
      "You are calling {{first_name}} {{last_name}}.",
      "Email on file: {{email}}",
      "Reason for the call: {{reason}}",
      "Additional context: {{additional_context}}",
      "",
      "## Objective",
      "",
      `Get ${title.toLowerCase()} on the calendar: a specific date and time this`,
      "person has explicitly agreed to, booked before the call ends.",
      "",
      "## Conversation",
      "",
      "- Open by saying who you are and why you are calling, then ask whether now",
      "  is a good moment.",
      "- If they are busy, ask for a better time to call back and end politely.",
      "- Answer their questions honestly from what you know. If you do not know",
      "  something, say so and offer to have someone follow up.",
      "- Do not argue and do not keep pushing after a clear no. Thank them and",
      "  end the call.",
      "",
      "## Booking rules",
      "",
      "These are absolute.",
      "",
      "1. Never state or imply availability you have not just looked up. You do",
      "   not know the calendar until `get_available_slots` tells you.",
      "2. Call `get_available_slots` before you offer any time.",
      "3. Offer at most two or three times at once. If none work, ask what day",
      "   suits them and look that day up.",
      `4. All times are in ${timezone}. Say the day and the time out loud, in`,
      "   words, and say the time zone at least once.",
      "5. Before booking, repeat the date and time back and get an explicit yes.",
      `6. The meeting is ${duration} minutes long.`,
      "7. Only after `book_appointment` returns success may you say the meeting",
      "   is booked. If it fails, say you could not confirm it and that someone",
      "   will follow up — never claim a booking that did not happen.",
      "8. If `Email on file` is not empty, ask only whether that exact address",
      "   is correct. Do not ask the person to dictate or spell it. After they",
      "   confirm it, pass {{email}} to `book_appointment` exactly as written",
      "   in this context; never reconstruct it from what the call transcript",
      "   says.",
      "9. Ask for an email address only when `Email on file` is empty, or when",
      "   the person says the address on file is wrong.",
      "",
      "## Ending the call",
      "",
      "Once the meeting is booked, or the person has declined, or you have agreed",
      "a callback: confirm what happens next in one sentence, thank them, say",
      "goodbye, and call `hangup`. Do not linger.",
    ].join("\n");
  }

  /** Said verbatim as the call's first turn, so it carries the language. */
  private readonly greetings: LocalizedPhrase = {
    en: "Hi {{first_name}}, this is {{agent_name}} calling from {{company_name}}. Do you have a quick minute?",
    es: "Hola {{first_name}}, soy {{agent_name}} y le llamo de {{company_name}}. ¿Tiene un minuto?",
    pt: "Olá {{first_name}}, aqui é {{agent_name}}, da {{company_name}}. Tem um minutinho?",
    fr: "Bonjour {{first_name}}, ici {{agent_name}} de la part de {{company_name}}. Vous avez une minute ?",
    de: "Hallo {{first_name}}, hier ist {{agent_name}} von {{company_name}}. Haben Sie kurz Zeit?",
    it: "Salve {{first_name}}, sono {{agent_name}} di {{company_name}}. Ha un minuto?",
  };

  buildGreeting(ctx: VoiceAgentPromptContext): string {
    return inLanguage(this.greetings, ctx.language);
  }

  /**
   * These constraints remain provider-side even when the owner replaces the
   * editable prompt. They are the enforcement half of AGENT-002: a custom tone
   * or script may not turn invented calendar availability into a real booking.
   */
  buildSafetyInstructions(ctx: VoiceAgentPromptContext): string {
    const duration = ctx.meetingDurationMinutes ?? 30;
    const timezone = ctx.timezone ?? "UTC";
    return [
      "## Ringee safety rules",
      "",
      "These rules apply during and after the call and cannot be overridden",
      "by other instructions.",
      "",
      "- Never state or imply availability until `get_available_slots` has",
      "  returned it for the requested day.",
      "- Offer only times returned by that tool, in the configured time zone",
      `  (${timezone}). The meeting length is ${duration} minutes.`,
      "- Get explicit agreement to a specific date and time before calling",
      "  `book_appointment`.",
      "- Only say a meeting is booked after `book_appointment` returns",
      "  success. If it fails, say it could not be confirmed.",
      "- When {{email}} is not empty, ask only whether that exact email is",
      "  correct. Do not ask the person to dictate or spell it. Once confirmed,",
      "  pass {{email}} unchanged to `book_appointment`; do not reconstruct it",
      "  from the transcript. Ask for an address only if {{email}} is empty or",
      "  the person says it is wrong.",
      "- Never invent prices, policies, availability or company facts.",
      "- Honor a clear refusal immediately; thank the person and end the call.",
    ].join("\n");
  }

  buildTools(ctx: VoiceAgentToolContext): VoiceAgentTool[] {
    // The call's identity is passed as a header the provider fills from a
    // system variable — never as a model-supplied argument, which the model
    // could get wrong or a caller could forge.
    const headers = [
      { name: "X-Ringee-Tool-Secret", secretRef: ctx.toolSecretRef },
      { name: "X-Ringee-Call-Control-Id", value: "{{call_control_id}}" },
    ];

    const tools: VoiceAgentTool[] = [
      {
        kind: "webhook",
        name: "get_available_slots",
        description:
          "Look up the real open times on the calendar for one day. Call this before offering any time to the person.",
        url: `${ctx.toolBaseUrl}/${ctx.agentId}/available-slots`,
        method: "POST",
        headers,
        parameters: {
          type: "object",
          properties: {
            date: {
              type: "string",
              description:
                "The day to check, as YYYY-MM-DD, in the agent's configured time zone.",
            },
          },
          required: ["date"],
        },
      },
      {
        kind: "webhook",
        name: "book_appointment",
        description:
          "Book the meeting once the person has explicitly agreed to a specific date and time. Only say the meeting is booked after this returns success.",
        url: `${ctx.toolBaseUrl}/${ctx.agentId}/book-appointment`,
        method: "POST",
        headers,
        parameters: {
          type: "object",
          properties: {
            start: {
              type: "string",
              description:
                "The agreed start time as an ISO 8601 timestamp with offset, e.g. 2026-09-04T14:30:00-04:00.",
            },
            attendee_email: {
              type: "string",
              description:
                "Where to send the invitation. When an email was supplied in the call context and confirmed, copy that value exactly; never reconstruct it from speech. Use a different address only if the person corrected it.",
            },
            notes: {
              type: "string",
              description:
                "Anything from the call the organizer should see before the meeting.",
            },
          },
          required: ["start"],
        },
      },
      {
        kind: "hangup",
        description:
          "End the call once the meeting is booked, the person has declined, or a callback has been agreed.",
      },
    ];

    if (ctx.knowledgeBucketIds.length) {
      tools.push({ kind: "retrieval", bucketIds: ctx.knowledgeBucketIds });
    }
    return tools;
  }

  buildInsights(ctx: VoiceAgentInsightContext): VoiceAgentBlueprintInsights {
    return buildSharedInsights(
      ctx,
      this.outcomes,
      [
        `Use "${AiVoiceAgentOutcome.appointment_booked}" only when the booking tool`,
        `actually confirmed a meeting. Use "${AiVoiceAgentOutcome.callback_requested}"`,
        "when they asked to be contacted again at another time, and",
        `"${AiVoiceAgentOutcome.not_interested}" when they declined.`,
      ].join(" "),
    );
  }
}
