/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AiVoiceAgentOutcome } from "@ringee/database";
import { AppointmentBookingBlueprint } from "./appointment-booking.blueprint";
import { RemindersNotificationsBlueprint } from "./reminders-notifications.blueprint";
import { DEFAULT_ANALYSIS_SETTINGS } from "../voice-agent.types";

const promptContext = {
  agentName: "Sofia",
  company: {
    name: "Acme",
    description: "Acme sells widgets.",
    website: "https://acme.test",
  },
  language: "es",
  timezone: "America/New_York",
  meetingDurationMinutes: 30,
  meetingTitle: "Product Demo",
};

const toolContext = {
  agentId: "agent-1",
  toolBaseUrl: "https://api.ringee.test/api/ai-voice-agents/tools",
  toolSecretRef: "ringee-voice-agent-tool-agent-1",
  knowledgeBucketIds: [] as string[],
};

describe("AppointmentBookingBlueprint", () => {
  const blueprint = new AppointmentBookingBlueprint();

  it("states the no-invented-availability rule the product depends on", () => {
    const instructions = blueprint.buildInstructions(promptContext);
    assert.match(instructions, /Never state or imply availability/);
    assert.match(
      instructions,
      /get_available_slots` before you offer any time/,
    );
    assert.match(instructions, /Only after `book_appointment` returns success/);
  });

  it("speaks the language of the selected voice", () => {
    assert.match(blueprint.buildInstructions(promptContext), /Speak Spanish/);
    assert.match(
      blueprint.buildInstructions({ ...promptContext, language: "en" }),
      /Speak English/,
    );
  });

  it("opens the call in the agent's own language, not in English", () => {
    assert.match(blueprint.buildGreeting(promptContext), /^Hola /);
    assert.match(
      blueprint.buildGreeting({ ...promptContext, language: "en" }),
      /^Hi /,
    );
    // A language Ringee curates no greeting for still opens the call.
    assert.match(
      blueprint.buildGreeting({ ...promptContext, language: "sv" }),
      /^Hi /,
    );
  });

  it("holds that language unless the person asks it to change", () => {
    const instructions = blueprint.buildInstructions(promptContext);
    assert.match(instructions, /Stay in Spanish even if the other person/);
    assert.match(instructions, /Change language only if they explicitly ask/);
  });

  it("carries the configured meeting length and time zone into the prompt", () => {
    const instructions = blueprint.buildInstructions({
      ...promptContext,
      meetingDurationMinutes: 45,
      timezone: "Europe/Madrid",
    });
    assert.match(instructions, /45 minutes long/);
    assert.match(instructions, /Europe\/Madrid/);
  });

  it("gives the known email to the agent and has it confirm without retranscribing", () => {
    const instructions = blueprint.buildInstructions(promptContext);
    assert.match(instructions, /Email on file: \{\{email\}\}/);
    assert.match(instructions, /ask only whether that exact address/);
    assert.match(instructions, /pass \{\{email\}\}[\s\S]*exactly as written/);
    assert.match(
      instructions,
      /never reconstruct it from what the call transcript/,
    );

    const safety = blueprint.buildSafetyInstructions(promptContext);
    assert.match(safety, /ask only whether that exact email/);
    assert.match(safety, /pass \{\{email\}\} unchanged/);
  });

  it("tells the booking tool to copy a confirmed context email exactly", () => {
    const booking = blueprint
      .buildTools(toolContext)
      .find(
        (tool) => tool.kind === "webhook" && tool.name === "book_appointment",
      );
    assert.equal(booking?.kind, "webhook");
    if (booking?.kind !== "webhook") return;

    const email = booking.parameters?.properties.attendee_email as
      | { description?: string }
      | undefined;
    assert.match(email?.description ?? "", /copy that value exactly/);
    assert.match(email?.description ?? "", /never reconstruct it from speech/);
  });

  it("authenticates its tools by secret reference, never in plaintext", () => {
    const tools = blueprint.buildTools(toolContext);
    const webhooks = tools.filter((t) => t.kind === "webhook");
    assert.equal(webhooks.length, 2);

    for (const tool of webhooks) {
      assert.equal(tool.kind, "webhook");
      if (tool.kind !== "webhook") continue;
      const secret = tool.headers?.find(
        (h) => h.name === "X-Ringee-Tool-Secret",
      );
      assert.equal(secret?.secretRef, toolContext.toolSecretRef);
      assert.equal(secret?.value, undefined);
    }
  });

  it("takes the call's identity from a system variable, not from the model", () => {
    const [slots] = blueprint.buildTools(toolContext);
    assert.equal(slots?.kind, "webhook");
    if (slots?.kind !== "webhook") return;

    const callId = slots.headers?.find(
      (h) => h.name === "X-Ringee-Call-Control-Id",
    );
    assert.equal(callId?.value, "{{call_control_id}}");
    // The model may only choose the day; it cannot name the call or the agent.
    assert.deepEqual(Object.keys(slots.parameters?.properties ?? {}), ["date"]);
  });

  it("attaches knowledge only when a source is ready", () => {
    assert.equal(
      blueprint.buildTools(toolContext).some((t) => t.kind === "retrieval"),
      false,
    );
    const withKnowledge = blueprint.buildTools({
      ...toolContext,
      knowledgeBucketIds: ["bucket-1"],
    });
    assert.deepEqual(
      withKnowledge.find((t) => t.kind === "retrieval"),
      { kind: "retrieval", bucketIds: ["bucket-1"] },
    );
  });

  it("constrains the outcome insight to this agent's own outcomes", () => {
    const insights = blueprint.buildInsights({
      analysis: DEFAULT_ANALYSIS_SETTINGS,
      extractionFields: [],
    });
    const schema = insights.outcome?.jsonSchema as {
      properties: { outcome: { enum: string[] } };
    };
    assert.deepEqual(schema.properties.outcome.enum, blueprint.outcomes);
    assert.ok(
      schema.properties.outcome.enum.includes(
        AiVoiceAgentOutcome.appointment_booked,
      ),
    );
    // An appointment agent cannot conclude a reminder's outcome.
    assert.equal(
      schema.properties.outcome.enum.includes(AiVoiceAgentOutcome.confirmed),
      false,
    );
  });

  // The provider validates an insight's `json_schema` as a strict structured
  // output: an object without `additionalProperties: false`, or with a
  // `required` that does not name every property, is rejected and takes the
  // whole agent sync down with it.
  it("closes every insight schema the way the provider requires", () => {
    const insights = blueprint.buildInsights({
      analysis: { ...DEFAULT_ANALYSIS_SETTINGS, sentiment: true },
      extractionFields: [
        {
          key: "budget",
          label: "Budget",
          type: "text",
          description: "Any budget they mentioned",
        },
      ],
    });

    for (const definition of Object.values(insights)) {
      const schema = definition.jsonSchema as
        | {
            properties: Record<string, unknown>;
            required?: string[];
            additionalProperties?: boolean;
          }
        | null
        | undefined;
      if (!schema) continue;

      assert.equal(schema.additionalProperties, false);
      assert.deepEqual(
        [...(schema.required ?? [])].sort(),
        Object.keys(schema.properties).sort(),
      );
    }
  });

  it("builds one extraction insight from the user's fields", () => {
    const insights = blueprint.buildInsights({
      analysis: DEFAULT_ANALYSIS_SETTINGS,
      extractionFields: [
        {
          key: "team_size",
          label: "Team size",
          type: "number",
          description: "Number of people on the sales team",
        },
        {
          key: "crm",
          label: "CRM",
          type: "select",
          description: "Which CRM they use",
          options: ["HubSpot", "Salesforce"],
        },
      ],
    });

    const schema = insights.extraction?.jsonSchema as {
      properties: Record<string, { type: unknown; enum?: unknown[] }>;
    };
    assert.deepEqual(schema.properties.team_size?.type, ["number", "null"]);
    assert.deepEqual(schema.properties.crm?.enum, [
      "HubSpot",
      "Salesforce",
      null,
    ]);
  });

  it("omits the analyses the user turned off", () => {
    const insights = blueprint.buildInsights({
      analysis: { ...DEFAULT_ANALYSIS_SETTINGS, summary: false },
      extractionFields: [],
    });
    assert.equal(insights.summary, undefined);
    assert.equal(insights.sentiment, undefined);
    assert.ok(insights.outcome);
  });
});

describe("RemindersNotificationsBlueprint", () => {
  const blueprint = new RemindersNotificationsBlueprint();

  it("needs no calendar and no webhook tools", () => {
    assert.equal(blueprint.requiresCalendar, false);
    const tools = blueprint.buildTools(toolContext);
    assert.deepEqual(
      tools.map((t) => t.kind),
      ["hangup"],
    );
  });

  it("requires the notification it is calling about", () => {
    const required = blueprint.variables
      .filter((v) => v.required)
      .map((v) => v.key);
    assert.deepEqual(required, ["first_name", "notification"]);
  });

  it("tells the agent it cannot reschedule on the call", () => {
    const instructions = blueprint.buildInstructions(promptContext);
    assert.match(instructions, /cannot reschedule on this/);
    assert.match(instructions, /Never invent a detail/);
  });

  it("opens in the agent's language and names what the call is about", () => {
    const greeting = blueprint.buildGreeting(promptContext);
    assert.match(greeting, /^Hola /);
    assert.ok(greeting.includes("{{notification}}"));
    assert.match(
      blueprint.buildGreeting({ ...promptContext, language: "en" }),
      /^Hi /,
    );
  });

  it("offers the reminder outcomes, not the booking ones", () => {
    const insights = blueprint.buildInsights({
      analysis: DEFAULT_ANALYSIS_SETTINGS,
      extractionFields: [],
    });
    const schema = insights.outcome?.jsonSchema as {
      properties: { outcome: { enum: string[] } };
    };
    assert.ok(
      schema.properties.outcome.enum.includes(AiVoiceAgentOutcome.confirmed),
    );
    assert.ok(
      schema.properties.outcome.enum.includes(
        AiVoiceAgentOutcome.cannot_attend,
      ),
    );
    assert.equal(
      schema.properties.outcome.enum.includes(
        AiVoiceAgentOutcome.appointment_booked,
      ),
      false,
    );
  });
});
