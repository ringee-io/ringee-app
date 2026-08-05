import { createHash } from "node:crypto";

/**
 * Pure, server-side predicates behind every Journey signal.
 *
 * These are deliberately free of Prisma and of NestJS so they can be unit
 * tested exhaustively and reused by the repository (which translates them into
 * SQL), by the analysis script and by the tests. Where a predicate is enforced
 * in SQL for performance, the TypeScript version here is the specification and
 * the two are kept in sync by tests over the same fixtures.
 *
 * Definitions: docs/journey-v2.md §4.
 */

// ── Call shape as the predicates see it ──────────────────────────────────────

export interface JourneyCallRow {
  direction: string | null;
  status: string;
  toNumber: string;
  startedAt: Date | null;
  answeredAt: Date | null;
  endedAt: Date | null;
  durationSeconds: number | null;
  outcome: string | null;
  providerCallId: string | null;
  totalCost: number | null;
}

export interface JourneyCallThresholds {
  minConnectedSeconds: number;
  meaningfulSeconds: number;
}

/** Dispositions that positively assert nobody was reached. */
export const UNCONNECTED_OUTCOMES = [
  "no_answer",
  "voicemail",
  "wrong_number",
] as const;

/** Call statuses in which a leg genuinely reached the far end. */
const TERMINAL_CONNECTED_STATUSES = new Set([
  "completed",
  "recording",
  "answered",
]);

/**
 * Normalises a phone number to a comparable E.164-ish key: digits only, with a
 * leading `+`. Deliberately lenient — this is used for *counting distinct
 * destinations*, not for dialling, and a stricter parse would silently drop
 * legitimate international numbers whose country we cannot infer.
 */
export function normalizeDestination(raw: string | null | undefined): string {
  if (!raw) return "";
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length < 6) return "";
  return `+${digits.replace(/^0+/, "")}`;
}

/**
 * A legitimately initiated call towards an external destination.
 *
 * Excludes calls that never left the queue, calls to numbers the workspace owns
 * (dialling yourself is not outbound activity) and configured QA destinations.
 */
export function isAttemptedCall(
  call: JourneyCallRow,
  context: {
    ownedNumbers: ReadonlySet<string>;
    testDestinations: ReadonlySet<string>;
  },
): boolean {
  if (!call.startedAt) return false;
  // Legacy rows carry no direction and are always the outbound web dialer.
  if (call.direction && call.direction !== "outbound") return false;
  if (call.status === "pending") return false;

  const destination = normalizeDestination(call.toNumber);
  if (!destination) return false;
  if (context.ownedNumbers.has(destination)) return false;
  if (context.testDestinations.has(destination)) return false;

  return true;
}

/**
 * A call that provably reached a human-answerable endpoint.
 *
 * Every clause here exists because one of them alone is forgeable:
 * `answeredAt` is stamped by fake answer supervision, the disposition is typed
 * by the user, and a duplicated provider row would double-count. Requiring the
 * telephony stamps AND a duration floor AND a non-machine disposition AND a
 * unique `providerCallId` makes a manufactured "connected call" expensive.
 */
export function isConnectedCall(
  call: JourneyCallRow,
  context: {
    ownedNumbers: ReadonlySet<string>;
    testDestinations: ReadonlySet<string>;
    thresholds: JourneyCallThresholds;
  },
): boolean {
  if (!isAttemptedCall(call, context)) return false;
  if (!call.answeredAt || !call.endedAt) return false;
  if (!TERMINAL_CONNECTED_STATUSES.has(call.status)) return false;
  // `providerCallId` is unique in the schema — this is what makes a replayed
  // provider webhook incapable of inflating the count.
  if (!call.providerCallId) return false;
  if ((call.durationSeconds ?? 0) < context.thresholds.minConnectedSeconds) {
    return false;
  }
  if (
    call.outcome &&
    (UNCONNECTED_OUTCOMES as readonly string[]).includes(call.outcome)
  ) {
    return false;
  }
  return true;
}

/** Operational evidence that a connected call was a real conversation. */
export interface JourneyConversationEvidence {
  hasCompletedTranscript: boolean;
  producedMeeting: boolean;
  producedCallback: boolean;
  producedCrmSync: boolean;
}

/**
 * A conversation, not a pickup.
 *
 * Long enough on its own, OR short but backed by something the operation
 * actually produced. Dispositions are never sufficient by themselves: a
 * dropdown is the cheapest thing in the product to manipulate, a synced CRM
 * activity or a completed transcript is not.
 */
