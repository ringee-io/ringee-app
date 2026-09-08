import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { VoiceAgentConversationSettings } from "./voice-agent.types";
import {
  composeVoiceAgentInstructions,
  readVoiceAgentConversationSettings,
  voiceAgentRuntimeVariables,
} from "./voice-agent-conversation";

const defaults: VoiceAgentConversationSettings = {
  greetingMode: "assistant_speaks_first",
  greeting: "Hi {{first_name}}.",
  instructions: "## Role\n\nBook a meeting.",
  postConversationEnabled: false,
  postConversationInstructions: "",
};

describe("voice agent conversation settings", () => {
  it("shows blueprint values for an agent with no stored override", () => {
    assert.deepEqual(
      readVoiceAgentConversationSettings(null, defaults),
      defaults,
    );
  });

  it("falls back field by field when older JSON is incomplete", () => {
    const resolved = readVoiceAgentConversationSettings(
      { greetingMode: "assistant_waits_for_user", greeting: "" },
      defaults,
    );
    assert.equal(resolved.greetingMode, "assistant_waits_for_user");
    assert.equal(resolved.greeting, "");
    assert.equal(resolved.instructions, defaults.instructions);
  });

  it("does not duplicate safety rules on the unchanged default prompt", () => {
    const instructions = composeVoiceAgentInstructions(
      defaults,
      defaults,
      "NEVER INVENT",
    );
    assert.match(instructions, /^## Role\n\nBook a meeting\./);
    assert.doesNotMatch(instructions, /NEVER INVENT/);
    assert.match(instructions, /\{\{current_datetime\}\}/);
    assert.match(instructions, /\{\{agent_timezone\}\}/);
  });

  it("formats the call-start clock in the agent's selected timezone", () => {
    assert.deepEqual(
      voiceAgentRuntimeVariables(
        "America/Santo_Domingo",
        new Date("2026-09-08T05:30:45.000Z"),
      ),
      {
        agent_timezone: "America/Santo_Domingo",
        current_datetime: "Tuesday, September 8, 2026 at 01:30:45 GMT-04:00",
      },
    );
  });

  it("falls back to an explicit UTC clock for an invalid legacy timezone", () => {
    assert.deepEqual(
      voiceAgentRuntimeVariables(
        "Legacy/Invalid",
        new Date("2026-09-08T05:30:45.000Z"),
      ),
      {
        agent_timezone: "UTC",
        current_datetime: "Tuesday, September 8, 2026 at 05:30:45 GMT+00:00",
      },
    );
  });

  it("keeps non-overridable safety rules on a customized prompt", () => {
    const instructions = composeVoiceAgentInstructions(
      { ...defaults, instructions: "## Role\n\nUse a warmer tone." },
      defaults,
      "## Ringee safety rules\n\nNever invent availability.",
    );
    assert.match(instructions, /Use a warmer tone/);
    assert.match(instructions, /Never invent availability/);
  });

  it("adds post-conversation instructions only when enabled", () => {
    const enabled = composeVoiceAgentInstructions(
      {
        ...defaults,
        postConversationEnabled: true,
        postConversationInstructions: "Send the summary to the CRM tool.",
      },
      defaults,
      "safety",
    );
    assert.match(enabled, /Post-conversation processing/);
    assert.match(enabled, /Send the summary to the CRM tool/);
    assert.ok(
      enabled.lastIndexOf("safety") >
        enabled.lastIndexOf("Send the summary to the CRM tool"),
    );

    const disabled = composeVoiceAgentInstructions(
      { ...defaults, postConversationInstructions: "Do not append me." },
      defaults,
      "safety",
    );
    assert.doesNotMatch(disabled, /Do not append me/);
  });
});
