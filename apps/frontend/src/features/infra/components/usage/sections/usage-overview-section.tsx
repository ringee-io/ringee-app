'use client';

import {
  IconLayoutDashboard,
  IconPhoneCall,
  IconPhone,
  IconClock,
  IconCurrencyDollar,
  IconSpeakerphone,
  IconDeviceLandlinePhone,
  IconUsers,
  IconPhoneCheck,
  IconClockPlay,
  IconShieldCheck,
  IconCoin,
  IconArrowRight,
  IconCircleCheck,
  IconAlertTriangle
} from '@tabler/icons-react';
import { cn } from '@ringee/frontend-shared/lib/utils';
import type { HealthSummary } from '../../../lib/usage-health';
import type { InfraUsage } from '../../../types';
import type { UsageSection } from '../usage-sections';
import {
  GroupLabel,
  InsightTile,
  Panel,
  SectionIntro,
  StatTile,
  TopResourceCard,
  formatDuration,
  formatMinutes,
  formatMoney
} from '../usage-primitives';

/** The compact, CTA-bearing summary card at the foot of Overview. */
function SummaryCard({
  icon: Icon,
  tint,
  accent,
  title,
  headline,
  sub,
  badge,
  ctaLabel,
  onCta
}: {
  icon: typeof IconShieldCheck;
  tint: string;
  accent: string;
  title: string;
  headline: string;
  sub?: string;
  badge?: React.ReactNode;
  ctaLabel: string;
  onCta: () => void;
}) {
  return (
    <Panel className='flex flex-col gap-4'>
      <div className='flex items-center gap-3'>
        <span
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-xl',
            tint,
            accent
          )}
        >
          <Icon className='size-5' />
        </span>
        <div className='min-w-0 flex-1'>
          <p className='text-muted-foreground text-[11px] font-medium tracking-wide uppercase'>
            {title}
          </p>
          <p className='truncate text-lg font-semibold tracking-tight'>
            {headline}
          </p>
        </div>
        {badge}
      </div>
      {sub ? (
        <p className='text-muted-foreground -mt-1 truncate text-xs'>{sub}</p>
      ) : null}
      <button
        type='button'
        onClick={onCta}
        className='text-muted-foreground hover:border-foreground/20 hover:text-foreground group inline-flex items-center gap-1.5 self-start rounded-full border px-3 py-1.5 text-xs font-medium transition-colors'
      >
        {ctaLabel}
        <IconArrowRight className='size-3.5 transition-transform group-hover:translate-x-0.5' />
      </button>
    </Panel>
  );
}

/**
 * Overview — the executive summary. Answers "how is the call center doing" in
 * one glance: headline counters, live resource counts, a few highlights, and
 * two summary cards that hand off to the health and cost views. Deliberately
 * chart-free — detail lives in the dedicated sections.
 */
