'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useAuth } from '@clerk/nextjs';
import { useOrgRole } from '@ringee/frontend-shared/hooks/use-org-role';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { IconLoader2, IconChartHistogram } from '@tabler/icons-react';
import { contentVariants } from '../../lib/motion';
import { buildHealth } from '../../lib/usage-health';
import { buildJourney } from '../../lib/journey';
import { useInfraApi } from '../../api';
import { useInfraStore } from '../../store/infra.store';
import type {
  InfraEdge,
  InfraNode,
  InfraJourneySignals,
  InfraUsage as InfraUsageData
} from '../../types';
import { UsageFilters, type UsageFilterState } from './usage-filters';
import { UsageSidebar, UsageSectionTabs } from './usage-sidebar';
import {
  DEFAULT_USAGE_SECTION,
  sectionUsesFilters,
  type UsageSection
} from './usage-sections';
import { UsageOverviewSection } from './sections/usage-overview-section';
import { UsageJourneySection } from './sections/usage-journey-section';
import { UsagePerformanceSection } from './sections/usage-performance-section';
import { UsageHealthSection } from './sections/usage-health-section';
import { UsageCostSection } from './sections/usage-cost-section';
import { UsageByResourceSection } from './sections/usage-resource-section';

const DEFAULT_FILTERS: UsageFilterState = {
  range: '30d',
  campaignId: null,
  numberId: null,
  sipDeviceId: null,
  memberId: null
};

/**
 * Usage — a segmented analytics workspace. One data fetch (overview + usage)
 * feeds five focused views selected from a secondary sidebar; filters persist
 * across the range/resource-driven views and step aside where they don't apply.
 */
