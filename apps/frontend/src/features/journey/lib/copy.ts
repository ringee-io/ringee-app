'use client';

import { useTranslations } from 'next-intl';
import { useCallback } from 'react';

/**
 * Journey copy lookup for ids the backend owns.
 *
 * Stage ids, requirement ids, action keys and capability ids all come from the
 * server-side program definition, which can publish a new version before this
 * app ships new strings. `t.has()` guards every dynamic lookup so an unknown id
 * renders a readable fallback instead of a raw message path — a new stage
 * appearing in the API must never make the page look broken.
 */
export function useJourneyCopy() {
  const t = useTranslations('journey');

  /** Translates a dynamic key, falling back to a humanised version of the id. */
  const dynamic = useCallback(
    (key: string, id: string) =>
      t.has(key as never) ? t(key as never) : humanise(id),
    [t]
  );

  return { t, dynamic };
}

/** `campaign_calls` → `Campaign calls`. Last-resort label for an unknown id. */
function humanise(id: string): string {
  const spaced = id.replace(/[_-]+/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
