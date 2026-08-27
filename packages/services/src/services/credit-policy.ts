/**
 * Thresholds of the prepaid-balance policy (BILL-009, BILL-010, BILL-019).
 *
 * They live in their own module rather than next to either consumer because
 * the two have to agree: the alert that tells a workspace "calls are now cut
 * off at 5 minutes" is only true while `CallService` caps them at exactly this
 * balance, for exactly this long. A copy in each file would drift.
 */

/** At or below this balance an answered outbound call is time-capped. */
export const LOW_BALANCE_USD = 2;

/** How long an answered call may run once the balance is low. */
export const LOW_BALANCE_MAX_CALL_SECONDS = 5 * 60;

/**
 * Organizations get an earlier heads-up, because topping one up is not a
 * self-service card tap — an admin has to notice, and finance may be a
 * different person. A personal workspace tops itself up in one click, so its
 * first warning is the one that actually changes what the product does.
 */
export const ORG_EARLY_WARNING_USD = 5;

/** At or below this the workspace cannot place calls at all. */
export const DEPLETED_USD = 0;

/**
 * How severe a balance has become, in the order the customer meets them.
 *
 * - `early_warning` — nothing has changed yet; top up at your leisure.
 * - `call_cap` — answered calls are hung up at `LOW_BALANCE_MAX_CALL_SECONDS`.
 * - `depleted` — the workspace is inactive: no outbound call is placed.
 */
export type CreditAlertTier = "early_warning" | "call_cap" | "depleted";

interface CreditAlertLevel {
  tier: CreditAlertTier;
  /** Alert when the balance falls to or below this, in USD. */
  threshold: number;
}

/**
 * The levels a workspace of this shape is alerted at, most severe last.
 * Organizations get the extra early warning; personal workspaces do not.
 */
export function creditAlertLevels(isOrganization: boolean): CreditAlertLevel[] {
  return [
    ...(isOrganization
      ? [{ tier: "early_warning" as const, threshold: ORG_EARLY_WARNING_USD }]
      : []),
    { tier: "call_cap", threshold: LOW_BALANCE_USD },
    { tier: "depleted", threshold: DEPLETED_USD },
  ];
}

/**
 * The tier a single debit pushed the workspace into, or `null` when it crossed
 * nothing.
 *
 * Crossing — not "is currently below" — is what makes this fire exactly once
 * per drop without storing any per-workspace alert state: a balance can only
 * cross a threshold downwards again after a top-up has lifted it back over.
 * A debit large enough to clear several levels at once reports only the worst
 * of them, so one debit is at most one alert.
 */
export function resolveCreditAlertTier(params: {
  balanceBefore: number;
  balanceAfter: number;
  isOrganization: boolean;
}): CreditAlertTier | null {
  const { balanceBefore, balanceAfter, isOrganization } = params;
  if (!Number.isFinite(balanceBefore) || !Number.isFinite(balanceAfter)) {
    return null;
  }

  const crossed = creditAlertLevels(isOrganization).filter(
    (level) =>
      balanceBefore > level.threshold && balanceAfter <= level.threshold,
  );

  return crossed.length > 0 ? crossed[crossed.length - 1].tier : null;
}
