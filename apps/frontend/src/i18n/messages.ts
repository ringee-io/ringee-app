import { DEFAULT_LOCALE, getLocaleChain, type SupportedLocale } from './config';

type MessageNode = string | { [key: string]: MessageNode };
export type Messages = Record<string, MessageNode>;

/**
 * Deep-merges `override` over `base`. Strings in `override` win; objects
 * recurse. Used to compose a regional locale (e.g. `en-GB`) on top of its
 * base locale (`en`) without forcing every key to be re-translated.
 */
function deepMerge(base: Messages, override: Messages): Messages {
  const out: Messages = { ...base };
  for (const key of Object.keys(override)) {
    const ov = override[key];
    const bs = base[key];
    if (
      ov &&
      typeof ov === 'object' &&
      !Array.isArray(ov) &&
      bs &&
      typeof bs === 'object' &&
      !Array.isArray(bs)
    ) {
      out[key] = deepMerge(bs as Messages, ov as Messages);
    } else if (ov !== undefined) {
      out[key] = ov;
    }
  }
  return out;
}

const NAMESPACES = [
  'common',
  'navigation',
  'auth',
  'marketing',
  'dashboard',
  'ai',
  'calls',
  'dialer',
  'contacts',
  'organizations',
  'team',
  'campaigns',
  'inbox',
  'activities',
  'meetings',
  'calendar',
  'crm',
  'integrations',
  'billing',
  'settings',
  'numberRotation',
  'onboarding',
  'productTour',
  'forms',
  'tables',
  'filters',
  'errors',
  'emptyStates',
  'toasts',
  'modals',
  'transcription',
  'voicemail',
  'aiVoiceAgents'
] as const;

export type Namespace = (typeof NAMESPACES)[number];

async function loadNamespace(
  locale: SupportedLocale,
  ns: Namespace
): Promise<Messages | null> {
  try {
    const mod = await import(`./locales/${locale}/${ns}.json`);
    return mod.default as Messages;
  } catch {
    return null;
  }
}

/**
 * Loads all namespaces for a locale, walking the fallback chain so that
 * regional overrides + base + English combine into a single message tree.
 * In development, missing keys at the leaf are visible because the resolver
 * leaves them undefined and `next-intl` will surface them.
 */
export async function loadMessages(locale: SupportedLocale): Promise<Messages> {
  const chain = getLocaleChain(locale);
  // English is always the ultimate fallback so `chain` already ends in `en`
  // for every supported locale (including `en` itself).
  const reverseChain = [...chain].reverse(); // [en, base, regional]
  const merged: Messages = {};

  for (const link of reverseChain) {
    const nsResults = await Promise.all(
      NAMESPACES.map(async (ns) => [ns, await loadNamespace(link, ns)] as const)
    );
    for (const [ns, msgs] of nsResults) {
      if (!msgs) continue;
      const existing = (merged[ns] as Messages | undefined) ?? {};
      merged[ns] = deepMerge(existing, msgs);
    }
  }

  return merged;
}

export const ALL_NAMESPACES = NAMESPACES;
export const FALLBACK_LOCALE = DEFAULT_LOCALE;
