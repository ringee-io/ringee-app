/**
 * The backend product-analytics contract (Stage 4B): which facts the server
 * may send, who their actor is, and which properties each may carry. Anything
 * not listed here is dropped before it is stored — a property cannot reach
 * the provider by being added at a call site.
 *
 * The browser has its own allowlist (`@ringee/frontend-shared/analytics`) for
 * interaction and exposure events; facts that change money, calls, meetings or
 * authorizations are only ever published from here, from durable evidence.
 *
 * Never put in a property: a contact's phone, email or name, a meeting title,
 * a note, a transcript, a recording, a credential, a URL with a query string,
 * or free text a person typed. Opaque Ringee ids are allowed for correlation.
 */

export const PRODUCT_ANALYTICS_SCHEMA_VERSION = 1;

/** PostHog's group type for Ringee workspaces (personal or organization). */
export const ANALYTICS_WORKSPACE_GROUP = "workspace";

/** Who caused a fact. AI and system facts never count as human activity. */
export type AnalyticsActorType = "human" | "ai" | "system";

/**
 * Where the follow-up review was opened from — the four entry points of the
 * shared activation screen. Bounded on purpose: dashboards split by it.
 */
export const ANALYTICS_ENTRY_SOURCES = [
  "first_list",
  "interested_outcome",
  "meeting_booked",
  "ai_voice_agents_navigation",
] as const;
export type AnalyticsEntrySource = (typeof ANALYTICS_ENTRY_SOURCES)[number];

export function isAnalyticsEntrySource(
  value: unknown,
): value is AnalyticsEntrySource {
  return (
    typeof value === "string" &&
    (ANALYTICS_ENTRY_SOURCES as readonly string[]).includes(value)
  );
}

/** Where a credit checkout was started from — bounded, for funnels. */
export const CHECKOUT_ENTRY_POINTS = [
  "credit_popover",
  "my_day_line",
  "test_call",
  "follow_up_review",
  "billing_settings",
  "low_balance_prompt",
  "other",
] as const;
export type CheckoutEntryPoint = (typeof CHECKOUT_ENTRY_POINTS)[number];

interface FactDefinition {
  /** The actor a fact of this name has unless the producer says otherwise. */
  actor: AnalyticsActorType;
  /** Whether it belongs to a workspace (most do). */
  scoped: boolean;
  /** Properties beyond the common envelope. */
  properties: readonly string[];
}

/**
 * Every backend fact. Names follow the Stage 4 plan (§6) where it proposed
 * one; the rest are the closest existing domain events.
 */
export const BACKEND_ANALYTICS_FACTS = {
  // Acquisition and workspaces
  signup_completed: { actor: "human", scoped: true, properties: [] },
  workspace_created: {
    actor: "human",
    scoped: true,
    properties: ["origin"],
  },
  first_list_completed: {
    actor: "human",
    scoped: true,
    properties: ["reward_granted_usd", "reward_offered", "list_size_bucket"],
  },
  // Calls
  human_call_connected: {
    actor: "human",
    scoped: true,
    properties: [
      "direction",
      "call_surface",
      "is_first_for_workspace",
      "duration_bucket",
      "caller_id_kind",
    ],
  },
  call_outcome_recorded: {
    actor: "human",
    scoped: true,
    properties: ["outcome", "conversation", "call_surface", "follow_up_state"],
  },
  // Numbers
  number_lookup_completed: {
    actor: "human",
    scoped: true,
    properties: [
      "lookup_status",
      "country_code",
      "number_type",
      "filters_used",
      "results_bucket",
      "error_code",
    ],
  },
  /** A "no line" blocker recovered: a number bought or a caller ID verified. */
  line_acquired: {
    actor: "human",
    scoped: true,
    properties: ["line_kind", "country_code"],
  },
  // Money
  credit_checkout_started: {
    actor: "human",
    scoped: true,
    properties: ["amount_usd", "checkout_kind", "entry_point"],
  },
  credit_topup_confirmed: {
    actor: "human",
    scoped: true,
    properties: ["amount_usd", "payment_source", "is_first_paid_topup"],
  },
  credit_grant_recorded: {
    actor: "system",
    scoped: true,
    properties: ["amount_usd", "grant_source"],
  },
  // Automatic follow-up
  followup_configuration_saved: {
    actor: "human",
    scoped: true,
    properties: ["entry_source", "onboarding_version", "missing_requirements"],
  },
  followup_adoption_authorized: {
    actor: "human",
    scoped: true,
    properties: [
      "entry_source",
      "onboarding_version",
      "scheduling_enabled",
      "reminders_enabled",
      "reminder_offset_minutes",
      "existing_meetings_scope",
      "included_meeting",
      "readiness_state",
      "missing_requirements",
    ],
  },
  followup_control_applied: {
    actor: "human",
    scoped: true,
    properties: ["capability", "control"],
  },
  followup_reminder_planned: {
    actor: "system",
    scoped: true,
    properties: ["reminder_trigger", "offset_minutes", "after_adoption"],
  },
  followup_objective_started: {
    actor: "system",
    scoped: true,
    properties: ["objective_type", "source_type"],
  },
  followup_objective_resolved: {
    actor: "ai",
    scoped: true,
    properties: ["objective_type", "source_type"],
  },
  followup_objective_closed: {
    actor: "system",
    scoped: true,
    properties: ["objective_type", "source_type", "closure_reason"],
  },
  followup_business_result_recorded: {
    actor: "ai",
    scoped: true,
    properties: [
      "result_kind",
      "counts_as_value",
      "via_objective",
      "via_handoff",
      "after_adoption",
      "onboarding_version",
    ],
  },
} as const satisfies Record<string, FactDefinition>;

export type BackendAnalyticsFact = keyof typeof BACKEND_ANALYTICS_FACTS;

/** The envelope every fact carries (§6 "Propiedades mínimas"). */
export const ANALYTICS_ENVELOPE_PROPERTIES = [
  "schema_version",
  "event_id",
  "occurred_at",
  "actor_type",
  "environment",
  "release_version",
  "workspace_key",
  "workspace_type",
  "organization_id",
  "rollout_cohort",
] as const;

export function isBackendAnalyticsFact(
  value: string,
): value is BackendAnalyticsFact {
  return Object.prototype.hasOwnProperty.call(BACKEND_ANALYTICS_FACTS, value);
}

/** The properties a fact may carry: its own plus the envelope. */
export function allowedFactProperties(
  fact: BackendAnalyticsFact,
): ReadonlySet<string> {
  return new Set<string>([
    ...ANALYTICS_ENVELOPE_PROPERTIES,
    ...BACKEND_ANALYTICS_FACTS[fact].properties,
  ]);
}

/**
 * The analytics identity of a technical actor: one per workspace and actor
 * type, so AI and system facts join the workspace group without ever being a
 * human's activity (and never a human's distinct id).
 */
export function technicalDistinctId(
  actor: Exclude<AnalyticsActorType, "human">,
  workspaceKey: string,
): string {
  return `${actor}:${workspaceKey}`;
}

/** Coarse buckets keep counts useful without exposing exact sizes. */
export function sizeBucket(count: number): string {
  if (count <= 0) return "0";
  if (count === 1) return "1";
  if (count <= 5) return "2-5";
  if (count <= 25) return "6-25";
  if (count <= 100) return "26-100";
  return "100+";
}

export function durationBucket(seconds: number | null | undefined): string {
  if (seconds == null || seconds <= 0) return "unknown";
  if (seconds < 30) return "<30s";
  if (seconds < 120) return "30s-2m";
  if (seconds < 600) return "2-10m";
  return "10m+";
}
