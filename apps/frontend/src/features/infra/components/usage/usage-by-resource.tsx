'use client';

import type { ComponentType } from 'react';
import {
  IconChartBar,
  IconSpeakerphone,
  IconPhone,
  IconDeviceLandlinePhone,
  IconUser,
  type IconProps
} from '@tabler/icons-react';
import type { InfraUsage, InfraUsageResourceRow } from '../../types';
import {
  EmptyHint,
  MiniBarRow,
  Panel,
  SectionHeader
} from './usage-primitives';

function Breakdown({
  title,
  icon,
  rowIcon,
  barClass,
  rows,
  empty
}: {
  title: string;
  icon: ComponentType<IconProps>;
  rowIcon: ComponentType<IconProps>;
  barClass: string;
  rows: InfraUsageResourceRow[];
  empty: string;
}) {
  const sorted = [...rows].sort((a, b) => b.calls - a.calls).slice(0, 8);
  const max = Math.max(1, ...sorted.map((r) => r.calls));
  return (
    <Panel>
      <SectionHeader title={title} icon={icon} />
      {sorted.length ? (
        <div className='space-y-0.5'>
          {sorted.map((r) => (
            <MiniBarRow
              key={r.id}
              name={r.name}
              value={r.calls}
              valueLabel={`${r.calls.toLocaleString()} calls · ${r.minutes}m`}
              max={max}
              icon={rowIcon}
              barClass={barClass}
            />
          ))}
        </div>
      ) : (
        <EmptyHint>{empty}</EmptyHint>
      )}
    </Panel>
  );
}

/**
 * Usage split by each resource kind. Every chart is a single-entity breakdown,
 * so it uses that resource type's accent (colour follows the entity) with the
 * name + value on every row.
 */
export function UsageByResource({
  usage,
  hasOrg
}: {
  usage: InfraUsage;
  hasOrg: boolean;
}) {
  const b = usage.byResource;
  return (
    <section>
      <SectionHeader
        title='Usage by resource'
        subtitle='Calls and minutes per campaign, number, device and agent'
        icon={IconChartBar}
      />
      <div className='grid gap-3 lg:grid-cols-2'>
        <Breakdown
          title='By campaign'
          icon={IconSpeakerphone}
          rowIcon={IconSpeakerphone}
          barClass='bg-amber-500'
          rows={b.byCampaign}
          empty='No campaign activity in this range.'
        />
        <Breakdown
          title='By phone number'
          icon={IconPhone}
          rowIcon={IconPhone}
          barClass='bg-emerald-500'
          rows={b.byNumber}
          empty='No number activity in this range.'
        />
        <Breakdown
          title='By SIP device'
          icon={IconDeviceLandlinePhone}
          rowIcon={IconDeviceLandlinePhone}
          barClass='bg-violet-500'
          rows={b.byDevice}
          empty='No device activity in this range.'
        />
        {hasOrg ? (
          <Breakdown
            title='By team member'
            icon={IconUser}
            rowIcon={IconUser}
            barClass='bg-sky-500'
            rows={b.byMember}
            empty='No agent activity in this range.'
          />
        ) : null}
      </div>
    </section>
  );
}
