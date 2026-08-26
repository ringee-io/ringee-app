/** Light presentational formatters — never used for validation. */

/**
 * Group an E.164-ish number for readability without being locale-clever:
 * "+13055550198" → "+1 305 555 0198". Leaves unknown shapes mostly intact.
 */
export function formatPhone(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  const plus = value.startsWith("+");
  const digits = value.replace(/[^\d]/g, "");
  if (digits.length < 7) return value;
  // Split the last 10 into 3-3-4; whatever precedes it is the country code.
  const last = digits.slice(-10);
  const cc = digits.slice(0, -10);
  const groups = [last.slice(0, 3), last.slice(3, 6), last.slice(6)].filter(
    Boolean,
  );
  const body = groups.join(" ");
  const head = cc ? `${plus ? "+" : ""}${cc} ` : plus ? "+" : "";
  return `${head}${body}`.trim();
}

/** Seconds → "M:SS" or "H:MM:SS". */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return h > 0
    ? `${h}:${mm}:${String(sec).padStart(2, "0")}`
    : `${mm}:${String(sec).padStart(2, "0")}`;
}
