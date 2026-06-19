/** Small presentation helpers for the side-panel "Today" feed. */

/** "2:30 PM" in the user's locale. */
export function formatTime(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "3:05" from a seconds count; "—" when unknown/zero. */
export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** A human label for a stored CallOutcome. */
export function outcomeLabel(
  outcome: string | null | undefined,
): string | null {
  if (!outcome) return null;
  const map: Record<string, string> = {
    meeting_booked: "Meeting booked",
    sale: "Sale",
    interested: "Interested",
    follow_up: "Follow up",
    callback_scheduled: "Callback",
    not_interested: "Not interested",
    no_answer: "No answer",
    voicemail: "Voicemail",
    wrong_number: "Wrong number",
    gatekeeper: "Gatekeeper",
  };
  return map[outcome] ?? outcome.replace(/_/g, " ");
}

/** Positive outcomes get an emerald chip; dead-ends a muted one. */
export function outcomeIsPositive(outcome: string | null | undefined): boolean {
  return (
    !!outcome &&
    ["meeting_booked", "sale", "interested", "follow_up"].includes(outcome)
  );
}
