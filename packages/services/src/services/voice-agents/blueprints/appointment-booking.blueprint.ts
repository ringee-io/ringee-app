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
import { buildScheduleCallbackTool } from "./callback.tool";
import {
  buildHumanSupportTool,
  voiceAgentWebhookHeaders,
} from "./human-support.tool";
import { buildHandoffContextTool } from "./handoff.tools";
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
  // Ringee owns availability and the meeting row. Google/Microsoft are optional
  // outbound sync targets, so their absence must not block this agent.
  readonly requiresCalendar = false;

  readonly outcomes: AiVoiceAgentOutcome[] = [
    AiVoiceAgentOutcome.meeting_booked,
    AiVoiceAgentOutcome.callback_scheduled,
    AiVoiceAgentOutcome.not_interested,
    AiVoiceAgentOutcome.no_answer,
    AiVoiceAgentOutcome.no_conversation,
    AiVoiceAgentOutcome.wrong_number,
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
      "- If they are busy, agree on a specific future date and time, call",
      "  `schedule_callback`, and end politely only after it succeeds.",
      "- Answer their questions honestly from what you know. If you do not know",
      "  something and they want an answer, say so and call",
      "  `request_human_support` so a person can follow up.",
      "- If they explicitly ask to speak with a person, call",
      "  `request_human_support` with a short subject and useful message.",
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
      `4. All times are in ${timezone}, the time zone of the calendar you book`,
      "   on. Never convert or restate them in another zone, and never quote",
      "   opening hours from memory — the tool is the only place the calendar",
      "   exists. Offer the available times in one natural",
      "   spoken sentence in the conversation's language. Say each clock time",
      "   fully in words and connect the choices with the spoken equivalent of",
      '   "or". For example, in Spanish: "Tengo disponible la una y veinte o',
      '   las diez y media." Never recite the raw slot list, punctuation, colons,',
      "   numbered items, AM/PM abbreviations or ISO timestamps. Say the day and",
      "   time zone naturally at least once.",
      "5. Before booking, repeat the date and time back and get an explicit yes.",
      `6. The meeting is ${duration} minutes long.`,
      "7. Only after `book_appointment` returns success may you say the meeting",
      "   is booked. If it fails, call `request_human_support`; only after that",
      "   succeeds may you say someone will follow up. Never claim a booking",
      "   that did not happen.",
      "   `book_appointment` books on the same calendar `get_available_slots`",
      "   read. You do not choose the calendar and cannot name one — if either",
      "   tool reports the calendar is unavailable, say you cannot check the",
      "   diary right now and call `request_human_support`.",
      "8. If `Email on file` is not empty, ask only whether that exact address",
      "   is correct. Do not ask the person to dictate or spell it. After they",
      "   confirm it, pass {{email}} to `book_appointment` exactly as written",
      "   in this context; never reconstruct it from what the call transcript",
      "   says.",
      "9. Ask for an email address only when `Email on file` is empty, or when",
      "   the person says the address on file is wrong.",
      "10. If a callback is requested, confirm one exact future date and time and",
      "   call `schedule_callback`. Only say it is scheduled after the tool",
      "   returns success. If it fails, do not promise the callback.",
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
      "  returned it for the requested day. The calendar's opening hours are",
      "  not in these instructions and must never be recited from memory.",
      "- Offer only times returned by that tool, in the calendar's time zone",
      `  (${timezone}). The meeting length is ${duration} minutes.`,
      "- The calendar is chosen by Ringee, not by you. Never name, request or",
      "  accept a different calendar, and never book a time that",
      "  `get_available_slots` did not just return.",
      "- Offer available times in one natural spoken sentence in the",
      "  conversation's language. Say each clock time fully in words and join",
      "  choices with a spoken conjunction. Never recite raw slot data,",
      "  punctuation, numbered items, AM/PM abbreviations or ISO timestamps.",
      "- Get explicit agreement to a specific date and time before calling",
      "  `book_appointment`.",
      "- Only say a meeting is booked after `book_appointment` returns",
      "  success. If it fails, say it could not be confirmed and call",
      "  `request_human_support`.",
      "- When {{email}} is not empty, ask only whether that exact email is",
      "  correct. Do not ask the person to dictate or spell it. Once confirmed,",
      "  pass {{email}} unchanged to `book_appointment`; do not reconstruct it",
      "  from the transcript. Ask for an address only if {{email}} is empty or",
      "  the person says it is wrong.",
      "- Only promise a callback after agreeing on an exact future date and time",
      "  and `schedule_callback` returns success.",
      "- Never invent prices, policies, availability or company facts.",
      "- If the person asks for a human, or any webhook tool fails and a person",
      "  must finish the request, call `request_human_support`. Only promise a",
      "  follow-up after that tool succeeds.",
      "- Honor a clear refusal immediately; thank the person and end the call.",
      ...(ctx.acceptsHandoffs
        ? [
            "- When you join a call already under way, or the reason for your call",
            "  is moving a meeting, call `get_handoff_context` before you speak and",
            "  follow it. Never open as if you had just called them, and never",
            "  repeat a check it says was done.",
            "- While moving an existing meeting, offer only times",
            "  `get_available_slots` returned for it, never call",
            "  `book_appointment`, and never say the meeting is moved.",
          ]
        : []),
    ].join("\n");
  }

  /**
   * How a scheduling agent continues a call it did not start (AGENT-021),
   * ahead of its own prompt — the default or the owner's, which both open a
   * new call. On a handed-over call the provider gives the agent the
   * previous agent's turns as if they were its own, and renders its prompt
   * with the previous call's variables. On real calls (2026-11-03), with
   * these rules only at the end, it re-ran the reminder or repeated "I'm
   * passing you to …", and never read its context.
   */
  buildLeadingInstructions(
    ctx: Pick<VoiceAgentPromptContext, "agentName" | "acceptsHandoffs">,
  ): string | null {
    if (!ctx.acceptsHandoffs) return null;
    const name = ctx.agentName.trim() || "the scheduling assistant";
    return [
      "## When a call is handed to you",
      "",
      "These rules come from Ringee. When they apply, they come before",
      "everything below — including how to open a call, why you are calling",
      "and what the call is about. On any other call, ignore this section.",
      "",
      "Another assistant may speak with the person first and then hand the",
      "call to you, because they cannot attend a meeting and want another",
      "time. You can tell: before your first turn, the conversation already",
      "holds that assistant telling the person it is passing them to you, and",
      "its `handoff` tool call. Every turn before that handoff was spoken by",
      "the other assistant, not by you, even where it appears as yours. The",
      "reason for the call and the additional context below describe that",
      "assistant's call, not what you must do now.",
      "",
      "- Your first action, before you say a single word, is to call",
      "  `get_handoff_context`. Then follow its speech_instruction.",
      `- You are ${name}. Never repeat or rephrase what the other assistant`,
      "  said, never speak as it, and never say you are passing the call to",
      "  anyone — the call is already yours.",
      `- Open with one short sentence: you are ${name}, and you will help them`,
      "  find a new time for their meeting. Do not greet them as if you had",
      "  just called, do not introduce the company again, and do not repeat a",
      "  check the context says was done.",
      "- Keep speaking the conversation's language as the context gives it.",
      "",
      "When the reason for your own call says you are following up a request",
      "to move a meeting, also call `get_handoff_context` before you offer",
      "any time, and follow it.",
      "",
      "On either kind of call you are moving an existing meeting, not booking",
      "a new one:",
      "",
      "- Its calendar, length and the member it is with stay as they are, and",
      "  `get_available_slots` reads that calendar for you. Times are in the",
      "  time zone its result names.",
      "- You cannot move the meeting on this call. When they choose a time, say",
      "  it is noted and that the team will confirm the change — never say it",
      "  is moved — and call `request_human_support` with the chosen time.",
      "  Never call `book_appointment` for this meeting.",
      "- If none of the times suit them and they want to be called again,",
      "  agree an exact time and call `schedule_callback`.",
    ].join("\n");
  }

  buildTools(ctx: VoiceAgentToolContext): VoiceAgentTool[] {
    // The call's identity is passed as a header the provider fills from a
    // system variable — never as a model-supplied argument, which the model
    // could get wrong or a caller could forge.
    const headers = voiceAgentWebhookHeaders(ctx);

    const tools: VoiceAgentTool[] = [
      {
        kind: "webhook",
        name: "get_available_slots",
        description:
          "Look up the real open times for one day on the calendar Ringee assigned to this agent. It is the only source of availability — the agent's instructions never list opening hours. Call this before offering any time, then follow the result's speech_instruction instead of reading the raw slot data aloud. The result's `timezone` is the calendar's own.",
        url: `${ctx.toolBaseUrl}/${ctx.agentId}/available-slots`,
        method: "POST",
        headers,
        parameters: {
          type: "object",
          properties: {
            date: {
              type: "string",
              description:
                "The day to check, as YYYY-MM-DD, in the calendar's time zone.",
            },
          },
          required: ["date"],
        },
      },
      {
        kind: "webhook",
        name: "book_appointment",
        description:
          "Book the meeting once the person has explicitly agreed to a specific date and time. Books on the same calendar get_available_slots read; the calendar is resolved by Ringee and cannot be chosen here. Only say the meeting is booked after this returns success.",
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
      buildScheduleCallbackTool(ctx),
      buildHumanSupportTool(ctx),
      {
        kind: "hangup",
        description:
          "End the call once the meeting is booked, the person has declined, or a callback has been agreed.",
      },
    ];
    // A scheduling agent the reminders agent may hand calls to (AGENT-021):
    // it reads what it continues instead of opening a new call's script.
    if (ctx.acceptsHandoffs) tools.push(buildHandoffContextTool(ctx));

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
        `Use "${AiVoiceAgentOutcome.meeting_booked}" only when the booking tool`,
        `actually confirmed a meeting. Use "${AiVoiceAgentOutcome.callback_scheduled}" only`,
        "when the callback tool actually scheduled another call, and",
        `"${AiVoiceAgentOutcome.not_interested}" when they declined.`,
      ].join(" "),
    );
  }
}
