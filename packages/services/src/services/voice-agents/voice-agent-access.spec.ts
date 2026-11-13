/// <reference types="node" />

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { ForbiddenException } from "@nestjs/common";
import {
  apiConfiguration,
  parsePersonalPilotUserIds,
} from "@ringee/configuration";
import {
  assertVoiceAgentAutomations,
  automationAdmissionFilter,
  voiceAgentAutomationsEnabled,
} from "./automations/automation-access";
import {
  assertVoiceAgentAccess,
  hasVoiceAgentAccess,
  voiceAgentAccess,
  VOICE_AGENT_ACCESS_DENIED,
} from "./voice-agent-access";

const config = apiConfiguration as unknown as {
  AI_VOICE_AGENT_AUTOMATIONS_ORG_IDS: string[];
  AI_VOICE_AGENT_PERSONAL_PILOT_USER_IDS: string[];
};
const ORGS = config.AI_VOICE_AGENT_AUTOMATIONS_ORG_IDS;
const PERSONAL = config.AI_VOICE_AGENT_PERSONAL_PILOT_USER_IDS;

const FREELANCER = "5a1d7c0e-1f43-4e0e-9a51-0d8f4a0b6c11";
const OTHER_FREELANCER = "8b2e6d1f-2a54-4f1f-8b62-1e9a5b1c7d22";

function pilot(orgs: string[], personal: string[]) {
  config.AI_VOICE_AGENT_AUTOMATIONS_ORG_IDS = orgs;
  config.AI_VOICE_AGENT_PERSONAL_PILOT_USER_IDS = personal;
}

