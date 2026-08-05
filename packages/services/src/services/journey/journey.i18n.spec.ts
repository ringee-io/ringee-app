/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  JOURNEY_PROGRAM_2026_08,
  journeyLadder,
} from "./program/journey.program";
import { JOURNEY_CAPABILITY_IDS } from "./program/journey.capabilities";

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

/** `stage.foundation.name` → the value, or undefined. */
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
const program = JOURNEY_PROGRAM_2026_08;

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
];

/** Every reason `rewardsBlockedReason` can carry. */
const BLOCKED_REASONS = ["disabled", "budget", "holdout", "paused"];

describe("journey copy — every program id has a string", () => {
  it("names and explains every stage on both ladders", () => {
    for (const type of ["personal", "organization"] as const) {
      for (const stage of journeyLadder(program, type)) {
        for (const field of ["name", "promise", "value"]) {
          const value = lookup(en, `stage.${stage.id}.${field}`);
          assert.equal(
            typeof value,
            "string",
            `missing en journey.stage.${stage.id}.${field}`,
          );
          assert.ok(
            (value as string).length > 0,
            `empty en journey.stage.${stage.id}.${field}`,
          );
        }
      }
    }
  });

  it("labels every requirement id", () => {
    const ids = new Set<string>();
    for (const type of ["personal", "organization"] as const) {
      for (const stage of journeyLadder(program, type)) {
        for (const requirement of stage.requirements) ids.add(requirement.id);
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
    for (const type of ["personal", "organization"] as const) {
      for (const stage of journeyLadder(program, type)) {
        for (const requirement of stage.requirements) {
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

describe("journey copy — tone", () => {
  it("never accuses the user of fraud", () => {
    // The client is told a claim needs more activity, never that it was
    // flagged. Leaking the anti-fraud posture teaches people how to evade it
    // and insults the majority who are not evading anything.
    const forbidden = /fraud|abuse|suspicious|cheat|banned|blocked|violation/i;
    const serialised = JSON.stringify(en);
    assert.ok(
      !forbidden.test(serialised),
      "journey copy must not accuse the user",
    );
  });

  it("never manufactures urgency", () => {
    const forbidden =
      /expires? (today|soon)|hurry|last chance|act now|only \d+ left/i;
    assert.ok(!forbidden.test(JSON.stringify(en)));
  });

  it("never promises credit before it is validated", () => {
    // "You will receive" style promises on a claim that may go to review.
    assert.match(lookup(en, "claim.pending_review") as string, /review|revis/i);
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

  it("translates every stage name into Spanish", () => {
    const es = loadLocale("es");
    for (const type of ["personal", "organization"] as const) {
      for (const stage of journeyLadder(program, type)) {
        assert.equal(
          typeof lookup(es, `stage.${stage.id}.name`),
          "string",
          `missing es journey.stage.${stage.id}.name`,
        );
      }
    }
  });
});