export function UsageOverviewSection({
  usage,
  hasOrg,
  health,
  onNavigate
}: {
  usage: InfraUsage;
  hasOrg: boolean;
  health: HealthSummary;
  onNavigate: (section: UsageSection) => void;
}) {
  const o = usage.overview;
  const p = usage.performance;
  const { currency } = usage;

  // Top spender across numbers + campaigns → the cost card's one-line highlight.
  const topSpender =
    [...usage.cost.spendByNumber, ...usage.cost.spendByCampaign].sort(
      (a, b) => b.cost - a.cost
    )[0] ?? null;

  const healthClean = health.attentionCount === 0;

  return (
    <div className='space-y-8'>
      <SectionIntro
        title='Overview'
        description={
          hasOrg
            ? 'How your call center is doing at a glance'
            : 'How your calling is doing at a glance'
        }
        icon={IconLayoutDashboard}
      />

      {/* Headline counters */}
      <div className='grid grid-cols-2 gap-3 lg:grid-cols-4'>
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
          value={formatMoney(o.monthlyCost, currency)}
          icon={IconCurrencyDollar}
          accent='text-amber-400'
          tint='bg-amber-500/15'
        />
      </div>

      {/* Live resource counts */}
      <div>
        <GroupLabel>Resources</GroupLabel>
        <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4'>
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
      </div>

      {/* Highlights */}
      <div>
        <GroupLabel>Highlights</GroupLabel>
        <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
          <InsightTile
            label='Answer rate'
            value={`${p.answerRate}%`}
            sub={`${p.callsConnected.toLocaleString()} of ${p.totalCalls.toLocaleString()} connected`}
            icon={IconPhoneCheck}
            accent='text-emerald-400'
            tint='bg-emerald-500/15'
          />
          <InsightTile
            label='Avg call duration'
            value={formatDuration(p.avgDurationSec)}
            sub='Across connected calls'
            icon={IconClockPlay}
            accent='text-sky-400'
            tint='bg-sky-500/15'
          />
          <TopResourceCard
            label='Top phone number'
            name={p.topNumber?.name ?? null}
            detail={p.topNumber ? `${p.topNumber.value} calls` : undefined}
            icon={IconPhone}
            accent='text-emerald-400'
            tint='bg-emerald-500/15'
          />
          <TopResourceCard
            label='Top campaign'
            name={p.topCampaign?.name ?? null}
            detail={p.topCampaign ? `${p.topCampaign.value} calls` : undefined}
            icon={IconSpeakerphone}
            accent='text-amber-400'
            tint='bg-amber-500/15'
          />
          <TopResourceCard
            label='Top SIP device'
            name={p.topDevice?.name ?? null}
            detail={p.topDevice ? `${p.topDevice.value} calls` : undefined}
            icon={IconDeviceLandlinePhone}
            accent='text-violet-400'
            tint='bg-violet-500/15'
          />
          {hasOrg ? (
            <TopResourceCard
              label='Top agent'
              name={p.topAgent?.name ?? null}
              detail={p.topAgent ? `${p.topAgent.value} calls` : undefined}
              icon={IconUsers}
              accent='text-sky-400'
              tint='bg-sky-500/15'
            />
          ) : null}
        </div>
      </div>

      {/* Handoffs */}
      <div className='grid gap-3 lg:grid-cols-2'>
        <SummaryCard
          icon={IconShieldCheck}
          tint={healthClean ? 'bg-emerald-500/15' : 'bg-amber-500/15'}
          accent={healthClean ? 'text-emerald-400' : 'text-amber-400'}
          title='Operational health'
          headline={
            healthClean
              ? 'All resources ready'
              : `${health.attentionCount} ${
                  health.attentionCount === 1
                    ? 'resource needs'
                    : 'resources need'
                } attention`
          }
          sub={
            healthClean
              ? 'Nothing needs setup right now'
              : health.criticalCount > 0
                ? `${health.criticalCount} blocking · ${health.warnCount} to review`
                : 'Non-blocking — configured but not optimal'
          }
          badge={
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium',
                healthClean
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : 'bg-amber-500/15 text-amber-400'
              )}
            >
              {healthClean ? (
                <IconCircleCheck className='size-3.5' />
              ) : (
                <IconAlertTriangle className='size-3.5' />
              )}
              {health.okCount}/{health.total} ready
            </span>
          }
          ctaLabel='View operational health'
          onCta={() => onNavigate('health')}
        />

        <SummaryCard
          icon={IconCoin}
          tint='bg-amber-500/15'
          accent='text-amber-400'
          title='Cost & billing'
          headline={`${formatMoney(o.monthlyCost, currency)} this month`}
          sub={
            topSpender
              ? `Top spender: ${topSpender.name} · ${formatMoney(topSpender.cost, currency)}`
              : 'No spend recorded yet'
          }
          ctaLabel='View cost & billing'
          onCta={() => onNavigate('cost')}
        />
      </div>
    </div>
  );
}
