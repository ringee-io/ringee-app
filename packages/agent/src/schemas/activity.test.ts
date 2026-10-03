import assert from "node:assert/strict";
import { test } from "node:test";
import { ListDispositionsSchema, LogCallOutcomeSchema } from "./activity.js";
import { TOOL_BY_ACTION, TOOL_BY_NAME } from "../tools/catalog.js";

/**
 * log_call_outcome is a public contract cached by external assistants: every
 * call that was valid before dispositions must stay valid, and the new
 * `dispositionId` is purely additive.
 */

const CALL_ID = "3f1c2a9e-7b1d-4c3e-9a2f-5d6e7f8a9b0c";
const DISPOSITION_ID = "8a7b6c5d-4e3f-4a1b-9c8d-7e6f5a4b3c2d";

test("a legacy call with a canonical outcome is still valid", () => {
  const parsed = LogCallOutcomeSchema.parse({
    callId: CALL_ID,
    outcome: "meeting_booked",
    outcomeNote: "Demo Friday",
  });
  assert.equal(parsed.outcome, "meeting_booked");
  assert.equal(parsed.dispositionId, undefined);
});

test("a workspace disposition can be logged without an outcome", () => {
  const parsed = LogCallOutcomeSchema.parse({
    callId: CALL_ID,
    dispositionId: DISPOSITION_ID,
  });
  assert.equal(parsed.dispositionId, DISPOSITION_ID);
  assert.equal(parsed.outcome, undefined);
});

test("an unknown outcome and an invented disposition id are refused", () => {
  assert.throws(() =>
    LogCallOutcomeSchema.parse({ callId: CALL_ID, outcome: "converted" }),
  );
  assert.throws(() =>
    LogCallOutcomeSchema.parse({ callId: CALL_ID, dispositionId: "demo" }),
  );
});

test("the schema stays a plain object, so the ChatGPT App can register its shape", () => {
  assert.deepEqual(Object.keys(LogCallOutcomeSchema.shape).sort(), [
    "callId",
    "dispositionId",
    "outcome",
    "outcomeNote",
  ]);
  assert.deepEqual(Object.keys(ListDispositionsSchema.shape), []);
});

test("list_dispositions is catalogued as a safe read", () => {
  const tool = TOOL_BY_NAME["list_dispositions"];
  assert.ok(tool, "tool should be in the catalog");
  assert.equal(tool.action, "dispositions.list");
  assert.equal(tool.sensitivity, "read");
  assert.equal(tool.annotations.readOnlyHint, true);
  assert.equal(TOOL_BY_ACTION["outcomes.log"]?.tool, "log_call_outcome");
});
