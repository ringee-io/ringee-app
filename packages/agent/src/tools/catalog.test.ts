import assert from "node:assert/strict";
import { test } from "node:test";
import { TOOL_BY_ACTION, TOOL_BY_NAME } from "./catalog.js";

/**
 * Wiring tests for the find_contacts_by_outcome catalog entry — the single
 * source of truth the CLI, Skills and ChatGPT App read for sensitivity,
 * confirmation and which component renders the result.
 */

test("find_contacts_by_outcome is registered as a read-only tool", () => {
  const tool = TOOL_BY_NAME["find_contacts_by_outcome"];
  assert.ok(tool, "tool should be in the catalog");
  assert.equal(tool.action, "contacts.byOutcome");
  assert.equal(tool.sensitivity, "read");
  // Read-only tier never spends credits and needs no confirmation gate.
  assert.notEqual(tool.consumesCredits, true);
  assert.notEqual(tool.requiresConfirmation, true);
});

test("its annotations match a safe read tool", () => {
  const tool = TOOL_BY_NAME["find_contacts_by_outcome"];
  assert.deepEqual(tool.annotations, {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  });
});

test("it renders through the OutcomeContactsCard component", () => {
  assert.equal(
    TOOL_BY_ACTION["contacts.byOutcome"].component,
    "OutcomeContactsCard",
  );
});
