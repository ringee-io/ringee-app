import { DEFAULT_LOCALE, type SupportedLocale } from './config';

/**
 * Frontend-only formatting helpers. Server code already has its own
 * formatters; these are for components that need a locale-aware string
 * outside the `useFormatter()` hook (utilities, table cell renderers, etc).
 *
 * All helpers tolerate `null`/`undefined` and return an empty string so
 * they're safe to drop into JSX without guards.
 */

type DateInput = Date | string | number | null | undefined;
type NumberInput = number | null | undefined;

function toDate(value: DateInput): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(
  value: DateInput,
  locale: SupportedLocale = DEFAULT_LOCALE,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }
): string {
  const d = toDate(value);
  if (!d) return '';
  return new Intl.DateTimeFormat(locale, options).format(d);
}

export function formatDateTime(
  value: DateInput,
  locale: SupportedLocale = DEFAULT_LOCALE,
  options: Intl.DateTimeFormatOptions = {
    dateStyle: 'medium',
    timeStyle: 'short'
  }
): string {
  const d = toDate(value);
  if (!d) return '';
  return new Intl.DateTimeFormat(locale, options).format(d);
}

const RELATIVE_UNITS: { unit: Intl.RelativeTimeFormatUnit; ms: number }[] = [
  { unit: 'year', ms: 365 * 24 * 60 * 60 * 1000 },
  { unit: 'month', ms: 30 * 24 * 60 * 60 * 1000 },
  { unit: 'week', ms: 7 * 24 * 60 * 60 * 1000 },
  { unit: 'day', ms: 24 * 60 * 60 * 1000 },
  { unit: 'hour', ms: 60 * 60 * 1000 },
  { unit: 'minute', ms: 60 * 1000 },
  { unit: 'second', ms: 1000 }
];

export function formatRelativeTime(
  value: DateInput,
  locale: SupportedLocale = DEFAULT_LOCALE,
  now: Date = new Date()
): string {
  const d = toDate(value);
  if (!d) return '';
  const diff = d.getTime() - now.getTime();
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  for (const { unit, ms } of RELATIVE_UNITS) {
    if (Math.abs(diff) >= ms || unit === 'second') {
      return rtf.format(Math.round(diff / ms), unit);
    }
  }
  return rtf.format(0, 'second');
}

export function formatNumber(
  value: NumberInput,
  locale: SupportedLocale = DEFAULT_LOCALE,
  options: Intl.NumberFormatOptions = {}
): string {
  if (value == null || Number.isNaN(value)) return '';
  return new Intl.NumberFormat(locale, options).format(value);
}

export function formatCurrency(
  value: NumberInput,
  currency: string = 'USD',
  locale: SupportedLocale = DEFAULT_LOCALE,
  options: Intl.NumberFormatOptions = {}
): string {
  if (value == null || Number.isNaN(value)) return '';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    ...options
  }).format(value);
}

export function formatPercent(
  value: NumberInput,
  locale: SupportedLocale = DEFAULT_LOCALE,
  options: Intl.NumberFormatOptions = { maximumFractionDigits: 1 }
): string {
  if (value == null || Number.isNaN(value)) return '';
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    ...options
  }).format(value);
}
