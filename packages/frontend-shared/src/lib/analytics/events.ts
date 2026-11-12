/**
 * The browser's analytics contract (Stage 4B): interaction and exposure only.
 * Facts that change money, calls, meetings or authorizations — a connected
 * call, a saved outcome, an adoption, a confirmed top-up — are published by
 * the backend from durable evidence, never from here.
 *
 * An event or property that is not listed is dropped before it is sent.
 * Never add: a contact's name, phone or email, a meeting title, a note, a
 * transcript, a credential, or free text a person typed.
 */

export const CLIENT_ANALYTICS_SCHEMA_VERSION = 1;

/** Where the shared follow-up review was opened from (bounded). */
export const FOLLOW_UP_ENTRY_SOURCES = [
  "first_list",
  "interested_outcome",
  "meeting_booked",
  "ai_voice_agents_navigation",
] as const;
export type FollowUpEntrySource = (typeof FOLLOW_UP_ENTRY_SOURCES)[number];

export function isFollowUpEntrySource(
  value: unknown,
): value is FollowUpEntrySource {
  return (
    typeof value === "string" &&
    (FOLLOW_UP_ENTRY_SOURCES as readonly string[]).includes(value)
  );
}

export const CLIENT_ANALYTICS_EVENTS = {
  // Automatic follow-up (Stage 4C)
  followup_invitation_shown: ["entry_source", "follow_up_state"],
  followup_invitation_dismissed: ["entry_source"],
  followup_review_opened: [
    "entry_source",
    "follow_up_state",
    "has_source_meeting",
    "can_configure",
    "missing_requirements",
  ],
  followup_review_row_saved: ["row", "entry_source"],
  followup_capability_toggled: ["capability", "enabled"],
  followup_activation_clicked: ["entry_source", "include_meeting"],
  followup_activation_failed: ["entry_source", "error_code"],
  followup_value_summary_viewed: ["result_kind", "first_result", "settled"],
  followup_value_summary_action: ["action"],
  // Readiness blockers and their recovery
  readiness_blocker_shown: ["blocker", "surface"],
  readiness_recovery_started: ["blocker", "action", "surface"],
  // First call. Exposure, intent and attempt are separate on purpose: My day
  // opens the test-call modal on its own (exposure); the person saving the
  // number to call is the intent; their explicit "Call next" the attempt.
  // The connected call is the backend's `human_call_connected`.
  first_list_offer_shown: ["reward_usd"],
  test_call_modal_shown: ["trigger", "line", "reward_usd"],
  test_call_intent: ["surface", "line"],
  test_call_dial_attempted: ["line", "has_credit"],
  // Numbers
  number_search_recovery_clicked: ["action", "lookup_status"],
  // Money
  credit_topup_opened: ["entry_point"],
} as const satisfies Record<string, readonly string[]>;

export type ClientAnalyticsEvent = keyof typeof CLIENT_ANALYTICS_EVENTS;

/** The envelope every client event carries besides its own properties. */
export const CLIENT_ENVELOPE = [
  "schema_version",
  "actor_type",
  "environment",
  "release_version",
  "workspace_key",
  "workspace_type",
] as const;
