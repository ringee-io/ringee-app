import { afterEach, describe, expect, it, vi } from "vitest";

const { constructClient } = vi.hoisted(() => ({ constructClient: vi.fn() }));
vi.mock("@telnyx/webrtc", () => ({
  TelnyxRTC: class {
    constructor(options: unknown) {
      constructClient(options);
    }
  },
}));

import { createTelnyxClient, type WebRtcRegion } from "./telnyx-engine";

describe("createTelnyxClient regional routing", () => {
  afterEach(() => vi.clearAllMocks());

  it("keeps routing automatic and enables call reports without forcing ICE or raw debug", () => {
    createTelnyxClient({ login: "credential", password: "password" });
    const options = constructClient.mock.lastCall?.[0];
    expect(options).not.toHaveProperty("region");
    expect(options).not.toHaveProperty("iceServers");
    expect(options).not.toHaveProperty("forceRelayCandidate");
    expect(options).not.toHaveProperty("enableCallRecording");
    expect(options.enableCallReports).toBe(true);
    expect(options.debug).toBe(false);
    expect(options.keepConnectionAliveOnSocketClose).toBe(true);
  });

  it.each<WebRtcRegion>([
    "eu",
    "us-central",
    "us-east",
    "us-west",
    "ca-central",
    "apac",
    "south-asia",
  ])("allows the supported signaling region %s", (region) => {
    createTelnyxClient({ login: "credential", password: "password", region });
    expect(constructClient.mock.lastCall?.[0].region).toBe(region);
  });

  it.each(["auto", "unknown-region", "attacker.example.com", ""])(
    "falls back to automatic routing for an unsupported runtime value %s",
    (region) => {
      createTelnyxClient({
        login: "credential",
        password: "password",
        region: region as WebRtcRegion,
      });
      expect(constructClient.mock.lastCall?.[0]).not.toHaveProperty("region");
    },
  );
});
