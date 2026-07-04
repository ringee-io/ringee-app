// Shared constants + formatting for the credit recharge flow. Centralized here
// so the amount selector, saved-card fast path and embedded checkout all agree
// on presets, bounds and the calling-time / money formatting.

export const RECHARGE_PRESETS = [10, 25, 50, 100] as const;

// One quick-pick set per flow. The custom input always accepts any in-bounds
// amount; presets are just the low-friction defaults.
export const MONTHLY_PRESETS = [25, 50, 100, 200] as const;
export const THRESHOLD_PRESETS = [5, 10, 20, 50] as const;
export const RELOAD_PRESETS = [10, 25, 50, 100] as const;

// Client-side bounds. The server re-validates these authoritatively
// (`normalizeTopupAmount`, $5–$2000) — these only drive UX.
export const MIN_AMOUNT = 5;
export const MAX_AMOUNT = 2000;

// ~50 minutes of calling per USD (matches the backend heuristic).
export const MINUTES_PER_USD = 50;

export const money = (n: number) => `$${n.toFixed(2)}`;

export const estimateMinutes = (usd: number) =>
  Math.round(usd * MINUTES_PER_USD);

const BRAND_LABELS: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'Amex',
  discover: 'Discover',
  diners: 'Diners',
  jcb: 'JCB',
  unionpay: 'UnionPay'
};

/** Human-friendly card brand label, e.g. "visa" -> "Visa". */
export function formatBrand(brand: string | null | undefined): string {
  if (!brand) return 'Card';
  return (
    BRAND_LABELS[brand.toLowerCase()] ??
    brand.charAt(0).toUpperCase() + brand.slice(1)
  );
}

/** "08/27" from (8, 2027); null when either part is missing. */
export function formatExpiry(
  month: number | null | undefined,
  year: number | null | undefined
): string | null {
  if (!month || !year) return null;
  return `${String(month).padStart(2, '0')}/${String(year).slice(-2)}`;
}
