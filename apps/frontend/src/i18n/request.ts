import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import {
  COOKIE_NAME,
  DEFAULT_LOCALE,
  isSupportedLocale,
  normalizeLocale
} from './config';
import { loadMessages } from './messages';

/**
 * Resolves the locale for a server-rendered request.
 * Priority: cookie → Accept-Language header → English fallback.
 *
 * The `next-intl` plugin wires this into every server component so SSR
 * markup is rendered in the user's language and avoids hydration flicker.
 */
export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(COOKIE_NAME)?.value;

  let locale = DEFAULT_LOCALE;

  if (fromCookie && isSupportedLocale(fromCookie)) {
    locale = fromCookie;
  } else {
    const headerStore = await headers();
    const acceptLanguage = headerStore.get('accept-language');
    if (acceptLanguage) {
      const preferred = acceptLanguage.split(',')[0]?.trim().split(';')[0];
      locale = normalizeLocale(preferred);
    }
  }

  return {
    locale,
    messages: await loadMessages(locale),
    now: new Date(),
    timeZone: 'UTC',
    onError(error) {
      // In dev, surface missing keys clearly. In prod, fall back silently.
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.warn('[i18n]', error.message);
      }
    },
    getMessageFallback({ namespace, key }) {
      if (process.env.NODE_ENV !== 'production') {
        return `⟦${namespace ? namespace + '.' : ''}${key}⟧`;
      }
      // Production: render the key path so layout never breaks.
      return `${namespace ? namespace + '.' : ''}${key}`;
    }
  };
});
