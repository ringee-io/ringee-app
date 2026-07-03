'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@ringee/frontend-shared/lib/utils';
import type { ComponentType } from 'react';
import type { IconProps } from '@tabler/icons-react';
import { SPRING } from '../../lib/motion';

/** Premium surface shared by every Usage panel. */
export function Panel({
  className,
  children
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'bg-card/60 rounded-2xl border p-4 shadow-sm ring-1 ring-white/5 backdrop-blur-sm sm:p-5',
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * The editorial header at the top of every Usage section — larger and calmer
 * than the compact panel {@link SectionHeader}, so each view opens with a clear
 * title, a one-line intent, and an optional right-hand summary.
 */
export function SectionIntro({
  title,
  description,
  icon: Icon,
  right
}: {
  title: string;
  description?: string;
  icon?: ComponentType<IconProps>;
  right?: React.ReactNode;
}) {
  return (
    <div className='mb-6 flex items-start gap-3'>
      {Icon ? (
        <span className='bg-muted/60 text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-xl'>
          <Icon className='size-[18px]' />
        </span>
      ) : null}
      <div className='min-w-0 flex-1'>
        <h1 className='text-base font-semibold tracking-tight'>{title}</h1>
        {description ? (
          <p className='text-muted-foreground text-[13px]'>{description}</p>
        ) : null}
      </div>
      {right ? <div className='shrink-0'>{right}</div> : null}
    </div>
  );
}

/** A quiet uppercase label that groups a cluster of panels within a section. */
export function GroupLabel({
  children,
  right
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className='mb-2.5 flex items-center justify-between'>
      <span className='text-muted-foreground text-[11px] font-medium tracking-[0.08em] uppercase'>
        {children}
      </span>
      {right}
    </div>
  );
}

interface SegmentItem<T extends string> {
  id: T;
  label: string;
  icon?: ComponentType<IconProps>;
}

/**
 * Premium pill tabs with a shared sliding indicator (framer `layoutId`). Used
 * for the second layer of segmentation inside "By resource".
 */
export function SegmentedTabs<T extends string>({
  items,
  active,
  onSelect,
  layoutId = 'usage-segment'
}: {
  items: SegmentItem<T>[];
  active: T;
  onSelect: (id: T) => void;
  layoutId?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <div className='bg-muted/40 inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border p-1'>
      {items.map((it) => {
        const on = it.id === active;
        const Icon = it.icon;
        return (
          <button
            key={it.id}
            type='button'
            onClick={() => onSelect(it.id)}
            className={cn(
              'relative flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
              on
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {on ? (
              <motion.span
                layoutId={layoutId}
                transition={reduce ? { duration: 0 } : SPRING}
                className='bg-card absolute inset-0 rounded-lg border shadow-sm ring-1 ring-white/5'
              />
            ) : null}
            {Icon ? <Icon className='relative size-3.5' /> : null}
            <span className='relative whitespace-nowrap'>{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function SectionHeader({
  title,
  subtitle,
  icon: Icon,
  right
}: {
  title: string;
  subtitle?: string;
  icon?: ComponentType<IconProps>;
  right?: React.ReactNode;
}) {
  return (
    <div className='mb-3 flex items-center gap-2.5'>
      {Icon ? (
        <span className='bg-muted/60 text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-lg'>
          <Icon className='size-4' />
        </span>
      ) : null}
      <div className='min-w-0 flex-1'>
        <h2 className='text-sm font-semibold tracking-tight'>{title}</h2>
        {subtitle ? (
          <p className='text-muted-foreground truncate text-[11px]'>
            {subtitle}
          </p>
        ) : null}
      </div>
      {right}
    </div>
  );
}

/** A single headline metric. */
export function StatTile({
  label,
  value,
  sub,
  icon: Icon,
  accent = 'text-muted-foreground',
  tint = 'bg-muted/60'
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon?: ComponentType<IconProps>;
  accent?: string;
  tint?: string;
}) {
  return (
    <Panel className='flex flex-col gap-2'>
      <div className='flex items-center justify-between'>
        <span className='text-muted-foreground text-[11px] font-medium tracking-wide uppercase'>
          {label}
        </span>
        {Icon ? (
          <span
            className={cn(
              'flex size-6 items-center justify-center rounded-md',
              tint,
              accent
            )}
          >
            <Icon className='size-3.5' />
          </span>
        ) : null}
      </div>
      <span className='text-2xl font-semibold tracking-tight tabular-nums'>
        {value}
      </span>
      {sub ? (
        <span className='text-muted-foreground text-[11px]'>{sub}</span>
      ) : null}
    </Panel>
  );
}

/** A labelled horizontal bar — the workhorse for every by-resource breakdown.
 *  Colour carries identity; the icon + name + value carry it too (never colour
 *  alone), which also satisfies the contrast-relief rule for accent fills. */
export function MiniBarRow({
  name,
  value,
  valueLabel,
  max,
  icon: Icon,
  barClass,
  onClick
}: {
  name: string;
  value: number;
  valueLabel: string;
  max: number;
  icon?: ComponentType<IconProps>;
  barClass: string;
  onClick?: () => void;
}) {
  const pct = max > 0 ? Math.max((value / max) * 100, value > 0 ? 4 : 0) : 0;
  const Row = onClick ? 'button' : 'div';
  return (
    <Row
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'group/row flex w-full items-center gap-3 rounded-lg px-1.5 py-1.5 text-left transition-colors',
        onClick && 'hover:bg-accent/40'
      )}
    >
      {Icon ? <Icon className='text-muted-foreground size-4 shrink-0' /> : null}
      <div className='min-w-0 flex-1'>
        <div className='mb-1 flex items-center justify-between gap-2'>
          <span className='truncate text-xs font-medium' title={name}>
            {name}
          </span>
          <span className='text-muted-foreground shrink-0 text-xs tabular-nums'>
            {valueLabel}
          </span>
        </div>
        <div className='bg-muted/70 h-1.5 w-full overflow-hidden rounded-full'>
          <div
            className={cn('h-full rounded-full', barClass)}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </Row>
  );
}

/** A "top X" highlight card for the performance section. */
export function TopResourceCard({
  label,
  name,
  detail,
  icon: Icon,
  accent,
  tint,
  onClick
}: {
  label: string;
  name: string | null;
  detail?: string;
  icon: ComponentType<IconProps>;
  accent: string;
  tint: string;
  onClick?: () => void;
}) {
  const Root = onClick && name ? 'button' : 'div';
  return (
    <Root
      type={onClick && name ? 'button' : undefined}
      onClick={name ? onClick : undefined}
      className={cn(
        'bg-card/60 flex items-center gap-3 rounded-xl border p-3 text-left ring-1 ring-white/5 transition-colors',
        onClick && name && 'hover:border-foreground/20 hover:bg-accent/30'
      )}
    >
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-lg',
          tint,
          accent
        )}
      >
        <Icon className='size-5' />
      </span>
      <div className='min-w-0'>
        <p className='text-muted-foreground text-[11px] font-medium tracking-wide uppercase'>
          {label}
        </p>
        <p className='truncate text-sm font-semibold' title={name ?? undefined}>
          {name ?? '—'}
        </p>
        {detail && name ? (
          <p className='text-muted-foreground truncate text-[11px]'>{detail}</p>
        ) : null}
      </div>
    </Root>
  );
}

/** A compact, horizontally-laid insight — icon + label + value on one line.
 *  Lighter than {@link StatTile}; used for the Overview "highlights" row. */
export function InsightTile({
  label,
  value,
  sub,
  icon: Icon,
  accent = 'text-muted-foreground',
  tint = 'bg-muted/60'
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: ComponentType<IconProps>;
  accent?: string;
  tint?: string;
}) {
  return (
    <Panel className='flex items-center gap-3'>
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-lg',
          tint,
          accent
        )}
      >
        <Icon className='size-5' />
      </span>
      <div className='min-w-0'>
        <p className='text-muted-foreground text-[11px] font-medium tracking-wide uppercase'>
          {label}
        </p>
        <p className='text-lg font-semibold tracking-tight tabular-nums'>
          {value}
        </p>
        {sub ? (
          <p className='text-muted-foreground truncate text-[11px]'>{sub}</p>
        ) : null}
      </div>
    </Panel>
  );
}

/** Empty placeholder shown inside a panel when a breakdown has no data. */
export function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className='text-muted-foreground flex h-24 items-center justify-center rounded-lg border border-dashed text-xs'>
      {children}
    </div>
  );
}

/** Format seconds as "3m 12s" / "48s". */
export function formatDuration(sec: number): string {
  if (!sec) return '0s';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** Compact money — "$1,240.50". */
export function formatMoney(v: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2
  }).format(v || 0);
}

/** Compact minutes — "1,204 min". */
export function formatMinutes(v: number): string {
  return `${new Intl.NumberFormat('en-US').format(v || 0)} min`;
}
