import assert from "node:assert/strict";
import { test } from "node:test";
import { TOOL_BY_ACTION, TOOL_BY_NAME, TOOL_CATALOG } from "./catalog.js";

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

/**
 * Catalog-wide invariants. The confirmation gate in every interface is driven
 * off `sensitivity` + `requiresConfirmation` + `annotations.destructiveHint`,
 * so those three must never drift apart.
 */

test("actions and tool names are unique", () => {
  const actions = TOOL_CATALOG.map((t) => t.action);
  const tools = TOOL_CATALOG.map((t) => t.tool);
  assert.equal(new Set(actions).size, actions.length, "duplicate action id");
  assert.equal(new Set(tools).size, tools.length, "duplicate tool name");
});

test("every destructive tool is gated and flagged", () => {
  for (const tool of TOOL_CATALOG.filter(
    (t) => t.sensitivity === "destructive",
  )) {
    assert.equal(
      tool.requiresConfirmation,
      true,
      `${tool.tool} must require confirmation`,
    );
    assert.equal(
      tool.annotations.destructiveHint,
      true,
      `${tool.tool} must set destructiveHint`,
    );
    assert.equal(
      tool.annotations.readOnlyHint,
      false,
      `${tool.tool} cannot be read-only`,
    );
  }
});

test("read tools never mutate and never need confirmation", () => {
  for (const tool of TOOL_CATALOG.filter((t) => t.sensitivity === "read")) {
    assert.equal(
      tool.annotations.destructiveHint,
      false,
      `${tool.tool} must not be destructive`,
    );
    assert.notEqual(
      tool.requiresConfirmation,
      true,
      `${tool.tool} should not need confirmation`,
    );
  }
});

test("every CLI example invokes the ringee binary", () => {
  for (const tool of TOOL_CATALOG) {
    assert.ok(
      tool.cli.startsWith("ringee "),
      `${tool.tool} has a malformed CLI example: ${tool.cli}`,
    );
  }
});

test("the campaign, analytics, DNC and pipeline tools are registered", () => {
  const expected = [
    "list_campaigns",
    "get_campaign",
    "update_campaign_status",
    "list_campaign_leads",
    "add_campaign_leads",
    "delete_campaign_lead",
    "get_campaign_analytics",
    "get_call_analytics",
    "get_day_activity",
    "list_callbacks",
    "list_dnc",
    "add_to_dnc",
    "remove_from_dnc",
    "list_ai_pipelines",
    "get_ai_pipeline_results",
  ];
  for (const tool of expected) {
    assert.ok(TOOL_BY_NAME[tool], `${tool} is missing from the catalog`);
  }
});

test("delete_campaign_lead and remove_from_dnc are destructive", () => {
  // Both undo something a user relies on: a lead's dialing history, and a
  // compliance suppression. Neither may be reachable without confirmation.
  for (const tool of ["delete_campaign_lead", "remove_from_dnc"]) {
    assert.equal(TOOL_BY_NAME[tool]?.sensitivity, "destructive", tool);
  }
});

test("AI voice agents are exposed only for list, trigger and result reads", () => {
  const tools = TOOL_CATALOG.filter((tool) =>
    tool.action.startsWith("voiceAgents."),
  );
  assert.deepEqual(
    tools.map((tool) => tool.tool),
    [
      "list_ai_voice_agents",
      "start_ai_voice_agent_call",
      "get_ai_voice_agent_call",
    ],
  );
  const trigger = TOOL_BY_NAME["start_ai_voice_agent_call"];
  assert.equal(trigger?.consumesCredits, true);
  assert.equal(trigger?.requiresConfirmation, true);
  assert.match(trigger?.cli ?? "", /--yes$/);
});
