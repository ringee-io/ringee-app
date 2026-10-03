/**
 * What counts as a campaign conversion (DISP-002) — one definition for every
 * query that counts them, so the campaign dashboard
 * (`OutboundAnalyticsRepository`) and the backoffice
 * (`BackofficeCampaignRepository`) cannot disagree.
 *
 * An attempt converts when what the agent recorded *means* a meeting or a sale:
 * its disposition's canonical outcome, or — for attempts recorded before that
 * was stored — its code, which then was the outcome. A workspace disposition
 * such as "Demo booked" (code `demo_booked`) counts; a label never decides.
 *
 * Constant SQL, built from no input: safe to interpolate into a raw query.
 */
export const CONVERSION_OUTCOMES = ["meeting_booked", "sale"] as const;

/** The canonical outcome a `CallAttempt` recorded. `alias` qualifies the columns. */
export function attemptOutcomeSql(alias?: string): string {
  const column = (name: string) => (alias ? `${alias}."${name}"` : `"${name}"`);
  return `COALESCE(${column("dispositionOutcome")}::text, ${column("dispositionCode")})`;
}

/** `<the attempt's outcome> IN ('meeting_booked','sale')`. */
export function isConversionSql(alias?: string): string {
  const outcomes = CONVERSION_OUTCOMES.map((o) => `'${o}'`).join(",");
  return `${attemptOutcomeSql(alias)} IN (${outcomes})`;
}
