import {
  RuleCondition,
  RuleGroup,
  RuleNode,
  RuleOperator,
} from "./offer.types";

/**
 * A small, closed rule evaluator — deliberately not a workflow engine.
 *
 * It resolves a dot path against a plain object and compares it with one of a
 * fixed operator set. New operators go in ONE place (`OPERATORS`); no offer
 * ever ships its own predicate, and no rule can reach the database.
 */

type OperatorFn = (actual: unknown, expected: unknown) => boolean;

/** Only finite numbers order-compare; anything else fails closed. */
function asNumber(value: unknown): number | null {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function compare(
  actual: unknown,
  expected: unknown,
  fn: (a: number, b: number) => boolean,
): boolean {
  const a = asNumber(actual);
  const b = asNumber(expected);
  if (a === null || b === null) return false;
  return fn(a, b);
}

const OPERATORS: Record<RuleOperator, OperatorFn> = {
  eq: (actual, expected) => actual === expected,
  neq: (actual, expected) => actual !== expected,
  gt: (actual, expected) => compare(actual, expected, (a, b) => a > b),
  gte: (actual, expected) => compare(actual, expected, (a, b) => a >= b),
  lt: (actual, expected) => compare(actual, expected, (a, b) => a < b),
  lte: (actual, expected) => compare(actual, expected, (a, b) => a <= b),
  in: (actual, expected) =>
    Array.isArray(expected) && expected.includes(actual as never),
  not_in: (actual, expected) =>
    Array.isArray(expected) && !expected.includes(actual as never),
  exists: (actual, expected) => {
    const present = actual !== undefined && actual !== null;
    // `{ operator: "exists" }` with no value means "must be present".
    return expected === false ? !present : present;
  },
};

/**
 * Reads `a.b.c` out of the context. Traversal stops at anything that is not a
 * plain object, so a malformed path yields `undefined` instead of throwing.
 */
export function resolveField(path: string, context: unknown): unknown {
  if (!path) return undefined;
  let current: unknown = context;
  for (const segment of path.split(".")) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function isCondition(node: RuleNode): node is RuleCondition {
  return typeof (node as RuleCondition).field === "string";
}

function evaluateCondition(
  condition: RuleCondition,
  context: unknown,
): boolean {
  const operator = OPERATORS[condition.operator];
  // An unknown operator fails closed: a typo must never hand out rewards.
  if (!operator) return false;
  return operator(resolveField(condition.field, context), condition.value);
}

export function evaluateNode(node: RuleNode, context: unknown): boolean {
  if (!node || typeof node !== "object") return false;
  return isCondition(node)
    ? evaluateCondition(node, context)
    : evaluateGroup(node, context);
}

/**
 * An empty group ({}, or one with empty arrays) passes: "no conditions" means
 * "no restrictions", which is what an offer without eligibility rules wants.
 */
export function evaluateGroup(group: RuleGroup, context: unknown): boolean {
  if (!group || typeof group !== "object") return true;

  if (Array.isArray(group.all) && group.all.length > 0) {
    if (!group.all.every((node) => evaluateNode(node, context))) return false;
  }

  if (Array.isArray(group.any) && group.any.length > 0) {
    if (!group.any.some((node) => evaluateNode(node, context))) return false;
  }

  if (group.not) {
    if (evaluateNode(group.not, context)) return false;
  }

  return true;
}

/**
 * Names the first failing condition, e.g. "user.totalCalls gte 300".
 * Diagnostics for the backoffice — never shown to the end user, who should not
 * learn the thresholds.
 */
export function describeFirstFailure(
  group: RuleGroup | undefined,
  context: unknown,
): string | undefined {
  if (!group) return undefined;
  const nodes: RuleNode[] = [
    ...(group.all ?? []),
    ...(group.any ?? []),
    ...(group.not ? [group.not] : []),
  ];
  for (const node of nodes) {
    if (evaluateNode(node, context)) continue;
    if (isCondition(node)) {
      return `${node.field} ${node.operator} ${JSON.stringify(node.value)}`;
    }
    const nested = describeFirstFailure(node, context);
    if (nested) return nested;
  }
  return undefined;
}
