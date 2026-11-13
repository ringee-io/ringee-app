'use client';

import { useEffect, useRef, useState } from 'react';
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

/** How long the right-edge panel takes to slide out: `duration-200` below. */
const DRAWER_EXIT_MS = 200;

/**
 * What the right edge shows, kept on screen while it slides out: `value`
 * while there is one; once it is gone, the last one, with `leaving` set,
 * for as long as the exit lasts; then nothing. Going from one value to
 * another is not an exit: the panel stays and its content changes in place.
 */
export function useDrawerExit<T>(value: T | null): {
  shown: T | null;
  leaving: boolean;
} {
  const open = value !== null;
  const last = useRef(value);
  useEffect(() => {
    if (value !== null) last.current = value;
  });
  const [wasOpen, setWasOpen] = useState(open);
  const [leaving, setLeaving] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    setLeaving(!open);
  }
  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => setLeaving(false), DRAWER_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [leaving]);
  if (open) return { shown: value, leaving: false };
  return { shown: leaving ? last.current : null, leaving };
}

/**
 * The panel on the right, full height, with no veil: the week stays in view
 * and usable behind it (it covers the side column, the weekend and the last
 * ~30px of Friday). Rendered once by the calendar, on the body so a scroll
 * container cannot clip it, under dialogs (z-50). It slides in from the edge
 * and back out; while it leaves, what it still shows is a picture — `inert`,
 * so a stale "Book" cannot be pressed. Reduced motion fades instead.
 */
export function DrawerEdge({
  leaving,
  children
}: {
  leaving: boolean;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <aside
      inert={leaving}
      className={cn(
        'bg-card fixed inset-y-0 right-0 z-40 flex w-[460px] max-w-full flex-col border-l text-base',
        // Light: a soft lift off the grid. Dark: a deep one, or it vanishes.
        'shadow-[-2px_0_8px_rgb(15_23_42/0.04),-16px_0_40px_-12px_rgb(15_23_42/0.12)] dark:shadow-[-18px_0_48px_rgba(0,0,0,0.5)]',
        leaving
          ? 'animate-out slide-out-to-right fill-mode-forwards motion-reduce:fade-out motion-reduce:slide-out-to-right-0 duration-200 ease-in'
          : 'animate-in slide-in-from-right motion-reduce:fade-in motion-reduce:slide-in-from-right-0 duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]'
      )}
    >
      {children}
    </aside>,
    document.body
  );
}

/** One drawer's content inside `DrawerEdge`: the dialog it names. */
export function SideDrawer({
  labelledBy,
  children
}: {
  labelledBy: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role='dialog'
      aria-labelledby={labelledBy}
      className='flex min-h-0 flex-1 flex-col'
    >
      {children}
    </div>
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
