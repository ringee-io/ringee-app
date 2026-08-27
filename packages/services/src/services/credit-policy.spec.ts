/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveCreditAlertTier } from "./credit-policy";

describe("resolveCreditAlertTier", () => {
  it("warns an organization at $5 before anything is restricted", () => {
    assert.equal(
      resolveCreditAlertTier({
        balanceBefore: 5.4,
        balanceAfter: 4.8,
        isOrganization: true,
      }),
      "early_warning",
    );
  });

  it("does not warn a personal workspace at $5", () => {
    assert.equal(
      resolveCreditAlertTier({
        balanceBefore: 5.4,
        balanceAfter: 4.8,
        isOrganization: false,
      }),
      null,
    );
  });

  it("reports the call cap when the balance falls to $2 or below", () => {
    for (const isOrganization of [true, false]) {
      assert.equal(
        resolveCreditAlertTier({
          balanceBefore: 2.1,
          balanceAfter: 2,
          isOrganization,
        }),
        "call_cap",
      );
    }
  });

  it("reports depletion when the balance stops being positive", () => {
    assert.equal(
      resolveCreditAlertTier({
        balanceBefore: 0.4,
        balanceAfter: -0.2,
        isOrganization: false,
      }),
      "depleted",
    );
  });

  it("reports only the worst tier when one debit clears several", () => {
    assert.equal(
      resolveCreditAlertTier({
        balanceBefore: 6,
        balanceAfter: 1.5,
        isOrganization: true,
      }),
      "call_cap",
    );
  });

  it("stays silent for a debit that crosses nothing", () => {
    assert.equal(
      resolveCreditAlertTier({
        balanceBefore: 40,
        balanceAfter: 39.2,
        isOrganization: true,
      }),
      null,
    );
  });

  it("stays silent below a threshold that was already crossed", () => {
    assert.equal(
      resolveCreditAlertTier({
        balanceBefore: 1.4,
        balanceAfter: 1.1,
        isOrganization: true,
      }),
      null,
    );
  });
});
