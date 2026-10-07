import type { CSSProperties, ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  ArrowRight,
  ArrowRightLeft,
  BadgeCheck,
  Bot,
  CalendarCheck,
  Check,
  Clock,
  Phone,
  PhoneIncoming,
  RotateCcw,
  Search,
  ShieldCheck,
  Snowflake
} from 'lucide-react';

import { cn } from '@ringee/frontend-shared/lib/utils';
import { ChatGptLogo, ClaudeLogo } from './agent-logos';
import styles from './feature-carousel.module.css';

/*
 * The small product scenes in the home feature cards. They are markup, not
 * screenshots: they follow the theme, stay sharp at any size and take their
 * words from `marketing.home.features.cards.<id>.visual`.
 *
 * A scene plays once when its card comes into view: every `step` fades in at
 * its `--at` delay and every `fill` grows to its `--w`. Without JavaScript,
 * or with reduced motion, the carousel never arms them and they simply show.
 *
 * Every value in a scene is sample data — demo names, numbers from the
 * fictional ranges (555-01xx, Ofcom's 020 7946), times — never a result or a
 * metric.
 */

const MUTED = 'text-neutral-500 dark:text-neutral-400';
const MONO = 'font-mono tabular-nums tracking-tight';
const DIVIDER = 'border-t border-black/[0.06] dark:border-white/[0.08]';

/** When a step of the scene appears, in milliseconds after the card does. */
function at(ms: number, extra?: Record<string, string>): CSSProperties {
  return { '--at': `${ms}ms`, ...extra } as CSSProperties;
}

function Panel({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'w-full max-w-[19.5rem] rounded-2xl border border-black/[0.07] bg-white p-3.5 text-[12.5px] leading-snug text-neutral-800 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.5)] dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-100 dark:shadow-[0_18px_40px_-20px_rgba(0,0,0,0.8)]',
        className
      )}
    >
      {children}
    </div>
  );
}

const PILL_TONES = {
  neutral:
    'bg-neutral-100 text-neutral-600 dark:bg-white/[0.07] dark:text-neutral-300',
  emerald:
    'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/15 ring-inset dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/20',
  solid: 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-emerald-950',
  amber:
    'bg-amber-50 text-amber-700 ring-1 ring-amber-600/15 ring-inset dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/20',
  sky: 'bg-sky-50 text-sky-700 ring-1 ring-sky-600/15 ring-inset dark:bg-sky-400/10 dark:text-sky-300 dark:ring-sky-400/20'
} as const;

