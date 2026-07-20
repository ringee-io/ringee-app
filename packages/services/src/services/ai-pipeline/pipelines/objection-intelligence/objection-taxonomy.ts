/**
 * Legacy objection labels retained for old snapshots/UI fallback plus the
 * shared outcome helpers below. New Objection Intelligence results always use
 * AI-discovered dynamic clusters and do not use this taxonomy.
 *
 * `toCanonicalObjection` only supports historical rule-based CallAnalysis rows.
 */
export const OBJECTION_TYPES = [
  "send_me_information",
  "no_time",
  "too_expensive",
  "using_another_solution",
  "not_interested",
  "call_me_later",
  "not_the_right_person",
  "need_to_ask_boss",
  "bad_timing",
  "we_do_this_internally",
  "other",
] as const;

export type ObjectionType = (typeof OBJECTION_TYPES)[number];

const CANONICAL_SET = new Set<string>(OBJECTION_TYPES);

/**
 * Map a stored objection label onto the canonical taxonomy. Accepts canonical
 * labels as-is (identity) and bridges the current CallAnalysis extractor's
 * coarse labels. Pure, deterministic — NOT a second AI extraction.
 */
export function toCanonicalObjection(
  raw: string | null | undefined,
): ObjectionType {
  if (!raw) return "other";
  const key = raw.trim().toLowerCase();
  if (CANONICAL_SET.has(key)) return key as ObjectionType;

  switch (key) {
    // CallAnalysis signal-extraction buckets → canonical taxonomy.
    case "price":
      return "too_expensive";
    case "competitor":
      return "using_another_solution";
    case "need":
      return "not_interested";
    case "authority":
      return "need_to_ask_boss";
    case "timing":
      return "bad_timing";
    case "trust":
      return "other";
    default:
      return "other";
  }
}

/** Human-readable label for a canonical objection type (UI + action titles). */
export function objectionLabel(type: string): string {
  const labels: Record<ObjectionType, string> = {
    send_me_information: "Send me information",
    no_time: "No time",
    too_expensive: "Too expensive",
    using_another_solution: "Using another solution",
    not_interested: "Not interested",
    call_me_later: "Call me later",
    not_the_right_person: "Not the right person",
    need_to_ask_boss: "Need to ask my boss",
    bad_timing: "Bad timing",
    we_do_this_internally: "We do this internally",
    other: "Other",
  };
  return labels[type as ObjectionType] ?? type;
}

/**
 * Outcome classes that count as a conversion for the (correlational)
 * convertedRate and as a "handled-well" excerpt in the AI sample. Mirrors the
 * positive-progression outcomes the Follow-up pipeline treats as eligible.
 */
export const CONVERTED_OUTCOMES = new Set<string>([
  "interested",
  "follow_up",
  "callback_scheduled",
  "meeting_booked",
  "sale",
]);

/** Outcome classes that count as the objection having killed the call. */
export const KILLED_OUTCOMES = new Set<string>([
  "not_interested",
  "gatekeeper",
]);

export function isConverted(outcomeClass: string): boolean {
  return CONVERTED_OUTCOMES.has(outcomeClass);
}

export function isKilled(outcomeClass: string): boolean {
  return KILLED_OUTCOMES.has(outcomeClass);
}
