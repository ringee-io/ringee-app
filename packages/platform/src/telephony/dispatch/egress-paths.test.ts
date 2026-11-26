import { describe, expect, it } from "vitest";
import { isCallOriginatingRequest } from "./egress-paths";

describe("which provider requests start a call", () => {
  it("paces voice caller-ID verification and leaves SMS verification alone", () => {
    expect(
      isCallOriginatingRequest("POST", "/verified_numbers", {
        verification_method: "call",
      }),
    ).toBe(true);
    expect(
      isCallOriginatingRequest("POST", "/verified_numbers", {
        verification_method: "sms",
      }),
    ).toBe(false);
    expect(isCallOriginatingRequest("POST", "/verified_numbers")).toBe(false);
  });
  it.each([
    ["POST", "/calls"],
    ["post", "/calls/"],
    ["POST", "/calls?x=1"],
    ["POST", "/calls/v3:abc-123/actions/transfer"],
    ["POST", "/texml/ai_calls/1234567890"],
    ["POST", "/texml/Accounts/AC123/Calls"],
    ["POST", "/texml/Accounts/AC123/Calls/"],
    ["POST", "/faxes"],
    ["POST", "/faxes///"],
  ])("%s %s spends capacity", (method, path) => {
    expect(isCallOriginatingRequest(method, path)).toBe(true);
  });

  it("reads a path with a long run of slashes in linear time", () => {
    const path = `/calls${"/".repeat(100_000)}x`;
    const started = performance.now();

    expect(isCallOriginatingRequest("POST", path)).toBe(false);
    expect(performance.now() - started).toBeLessThan(1_000);
  });

  it.each([
    ["GET", "/calls"],
    ["GET", "/calls/v3:abc"],
    ["POST", "/calls/v3:abc/actions/answer"],
    ["POST", "/calls/v3:abc/actions/hangup"],
    ["POST", "/calls/v3:abc/actions/bridge"],
    ["POST", "/calls/v3:abc/actions/playback_start"],
    ["POST", "/calls/v3:abc/actions/record_start"],
    ["POST", "/calls/v3:abc/actions/streaming_start"],
    ["POST", "/messages"],
    ["POST", "/telephony_credentials"],
    ["POST", "/ai/assistants/abc"],
    ["PATCH", "/texml_applications/abc"],
    ["DELETE", "/calls/v3:abc"],
  ])("%s %s does not", (method, path) => {
    expect(isCallOriginatingRequest(method, path)).toBe(false);
  });
});
