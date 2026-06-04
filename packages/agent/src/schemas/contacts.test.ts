import assert from "node:assert/strict";
import { test } from "node:test";
import { FindContactsByOutcomeSchema } from "./contacts.js";
import { callOutcomeEnum } from "./common.js";

/**
 * Input-validation tests for find_contacts_by_outcome. The schema is the shared
 * contract the CLI, ChatGPT App and RingeeClient all validate against before
 * the backend ever sees the request, so these guard the public surface.
 */

test("accepts a valid outcome set and exposes parsed defaults", () => {
  const parsed = FindContactsByOutcomeSchema.parse({
    outcomes: ["sale", "interested", "meeting_booked"],
  });
  assert.deepEqual(parsed.outcomes, ["sale", "interested", "meeting_booked"]);
  // Optional fields stay undefined; the backend applies "any"/page 1/limit 10.
  assert.equal(parsed.match, undefined);
  assert.equal(parsed.includeUnreachable, undefined);
});

test("accepts match=last and includeUnreachable", () => {
  const parsed = FindContactsByOutcomeSchema.parse({
    outcomes: ["sale"],
    match: "last",
    includeUnreachable: true,
    page: 2,
    limit: 25,
  });
  assert.equal(parsed.match, "last");
  assert.equal(parsed.includeUnreachable, true);
  assert.equal(parsed.page, 2);
  assert.equal(parsed.limit, 25);
});

test("requires at least one outcome", () => {
  assert.throws(() => FindContactsByOutcomeSchema.parse({ outcomes: [] }));
});

test("rejects unknown outcomes", () => {
  assert.throws(() =>
    FindContactsByOutcomeSchema.parse({ outcomes: ["closed_won"] }),
  );
});

test("rejects an invalid match mode", () => {
  assert.throws(() =>
    FindContactsByOutcomeSchema.parse({ outcomes: ["sale"], match: "first" }),
  );
});

test("rejects a non-boolean includeUnreachable", () => {
  assert.throws(() =>
    FindContactsByOutcomeSchema.parse({
      outcomes: ["sale"],
      includeUnreachable: "yes",
    }),
  );
});

test("enforces the limit ceiling of 50", () => {
  assert.throws(() =>
    FindContactsByOutcomeSchema.parse({ outcomes: ["sale"], limit: 51 }),
  );
});

test("every CallOutcome value is a valid outcome filter", () => {
  // Guards drift between the outcome enum and what the tool will accept.
  for (const outcome of callOutcomeEnum.options) {
    const parsed = FindContactsByOutcomeSchema.parse({ outcomes: [outcome] });
    assert.deepEqual(parsed.outcomes, [outcome]);
  }
});