function Pill({
  children,
  tone = 'neutral',
  className,
  style
}: {
  children: ReactNode;
  tone?: keyof typeof PILL_TONES;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      style={style}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap [&_svg]:h-3 [&_svg]:w-3',
        PILL_TONES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

/** A line of a conversation: the other person on the left, Ringee's side on the right. */
function Bubble({
  children,
  side,
  step
}: {
  children: ReactNode;
  side: 'them' | 'us';
  step: number;
}) {
  return (
    <p
      style={at(step)}
      className={cn(
        styles.step,
        'max-w-[88%] rounded-2xl px-3 py-2 text-[12.5px] leading-snug',
        side === 'them'
          ? 'self-start rounded-bl-md bg-neutral-100 text-neutral-800 dark:bg-white/[0.07] dark:text-neutral-100'
          : 'self-end rounded-br-md bg-emerald-600 text-white dark:bg-emerald-500 dark:text-emerald-950'
      )}
    >
      {children}
    </p>
  );
}

function LiveDot({ className }: { className?: string }) {
  return (
    <span className={cn('relative flex h-2 w-2', className)}>
      <span className='absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 motion-safe:animate-ping' />
      <span className='relative inline-flex h-2 w-2 rounded-full bg-emerald-500' />
    </span>
  );
}

const WAVE = [
  0.35, 0.6, 0.9, 0.55, 0.75, 1, 0.65, 0.4, 0.8, 0.95, 0.5, 0.7, 0.45, 0.85
];

function Wave({ className }: { className?: string }) {
  return (
    <span className={cn(styles.wave, className)}>
      {WAVE.map((height, i) => (
        <span
          key={i}
          style={{ height: `${height * 100}%`, '--i': i } as CSSProperties}
        />
      ))}
    </span>
  );
}

function Initials({ children }: { children: string }) {
  return (
    <span className='inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-[10px] font-semibold text-neutral-600 ring-2 ring-white dark:bg-neutral-700 dark:text-neutral-200 dark:ring-neutral-900'>
      {children}
    </span>
  );
}

function IconBadge({ children }: { children: ReactNode }) {
  return (
    <span className='inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300 [&_svg]:h-3.5 [&_svg]:w-3.5'>
      {children}
    </span>
  );
}

function CallHeader({
  icon,
  children,
  aside
}: {
  icon: ReactNode;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className='flex items-center gap-2'>
      <IconBadge>{icon}</IconBadge>
      <span className='flex-1 truncate font-medium'>{children}</span>
      {aside}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Calling                                                           */
/* ---------------------------------------------------------------- */

function MatchRow({
  lead,
  from,
  to,
  step
}: {
  lead: string;
  from: string;
  to: string;
  step: number;
}) {
  return (
    <li
      style={at(step)}
      className={cn(
        styles.step,
        'flex items-center gap-2 rounded-xl bg-neutral-50 px-3 py-2 dark:bg-white/[0.04]'
      )}
    >
      <span className='min-w-0 flex-1'>
        <span className={cn(MUTED, 'block truncate text-[11px]')}>{lead}</span>
        <span className={cn(MONO, 'block whitespace-nowrap')}>{from}</span>
      </span>
      <ArrowRight
        aria-hidden
        className='h-3.5 w-3.5 shrink-0 text-emerald-500'
      />
      <span className={cn(MONO, 'shrink-0 font-semibold whitespace-nowrap')}>
        {to}
      </span>
    </li>
  );
}

function PoolRow({
  number,
  used,
  cap,
  status,
  step
}: {
  number: string;
  used: number;
  cap: number;
  status: ReactNode;
  step: number;
}) {
  return (
    <li style={at(step)} className={cn(styles.step, 'flex items-center gap-2')}>
      <span className={cn(MONO, 'flex-1 truncate')}>{number}</span>
      <span className='h-1.5 w-8 shrink-0 overflow-hidden rounded-full bg-neutral-200 sm:w-12 dark:bg-white/10'>
        <span
          className={cn(
            styles.fill,
            'block h-full rounded-full',
            used >= cap ? 'bg-amber-500' : 'bg-emerald-500'
          )}
          style={at(step + 150, { '--w': `${(used / cap) * 100}%` })}
        />
      </span>
      <span
        className={cn(
          MONO,
          MUTED,
          'hidden w-9 text-right text-[11px] sm:inline'
        )}
      >
        {used}/{cap}
      </span>
      {status}
    </li>
  );
}

function RotationVisual() {
  const t = useTranslations('marketing.home.features.cards.rotation.visual');
  return (
    <Panel className='max-w-[20.5rem] p-3'>
      <p className={cn(MUTED, 'px-1 text-[11px]')}>{t('matches')}</p>
      <ul className='mt-1.5 space-y-1.5'>
        <MatchRow
          lead={t('leadMadrid')}
          from='+34 91 ···'
          to='+34 91 060 ···'
          step={0}
        />
        <MatchRow
          lead={t('leadMiami')}
          from='+1 305 ···'
          to='+1 305 555 0142'
          step={350}
        />
        <MatchRow
          lead={t('leadLondon')}
          from='+44 20 ···'
          to='+44 20 7946 0958'
          step={700}
        />
      </ul>
      <p className={cn(MUTED, DIVIDER, 'mt-3 px-1 pt-2.5 text-[11px]')}>
        {t('pool')}
      </p>
      <ul className='mt-1.5 space-y-2 px-1'>
        <PoolRow
          number='+34 91 060 ···'
          used={38}
          cap={80}
          step={1100}
          status={<Pill tone='emerald'>{t('active')}</Pill>}
        />
        <PoolRow
          number='+34 93 412 ···'
          used={80}
          cap={80}
          step={1300}
          status={<Pill tone='amber'>{t('atCap')}</Pill>}
        />
        <PoolRow
          number='+34 96 210 ···'
          used={12}
          cap={80}
          step={1500}
          status={
            <Pill tone='sky'>
              <Snowflake aria-hidden />
              {t('resting')}
            </Pill>
          }
        />
      </ul>
    </Panel>
  );
}

function QueueRow({
  initials,
  name,
  status,
  step
}: {
  initials: string;
  name: string;
  status: ReactNode;
  step: number;
}) {
  return (
    <li
      style={at(step)}
      className={cn(styles.step, 'flex items-center gap-2 py-1')}
    >
      <Initials>{initials}</Initials>
      <span className='flex-1 truncate font-medium'>{name}</span>
      {status}
    </li>
  );
}

function CampaignsVisual() {
  const t = useTranslations('marketing.home.features.cards.campaigns.visual');
  return (
    <Panel>
      <div className='grid grid-cols-2 rounded-lg bg-neutral-100 p-0.5 text-center text-[11px] font-medium dark:bg-white/[0.06]'>
        <span className='rounded-md bg-white py-1 shadow-sm dark:bg-neutral-800'>
          {t('progressive')}
        </span>
        <span className={cn(MUTED, 'py-1')}>{t('preview')}</span>
      </div>
      <ul className='mt-2.5'>
        <QueueRow
          initials='OB'
          name='Olivia Bennett'
          step={0}
          status={
            <Pill tone='emerald'>
              <LiveDot className='h-1.5 w-1.5 [&>span]:h-1.5 [&>span]:w-1.5' />
              {t('calling')}
            </Pill>
          }
        />
        <QueueRow
          initials='MR'
          name='Marcus Reid'
          step={300}
          status={<Pill>{t('next')}</Pill>}
        />
        <QueueRow
          initials='SR'
          name='Sofía Ruiz'
          step={600}
          status={<Pill>{t('queued')}</Pill>}
        />
      </ul>
      <div
        style={at(950)}
        className={cn(
          styles.step,
          DIVIDER,
          'mt-2 flex flex-wrap gap-1.5 pt-2.5'
        )}
      >
        <Pill>
          <Clock aria-hidden />
          8:00–21:00
        </Pill>
        <Pill>
          <RotateCcw aria-hidden />
          {t('attempts')}
        </Pill>
        <Pill>
          <ShieldCheck aria-hidden />
          DNC
        </Pill>
      </div>
    </Panel>
  );
}

/* ---------------------------------------------------------------- */
/* AI voice agents                                                    */
/* ---------------------------------------------------------------- */

function AppointmentsVisual() {
  const t = useTranslations(
    'marketing.home.features.cards.appointments.visual'
  );
  return (
    <Panel>
      <CallHeader icon={<Bot aria-hidden />} aside={<LiveDot />}>
        {t('header')}
      </CallHeader>
      <div className='mt-3 flex flex-col gap-1.5'>
        <Bubble side='us' step={0}>
          {t('ask')}
        </Bubble>
        <Bubble side='them' step={700}>
          {t('answer')}
        </Bubble>
      </div>
      <div style={at(1400)} className={cn(styles.step, DIVIDER, 'mt-3 pt-2.5')}>
        <Pill tone='solid' className='px-2.5 py-1 text-[11.5px]'>
          <CalendarCheck aria-hidden />
          {t('booked')}
        </Pill>
      </div>
    </Panel>
  );
}

function ReceptionistVisual() {
  const t = useTranslations(
    'marketing.home.features.cards.receptionist.visual'
  );
  return (
    <Panel className='max-w-[20.5rem]'>
      <CallHeader
        icon={<PhoneIncoming aria-hidden />}
        aside={
          <span className={cn(MONO, MUTED, 'text-[11px]')}>
            +1 305 555 0187
          </span>
        }
      >
        {t('incoming')}
      </CallHeader>
      <div className='mt-3 flex flex-col gap-1.5'>
        <Bubble side='us' step={0}>
          {t('greeting')}
        </Bubble>
        <Bubble side='them' step={700}>
          {t('caller')}
        </Bubble>
        <Bubble side='us' step={1400}>
          {t('agent')}
        </Bubble>
      </div>
      <div
        style={at(2100)}
        className={cn(
          styles.step,
          DIVIDER,
          'mt-3 flex items-center gap-2 pt-2.5'
        )}
      >
        <ArrowRightLeft
          aria-hidden
          className='h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400'
        />
        <span className='flex-1 font-medium'>{t('transfer')}</span>
        <span className='flex -space-x-1'>
          <Initials>AL</Initials>
          <Initials>JM</Initials>
          <Initials>+2</Initials>
        </span>
      </div>
    </Panel>
  );
}

/* ---------------------------------------------------------------- */
/* AI and automation                                                  */
/* ---------------------------------------------------------------- */

function ObjectionBar({
  rank,
  label,
  width,
  step
}: {
  rank: number;
  label: string;
  width: string;
  step: number;
}) {
  return (
    <li style={at(step)} className={cn(styles.step, 'flex items-center gap-2')}>
      <span className={cn(MONO, MUTED, 'w-3 text-[11px]')}>{rank}</span>
      <span className='w-[7.5rem] shrink-0 truncate text-[11.5px]'>
        {label}
      </span>
      <span className='h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-100 dark:bg-white/[0.07]'>
        <span
          className={cn(
            styles.fill,
            'block h-full rounded-full bg-emerald-500'
          )}
          style={at(step + 150, { '--w': width })}
        />
      </span>
    </li>
  );
}

function InsightsVisual() {
  const t = useTranslations('marketing.home.features.cards.insights.visual');
  return (
    <Panel>
      <div className='flex items-center gap-2'>
        <span className='inline-flex items-center gap-1 rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-600 dark:bg-red-500/15 dark:text-red-300'>
          <span className='h-1.5 w-1.5 rounded-full bg-red-500 motion-safe:animate-pulse' />
          REC
        </span>
        <span className='flex-1 font-medium'>{t('live')}</span>
        <Wave className='h-3.5 text-emerald-500/80' />
      </div>
      <div className='mt-2.5 space-y-1 text-[12px]'>
        <p style={at(0)} className={styles.step}>
          <span className={cn(MUTED, 'font-medium')}>{t('leadLabel')}</span>{' '}
          {t('lead')}
        </p>
        <p style={at(500)} className={styles.step}>
          <span className='font-medium text-emerald-700 dark:text-emerald-300'>
            {t('youLabel')}
          </span>{' '}
          {t('you')}
        </p>
      </div>
      <div className={cn(DIVIDER, 'mt-2.5 pt-2.5')}>
        <p className={cn(MUTED, 'text-[11px]')}>{t('top')}</p>
        <ul className='mt-1.5 space-y-1.5'>
          <ObjectionBar rank={1} label={t('price')} width='86%' step={900} />
          <ObjectionBar
            rank={2}
            label={t('provider')}
            width='62%'
            step={1100}
          />
          <ObjectionBar rank={3} label={t('timing')} width='40%' step={1300} />
        </ul>
      </div>
    </Panel>
  );
}

function ToolCall({ name, step }: { name: string; step: number }) {
  return (
    <li
      style={at(step)}
      className={cn(styles.step, 'flex items-center gap-1.5')}
    >
      <Check
        aria-hidden
        className='h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400'
      />
      <span className={cn(MONO, 'text-[11.5px]')}>{name}</span>
    </li>
  );
}

function AssistantsVisual() {
  const t = useTranslations('marketing.home.features.cards.assistants.visual');
  return (
    <Panel className='max-w-[20.5rem]'>
      <div className='flex items-center gap-2'>
        <span className='flex items-center gap-1.5 text-neutral-700 dark:text-neutral-200'>
          <ChatGptLogo className='h-4 w-4' />
          <ClaudeLogo className='h-4 w-4 text-[#D97757]' />
        </span>
        <span className={cn(MUTED, 'flex-1 truncate text-[11px]')}>
          {t('connected')}
        </span>
        <Pill tone='emerald'>MCP</Pill>
      </div>
      <div className='mt-3 flex flex-col'>
        <p
          style={at(0)}
          className={cn(
            styles.step,
            'max-w-[88%] self-end rounded-2xl rounded-br-md bg-neutral-900 px-3 py-2 text-[12.5px] leading-snug text-white dark:bg-white dark:text-neutral-900'
          )}
        >
          {t('prompt')}
        </p>
      </div>
      <ul className={cn(DIVIDER, 'mt-3 space-y-1.5 pt-2.5')}>
        <ToolCall name='list_calls' step={600} />
        <ToolCall name='get_campaign_analytics' step={1000} />
        <ToolCall name='get_ai_pipeline_results' step={1400} />
      </ul>
      <div
        style={at(1800)}
        className={cn(
          styles.step,
          'mt-3 inline-flex items-center gap-2 text-[11.5px] text-emerald-700 dark:text-emerald-300'
        )}
      >
        <span className={cn(styles.typing, 'inline-flex gap-0.5')}>
          <span />
          <span />
          <span />
        </span>
        {t('reading')}
      </div>
      <div className={cn(DIVIDER, 'mt-3 flex flex-wrap gap-1.5 pt-2.5')}>
        {(['one', 'two', 'three'] as const).map((key, i) => (
          <Pill key={key} className={styles.step} style={at(2200 + i * 150)}>
            {t(`suggestions.${key}`)}
          </Pill>
        ))}
      </div>
    </Panel>
  );
}

/* ---------------------------------------------------------------- */
/* Prospecting and CRM                                               */
/* ---------------------------------------------------------------- */

function ProspectingVisual() {
  const t = useTranslations('marketing.home.features.cards.prospecting.visual');
  return (
    <Panel>
      <div className='flex items-center gap-2 rounded-lg border border-black/[0.08] px-2.5 py-1.5 dark:border-white/10'>
        <Search aria-hidden className='h-3.5 w-3.5 text-neutral-400' />
        <span className='flex-1 truncate'>{t('query')}</span>
        <Pill>Apollo</Pill>
      </div>
      <ul className='mt-2'>
        <li
          style={at(0)}
          className={cn(styles.step, 'flex items-center gap-2 py-1.5')}
        >
          <Initials>LM</Initials>
          <span className='min-w-0 flex-1'>
            <span className='block truncate font-medium'>Laura Martín</span>
            <span className={cn(MUTED, 'block truncate text-[11px]')}>
              {t('roleOne')}
            </span>
          </span>
          <span className='rounded-md border border-black/[0.1] px-2 py-0.5 text-[11px] font-medium dark:border-white/15'>
            {t('reveal')}
          </span>
        </li>
        <li
          style={at(500)}
          className={cn(styles.step, 'flex items-center gap-2 py-1.5')}
        >
          <Initials>DP</Initials>
          <span className='min-w-0 flex-1'>
            <span className='block truncate font-medium'>Diego Pardo</span>
            <span className={cn(MONO, MUTED, 'block truncate text-[11px]')}>
              +34 6•• ••• •••
            </span>
          </span>
          <BadgeCheck
            aria-hidden
            className='h-4 w-4 text-emerald-600 dark:text-emerald-400'
          />
        </li>
      </ul>
      <div
        style={at(1000)}
        className={cn(
          styles.step,
          'mt-2 flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-1.5 text-[11.5px] font-semibold text-white dark:bg-emerald-500 dark:text-emerald-950'
        )}
      >
        <Phone aria-hidden className='h-3.5 w-3.5' />
        {t('call')}
      </div>
    </Panel>
  );
}

export const FEATURE_VISUALS = {
  rotation: RotationVisual,
  campaigns: CampaignsVisual,
  appointments: AppointmentsVisual,
  receptionist: ReceptionistVisual,
  insights: InsightsVisual,
  assistants: AssistantsVisual,
  prospecting: ProspectingVisual
} as const;

export type FeatureVisualId = keyof typeof FEATURE_VISUALS;

/**
 * The illustration area of a card: a fixed-height band on a tall card, the
 * whole side of a wide one. Decoration — the card's text says it all.
 */
export function FeatureVisual({
  id,
  night,
  className
}: {
  id: FeatureVisualId;
  /** On the dark card: the scene sits on a night sky in either theme. */
  night?: boolean;
  className?: string;
}) {
  const Visual = FEATURE_VISUALS[id];
  return (
    <div
      aria-hidden
      className={cn(
        night ? styles.frameNight : styles.frame,
        'relative flex items-center justify-center overflow-hidden px-5',
        className
      )}
    >
      <Visual />
    </div>
  );
}
