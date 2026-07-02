'use client';

import {
  IconCoin,
  IconPhone,
  IconSpeakerphone,
  IconUser,
  IconChartArea,
  IconClock,
  IconCurrencyDollar,
  IconFlame,
  IconReceipt2
} from '@tabler/icons-react';
import type { InfraUsage } from '../../../types';
import { TimeArea } from '../usage-charts';
import {
  EmptyHint,
  GroupLabel,
  MiniBarRow,
  Panel,
  SectionHeader,
  SectionIntro,
  StatTile,
  formatMinutes,
  formatMoney
} from '../usage-primitives';

/**
 * Cost & billing — everything about spend and economic usage in one place. KPI
 * row, the spend/minutes trends (which deliberately live *only* here, never in
 * Overview), and the by-number / by-campaign / by-member breakdowns.
 */
export function UsageCostSection({
  usage,
  hasOrg
}: {
  usage: InfraUsage;
  hasOrg: boolean;
}) {
  const { cost, currency, overview, byResource } = usage;

  const rangeSpend = cost.series.reduce((sum, p) => sum + p.spend, 0);

  // The single most expensive entity across numbers + campaigns → "cost driver".
  const drivers = [
    ...cost.spendByNumber.map((r) => ({ ...r, kind: 'number' as const })),
    ...cost.spendByCampaign.map((r) => ({ ...r, kind: 'campaign' as const }))
  ].sort((a, b) => b.cost - a.cost);
  const topDriver = drivers[0] ?? null;

  const spendByMember = hasOrg
    ? byResource.byMember.filter((r) => r.cost > 0)
    : [];

  const maxNumberSpend = Math.max(1, ...cost.spendByNumber.map((r) => r.cost));
  const maxCampaignSpend = Math.max(
    1,
    ...cost.spendByCampaign.map((r) => r.cost)
  );
  const maxMemberSpend = Math.max(1, ...spendByMember.map((r) => r.cost));

  return (
    <div className='space-y-8'>
      <SectionIntro
        title='Cost & billing'
        description='Where your spend and minutes are going'
        icon={IconCoin}
      />

      <div className='grid grid-cols-2 gap-3 lg:grid-cols-4'>
        <StatTile
          label='Monthly spend'
          value={formatMoney(overview.monthlyCost, currency)}
          icon={IconCurrencyDollar}
          accent='text-amber-400'
          tint='bg-amber-500/15'
        />
        <StatTile
          label='Spend in range'
          value={formatMoney(rangeSpend, currency)}
          icon={IconReceipt2}
          accent='text-amber-400'
          tint='bg-amber-500/15'
        />
        <StatTile
          label='Minutes this month'
          value={formatMinutes(overview.minutesThisMonth)}
          icon={IconClock}
          accent='text-sky-400'
          tint='bg-sky-500/15'
        />
        <StatTile
          label='Top cost driver'
          value={topDriver ? formatMoney(topDriver.cost, currency) : '—'}
          sub={topDriver?.name}
          icon={IconFlame}
          accent='text-rose-400'
          tint='bg-rose-500/15'
        />
      </div>

      <div>
        <GroupLabel>Trends</GroupLabel>
        <div className='grid gap-3 lg:grid-cols-2'>
          <TimeArea
            data={cost.series}
            dataKey='spend'
            gradientId='infra-spend-grad'
            format={(v) => formatMoney(v, currency)}
            icon={IconChartArea}
            title='Spend over time'
          />
          <TimeArea
            data={cost.series}
            dataKey='minutes'
            gradientId='infra-minutes-grad'
            format={(v) => formatMinutes(v)}
            icon={IconChartArea}
            title='Minutes over time'
          />
        </div>
      </div>

      <div>
        <GroupLabel>Breakdown</GroupLabel>
        <div className='grid gap-3 lg:grid-cols-2'>
          <Panel>
            <SectionHeader title='Spend by number' icon={IconPhone} />
            {cost.spendByNumber.length ? (
              <div className='space-y-0.5'>
                {cost.spendByNumber.slice(0, 8).map((r) => (
                  <MiniBarRow
                    key={r.id}
                    name={r.name}
                    value={r.cost}
                    valueLabel={formatMoney(r.cost, currency)}
                    max={maxNumberSpend}
                    icon={IconPhone}
                    barClass='bg-emerald-500'
                  />
                ))}
              </div>
            ) : (
              <EmptyHint>No number spend yet.</EmptyHint>
            )}
          </Panel>

          <Panel>
            <SectionHeader title='Spend by campaign' icon={IconSpeakerphone} />
            {cost.spendByCampaign.length ? (
              <div className='space-y-0.5'>
                {cost.spendByCampaign.slice(0, 8).map((r) => (
                  <MiniBarRow
                    key={r.id}
                    name={r.name}
                    value={r.cost}
                    valueLabel={formatMoney(r.cost, currency)}
                    max={maxCampaignSpend}
                    icon={IconSpeakerphone}
                    barClass='bg-amber-500'
                  />
                ))}
              </div>
            ) : (
              <EmptyHint>No campaign spend yet.</EmptyHint>
            )}
          </Panel>

          {hasOrg ? (
            <Panel className='lg:col-span-2'>
              <SectionHeader title='Spend by team member' icon={IconUser} />
              {spendByMember.length ? (
                <div className='space-y-0.5'>
                  {spendByMember.slice(0, 8).map((r) => (
                    <MiniBarRow
                      key={r.id}
                      name={r.name}
                      value={r.cost}
                      valueLabel={formatMoney(r.cost, currency)}
                      max={maxMemberSpend}
                      icon={IconUser}
                      barClass='bg-sky-500'
                    />
                  ))}
                </div>
              ) : (
                <EmptyHint>No team-member spend yet.</EmptyHint>
              )}
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  );
}
