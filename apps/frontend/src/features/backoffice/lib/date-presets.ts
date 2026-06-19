export type DateRange = { start: Date; end: Date };

export type PresetKey =
  | 'today'
  | 'yesterday'
  | '7d'
  | '14d'
  | '30d'
  | '90d'
  | 'custom';

export const PRESETS: { key: PresetKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7d', label: 'Last 7 days' },
  { key: '14d', label: 'Last 14 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: '90d', label: 'Last 90 days' },
  { key: 'custom', label: 'Custom' }
];

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/** Resolve a quick preset to an absolute, inclusive date range. */
export function rangeForPreset(key: Exclude<PresetKey, 'custom'>): DateRange {
  const now = new Date();
  const end = endOfDay(now);

  switch (key) {
    case 'today':
      return { start: startOfDay(now), end };
    case 'yesterday': {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return { start: startOfDay(y), end: endOfDay(y) };
    }
    case '7d':
      return { start: startOfDay(daysAgo(now, 6)), end };
    case '14d':
      return { start: startOfDay(daysAgo(now, 13)), end };
    case '30d':
      return { start: startOfDay(daysAgo(now, 29)), end };
    case '90d':
      return { start: startOfDay(daysAgo(now, 89)), end };
  }
}

function daysAgo(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() - n);
  return x;
}

/** yyyy-mm-dd for <input type="date"> values. */
export function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromDateInputValue(value: string, endOfDayFlag = false): Date {
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  return endOfDayFlag ? endOfDay(date) : startOfDay(date);
}
