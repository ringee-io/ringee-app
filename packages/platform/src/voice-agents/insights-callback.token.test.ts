import { describe, expect, it } from "vitest";
import {
  voiceAgentInsightsToken,
  voiceAgentInsightsTokenMatches,
} from "./insights-callback.token";

/**
 * The analysis callback is a public route whose only proof of authorization is
 * the token in its URL — the provider stores a bare URL against the analysis
 * group, with no headers to set and no signature to pin.
 */
describe("voiceAgentInsightsToken", () => {
  it("is stable for an agent, so a saved callback URL keeps working", () => {
    expect(voiceAgentInsightsToken("agent-1")).toBe(
      voiceAgentInsightsToken("agent-1"),
    );
  });

  it("does not carry from one agent to another", () => {
    expect(voiceAgentInsightsToken("agent-1")).not.toBe(
      voiceAgentInsightsToken("agent-2"),
    );
    expect(
      voiceAgentInsightsTokenMatches(
        "agent-2",
        voiceAgentInsightsToken("agent-1"),
      ),
    ).toBe(false);
  });

  it("accepts its own token and nothing else", () => {
    const token = voiceAgentInsightsToken("agent-1");
    expect(voiceAgentInsightsTokenMatches("agent-1", token)).toBe(true);
    expect(voiceAgentInsightsTokenMatches("agent-1", "")).toBe(false);
    expect(voiceAgentInsightsTokenMatches("agent-1", null)).toBe(false);
    // Malformed input must answer false, not throw: an unauthenticated caller
    // decides what arrives here.
    expect(voiceAgentInsightsTokenMatches("agent-1", "not-hex")).toBe(false);
    expect(voiceAgentInsightsTokenMatches("agent-1", `${token}00`)).toBe(false);
  });
});
