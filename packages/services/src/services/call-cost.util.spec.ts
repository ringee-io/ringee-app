/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateCallCharge, readProfitMultiplier } from "./call-cost.util";

describe("calculateCallCharge", () => {
  it("applies a separate multiplier to recording cost parts", () => {
    const result = calculateCallCharge({
      costParts: [
        { call_part: "sip-trunking", cost: "0.0280" },
        { call_part: "call-recording", cost: "0.0020" },
      ],
      totalCost: "0.0300",
      callProfitMultiplier: 2.5,
      recordingProfitMultiplier: 1.5,
    });

    assert.equal(result.rawCallCost, 0.028);
    assert.equal(result.rawRecordingCost, 0.002);
    assert.equal(result.computedCallCost, 0.07);
    assert.equal(result.computedRecordingCost, 0.003);
    assert.ok(Math.abs(result.computedTotalCost - 0.073) < Number.EPSILON);
  });

  it("applies the call multiplier to every non-recording part", () => {
    const result = calculateCallCharge({
      costParts: [
        { call_part: "sip-trunking", cost: "0.0200" },
        { call_part: "call-control", cost: "0.0080" },
        { call_part: "call-recording", cost: "0.0020" },
      ],
      totalCost: "0.0300",
      callProfitMultiplier: 2,
      recordingProfitMultiplier: 1,
    });

    assert.equal(result.rawCallCost, 0.028);
    assert.equal(result.rawRecordingCost, 0.002);
    assert.equal(result.computedTotalCost, 0.058);
  });

  it("falls back to total_cost when cost_parts are unavailable", () => {
    const result = calculateCallCharge({
      costParts: undefined,
      totalCost: "0.0300",
      callProfitMultiplier: 2,
      recordingProfitMultiplier: 1.5,
    });

    assert.equal(result.computedTotalCost, 0.06);
  });
});

describe("readProfitMultiplier", () => {
  it("uses the provided fallback for a missing or invalid value", () => {
    assert.equal(readProfitMultiplier(undefined, 2), 2);
    assert.equal(readProfitMultiplier("invalid", 2), 2);
  });
});
