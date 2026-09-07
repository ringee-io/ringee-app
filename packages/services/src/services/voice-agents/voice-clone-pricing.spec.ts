/// <reference types="node" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateVoiceClonePrice } from "./voice-clone-pricing";

describe("voice clone pricing", () => {
  it("applies a configurable multiplier with six decimal currency precision", () => {
    assert.equal(calculateVoiceClonePrice(2, 1.5).amountUsd, 3);
    assert.equal(calculateVoiceClonePrice(0.1, 3).amountUsd, 0.3);
    assert.equal(calculateVoiceClonePrice(0.0123456, 1).amountUsd, 0.012346);
    assert.equal(calculateVoiceClonePrice(0, 5).amountUsd, 0);
  });
  it("rejects unsafe pricing configuration", () => {
    for (const [base, margin] of [
      [-1, 1],
      [NaN, 1],
      [Infinity, 1],
      [1, 0.9],
      [1, NaN],
      [1, Infinity],
      [Number.MAX_VALUE, 2],
    ]) {
      assert.throws(
        () => calculateVoiceClonePrice(base!, margin!),
        /Invalid voice cloning/,
      );
    }
  });
});
