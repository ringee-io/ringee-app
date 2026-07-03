'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  IconStack2,
  IconSpeakerphone,
  IconPhone,
  IconDeviceLandlinePhone,
  IconUser,
  type IconProps
} from '@tabler/icons-react';
import type { ComponentType } from 'react';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { contentVariants } from '../../../lib/motion';
import { TONE_DOT, prettyStatus, statusTone } from '../../../lib/node-config';
import type {
  InfraNode,
  InfraUsage,
  InfraUsageResourceRow,
  InfrastructureResourceType
} from '../../../types';
import {
  EmptyHint,
  Panel,
  SectionIntro,
  SegmentedTabs,
  formatMoney
} from '../usage-primitives';

type ResTab = 'number' | 'campaign' | 'device' | 'member';

interface TabConfig {
  id: ResTab;
  label: string;
  nodeType: InfrastructureResourceType;
  rowIcon: ComponentType<IconProps>;
  barClass: string;
  rows: InfraUsageResourceRow[];
  empty: string;
  showSpend: boolean;
}

/** A single resource line — name + live status, a calls bar, and the metrics. */
function ResourceRow({
  row,
  max,
  icon: Icon,
  barClass,
  currency,
  status,
  showSpend
}: {
  row: InfraUsageResourceRow;
  max: number;
  icon: ComponentType<IconProps>;
  barClass: string;
  currency: string;
  status?: string;
  showSpend: boolean;
}) {
  const pct =
    max > 0 ? Math.max((row.calls / max) * 100, row.calls > 0 ? 4 : 0) : 0;
  return (
    <div className='hover:bg-accent/30 flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors'>
      <span className='bg-muted/50 text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-lg'>
        <Icon className='size-4' />
      </span>
      <div className='min-w-0 flex-1'>
        <div className='flex items-center gap-2'>
          <span className='truncate text-sm font-medium' title={row.name}>
            {row.name}
          </span>
          {status ? (
            <span className='text-muted-foreground flex shrink-0 items-center gap-1.5 text-[11px]'>
              <span
                className={cn(
                  'size-1.5 rounded-full',
                  TONE_DOT[statusTone(status)]
                )}
              />
              {prettyStatus(status)}
            </span>
          ) : null}
        </div>
        <div className='bg-muted/70 mt-1.5 h-1.5 w-full overflow-hidden rounded-full'>
          <div
            className={cn('h-full rounded-full', barClass)}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <div className='shrink-0 text-right'>
        <p className='text-sm font-semibold tabular-nums'>
          {row.calls.toLocaleString()}{' '}
          <span className='text-muted-foreground text-[11px] font-normal'>
            calls
          </span>
        </p>
        <p className='text-muted-foreground text-[11px] tabular-nums'>
          {row.minutes.toLocaleString()}m
          {showSpend ? ` · ${formatMoney(row.cost, currency)}` : ''}
        </p>
      </div>
    </div>
  );
}

/**
 * By resource — a second layer of segmentation so each resource kind gets its
 * own focused surface (phone numbers, campaigns, SIP devices, agents) instead
 * of four breakdowns competing on one screen. Rows join live node status so the
 * table doubles as a registration/activity read.
 */
export function UsageByResourceSection({
  usage,
  hasOrg,
  nodes
}: {
  usage: InfraUsage;
  hasOrg: boolean;
  nodes: InfraNode[];
}) {
  const reduce = useReducedMotion();
  const [tab, setTab] = useState<ResTab>('number');
  const b = usage.byResource;

  // referenceId → status, per resource kind, so a row can show its live state.
  const statusByRef = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of nodes) if (n.referenceId) m.set(n.referenceId, n.status);
    return m;
  }, [nodes]);

  const tabs: TabConfig[] = [
    {
      id: 'number',
      label: 'Phone numbers',
      nodeType: 'PHONE_NUMBER',
      rowIcon: IconPhone,
      barClass: 'bg-emerald-500',
      rows: b.byNumber,
      empty: 'No number activity in this range.',
      showSpend: true
    },
    {
      id: 'campaign',
      label: 'Campaigns',
      nodeType: 'CAMPAIGN',
      rowIcon: IconSpeakerphone,
      barClass: 'bg-amber-500',
      rows: b.byCampaign,
      empty: 'No campaign activity in this range.',
      showSpend: true
    },
    {
      id: 'device',
      label: 'SIP devices',
      nodeType: 'SIP_DEVICE',
      rowIcon: IconDeviceLandlinePhone,
      barClass: 'bg-violet-500',
      rows: b.byDevice,
      empty: 'No device activity in this range.',
      showSpend: false
    },
    ...(hasOrg
      ? [
          {
            id: 'member' as const,
            label: 'Agents',
            nodeType: 'TEAM_MEMBER' as InfrastructureResourceType,
            rowIcon: IconUser,
            barClass: 'bg-sky-500',
            rows: b.byMember,
            empty: 'No agent activity in this range.',
            showSpend: true
          }
        ]
      : [])
  ];

  // Personal → org demotion could strand the active tab on "member"; keep it valid.
  const activeTab = tabs.find((t) => t.id === tab) ?? tabs[0];
  const sorted = [...activeTab.rows]
    .sort((a, c) => c.calls - a.calls)
    .slice(0, 12);
  const max = Math.max(1, ...sorted.map((r) => r.calls));

  return (
    <div className='space-y-6'>
      <SectionIntro
        title='By resource'
        description='Explore usage one resource kind at a time'
        icon={IconStack2}
      />

      <SegmentedTabs
        items={tabs.map((t) => ({
          id: t.id,
          label: t.label,
          icon: t.rowIcon
        }))}
        active={activeTab.id}
        onSelect={setTab}
        layoutId='usage-resource-tab'
      />

      <AnimatePresence mode='wait'>
        <motion.div
          key={activeTab.id}
          variants={reduce ? undefined : contentVariants}
          initial={reduce ? false : 'hidden'}
          animate='visible'
          exit={reduce ? undefined : 'exit'}
        >
          <Panel className='space-y-0.5'>
            {sorted.length ? (
              sorted.map((row) => (
                <ResourceRow
                  key={row.id}
                  row={row}
                  max={max}
                  icon={activeTab.rowIcon}
                  barClass={activeTab.barClass}
                  currency={usage.currency}
                  status={statusByRef.get(row.id)}
                  showSpend={activeTab.showSpend}
                />
              ))
            ) : (
              <EmptyHint>{activeTab.empty}</EmptyHint>
            )}
          </Panel>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
