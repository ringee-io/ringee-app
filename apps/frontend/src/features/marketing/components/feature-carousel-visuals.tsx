import type { CSSProperties, ReactNode } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import {
  ArrowRight,
  ArrowRightLeft,
  BadgeCheck,
  BellRing,
  Bot,
  CalendarCheck,
  CalendarClock,
  Check,
  Clock,
  FileText,
  Monitor,
  Phone,
  PhoneCall,
  PhoneIncoming,
  Puzzle,
  RotateCcw,
  Search,
  Server,
  ShieldCheck,
  Smartphone,
  Snowflake,
  Webhook
} from 'lucide-react';

import { cn } from '@ringee/frontend-shared/lib/utils';
import { ChatGptLogo, ClaudeLogo } from './agent-logos';
import styles from './feature-carousel.module.css';

/*
 * The small product scenes at the top of each home feature card. They are
 * markup, not screenshots: they follow the theme, stay sharp at any size and
 * take their words from `marketing.home.features.cards.<id>.visual`.
 *
 * They illustrate what a feature does, so every value in them is sample data
 * — demo names, numbers from the fictional ranges (555-01xx, Ofcom's 020 7946
 * and 07700 900), times — never a result or a metric.
 */

const MUTED = 'text-neutral-500 dark:text-neutral-400';
const MONO = 'font-mono tabular-nums tracking-tight';
const DIVIDER = 'border-t border-black/[0.06] dark:border-white/[0.08]';

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
  className
}: {
  children: ReactNode;
  tone?: keyof typeof PILL_TONES;
  className?: string;
}) {
  return (
    <span
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
  side
}: {
  children: ReactNode;
  side: 'them' | 'us';
}) {
  return (
    <p
      className={cn(
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
  0.35, 0.6, 0.9, 0.55, 0.75, 1, 0.65, 0.4, 0.8, 0.95, 0.5, 0.7, 0.45, 0.85,
  0.6, 0.3, 0.75, 0.9, 0.55, 0.4, 0.65, 0.8, 0.5, 0.35
];

function Wave({
  bars = WAVE.length,
  className
}: {
  bars?: number;
  className?: string;
}) {
  return (
    <span className={cn(styles.wave, className)}>
      {WAVE.slice(0, bars).map((height, i) => (
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
    <span className='inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-[10px] font-semibold text-neutral-600 dark:bg-white/10 dark:text-neutral-300'>
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

/* ---------------------------------------------------------------- */
/* Calling                                                           */
/* ---------------------------------------------------------------- */

function GlobalCallingVisual() {
  const t = useTranslations('marketing.home.features.cards.global.visual');
  return (
    <Panel>
      <div className='flex items-center justify-between'>
        <span className='inline-flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-300'>
          <LiveDot />
          {t('status')}
        </span>
        <span className={cn(MONO, MUTED)}>02:14</span>
      </div>
      <p className={cn(MONO, 'mt-2.5 text-[17px] font-semibold')}>
        +44 20 7946 0958
      </p>
      <p className={cn(MUTED, 'mt-0.5')}>{t('place')}</p>
      <Wave className='mt-2.5 h-6 text-emerald-500/80' />
      <div className={cn(DIVIDER, 'mt-3 flex flex-wrap gap-1.5 pt-3')}>
        <Pill>
          <Monitor aria-hidden />
          Web
        </Pill>
        <Pill>
          <Smartphone aria-hidden />
          iOS · Android
        </Pill>
        <Pill>
          <Puzzle aria-hidden />
          Chrome
        </Pill>
      </div>
    </Panel>
  );
}

function PoolRow({
  number,
  used,
  cap,
  status
}: {
  number: string;
  used: number;
  cap: number;
  status: ReactNode;
}) {
  return (
    <li className='flex items-center gap-2'>
      <span className={cn(MONO, 'flex-1 truncate')}>{number}</span>
      <span className='h-1.5 w-12 overflow-hidden rounded-full bg-neutral-200 dark:bg-white/10'>
        <span
          className={cn(
            'block h-full rounded-full',
            used >= cap ? 'bg-amber-500' : 'bg-emerald-500'
          )}
          style={{ width: `${(used / cap) * 100}%` }}
        />
      </span>
      <span className={cn(MONO, MUTED, 'w-9 text-right text-[11px]')}>
        {used}/{cap}
      </span>
      {status}
    </li>
  );
}

function RotationVisual() {
  const t = useTranslations('marketing.home.features.cards.rotation.visual');
  return (
    <Panel className='p-3'>
      <div className='flex items-center gap-2 rounded-xl bg-neutral-50 px-3 py-2 dark:bg-white/[0.04]'>
        <div className='min-w-0 flex-1'>
          <p className={cn(MUTED, 'text-[11px]')}>{t('lead')}</p>
          <p className={MONO}>+34 91 123 ···</p>
        </div>
        <ArrowRight
          aria-hidden
          className='h-3.5 w-3.5 shrink-0 text-neutral-400'
        />
        <div className='min-w-0 flex-1 text-right'>
          <p className='text-[11px] font-medium text-emerald-700 dark:text-emerald-300'>
            {t('shows')}
          </p>
          <p className={cn(MONO, 'font-semibold')}>+34 91 060 ···</p>
        </div>
      </div>
      <p className={cn(MUTED, 'mt-3 px-1 text-[11px]')}>{t('pool')}</p>
      <ul className='mt-1.5 space-y-2 px-1'>
        <PoolRow
          number='+34 91 060 ···'
          used={38}
          cap={80}
          status={<Pill tone='emerald'>{t('active')}</Pill>}
        />
        <PoolRow
          number='+34 93 412 ···'
          used={80}
          cap={80}
          status={<Pill tone='amber'>{t('atCap')}</Pill>}
        />
        <PoolRow
          number='+34 96 210 ···'
          used={12}
          cap={80}
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

function NumberRow({
  type,
  number,
  country
}: {
  type: ReactNode;
  number: string;
  country: string;
}) {
  return (
    <li className='flex items-center gap-2 py-1.5'>
      <span className='w-[4.5rem] shrink-0'>{type}</span>
      <span className={cn(MONO, 'flex-1 truncate')}>{number}</span>
      <span className={cn(MUTED, 'text-[11px] font-medium')}>{country}</span>
    </li>
  );
}

function NumbersVisual() {
  const t = useTranslations('marketing.home.features.cards.numbers.visual');
  return (
    <Panel className='py-2.5'>
      <ul>
        <NumberRow
          type={<Pill>Local</Pill>}
          number='+1 305 555 0142'
          country='US'
        />
        <NumberRow
          type={<Pill>Toll-free</Pill>}
          number='+1 888 555 0199'
          country='US'
        />
        <NumberRow
          type={<Pill>{t('mobile')}</Pill>}
          number='+44 7700 900123'
          country='UK'
        />
      </ul>
      <div className={cn(DIVIDER, 'mt-1.5 pt-2.5')}>
        <div className='flex items-center gap-2'>
          <span className='w-[4.5rem] shrink-0'>
            <Pill tone='emerald'>{t('yours')}</Pill>
          </span>
          <span className={cn(MONO, 'flex-1 truncate font-semibold')}>
            +1 415 555 0101
          </span>
        </div>
        <p className='mt-1.5 flex items-center gap-1 pl-[5rem] text-[11px] font-medium text-emerald-700 dark:text-emerald-300'>
          <BadgeCheck aria-hidden className='h-3.5 w-3.5' />
          {t('verified')}
        </p>
      </div>
    </Panel>
  );
}

function QueueRow({
  initials,
  name,
  status
}: {
  initials: string;
  name: string;
  status: ReactNode;
}) {
  return (
    <li className='flex items-center gap-2 py-1'>
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
          status={<Pill>{t('next')}</Pill>}
        />
        <QueueRow
          initials='SR'
          name='Sofía Ruiz'
          status={<Pill>{t('queued')}</Pill>}
        />
      </ul>
      <div className={cn(DIVIDER, 'mt-2 flex flex-wrap gap-1.5 pt-2.5')}>
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

function ByocVisual() {
  const t = useTranslations('marketing.home.features.cards.byoc.visual');
  return (
    <Panel className='flex flex-col items-center gap-0 text-center'>
      <div className='flex w-full items-center gap-2.5 rounded-xl border border-black/[0.07] px-3 py-2 dark:border-white/10'>
        <IconBadge>
          <Server aria-hidden />
        </IconBadge>
        <span className='flex-1 text-left font-medium'>{t('carrier')}</span>
        <span className={cn(MONO, MUTED, 'text-[11px]')}>SIP · PBX</span>
      </div>
      <span
        aria-hidden
        className='h-4 w-px bg-gradient-to-b from-neutral-300 to-emerald-500 dark:from-white/20'
      />
      <div className='flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 font-semibold text-white dark:bg-emerald-500 dark:text-emerald-950'>
        Ringee
      </div>
      <span aria-hidden className='h-3 w-px bg-emerald-500/60' />
      <div className='flex flex-wrap justify-center gap-1.5'>
        <Pill tone='emerald'>{t('dialer')}</Pill>
        <Pill tone='emerald'>{t('campaigns')}</Pill>
        <Pill tone='emerald'>{t('agents')}</Pill>
      </div>
      <div
        className={cn(
          DIVIDER,
          'mt-3 flex w-full justify-center gap-1.5 pt-2.5'
        )}
      >
        <Pill>MIT</Pill>
        <Pill>Self-hosted</Pill>
      </div>
    </Panel>
  );
}

/* ---------------------------------------------------------------- */
/* AI voice agents                                                    */
/* ---------------------------------------------------------------- */

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
        <Bubble side='us'>{t('ask')}</Bubble>
        <Bubble side='them'>{t('answer')}</Bubble>
      </div>
      <div className={cn(DIVIDER, 'mt-3 pt-2.5')}>
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
    <Panel>
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
        <Bubble side='them'>{t('caller')}</Bubble>
        <Bubble side='us'>{t('agent')}</Bubble>
      </div>
      <div className={cn(DIVIDER, 'mt-3 flex items-center gap-2 pt-2.5')}>
        <ArrowRightLeft
          aria-hidden
          className='h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400'
        />
        <span className='flex-1 font-medium'>{t('transfer')}</span>
        <span className='flex -space-x-1.5'>
          <Initials>AL</Initials>
          <Initials>JM</Initials>
          <Initials>+2</Initials>
        </span>
      </div>
    </Panel>
  );
}

function RemindersVisual() {
  const t = useTranslations('marketing.home.features.cards.reminders.visual');
  return (
    <Panel>
      <CallHeader icon={<BellRing aria-hidden />} aside={<LiveDot />}>
        {t('header')}
      </CallHeader>
      <div className='mt-3 flex flex-col'>
        <Bubble side='us'>{t('ask')}</Bubble>
      </div>
      <div className={cn(DIVIDER, 'mt-3 flex flex-wrap gap-1.5 pt-2.5')}>
        <Pill tone='solid' className='px-2.5 py-1'>
          <Check aria-hidden />
          {t('confirmed')}
        </Pill>
        <Pill className='px-2.5 py-1'>{t('cantAttend')}</Pill>
        <Pill className='px-2.5 py-1'>{t('later')}</Pill>
      </div>
    </Panel>
  );
}

function SettingRow({
  label,
  children
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className='flex items-center gap-2'>
      <span className={cn(MUTED, 'w-[5.5rem] shrink-0 text-[11px]')}>
        {label}
      </span>
      <div className='flex min-w-0 flex-1 flex-wrap items-center gap-1.5'>
        {children}
      </div>
    </div>
  );
}

function CustomizeVisual() {
  const t = useTranslations('marketing.home.features.cards.customize.visual');
  return (
    <Panel className='space-y-2.5'>
      <SettingRow label={t('voice')}>
        <Wave bars={14} className='h-4 text-emerald-500/80' />
        <Pill tone='emerald'>{t('cloned')}</Pill>
      </SettingRow>
      <SettingRow label={t('knowledge')}>
        <Pill>
          <FileText aria-hidden />
          {t('file')}
        </Pill>
        <Pill>FAQ</Pill>
      </SettingRow>
      <SettingRow label={t('model')}>
        <span className='grid grid-cols-2 rounded-lg bg-neutral-100 p-0.5 text-center text-[11px] font-medium dark:bg-white/[0.06]'>
          <span className='rounded-md bg-white px-2 py-0.5 shadow-sm dark:bg-neutral-800'>
            Ringee AI
          </span>
          <span className={cn(MUTED, 'px-2 py-0.5')}>{t('ownKey')}</span>
        </span>
      </SettingRow>
      <div className={cn(DIVIDER, 'flex flex-wrap gap-1 pt-2.5')}>
        {['ES', 'EN', 'PT', 'FR', 'DE', 'IT'].map((language) => (
          <Pill key={language} className={MONO}>
            {language}
          </Pill>
        ))}
      </div>
    </Panel>
  );
}

/* ---------------------------------------------------------------- */
/* AI and automation                                                  */
/* ---------------------------------------------------------------- */

function ToolCall({ name, done }: { name: string; done?: boolean }) {
  return (
    <li className='flex items-center gap-1.5'>
      {done ? (
        <Check
          aria-hidden
          className='h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400'
        />
      ) : (
        <span
          className={cn(
            styles.typing,
            'inline-flex gap-0.5 text-emerald-600 dark:text-emerald-400'
          )}
        >
          <span />
          <span />
          <span />
        </span>
      )}
      <span className={cn(MONO, 'text-[11.5px]', !done && MUTED)}>{name}</span>
    </li>
  );
}

function AssistantsVisual() {
  const t = useTranslations('marketing.home.features.cards.assistants.visual');
  return (
    <Panel>
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
        <p className='max-w-[88%] self-end rounded-2xl rounded-br-md bg-neutral-900 px-3 py-2 text-[12.5px] leading-snug text-white dark:bg-white dark:text-neutral-900'>
          {t('prompt')}
        </p>
      </div>
      <ul className={cn(DIVIDER, 'mt-3 space-y-1.5 pt-2.5')}>
        <ToolCall name='list_calls' done />
        <ToolCall name='get_campaign_analytics' done />
        <ToolCall name='get_ai_pipeline_results' />
      </ul>
    </Panel>
  );
}

function ObjectionBar({
  rank,
  label,
  width
}: {
  rank: number;
  label: string;
  width: string;
}) {
  return (
    <li className='flex items-center gap-2'>
      <span className={cn(MONO, MUTED, 'w-3 text-[11px]')}>{rank}</span>
      <span className='w-[7.5rem] shrink-0 truncate text-[11.5px]'>
        {label}
      </span>
      <span className='h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-100 dark:bg-white/[0.07]'>
        <span
          className='block h-full rounded-full bg-emerald-500'
          style={{ width }}
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
        <Wave bars={10} className='h-3.5 text-emerald-500/80' />
      </div>
      <div className='mt-2.5 space-y-1 text-[12px]'>
        <p>
          <span className={cn(MUTED, 'font-medium')}>{t('leadLabel')}</span>{' '}
          {t('lead')}
        </p>
        <p>
          <span className='font-medium text-emerald-700 dark:text-emerald-300'>
            {t('youLabel')}
          </span>{' '}
          {t('you')}
        </p>
      </div>
      <div className={cn(DIVIDER, 'mt-2.5 pt-2.5')}>
        <p className={cn(MUTED, 'text-[11px]')}>{t('top')}</p>
        <ul className='mt-1.5 space-y-1.5'>
          <ObjectionBar rank={1} label={t('price')} width='86%' />
          <ObjectionBar rank={2} label={t('provider')} width='62%' />
          <ObjectionBar rank={3} label={t('timing')} width='40%' />
        </ul>
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
        <li className='flex items-center gap-2 py-1.5'>
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
        <li className='flex items-center gap-2 py-1.5'>
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
      <div className='mt-2 flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-1.5 text-[11.5px] font-semibold text-white dark:bg-emerald-500 dark:text-emerald-950'>
        <Phone aria-hidden className='h-3.5 w-3.5' />
        {t('call')}
      </div>
    </Panel>
  );
}

function FollowUpVisual() {
  const t = useTranslations('marketing.home.features.cards.followUp.visual');
  return (
    <Panel>
      <div className='flex items-center justify-between'>
        <span className='font-medium'>{t('ended')}</span>
        <span className={cn(MONO, MUTED)}>04:12</span>
      </div>
      <div className='mt-2.5 grid grid-cols-2 gap-1.5 text-center text-[11.5px] font-medium'>
        <span className='rounded-lg bg-emerald-600 py-1.5 text-white dark:bg-emerald-500 dark:text-emerald-950'>
          {t('interested')}
        </span>
        <span className='rounded-lg bg-neutral-100 py-1.5 text-neutral-600 dark:bg-white/[0.07] dark:text-neutral-300'>
          {t('sale')}
        </span>
        <span className='rounded-lg bg-neutral-100 py-1.5 text-neutral-600 dark:bg-white/[0.07] dark:text-neutral-300'>
          Callback
        </span>
        <span className='rounded-lg bg-neutral-100 py-1.5 text-neutral-600 dark:bg-white/[0.07] dark:text-neutral-300'>
          {t('noAnswer')}
        </span>
      </div>
      <ul className={cn(DIVIDER, 'mt-3 space-y-2 pt-2.5')}>
        <li className='flex items-center gap-2'>
          <CalendarClock
            aria-hidden
            className='h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400'
          />
          <span className='flex-1'>{t('callback')}</span>
        </li>
        <li className='flex items-center gap-2'>
          <CalendarCheck
            aria-hidden
            className='h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400'
          />
          <span className='flex-1'>{t('meeting')}</span>
          <Pill>Google</Pill>
        </li>
      </ul>
    </Panel>
  );
}

function SyncRow({
  name,
  detail,
  logo
}: {
  name: string;
  detail: ReactNode;
  logo: ReactNode;
}) {
  return (
    <li className='flex items-center gap-2 py-1.5'>
      <span className='flex w-14 shrink-0 items-center'>{logo ?? name}</span>
      <span className={cn(MUTED, 'min-w-0 flex-1 truncate text-[11.5px]')}>
        {detail}
      </span>
      <Check
        aria-hidden
        className='h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400'
      />
    </li>
  );
}

function CrmSyncVisual() {
  const t = useTranslations('marketing.home.features.cards.crmSync.visual');
  return (
    <Panel>
      <div className='flex items-center gap-2 rounded-xl bg-neutral-50 px-3 py-2 dark:bg-white/[0.04]'>
        <PhoneCall
          aria-hidden
          className='h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400'
        />
        <span className='flex-1 truncate font-medium'>{t('event')}</span>
      </div>
      <ul className='mt-1.5 px-1'>
        <SyncRow
          name='Attio'
          detail={t('attio')}
          logo={
            <Image
              src='/companies/attio.svg'
              alt=''
              width={48}
              height={12}
              className='h-3 w-auto dark:invert'
            />
          }
        />
        <SyncRow
          name='Odoo'
          detail={t('odoo')}
          logo={
            <span className='inline-flex items-center gap-1 text-[11.5px] font-semibold'>
              <Image
                src='/companies/odoo.svg'
                alt=''
                width={20}
                height={12}
                className='h-3 w-auto'
              />
              Odoo
            </span>
          }
        />
        <SyncRow
          name='Webhook'
          detail={<span className={MONO}>call.outcome.updated</span>}
          logo={
            <span className='inline-flex items-center gap-1 text-[11.5px] font-semibold'>
              <Webhook aria-hidden className='h-3.5 w-3.5' />
              Webhook
            </span>
          }
        />
      </ul>
    </Panel>
  );
}

export const FEATURE_VISUALS = {
  global: GlobalCallingVisual,
  rotation: RotationVisual,
  numbers: NumbersVisual,
  campaigns: CampaignsVisual,
  byoc: ByocVisual,
  appointments: AppointmentsVisual,
  receptionist: ReceptionistVisual,
  reminders: RemindersVisual,
  customize: CustomizeVisual,
  assistants: AssistantsVisual,
  insights: InsightsVisual,
  prospecting: ProspectingVisual,
  followUp: FollowUpVisual,
  crmSync: CrmSyncVisual
} as const;

export type FeatureVisualId = keyof typeof FEATURE_VISUALS;

/** The illustration area of a card. Decoration: the card's text says it all. */
export function FeatureVisual({ id }: { id: FeatureVisualId }) {
  const Visual = FEATURE_VISUALS[id];
  return (
    <div
      aria-hidden
      className={cn(
        styles.frame,
        'relative flex h-[14.5rem] items-center justify-center overflow-hidden rounded-[1.25rem] px-5'
      )}
    >
      <Visual />
    </div>
  );
}
