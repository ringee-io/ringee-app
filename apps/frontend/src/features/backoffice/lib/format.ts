export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function formatNumber(n: number): string {
  return n.toLocaleString();
}

export function formatMoney(n: number): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/** Cost-per-unit figures are often fractions of a cent — keep 4 decimals. */
export function formatMoneyPrecise(n: number): string {
  if (!n) return '0.0000';
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4
  });
}

/** Values arrive from the API already scaled 0-100. */
export function formatPercent(n: number): string {
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
}

export function formatDuration(totalSeconds: number): string {
  if (!totalSeconds) return '0s';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString();
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}
