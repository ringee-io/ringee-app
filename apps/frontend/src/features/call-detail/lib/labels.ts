'use client';

import { useTranslations } from 'next-intl';
import { humanize } from './format';

/**
 * Enum → label, translated, with the enum value itself as the last resort.
 *
 * Prisma enums are additive contracts: a new outcome or a new call source can
 * reach this screen from a backend deploy before its translation exists. `t`
 * would render the raw key path for that ("calls.detail.outcomes.x"), which is
 * worse than the value — so every lookup checks `t.has` first and humanizes
 * what it does not know.
 */
export function useEnumLabels() {
  const t = useTranslations('calls.detail');

  const lookup = (group: string, value: string | null | undefined) => {
    if (!value) return null;
    const key = `${group}.${value}`;
    return t.has(key) ? t(key) : humanize(value);
  };

  return {
    /** How the call was placed. A null source predates the column: web dialer. */
    source: (value: string | null | undefined) =>
      lookup('sources', value ?? 'web') ?? t('sources.web'),
    outcome: (value: string | null | undefined) => lookup('outcomes', value),
    agentOutcome: (value: string | null | undefined) =>
      lookup('agentOutcomes', value),
    sentiment: (value: string | null | undefined) => lookup('sentiments', value)
  };
}
