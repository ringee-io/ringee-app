import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { VoiceAgentConversationSettings } from "./voice-agent.types";
import {
  composeVoiceAgentInstructions,
  readVoiceAgentConversationSettings,
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
    assert.equal(
      composeVoiceAgentInstructions(defaults, defaults, "NEVER INVENT"),
      defaults.instructions,
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
