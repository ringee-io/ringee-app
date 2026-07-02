'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useAuth } from '@clerk/nextjs';
import { useOrgRole } from '@ringee/frontend-shared/hooks/use-org-role';
import { IconLoader2, IconChartHistogram } from '@tabler/icons-react';
import { useInfraApi } from '../../api';
import { useInfraStore } from '../../store/infra.store';
import type {
  InfraEdge,
  InfraNode,
  InfraUsage as InfraUsageData
} from '../../types';
import { UsageFilters, type UsageFilterState } from './usage-filters';
import { UsageOverviewCards } from './usage-overview-cards';
import { UsagePerformance } from './usage-performance';
import { UsageHealth } from './usage-health';
import { UsageCost } from './usage-cost';
import { UsageByResource } from './usage-by-resource';

const DEFAULT_FILTERS: UsageFilterState = {
  range: '30d',
  campaignId: null,
  numberId: null,
  sipDeviceId: null,
  memberId: null
};

export function InfraUsage() {
  const api = useInfraApi();
  const reduce = useReducedMotion();
  const { hasOrg } = useOrgRole();
  const { orgId, isLoaded: authLoaded } = useAuth();
  const contextSwitching = useInfraStore((s) => s.contextSwitching);
  const setContextSwitching = useInfraStore((s) => s.setContextSwitching);

  const [nodes, setNodes] = useState<InfraNode[]>([]);
  const [edges, setEdges] = useState<InfraEdge[]>([]);
  const [usage, setUsage] = useState<InfraUsageData | null>(null);
  const [filters, setFilters] = useState<UsageFilterState>(DEFAULT_FILTERS);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingUsage, setLoadingUsage] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Overview (filter options + operational health), reloads on workspace switch
  useEffect(() => {
    if (!authLoaded) return;
    let cancelled = false;
    setLoadingOverview(true);
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

  // Full loader until the first usage payload lands; later filter reloads dim
  // the content instead (see loadingUsage below), so there's no blank flash.
  const busy =
    contextSwitching || (!usage && (loadingOverview || loadingUsage));
  const empty = !busy && !error && nodes.length === 0;

  return (
    <div className='relative h-full w-full overflow-y-auto'>
      <div className='bg-background/80 sticky top-0 z-10 border-b px-4 py-2.5 backdrop-blur-xl sm:px-6'>
        <UsageFilters
          nodes={nodes}
          hasOrg={hasOrg}
          filters={filters}
          onChange={setFilters}
        />
      </div>

      {error ? (
        <div className='flex h-64 items-center justify-center'>
          <p className='text-destructive text-sm'>{error}</p>
        </div>
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
            Add numbers, campaigns or devices in Architecture and start calling
            — usage will show up here.
          </p>
        </div>
      ) : usage ? (
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className='mx-auto max-w-[1200px] space-y-6 px-4 py-5 sm:px-6'
        >
          {/* A subtle refresh shimmer while a filter change is in flight. */}
          <div
            className={
              loadingUsage
                ? 'pointer-events-none opacity-60 transition-opacity'
                : 'transition-opacity'
            }
          >
            <UsageOverviewCards usage={usage} hasOrg={hasOrg} />
          </div>
          <UsagePerformance usage={usage} hasOrg={hasOrg} />
          <UsageHealth nodes={nodes} edges={edges} hasOrg={hasOrg} />
          <div className={loadingUsage ? 'pointer-events-none opacity-60' : ''}>
            <UsageCost usage={usage} />
          </div>
          <div className={loadingUsage ? 'pointer-events-none opacity-60' : ''}>
            <UsageByResource usage={usage} hasOrg={hasOrg} />
          </div>
        </motion.div>
      ) : null}
    </div>
  );
}
