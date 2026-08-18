/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  describeFirstFailure,
  evaluateGroup,
  resolveField,
} from "./offer-rules.engine";

const context = {
  user: { totalCalls: 300, plan: "pro", nickname: null },
  organization: { totalCalls: 1300, memberCount: 8 },
};

describe("offer rule engine", () => {
  it("reads nested fields and survives bad paths", () => {
    assert.equal(resolveField("organization.totalCalls", context), 1300);
    assert.equal(resolveField("organization.missing.deep", context), undefined);
    assert.equal(resolveField("", context), undefined);
  });

  it("supports the documented operators", () => {
    const check = (field: string, operator: string, value?: unknown): boolean =>
      evaluateGroup(
        { all: [{ field, operator: operator as never, value }] },
        context,
      );

    assert.equal(check("user.plan", "eq", "pro"), true);
    assert.equal(check("user.plan", "neq", "free"), true);
    assert.equal(check("user.totalCalls", "gt", 299), true);
    assert.equal(check("user.totalCalls", "gt", 300), false);
    assert.equal(check("user.totalCalls", "gte", 300), true);
    assert.equal(check("user.totalCalls", "lt", 301), true);
    assert.equal(check("user.totalCalls", "lte", 300), true);
    assert.equal(check("user.plan", "in", ["pro", "team"]), true);
    assert.equal(check("user.plan", "not_in", ["free"]), true);
    assert.equal(check("user.plan", "exists"), true);
    assert.equal(check("user.nickname", "exists"), false);
    assert.equal(check("user.nickname", "exists", false), true);
  });

  it("treats an empty rule group as no restriction", () => {
    assert.equal(evaluateGroup({}, context), true);
    assert.equal(evaluateGroup({ all: [] }, context), true);
  });

  it("fails closed on an unknown operator", () => {
    // A typo in an authored rule must withhold the offer, never grant it.
    assert.equal(
      evaluateGroup(
        {
          all: [
            {
              field: "user.totalCalls",
              operator: "at_least" as never,
              value: 1,
            },
          ],
        },
        context,
      ),
      false,
    );
  });

  it("fails closed when a value is not comparable", () => {
    assert.equal(
      evaluateGroup(
        { all: [{ field: "user.plan", operator: "gte", value: 300 }] },
        context,
      ),
      false,
    );
    assert.equal(
      evaluateGroup(
        { all: [{ field: "user.missing", operator: "gte", value: 0 }] },
        context,
      ),
      false,
    );
  });

  it("combines all / any / not", () => {
    assert.equal(
      evaluateGroup(
        {
          any: [
            { field: "user.totalCalls", operator: "gte", value: 5000 },
            { field: "organization.totalCalls", operator: "gte", value: 300 },
          ],
        },
        context,
      ),
      true,
    );
    assert.equal(
      evaluateGroup(
        { not: { field: "user.plan", operator: "eq", value: "pro" } },
        context,
      ),
      false,
    );
  });

  it("names the first failing condition for diagnostics", () => {
    assert.equal(
      describeFirstFailure(
        {
          all: [
            { field: "organization.totalCalls", operator: "gte", value: 300 },
            { field: "user.totalCalls", operator: "gte", value: 500 },
          ],
        },
        context,
      ),
      "user.totalCalls gte 500",
    );
  });
});