export function InfraUsage() {
  const api = useInfraApi();
  const reduce = useReducedMotion();
  const { hasOrg } = useOrgRole();
  const { orgId, isLoaded: authLoaded } = useAuth();
  const contextSwitching = useInfraStore((s) => s.contextSwitching);
  const setContextSwitching = useInfraStore((s) => s.setContextSwitching);

  const [section, setSection] = useState<UsageSection>(DEFAULT_USAGE_SECTION);
  const [nodes, setNodes] = useState<InfraNode[]>([]);
  const [edges, setEdges] = useState<InfraEdge[]>([]);
  const [usage, setUsage] = useState<InfraUsageData | null>(null);
  const [signals, setSignals] = useState<InfraJourneySignals | null>(null);
  const [filters, setFilters] = useState<UsageFilterState>(DEFAULT_FILTERS);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingUsage, setLoadingUsage] = useState(true);
  const [loadingJourney, setLoadingJourney] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Overview (filter options + operational health) + Journey signals, both
  //    reload on workspace switch. Journey signals use a fixed 30-day window, so
  //    they're fetched here (not on filter change).
  useEffect(() => {
    if (!authLoaded) return;
    let cancelled = false;
    setLoadingOverview(true);
    setLoadingJourney(true);
    setSignals(null);
    setFilters(DEFAULT_FILTERS);
    api
      .getOverview()
      .then((data) => {
        if (cancelled) return;
        setNodes(data.nodes);
        setEdges(data.edges);
      })
      .catch(() => !cancelled && setError('Could not load your workspace.'))
      .finally(() => {
        if (cancelled) return;
        setLoadingOverview(false);
        setContextSwitching(false);
      });
    api
      .getJourney()
      .then((data) => !cancelled && setSignals(data))
      // A Journey signal failure is non-fatal — the other views still work.
      .catch(() => undefined)
      .finally(() => !cancelled && setLoadingJourney(false));
    return () => {
      cancelled = true;
    };
  }, [authLoaded, orgId, api, setContextSwitching]);

  // ── Usage metrics, reload on workspace switch + any filter change
  const loadUsage = useCallback(() => {
    if (!authLoaded) return () => undefined;
    let cancelled = false;
    setLoadingUsage(true);
    api
      .getUsage({
        range: filters.range,
        campaignId: filters.campaignId,
        numberId: filters.numberId,
        sipDeviceId: filters.sipDeviceId,
        memberId: filters.memberId
      })
      .then((data) => !cancelled && setUsage(data))
      .catch(() => !cancelled && setError('Could not load usage.'))
      .finally(() => !cancelled && setLoadingUsage(false));
    return () => {
      cancelled = true;
    };
  }, [authLoaded, orgId, api, filters]);

  useEffect(() => loadUsage(), [loadUsage]);

  // Health is derived (no extra fetch) from the overview nodes+edges, so it
  // always agrees with the canvas. Computed here so the shell can also show the
  // readiness legend in the toolbar on the health view.
  const health = useMemo(
    () => buildHealth(nodes, edges, hasOrg),
    [nodes, edges, hasOrg]
  );

  // Journey is derived from the overview nodes/edges + the 30-day signals, so it
  // stands on its own (no `usage` payload, no filters) and can render on a
  // brand-new, empty workspace with its "Not enough activity yet" framing.
  const journey = useMemo(
    () => (signals ? buildJourney({ nodes, edges, signals, hasOrg }) : null),
    [signals, nodes, edges, hasOrg]
  );

  // Full loader until the first usage payload lands; later filter reloads dim
  // the content instead (see loadingUsage below), so there's no blank flash.
  const busy =
    contextSwitching || (!usage && (loadingOverview || loadingUsage));
  const journeyBusy = contextSwitching || loadingOverview || loadingJourney;
  const empty = !busy && !error && nodes.length === 0;
  const showFilters = sectionUsesFilters(section);
  // The health view ignores filters, so its content never dims on reload.
  const dim = loadingUsage && showFilters;

  const renderSection = (data: InfraUsageData) => {
    switch (section) {
      case 'overview':
        return (
          <UsageOverviewSection
            usage={data}
            hasOrg={hasOrg}
            health={health}
            journey={journey}
            onNavigate={setSection}
          />
        );
      case 'performance':
        return <UsagePerformanceSection usage={data} hasOrg={hasOrg} />;
      case 'health':
        return <UsageHealthSection health={health} />;
      case 'cost':
        return <UsageCostSection usage={data} hasOrg={hasOrg} />;
      case 'resource':
        return (
          <UsageByResourceSection usage={data} hasOrg={hasOrg} nodes={nodes} />
        );
    }
  };

  return (
    <div className='flex h-full w-full'>
      <UsageSidebar active={section} onSelect={setSection} />

      <div className='relative flex min-w-0 flex-1 flex-col'>
        <div className='relative min-h-0 flex-1 overflow-y-auto'>
          {/* Toolbar — the mobile section nav plus the filters. On views that
              ignore filters (health), it collapses away on desktop and keeps
              only the mobile nav; the readiness legend lives in the header. */}
          <div
            className={cn(
              'bg-background/80 sticky top-0 z-10 backdrop-blur-xl',
              showFilters ? 'border-b' : 'border-b md:border-b-0'
            )}
          >
            <div className='px-4 py-3 sm:px-6 md:hidden'>
              <UsageSectionTabs active={section} onSelect={setSection} />
            </div>
            {showFilters ? (
              <div className='px-4 pb-2.5 sm:px-6 md:py-2.5'>
                <UsageFilters
                  nodes={nodes}
                  hasOrg={hasOrg}
                  filters={filters}
                  onChange={setFilters}
                />
              </div>
            ) : null}
          </div>

          {error ? (
            <div className='flex h-64 items-center justify-center'>
              <p className='text-destructive text-sm'>{error}</p>
            </div>
          ) : section === 'journey' ? (
            journeyBusy ? (
              <div className='flex h-64 items-center justify-center'>
                <div className='bg-card/90 flex items-center gap-2.5 rounded-full border px-4 py-2 shadow-lg ring-1 ring-white/5'>
                  <IconLoader2 className='text-primary size-4 animate-spin' />
                  <p className='text-sm font-medium'>
                    {contextSwitching
                      ? 'Switching workspace…'
                      : 'Reading your journey…'}
                  </p>
                </div>
              </div>
            ) : !journey ? (
              <div className='flex h-64 items-center justify-center'>
                <p className='text-destructive text-sm'>
                  Could not load your journey.
                </p>
              </div>
            ) : (
              <div className='mx-auto max-w-[1180px] px-4 py-6 sm:px-6'>
                <AnimatePresence mode='wait'>
                  <motion.div
                    key='journey'
                    variants={reduce ? undefined : contentVariants}
                    initial={reduce ? false : 'hidden'}
                    animate='visible'
                    exit={reduce ? undefined : 'exit'}
                  >
                    <UsageJourneySection
                      journey={journey}
                      onNavigate={setSection}
                    />
                  </motion.div>
                </AnimatePresence>
              </div>
            )
          ) : busy ? (
            <div className='flex h-64 items-center justify-center'>
              <div className='bg-card/90 flex items-center gap-2.5 rounded-full border px-4 py-2 shadow-lg ring-1 ring-white/5'>
                <IconLoader2 className='text-primary size-4 animate-spin' />
                <p className='text-sm font-medium'>
                  {contextSwitching ? 'Switching workspace…' : 'Loading usage…'}
                </p>
              </div>
            </div>
          ) : empty ? (
            <div className='flex h-64 flex-col items-center justify-center gap-2 text-center'>
              <span className='bg-muted/60 text-muted-foreground flex size-12 items-center justify-center rounded-2xl'>
                <IconChartHistogram className='size-6' />
              </span>
              <p className='text-sm font-medium'>Nothing to measure yet</p>
              <p className='text-muted-foreground max-w-xs text-xs'>
                Add numbers, campaigns or devices in Architecture and start
                calling — usage will show up here.
              </p>
            </div>
          ) : usage ? (
            <div className='mx-auto max-w-[1180px] px-4 py-6 sm:px-6'>
              <AnimatePresence mode='wait'>
                <motion.div
                  key={section}
                  variants={reduce ? undefined : contentVariants}
                  initial={reduce ? false : 'hidden'}
                  animate='visible'
                  exit={reduce ? undefined : 'exit'}
                  className={
                    dim
                      ? 'pointer-events-none opacity-60 transition-opacity'
                      : 'transition-opacity'
                  }
                >
                  {renderSection(usage)}
                </motion.div>
              </AnimatePresence>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
