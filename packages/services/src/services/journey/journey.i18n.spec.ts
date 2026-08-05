/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  JOURNEY_PROGRAM_2026_09,
  journeyNodes,
  journeyTracks,
} from "./program/journey.program";
import { JOURNEY_CAPABILITY_IDS } from "./program/journey.capabilities";
import { JOURNEY_WORKSPACE_TYPES } from "./program/journey.workspace";

/**
 * The copy contract between the program definition and the UI.
 *
 * The backend owns every id — stages, requirements, action keys, capabilities
 * and claim message codes — and the frontend only translates them. The failure
 * mode that creates is silent: add a stage, ship it, and users see a raw id or
 * a humanised slug where a sentence should be.
 *
 * These tests close that gap by asserting the source locale covers every id the
 * program can actually produce. `en` is the universal fallback for every other
 * locale, so covering `en` guarantees no user ever sees a missing string.
 */

const LOCALES_DIR = join(
  __dirname,
  "../../../../../apps/frontend/src/i18n/locales",
);

function loadLocale(locale: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(LOCALES_DIR, locale, "journey.json"), "utf8"),
  );
}

/** `node.core.rhythm.name` → the value, or undefined. */
function lookup(messages: Record<string, unknown>, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (node, key) =>
        node && typeof node === "object"
          ? (node as Record<string, unknown>)[key]
          : undefined,
      messages,
    );
}

const en = loadLocale("en");
const program = JOURNEY_PROGRAM_2026_09;

/** Every message code `JourneyService` can put on a claim result. */
const CLAIM_MESSAGE_CODES = [
  "claimed",
  "already_claimed",
  "pending_review",
  "needs_more_activity",
  "not_eligible",
  "rewards_unavailable",
  "workspace_cap_reached",
  "program_paused",
  "rate_limited",
  // v3: a reward already settled under the previous program version.
  "already_claimed_legacy",
];

/** Every reason `rewardsBlockedReason` can carry. */
const BLOCKED_REASONS = ["disabled", "budget", "holdout", "paused"];

describe("journey copy — every program id has a string", () => {
  it("names and explains every node of the graph", () => {
    for (const type of JOURNEY_WORKSPACE_TYPES) {
      for (const node of journeyNodes(program, type)) {
        for (const field of ["name", "promise", "value"]) {
          const value = lookup(en, `node.${node.id}.${field}`);
          assert.equal(
            typeof value,
            "string",
            `missing en journey.node.${node.id}.${field}`,
          );
          assert.ok(
            (value as string).length > 0,
            `empty en journey.node.${node.id}.${field}`,
          );
        }
      }
    }
  });

  it("names and explains every track", () => {
    for (const type of JOURNEY_WORKSPACE_TYPES) {
      for (const track of journeyTracks(program, type)) {
        for (const field of ["name", "description"]) {
          const value = lookup(en, `track.${track.id}.${field}`);
          assert.equal(
            typeof value,
            "string",
            `missing en journey.track.${track.id}.${field}`,
          );
        }
      }
    }
  });

  it("labels every requirement id", () => {
    const ids = new Set<string>();
    for (const type of JOURNEY_WORKSPACE_TYPES) {
      for (const node of journeyNodes(program, type)) {
        for (const requirement of node.requirements) ids.add(requirement.id);
      }
    }
    for (const id of ids) {
      assert.equal(
        typeof lookup(en, `requirement.${id}`),
        "string",
        `missing en journey.requirement.${id}`,
      );
    }
  });

  it("labels every action key", () => {
    const keys = new Set<string>();
    for (const type of JOURNEY_WORKSPACE_TYPES) {
      for (const node of journeyNodes(program, type)) {
        for (const requirement of node.requirements) {
          keys.add(requirement.actionKey);
        }
      }
    }
    for (const key of keys) {
      assert.equal(
        typeof lookup(en, `action.${key}`),
        "string",
        `missing en journey.action.${key}`,
      );
    }
  });

  it("labels every node status the evaluator can return", () => {
    for (const status of ["achieved", "in_progress", "available", "locked"]) {
      assert.equal(
        typeof lookup(en, `status.${status}`),
        "string",
        `missing en journey.status.${status}`,
      );
    }
  });

  it("labels every advanced capability", () => {
    for (const id of JOURNEY_CAPABILITY_IDS) {
      assert.equal(
        typeof lookup(en, `capabilities.${id}`),
        "string",
        `missing en journey.capabilities.${id}`,
      );
    }
  });

  it("has copy for every claim outcome the API can return", () => {
    for (const code of CLAIM_MESSAGE_CODES) {
      assert.equal(
        typeof lookup(en, `claim.${code}`),
        "string",
        `missing en journey.claim.${code}`,
      );
    }
  });

  it("has copy for every reason rewards can be unavailable", () => {
    for (const reason of BLOCKED_REASONS) {
      assert.equal(
        typeof lookup(en, `reward.unavailableReason.${reason}`),
        "string",
        `missing en journey.reward.unavailableReason.${reason}`,
      );
    }
  });
});

