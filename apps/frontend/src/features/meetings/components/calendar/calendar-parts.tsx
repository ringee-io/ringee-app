'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight, RotateCw } from 'lucide-react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { atTime, useCalendarFormat } from './calendar-utils';

/** Day / Week / Month and 15m / 30m / 45m / 1h: one control, two uses. */
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
  kind = 'tablist',
  className
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
  kind?: 'tablist' | 'radiogroup';
  className?: string;
}) {
  return (
    <div
      role={kind}
      aria-label={label}
      className={cn(
        'bg-muted inline-flex h-8 shrink-0 gap-[3px] rounded-lg border p-[3px]',
        className
      )}
    >
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={String(option.value)}
            type='button'
            role={kind === 'tablist' ? 'tab' : 'radio'}
            aria-selected={kind === 'tablist' ? on : undefined}
            aria-checked={kind === 'radiogroup' ? on : undefined}
            onClick={() => onChange(option.value)}
            className={cn(
              'focus-visible:ring-ring/50 inline-flex flex-1 items-center justify-center rounded-md px-[11px] text-sm font-medium whitespace-nowrap outline-none focus-visible:ring-[3px]',
              on
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A panel on the right, full height, with no veil: Monday to Friday stay in
 * view and usable behind it. Rendered on the body so a scroll container
 * cannot clip it, under dialogs (z-50).
 */
export function SideDrawer({
  labelledBy,
  children
}: {
  labelledBy: string;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <aside
      role='dialog'
      aria-labelledby={labelledBy}
      className='bg-card animate-in fade-in slide-in-from-right-8 fixed inset-y-0 right-0 z-40 flex w-[420px] max-w-full flex-col border-l text-base shadow-[-18px_0_48px_rgba(0,0,0,0.5)] duration-200'
    >
      {children}
    </aside>,
    document.body
  );
}

/** A label over a group of facts, in small capitals. */
export function SectionLabel({
  children,
  className
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        'text-muted-foreground text-xs font-semibold tracking-[0.06em] uppercase',
        className
      )}
    >
      {children}
    </p>
  );
}

/** The date of a meeting, a day at a time. */
export function DateStepper({
  date,
  label,
  onStep,
  disablePrev
}: {
  date: Date;
  label: string;
  onStep: (days: number) => void;
  disablePrev?: boolean;
}) {
  const t = useTranslations('meetings.page');
  return (
    <div className='border-input dark:bg-input/30 flex h-8 items-center rounded-md border bg-transparent'>
      <Button
        type='button'
        variant='ghost'
        size='icon'
        className='size-[30px]'
        onClick={() => onStep(-1)}
        disabled={disablePrev}
        aria-label={t('previousDay')}
      >
        <ChevronLeft />
      </Button>
      <span
        className='min-w-0 flex-1 truncate text-center text-sm font-medium'
        aria-live='polite'
        title={date.toDateString()}
      >
        {label}
      </span>
      <Button
        type='button'
        variant='ghost'
        size='icon'
        className='size-[30px]'
        onClick={() => onStep(1)}
        aria-label={t('nextDay')}
      >
        <ChevronRight />
      </Button>
    </div>
  );
}

/**
 * Open start times as buttons. The chosen one is green; a time chosen on the
 * calendar that the calendar does not offer is shown chosen all the same.
 */
export function SlotGrid({
  date,
  slots,
  value,
  onChange,
  loading,
  failed,
  onRetry,
  columns = 6,
  dayName
}: {
  date: Date;
  slots: string[];
  value: string | null;
  onChange: (time: string) => void;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  columns?: number;
  /** "Saturday": says which day has no open times. */
  dayName: string;
}) {
  const t = useTranslations('meetings.page.slots');
  const fmt = useCalendarFormat();

  if (loading && slots.length === 0) {
    return (
      <div
        className='grid gap-[7px]'
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        aria-busy
      >
        {Array.from({ length: columns * 2 }, (_, i) => (
          <Skeleton key={i} className='h-7 rounded-md' />
        ))}
      </div>
    );
  }

  if (failed) {
    return (
      <div className='text-muted-foreground flex items-center gap-2 py-1 text-[12.8px]'>
        <span>{t('failed')}</span>
        <Button type='button' variant='ghost' size='sm' onClick={onRetry}>
          <RotateCw />
          {t('retry')}
        </Button>
      </div>
    );
  }

  const times = [...new Set([...slots, ...(value ? [value] : [])])].sort();
  if (times.length === 0) {
    return (
      <p className='text-muted-foreground py-2 text-[12.8px]'>
        {t('none', { day: dayName })}
      </p>
    );
  }

  return (
    <div
      className='grid gap-[7px]'
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {times.map((time) => {
        const on = time === value;
        return (
          <button
            key={time}
            type='button'
            aria-pressed={on}
            onClick={() => onChange(time)}
            className={cn(
              'focus-visible:ring-ring/50 h-7 rounded-md border text-[12.8px] whitespace-nowrap tabular-nums outline-none focus-visible:ring-[3px]',
              on
                ? 'border-emerald-500 bg-emerald-500/15 font-semibold text-emerald-700 dark:text-emerald-400'
                : 'border-input hover:bg-muted'
            )}
          >
            {fmt.time(atTime(date, time))}
          </button>
        );
      })}
    </div>
  );
}

/** A field's own error, under it. */
export function FieldError({ children }: { children: React.ReactNode }) {
  return (
    <p className='text-[12.8px] text-red-600 dark:text-red-400' role='alert'>
      {children}
    </p>
  );
}
