'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type {
  DashboardFilters,
  DashboardRangeKey,
  DashboardScope
} from './types';

interface DashboardFiltersContextValue {
  filters: DashboardFilters;
  setRange: (
    range: DashboardRangeKey,
    custom?: { from: string; to: string }
  ) => void;
  setScope: (scope: DashboardScope) => void;
  setMemberId: (id: string | null) => void;
  setCampaignId: (id: string | null) => void;
  setOutcome: (outcome: string | null) => void;
  /**
   * Build query string suitable for /dashboard/* endpoints.
   */
  toQuery: () => Record<string, string>;
}

const DashboardFiltersContext =
  React.createContext<DashboardFiltersContextValue | null>(null);

const SCOPE_VALUES: DashboardScope[] = ['personal', 'organization'];
const RANGE_VALUES: DashboardRangeKey[] = [
  'today',
  'yesterday',
  '7d',
  '30d',
  'this_month',
  'last_month',
  'custom'
];

export function DashboardFiltersProvider({
  children,
  defaultScope
}: {
  children: React.ReactNode;
  defaultScope: DashboardScope;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const filters = React.useMemo<DashboardFilters>(() => {
    const rangeParam = searchParams.get('range') as DashboardRangeKey | null;
    const scopeParam = searchParams.get('scope') as DashboardScope | null;
    return {
      range:
        rangeParam && RANGE_VALUES.includes(rangeParam) ? rangeParam : '30d',
      from: searchParams.get('from') ?? undefined,
      to: searchParams.get('to') ?? undefined,
      scope:
        scopeParam && SCOPE_VALUES.includes(scopeParam)
          ? scopeParam
          : defaultScope,
      memberId: searchParams.get('memberId'),
      campaignId: searchParams.get('campaignId'),
      outcome: searchParams.get('outcome')
    };
  }, [searchParams, defaultScope]);

  const update = React.useCallback(
    (changes: Record<string, string | null | undefined>) => {
      const url = new URL(window.location.href);
      for (const [k, v] of Object.entries(changes)) {
        if (v === null || v === undefined || v === '')
          url.searchParams.delete(k);
        else url.searchParams.set(k, v);
      }
      router.replace(url.pathname + url.search, { scroll: false });
    },
    [router]
  );

  const value: DashboardFiltersContextValue = {
    filters,
    setRange: (range, custom) =>
      update({
        range,
        from: range === 'custom' ? custom?.from : null,
        to: range === 'custom' ? custom?.to : null
      }),
    setScope: (scope) => update({ scope }),
    setMemberId: (memberId) => update({ memberId }),
    setCampaignId: (campaignId) => update({ campaignId }),
    setOutcome: (outcome) => update({ outcome }),
    toQuery: () => {
      const q: Record<string, string> = {};
      if (filters.range === 'custom' && filters.from && filters.to) {
        q.from = filters.from;
        q.to = filters.to;
      } else {
        q.range = filters.range;
      }
      if (filters.scope) q.scope = filters.scope;
      if (filters.memberId) q.memberId = filters.memberId;
      if (filters.campaignId) q.campaignId = filters.campaignId;
      if (filters.outcome) q.outcome = filters.outcome;
      return q;
    }
  };

  return (
    <DashboardFiltersContext.Provider value={value}>
      {children}
    </DashboardFiltersContext.Provider>
  );
}

export function useDashboardFilters() {
  const ctx = React.useContext(DashboardFiltersContext);
  if (!ctx)
    throw new Error(
      'useDashboardFilters must be used inside DashboardFiltersProvider'
    );
  return ctx;
}
