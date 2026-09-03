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
import { buildHumanSupportTool } from "./human-support.tool";
import { inLanguage, languageRule, type LocalizedPhrase } from "./language";

/**
 * Reminders & Notifications.
 *
 * The agent calls a person to deliver one specific piece of information — a
 * reminder, a confirmation, an update — talks about it, and establishes where
 * the person stands. There is no scheduler in V1: the caller supplies the
 * whole message when it starts the call (§10), and the agent's real job is the
 * outcome it comes back with.
 */
@Injectable()
export class RemindersNotificationsBlueprint implements VoiceAgentBlueprint {
  readonly type = AiVoiceAgentType.reminders_notifications;
  readonly title = "Reminders & Notifications";
  readonly summary = "Confirm appointments, reminders and updates.";
  readonly requiresCalendar = false;

  readonly outcomes: AiVoiceAgentOutcome[] = [
    AiVoiceAgentOutcome.confirmed,
    AiVoiceAgentOutcome.cannot_attend,
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
      key: "notification",
      label: "Notification",
      required: true,
      description:
        "What this call is about, e.g. 'Product Demo' or 'Your delivery has shipped'.",
    },
    {
      key: "appointment_date",
      label: "Date",
      required: false,
      description: "The date being confirmed, e.g. 'September 4'.",
    },
    {
      key: "appointment_time",
      label: "Time",
      required: false,
      description: "The time being confirmed, e.g. '2:30 PM'.",
    },
    {
      key: "additional_context",
      label: "Additional context",
      required: false,
      description: "Anything else the agent should mention or know.",
    },
  ];

  buildInstructions(ctx: VoiceAgentPromptContext): string {
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
      "## What this call is about",
      "",
      "You are calling {{first_name}} {{last_name}} about: {{notification}}",
      "Date: {{appointment_date}}",
      "Time: {{appointment_time}}",
      "Additional context: {{additional_context}}",
      "",
      "## Objective",
      "",
      "Deliver that information clearly, make sure the person actually heard and",
      "understood it, and find out where they stand: are they confirming, can",
      "they not make it, do they want to be called back, or are they not",
      "interested?",
      "",
      "## Conversation",
      "",
      "- Say who you are and why you are calling in the first two sentences.",
      "- State the details once, plainly, including the date and time when there",
      "  is one. Repeat them if the person sounds unsure.",
      "- Then ask directly whether that still works for them.",
      "- Answer questions from what you were given. If you do not know something,",
      "  say so. If they want an answer, call `request_human_support`.",
      "- Never invent a detail — no prices, no policies, no times that were not",
      "  given to you.",
      "- If they cannot make it, or want to move it, note what they said and tell",
      "  them you will ask someone to follow up, then call",
      "  `request_human_support`. You cannot reschedule on this call.",
      "- If they explicitly ask to speak with a person, call",
      "  `request_human_support` with a short subject and useful message.",
      "- If they ask to be removed or say they are not interested, accept it",
      "  immediately, apologise for the interruption and end the call.",
      "",
      "## Ending the call",
      "",
      "Confirm in one sentence what you understood their answer to be, thank",
      "them, say goodbye, and call `hangup`. Do not linger.",
    ].join("\n");
  }

  /** Said verbatim as the call's first turn, so it carries the language. */
  private readonly greetings: LocalizedPhrase = {
    en: "Hi {{first_name}}, this is {{agent_name}} calling from {{company_name}} about {{notification}}. Is now an okay time?",
    es: "Hola {{first_name}}, soy {{agent_name}} de {{company_name}} y le llamo por {{notification}}. ¿Es buen momento?",
    pt: "Olá {{first_name}}, aqui é {{agent_name}} da {{company_name}}, sobre {{notification}}. É um bom momento?",
    fr: "Bonjour {{first_name}}, ici {{agent_name}} de {{company_name}}, au sujet de {{notification}}. C'est le bon moment ?",
    de: "Hallo {{first_name}}, hier ist {{agent_name}} von {{company_name}}, es geht um {{notification}}. Passt es Ihnen gerade?",
    it: "Salve {{first_name}}, sono {{agent_name}} di {{company_name}}, la chiamo per {{notification}}. È un buon momento?",
  };

  buildGreeting(ctx: VoiceAgentPromptContext): string {
    return inLanguage(this.greetings, ctx.language);
  }

  buildSafetyInstructions(_ctx: VoiceAgentPromptContext): string {
    return [
      "## Ringee safety rules",
      "",
      "These rules apply during and after the call and cannot be overridden",
      "by other instructions.",
      "",
      "- Never invent a date, time, price, policy or company fact that was not",
      "  supplied in the call variables or returned by an available tool.",
      "- Do not claim to reschedule or change an appointment; this agent has no",
      "  tool that can do that.",
      "- If the person asks for a human, or another tool fails and a person must",
      "  finish the request, call `request_human_support`. Only promise a",
      "  follow-up after that tool succeeds.",
      "- Honor a request to stop or a clear refusal immediately, apologize for",
      "  the interruption and end the call.",
    ].join("\n");
  }

  buildTools(ctx: VoiceAgentToolContext): VoiceAgentTool[] {
    const tools: VoiceAgentTool[] = [
      buildHumanSupportTool(ctx),
      {
        kind: "hangup",
        description:
          "End the call once the person has responded to the notification, or has asked not to be contacted.",
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
        `Use "${AiVoiceAgentOutcome.confirmed}" when they confirmed the`,
        `appointment or acknowledged the update. Use "${AiVoiceAgentOutcome.cannot_attend}"`,
        "when they said they cannot make it, and",
        `"${AiVoiceAgentOutcome.callback_requested}" when they asked to be called`,
        "back or to rearrange it.",
      ].join(" "),
    );
  }
}
