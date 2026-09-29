import { ES_MARKETING_ROUTES } from './content/es/routes';
import { SITE_URL } from './site';

export type MarketingLocale = 'en' | 'es';

/** Only published Spanish content may acquire the /es prefix. */
export const SPANISH_MARKETING_PATHS = new Set<string>(
  Object.keys(ES_MARKETING_ROUTES)
);

export function marketingLocaleFromPath(path: string): MarketingLocale {
  return path === '/es' || path.startsWith('/es/') ? 'es' : 'en';
}

export function localizedHref(href: string, locale: MarketingLocale): string {
  if (!href.startsWith('/') || href.startsWith('//')) return href;
  const [, path, suffix] = href.match(/^([^?#]*)(.*)$/)!;
  const enPath = path.startsWith('/es/') ? path.slice(3) : path;
  return `${locale === 'es' && SPANISH_MARKETING_PATHS.has(enPath) ? '/es' : ''}${enPath}${suffix}`;
}

export function languageAlternates(enPath: string) {
  if (!SPANISH_MARKETING_PATHS.has(enPath)) return undefined;
  return {
    en: `${SITE_URL}${enPath}`,
    es: `${SITE_URL}/es${enPath}`,
    'x-default': `${SITE_URL}${enPath}`
  };
}