/**
 * Only the strings a user actually reads.
 *
 * `JSON.stringify` would also serialise the KEYS, and a key like `blockedBy`
 * would trip a check meant to catch the word "blocked" in a sentence shown to
 * a person. Tone is a property of copy, not of identifiers.
 */
function allCopy(messages: unknown): string[] {
  if (typeof messages === "string") return [messages];
  if (messages && typeof messages === "object") {
    return Object.values(messages as Record<string, unknown>).flatMap(allCopy);
  }
  return [];
}

describe("journey copy — tone", () => {
  it("never accuses the user of fraud", () => {
    // The client is told a claim needs more activity, never that it was
    // flagged. Leaking the anti-fraud posture teaches people how to evade it
    // and insults the majority who are not evading anything.
    const forbidden = /fraud|abuse|suspicious|cheat|banned|violation/i;
    for (const line of allCopy(en)) {
      assert.ok(!forbidden.test(line), `accusatory copy: "${line}"`);
    }
  });

  it("never manufactures urgency", () => {
    const forbidden =
      /expires? (today|soon)|hurry|last chance|act now|only \d+ left/i;
    for (const line of allCopy(en)) {
      assert.ok(!forbidden.test(line), `manufactured urgency: "${line}"`);
    }
  });

  it("never promises credit before it is validated", () => {
    // "You will receive" style promises on a claim that may go to review.
    assert.match(lookup(en, "claim.pending_review") as string, /review|revis/i);
  });

  it("explains that the Journey can be finished by different paths", () => {
    // The whole point of an elective model. If the copy does not say it, users
    // read a partly-empty graph as "I am behind" rather than "I chose".
    const value = lookup(en, "completion.explainer");
    assert.equal(
      typeof value,
      "string",
      "missing en journey.completion.explainer",
    );
  });

  it("never falls back to generic previous-step wording for a blocked node", () => {
    // v2 said "Complete the previous step first" because a ladder has exactly
    // one predecessor. A graph does not, so the copy must name the blocker.
    for (const line of allCopy(en)) {
      assert.ok(
        !/previous step/i.test(line),
        `blocked-node copy must name the actual blocker: "${line}"`,
      );
    }
    assert.match(
      lookup(en, "status.blockedBy") as string,
      /\{nodes?\}/,
      "journey.status.blockedBy must interpolate the blocking node names",
    );
  });
});

describe("journey copy — translations", () => {
  it("keeps the Spanish locale structurally identical to English", () => {
    // `en` is the universal fallback, so a missing key is survivable — a key
    // with the wrong SHAPE (object where a string is expected) is not.
    const es = loadLocale("es");
    const compare = (a: unknown, b: unknown, path: string) => {
      if (typeof a === "string") {
        assert.equal(typeof b, "string", `es shape mismatch at ${path}`);
        return;
      }
      if (a && typeof a === "object" && b && typeof b === "object") {
        for (const key of Object.keys(a as Record<string, unknown>)) {
          const next = (b as Record<string, unknown>)[key];
          if (next === undefined) continue; // falls back to en, fine
          compare((a as Record<string, unknown>)[key], next, `${path}.${key}`);
        }
      }
    };
    compare(en, es, "journey");
  });

  it("translates every node name into Spanish", () => {
    const es = loadLocale("es");
    for (const type of JOURNEY_WORKSPACE_TYPES) {
      for (const node of journeyNodes(program, type)) {
        assert.equal(
          typeof lookup(es, `node.${node.id}.name`),
          "string",
          `missing es journey.node.${node.id}.name`,
        );
      }
    }
  });

  it("translates every track name into Spanish", () => {
    const es = loadLocale("es");
    for (const type of JOURNEY_WORKSPACE_TYPES) {
      for (const track of journeyTracks(program, type)) {
        assert.equal(
          typeof lookup(es, `track.${track.id}.name`),
          "string",
          `missing es journey.track.${track.id}.name`,
        );
      }
    }
  });
});