export function isMeaningfulConversation(
  call: JourneyCallRow,
  context: {
    ownedNumbers: ReadonlySet<string>;
    testDestinations: ReadonlySet<string>;
    thresholds: JourneyCallThresholds;
    evidence: JourneyConversationEvidence;
  },
): boolean {
  if (!isConnectedCall(call, context)) return false;
  if ((call.durationSeconds ?? 0) >= context.thresholds.meaningfulSeconds) {
    return true;
  }
  const { evidence } = context;
  return (
    evidence.hasCompletedTranscript ||
    evidence.producedMeeting ||
    evidence.producedCallback ||
    evidence.producedCrmSync
  );
}

// ── Timezone ─────────────────────────────────────────────────────────────────

const IANA_PATTERN = /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/;

/**
 * Validates a workspace timezone, falling back to UTC.
 *
 * Falls back rather than throwing: a bad value in one workspace's profile must
 * not take down the Journey for that workspace, and UTC is a defensible,
 * documented default. The value is interpolated into SQL (`AT TIME ZONE`), so
 * the format check is also the injection guard.
 */
export function resolveWorkspaceTimezone(
  raw: string | null | undefined,
): string {
  if (!raw || typeof raw !== "string") return "UTC";
  const candidate = raw.trim();
  if (!candidate || candidate.length > 64 || !IANA_PATTERN.test(candidate)) {
    return "UTC";
  }
  try {
    // Intl is the authority on whether PostgreSQL will recognise the zone.
    new Intl.DateTimeFormat("en-US", { timeZone: candidate });
    return candidate;
  } catch {
    return "UTC";
  }
}

/**
 * The workspace-local calendar day for an instant, as `YYYY-MM-DD`.
 *
 * Used by the analysis script and by the tests that pin DST behaviour; the
 * repository does the same bucketing in SQL for the live path.
 */
export function localDayKey(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * The workspace-local ISO week key, as `YYYY-Www`.
 *
 * Weeks start on Monday, matching `date_trunc('week', …)` in PostgreSQL so the
 * TypeScript and SQL paths agree.
 */
export function localWeekKey(instant: Date, timeZone: string): string {
  const day = localDayKey(instant, timeZone);
  const [year, month, date] = day.split("-").map(Number);
  // Anchor at noon UTC so the arithmetic below can never slip a day.
  const anchor = new Date(Date.UTC(year, month - 1, date, 12));
  const isoDay = anchor.getUTCDay() === 0 ? 7 : anchor.getUTCDay();
  anchor.setUTCDate(anchor.getUTCDate() + 4 - isoDay);
  const isoYear = anchor.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4, 12));
  const firstIsoDay =
    firstThursday.getUTCDay() === 0 ? 7 : firstThursday.getUTCDay();
  firstThursday.setUTCDate(firstThursday.getUTCDate() + 4 - firstIsoDay);
  const week =
    1 +
    Math.round(
      (anchor.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000),
    );
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

// ── Rollout cohorts ──────────────────────────────────────────────────────────

/**
 * A stable 0-99 bucket for a workspace.
 *
 * Hash-based rather than random or modulo-of-id so a workspace never changes
 * bucket between requests, deploys or percentage changes — the property that
 * makes a staged rollout and a holdout measurable at all.
 */
export function workspaceBucket(
  workspaceType: string,
  workspaceId: string,
): number {
  const digest = createHash("sha256")
    .update(`journey:${workspaceType}:${workspaceId}`)
    .digest();
  return digest.readUInt32BE(0) % 100;
}

export interface JourneyRolloutDecision {
  /** Whether this workspace sees the Journey surface at all. */
  enabled: boolean;
  /** In the holdout: sees the Journey, is never offered rewards. */
  holdout: boolean;
  bucket: number;
}

export function resolveRollout(input: {
  workspaceType: string;
  workspaceId: string;
  userId: string;
  rolloutPercent: number;
  holdoutPercent: number;
  internalUserIds: ReadonlySet<string>;
}): JourneyRolloutDecision {
  const bucket = workspaceBucket(input.workspaceType, input.workspaceId);
  // Internal users are always in, and never in the holdout — they are how we
  // dogfood the surface, not a measurement population.
  if (input.internalUserIds.has(input.userId)) {
    return { enabled: true, holdout: false, bucket };
  }
  const enabled = bucket < input.rolloutPercent;
  // The holdout is carved from the TOP of the enabled range so growing the
  // rollout percentage never reshuffles who is in it.
  const holdout =
    enabled &&
    input.holdoutPercent > 0 &&
    bucket >= Math.max(0, input.rolloutPercent - input.holdoutPercent);
  return { enabled, holdout, bucket };
}

/** SHA-256 of a value, truncated — for risk snapshots that must not carry PII. */
export function hashIdentifier(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}
