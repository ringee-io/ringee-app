'use client';

import {
  IconActivityHeartbeat,
  IconPhoneCheck,
  IconClockPlay,
  IconSpeakerphone,
  IconPhone,
  IconUser,
  IconDeviceLandlinePhone
} from '@tabler/icons-react';
import type { InfraUsage } from '../../types';
import {
  Panel,
  SectionHeader,
  TopResourceCard,
  formatDuration
} from './usage-primitives';

/** Circular answer-rate meter (single primary hue, value shown in the center). */
function AnswerRateRing({ pct }: { pct: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const offset = c - (clamped / 100) * c;
  return (
    <div className='relative flex size-24 shrink-0 items-center justify-center'>
      <svg className='size-24 -rotate-90' viewBox='0 0 80 80'>
        <circle
          cx='40'
          cy='40'
          r={r}
          fill='none'
          stroke='var(--muted)'
          strokeWidth='7'
        />
        <circle
          cx='40'
          cy='40'
          r={r}
          fill='none'
          stroke='var(--primary)'
          strokeWidth='7'
          strokeLinecap='round'
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 600ms ease' }}
        />
      </svg>
      <div className='absolute flex flex-col items-center'>
        <span className='text-xl font-semibold tabular-nums'>{clamped}%</span>
        <span className='text-muted-foreground text-[10px]'>answered</span>
      </div>
    </div>
  );
}

export function UsagePerformance({
  usage,
  hasOrg
}: {
  usage: InfraUsage;
  hasOrg: boolean;
}) {
  const p = usage.performance;

  return (
    <section>
      <SectionHeader
        title='Performance'
        subtitle='How calling is going in the selected range'
        icon={IconActivityHeartbeat}
      />
      <div className='grid gap-3 lg:grid-cols-3'>
        {/* Answer rate + core rates */}
        <Panel className='flex items-center gap-4'>
          <AnswerRateRing pct={p.answerRate} />
          <div className='min-w-0 flex-1 space-y-2.5'>
            <Metric
              icon={IconPhoneCheck}
              label='Calls connected'
              value={`${p.callsConnected.toLocaleString()} / ${p.totalCalls.toLocaleString()}`}
            />
            <Metric
              icon={IconClockPlay}
              label='Avg call duration'
              value={formatDuration(p.avgDurationSec)}
            />
          </div>
        </Panel>

        {/* Top performers */}
        <div className='grid gap-3 sm:grid-cols-2 lg:col-span-2'>
          <TopResourceCard
            label='Top campaign'
            name={p.topCampaign?.name ?? null}
            detail={p.topCampaign ? `${p.topCampaign.value} calls` : undefined}
            icon={IconSpeakerphone}
            accent='text-amber-400'
            tint='bg-amber-500/15'
          />
          <TopResourceCard
            label='Top phone number'
            name={p.topNumber?.name ?? null}
            detail={p.topNumber ? `${p.topNumber.value} calls` : undefined}
            icon={IconPhone}
            accent='text-emerald-400'
            tint='bg-emerald-500/15'
          />
          {hasOrg ? (
            <TopResourceCard
              label='Top agent'
              name={p.topAgent?.name ?? null}
              detail={p.topAgent ? `${p.topAgent.value} calls` : undefined}
              icon={IconUser}
              accent='text-sky-400'
              tint='bg-sky-500/15'
            />
          ) : null}
          <TopResourceCard
            label='Top SIP device'
            name={p.topDevice?.name ?? null}
            detail={p.topDevice ? `${p.topDevice.value} calls` : undefined}
            icon={IconDeviceLandlinePhone}
            accent='text-violet-400'
            tint='bg-violet-500/15'
          />
        </div>
      </div>
    </section>
  );
}

function Metric({
  icon: Icon,
  label,
  value
}: {
  icon: typeof IconPhoneCheck;
  label: string;
  value: string;
}) {
  return (
    <div className='flex items-center gap-2.5'>
      <Icon className='text-muted-foreground size-4 shrink-0' />
      <span className='text-muted-foreground min-w-0 flex-1 truncate text-xs'>
        {label}
      </span>
      <span className='text-sm font-semibold tabular-nums'>{value}</span>
    </div>
  );
}
