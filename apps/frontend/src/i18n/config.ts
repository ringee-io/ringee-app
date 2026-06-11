/**
 * Locale configuration for the Ringee frontend.
 * Source language is `en`. Regional variants override only the keys that
 * differ; everything else falls back through the chain to `en`.
 */

export const SUPPORTED_LOCALES = [
  'en',
  'en-GB',
  'es',
  'es-MX',
  'fr',
  'fr-BE',
  'pt',
  'de',
  'it',
  'nl'
] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export type Locale = SupportedLocale | string;

export const DEFAULT_LOCALE: SupportedLocale = 'en';

export const LOCALE_LABELS: Record<SupportedLocale, string> = {
  en: 'English',
  'en-GB': 'English (UK)',
  es: 'Español',
  'es-MX': 'Español (MX)',
  fr: 'Français',
  'fr-BE': 'Français (BE)',
  pt: 'Português',
  de: 'Deutsch',
  it: 'Italiano',
  nl: 'Nederlands'
};

export const LOCALE_FLAGS: Record<SupportedLocale, string> = {
  en: '🇺🇸',
  'en-GB': '🇬🇧',
  es: '🇪🇸',
  'es-MX': '🇲🇽',
  fr: '🇫🇷',
  'fr-BE': '🇧🇪',
  pt: '🇵🇹',
  de: '🇩🇪',
  it: '🇮🇹',
  nl: '🇳🇱'
};

/**
 * Regional variants fall back to their base locale; base locales fall back
 * to English. The chain is consumed by the message loader so missing keys
 * resolve correctly without duplicating every string in regional files.
 */
const FALLBACK_MAP: Partial<Record<SupportedLocale, SupportedLocale>> = {
  'en-GB': 'en',
  'es-MX': 'es',
  'fr-BE': 'fr'
};

export const COOKIE_NAME = 'ringee_locale';

export function isSupportedLocale(locale: unknown): locale is SupportedLocale {
  return (
    typeof locale === 'string' &&
    (SUPPORTED_LOCALES as readonly string[]).includes(locale)
  );
}

/**
 * Normalize an arbitrary locale string (e.g. from `navigator.language`,
 * `Accept-Language`, or a Clerk profile field) into a `SupportedLocale`.
 * Tries exact match, then base-language match, then falls back to English.
 */
export function normalizeLocale(
  input: string | null | undefined
): SupportedLocale {
  if (!input) return DEFAULT_LOCALE;

  const candidate = input.replace('_', '-');
  if (isSupportedLocale(candidate)) return candidate;

  const exact = SUPPORTED_LOCALES.find(
    (l) => l.toLowerCase() === candidate.toLowerCase()
  );
  if (exact) return exact;

  const base = candidate.split('-')[0]?.toLowerCase();
  if (base && isSupportedLocale(base)) return base;

  return DEFAULT_LOCALE;
}

export function getLocaleLabel(locale: SupportedLocale): string {
  return LOCALE_LABELS[locale] ?? LOCALE_LABELS[DEFAULT_LOCALE];
}

export function getLocaleFlag(locale: SupportedLocale): string {
  return LOCALE_FLAGS[locale] ?? LOCALE_FLAGS[DEFAULT_LOCALE];
}

/**
 * Returns the next locale in the fallback chain, or `null` if `locale`
 * is the root of the chain.
 */
export function getLocaleFallback(
  locale: SupportedLocale
): SupportedLocale | null {
  if (locale === DEFAULT_LOCALE) return null;
  return FALLBACK_MAP[locale] ?? DEFAULT_LOCALE;
}

/** All current locales are LTR. RTL is intentionally out of scope for now. */
export function getLocaleDirection(_locale: SupportedLocale): 'ltr' | 'rtl' {
  return 'ltr';
}

/**
 * Returns the chain of locales to consult for a given locale, from most
 * specific to least specific. e.g. `en-GB -> ['en-GB', 'en']`.
 */
export function getLocaleChain(locale: SupportedLocale): SupportedLocale[] {
  const chain: SupportedLocale[] = [locale];
  let current: SupportedLocale | null = locale;
  while ((current = getLocaleFallback(current))) {
    chain.push(current);
  }
  return chain;
}
