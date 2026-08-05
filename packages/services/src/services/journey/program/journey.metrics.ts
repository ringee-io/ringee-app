/**
 * The Journey metric bag — the single vocabulary every stage requirement is
 * written against.
 *
 * Everything is a number so evaluation is a pure `current >= target` fold with
 * no per-stage branching: booleans are 0/1, durations are whole minutes, and
 * "has the workspace done X" questions are counts. The repository produces
 * exactly this shape and nothing else reads the database on the stage path.
 *
 * Definitions live in `docs/journey-v2.md` §4 and must stay in sync with
 * `journey.repository.ts`; the metric key is the contract between them.
 */

export const JOURNEY_METRIC_KEYS = [
  // ── Foundation ────────────────────────────────────────────────────────────
  /** 1 when the workspace admin has a Clerk-verified phone number. */
  "verifiedPhone",
  /** Purchased numbers plus verified caller IDs that can actually place a call. */
  "dialableNumbers",

  // ── Calling ───────────────────────────────────────────────────────────────
  /** Legitimately dialled external destinations (see `attemptedCall`). */
  "attemptedCalls",
  /** Provider-confirmed, answered, long-enough, non-machine calls. */
  "connectedCalls",
  /** Connected calls with duration or operational evidence of a real talk. */
  "meaningfulConversations",
  /** Whole minutes of connected talk time. */
  "connectedMinutes",
  /** Connected minutes that actually cost money (a real carrier leg). */
  "billableMinutes",
  /** Distinct E.164-normalised destinations among connected calls. */
  "uniqueDestinations",
  /** Distinct workspace-local calendar days with a connected call. */
  "activeDays",
  /** Distinct workspace-local ISO weeks with a connected call. */
  "activeWeeks",
  /** Distinct users who placed a connected call. */
  "activeMembers",
  /** Memberships that were actually accepted — pending invitations excluded. */
  "acceptedMembers",
  /** Distinct origin channels (web, extension, mobile, campaign, session, …). */
  "callSources",
  /** Connected calls that carry a disposition. */
  "outcomesLogged",

  // ── Campaigns ─────────────────────────────────────────────────────────────
  "campaignConnectedCalls",
  "campaignUniqueDestinations",
  "campaignActiveDays",
  /** Campaigns clearing the volume + spread + distribution floor. */
  "campaignsWithRealActivity",
  /** Distinct campaign leads that were actually reached. */
  "workedLeads",

  // ── Follow-through ────────────────────────────────────────────────────────
  /** Callbacks that were created and later actually called back. */
  "callbacksWorked",
  /** Meetings pushed to a real external calendar. */
  "meetingsSynced",

  // ── Integrations ──────────────────────────────────────────────────────────
  /** CRM activity syncs that completed, for calls that really connected. */
  "crmSyncedCalls",
  /** Outbound webhook deliveries a custom integration accepted. */
  "customIntegrationDeliveries",
  /** Enrichment jobs that produced a contact in Ringee. */
  "enrichmentImports",
  /** Convenience roll-up: crmSyncedCalls + customIntegrationDeliveries + meetingsSynced. */
  "integrationSuccesses",

  // ── Intelligence ──────────────────────────────────────────────────────────
  /** Completed, non-empty transcripts of connected calls. */
  "transcriptionsCompleted",
  /** Successful pipeline runs that persisted a result the user can act on. */
  "aiResultsProduced",
  /** Distinct members whose calls produced an AI result. */
  "aiMembersCovered",

  // ── Inbound ───────────────────────────────────────────────────────────────
  /** Genuinely answered inbound calls, same duration and QA floors as outbound. */
  "inboundCallsAnswered",
  /** Answered inbound calls that rang on a desk phone. Not `sipDeviceCalls`. */
  "inboundSipDeviceCalls",
  /** Missed inbound calls that were called back and connected within 48h. */
  "inboundMissedFollowedUp",

  // ── Agentic / channels ────────────────────────────────────────────────────
  "mcpSessions",
  "mcpCalls",
  /** Distinct caller IDs actually used on connected calls. */
  "rotationCallerIdsUsed",
  "sipDeviceCalls",
  "sdkCalls",
  "extensionCalls",
  "callSessionCalls",

  // ── Derived ───────────────────────────────────────────────────────────────
  /** How many advanced capabilities cleared their own usage floor. */
  "advancedCapabilitiesUsed",
] as const;

export type JourneyMetricKey = (typeof JOURNEY_METRIC_KEYS)[number];

export type JourneyMetrics = Record<JourneyMetricKey, number>;

/** A metric bag with every key at zero — the honest starting point. */
export function emptyJourneyMetrics(): JourneyMetrics {
  return JOURNEY_METRIC_KEYS.reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {} as JourneyMetrics);
}

/**
 * Coerces an arbitrary record into a complete metric bag. Missing keys become
 * 0 and non-finite values are rejected rather than propagated — an `NaN`
 * leaking into a comparison would silently make every requirement fail.
 */
export function toJourneyMetrics(
  input: Partial<Record<JourneyMetricKey, number>>,
): JourneyMetrics {
  const metrics = emptyJourneyMetrics();
  for (const key of JOURNEY_METRIC_KEYS) {
    const value = input[key];
    metrics[key] =
      typeof value === "number" && Number.isFinite(value)
        ? Math.max(0, Math.trunc(value))
        : 0;
  }
  return metrics;
}