describe("AI Voice Agent access (AGENT-011, AGENT-018)", () => {
  afterEach(() => pilot(ORGS, PERSONAL));

  it("opens the module for every organization, and automations only on its allowlist", () => {
    pilot(["org-1"], []);
    assert.deepEqual(voiceAgentAccess({ organizationId: "org-1" }), {
      workspaceType: "organization",
      module: true,
      automations: true,
    });
    assert.deepEqual(
      voiceAgentAccess({ userId: FREELANCER, organizationId: "org-2" }),
      { workspaceType: "organization", module: true, automations: false },
    );
    assert.doesNotThrow(() =>
      assertVoiceAgentAccess({ userId: FREELANCER, organizationId: "org-2" }),
    );
  });

  it("closes a personal workspace that is not enrolled, even when every organization is admitted", () => {
    pilot(["*"], []);
    const ctx = { userId: FREELANCER, organizationId: null };
    assert.deepEqual(voiceAgentAccess(ctx), {
      workspaceType: "personal",
      module: false,
      automations: false,
    });
    assert.equal(hasVoiceAgentAccess(ctx), false);
    assert.throws(
      () => assertVoiceAgentAccess(ctx),
      (error: unknown) =>
        error instanceof ForbiddenException &&
        error.message === VOICE_AGENT_ACCESS_DENIED,
    );
    assert.equal(voiceAgentAutomationsEnabled(ctx), false);
    // "*" still admits every organization.
    assert.equal(
      voiceAgentAutomationsEnabled({ userId: FREELANCER, organizationId: "x" }),
      true,
    );
  });

  it("admits an enrolled owner's personal workspace — and only that owner's", () => {
    pilot([], [FREELANCER]);
    assert.deepEqual(
      voiceAgentAccess({ userId: FREELANCER, organizationId: null }),
      { workspaceType: "personal", module: true, automations: true },
    );
    assert.doesNotThrow(() =>
      assertVoiceAgentAutomations({ userId: FREELANCER, organizationId: null }),
    );
    // Two personal workspaces share a null organization, never an admission.
    assert.equal(
      hasVoiceAgentAccess({ userId: OTHER_FREELANCER, organizationId: null }),
      false,
    );
    assert.throws(
      () =>
        assertVoiceAgentAutomations({
          userId: OTHER_FREELANCER,
          organizationId: null,
        }),
      ForbiddenException,
    );
    // A personal scope that names no owner is never admitted.
    assert.equal(voiceAgentAccess({ organizationId: null }).module, false);
    assert.equal(voiceAgentAutomationsEnabled(null), false);
  });

  it("decides a user's personal workspace and organization separately", () => {
    pilot(["org-1"], []);
    // A member of an admitted organization gains nothing in personal.
    assert.equal(
      voiceAgentAutomationsEnabled({
        userId: FREELANCER,
        organizationId: "org-1",
      }),
      true,
    );
    assert.equal(
      voiceAgentAutomationsEnabled({
        userId: FREELANCER,
        organizationId: null,
      }),
      false,
    );
    pilot([], [FREELANCER]);
    // Personal enrollment admits no organization's automations.
    assert.equal(
      voiceAgentAutomationsEnabled({
        userId: FREELANCER,
        organizationId: "org-1",
      }),
      false,
    );
    assert.equal(
      voiceAgentAutomationsEnabled({
        userId: FREELANCER,
        organizationId: null,
      }),
      true,
    );
    assert.throws(
      () =>
        assertVoiceAgentAutomations({
          userId: FREELANCER,
          organizationId: "org-1",
        }),
      /not enabled for this organization/,
    );
  });

  it("hands the claim queries both lists, with null for every workspace of a type", () => {
    pilot(["org-1"], [FREELANCER]);
    assert.deepEqual(automationAdmissionFilter(), {
      organizationIds: ["org-1"],
      personalUserIds: [FREELANCER],
    });
    pilot(["*"], []);
    assert.deepEqual(automationAdmissionFilter(), {
      organizationIds: null,
      personalUserIds: [],
    });
    pilot([], ["*"]);
    assert.deepEqual(automationAdmissionFilter(), {
      organizationIds: [],
      personalUserIds: null,
    });
  });

  it("admits every personal workspace with '*', and still no organization", () => {
    pilot([], ["*"]);
    for (const userId of [FREELANCER, OTHER_FREELANCER]) {
      assert.deepEqual(voiceAgentAccess({ userId, organizationId: null }), {
        workspaceType: "personal",
        module: true,
        automations: true,
      });
    }
    // The personal list never opens an organization's automations.
    assert.equal(
      voiceAgentAutomationsEnabled({
        userId: FREELANCER,
        organizationId: "org-1",
      }),
      false,
    );
    // A personal scope that names no owner is still never admitted.
    assert.equal(voiceAgentAccess({ organizationId: null }).module, false);
  });

  it("parses '*' as every personal workspace and drops malformed entries", () => {
    const warn = console.warn;
    const warnings: unknown[] = [];
    console.warn = (...args: unknown[]) => warnings.push(args);
    try {
      assert.deepEqual(parsePersonalPilotUserIds(undefined), []);
      assert.deepEqual(parsePersonalPilotUserIds(""), []);
      assert.deepEqual(parsePersonalPilotUserIds("*"), ["*"]);
      assert.deepEqual(parsePersonalPilotUserIds(` ${FREELANCER}, * `), ["*"]);
      assert.equal(warnings.length, 0);
      assert.deepEqual(
        parsePersonalPilotUserIds(
          ` ${FREELANCER.toUpperCase()} , not-an-id,${FREELANCER},${OTHER_FREELANCER}`,
        ),
        [FREELANCER, OTHER_FREELANCER],
      );
      assert.deepEqual(parsePersonalPilotUserIds("all, everyone"), []);
      assert.ok(warnings.length >= 2);
    } finally {
      console.warn = warn;
    }
    // The enrolled id still matches a differently cased one at decision time.
    pilot([], [FREELANCER]);
    assert.equal(
      hasVoiceAgentAccess({
        userId: FREELANCER.toUpperCase(),
        organizationId: null,
      }),
      true,
    );
  });
});
