/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ForbiddenException } from "@nestjs/common";
import {
  assertVoiceAgentAccess,
  hasVoiceAgentAccess,
} from "./voice-agent-access";

describe("AI Voice Agent access", () => {
  it("opens the module for an active organization workspace", () => {
    const ctx = { userId: "user-1", organizationId: "org-1" };

    assert.equal(hasVoiceAgentAccess(ctx), true);
    assert.doesNotThrow(() => assertVoiceAgentAccess(ctx));
  });

  it("rejects a personal workspace", () => {
    const ctx = { userId: "user-1", organizationId: null };

    assert.equal(hasVoiceAgentAccess(ctx), false);
    assert.throws(
      () => assertVoiceAgentAccess(ctx),
      (error: unknown) =>
        error instanceof ForbiddenException &&
        error.message ===
          "AI Voice Agents require an active organization workspace",
    );
  });
});
