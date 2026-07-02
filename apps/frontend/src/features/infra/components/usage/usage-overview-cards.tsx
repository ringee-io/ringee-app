'use client';

import {
  IconPhoneCall,
  IconPhone,
  IconClock,
  IconCurrencyDollar,
  IconSpeakerphone,
  IconDeviceLandlinePhone,
  IconUsers
} from '@tabler/icons-react';
import type { InfraUsage } from '../../types';
import { StatTile, formatMinutes, formatMoney } from './usage-primitives';

/**
 * Headline counters. The first four are absolute windows (today / this week /
 * this month); the rest are live resource counts. Agents only read in an
 * organization workspace.
 */
export function UsageOverviewCards({
  usage,
  hasOrg
}: {
  usage: InfraUsage;
  hasOrg: boolean;
}) {
  const o = usage.overview;
  return (
    <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4'>
      <StatTile
        label='Calls today'
        value={o.callsToday.toLocaleString()}
        icon={IconPhoneCall}
        accent='text-emerald-400'
        tint='bg-emerald-500/15'
      />
      <StatTile
        label='Calls this week'
        value={o.callsThisWeek.toLocaleString()}
        icon={IconPhone}
        accent='text-emerald-400'
        tint='bg-emerald-500/15'
      />
      <StatTile
        label='Minutes this month'
        value={formatMinutes(o.minutesThisMonth)}
        icon={IconClock}
        accent='text-sky-400'
        tint='bg-sky-500/15'
      />
      <StatTile
        label='Monthly cost'
        value={formatMoney(o.monthlyCost, usage.currency)}
        icon={IconCurrencyDollar}
        accent='text-amber-400'
        tint='bg-amber-500/15'
      />
      <StatTile
        label='Active campaigns'
        value={o.activeCampaigns.toLocaleString()}
        icon={IconSpeakerphone}
        accent='text-amber-400'
        tint='bg-amber-500/15'
      />
      <StatTile
        label='Active numbers'
        value={o.activeNumbers.toLocaleString()}
        icon={IconPhone}
        accent='text-emerald-400'
        tint='bg-emerald-500/15'
      />
      <StatTile
        label='SIP devices'
        value={o.sipDevices.toLocaleString()}
        icon={IconDeviceLandlinePhone}
        accent='text-violet-400'
        tint='bg-violet-500/15'
      />
      {hasOrg ? (
        <StatTile
          label='Active agents'
          value={o.activeAgents.toLocaleString()}
          icon={IconUsers}
          accent='text-sky-400'
          tint='bg-sky-500/15'
        />
      ) : null}
    </div>
  );
}
