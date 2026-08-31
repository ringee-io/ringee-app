'use client';

import type { ReactNode } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from '@ringee/frontend-shared/components/ui/card';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { cn } from '@ringee/frontend-shared/lib/utils';
import type { LucideIcon } from 'lucide-react';

/**
 * The small vocabulary the detail screen is built from.
 *
 * A call detail is mostly labelled facts, and the value of the screen comes
 * from them all being read the same way — same label weight, same empty state,
 * same tone for "this went well". Spelling that out once here is what keeps
 * eleven cards from drifting into eleven layouts.
 */

/** Tone shared by outcome, sentiment and status. Never colour alone: each use
 *  pairs it with a word, so the meaning survives a colour-blind reader. */
export type Tone = 'good' | 'bad' | 'neutral' | 'warn';

const TONE_CLASSES: Record<Tone, string> = {
  good: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  bad: 'border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  warn: 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  neutral: 'border-border bg-muted text-muted-foreground'
};

export function ToneBadge({
  tone = 'neutral',
  icon: Icon,
  children,
  className
}: {
  tone?: Tone;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Badge
      variant='outline'
      className={cn(
        'gap-1.5 rounded-lg border font-medium',
        TONE_CLASSES[tone],
        className
      )}
    >
      {Icon ? <Icon className='size-3.5' /> : null}
      {children}
    </Badge>
  );
}

/** A card with an icon, a title and an optional right-hand slot. */
export function Panel({
  title,
  icon: Icon,
  action,
  description,
  children,
  className
}: {
  title: ReactNode;
  icon?: LucideIcon;
  action?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn('rounded-xl', className)}>
      <CardHeader className='flex flex-row items-start justify-between gap-3 space-y-0 pb-3'>
        <div className='min-w-0'>
          <CardTitle className='flex items-center gap-2 text-sm font-semibold'>
            {Icon ? (
              <Icon className='text-muted-foreground size-4 shrink-0' />
            ) : null}
            {title}
          </CardTitle>
          {description ? (
            <p className='text-muted-foreground mt-1 text-xs'>{description}</p>
          ) : null}
        </div>
        {action ? <div className='shrink-0'>{action}</div> : null}
      </CardHeader>
      <CardContent className='space-y-3'>{children}</CardContent>
    </Card>
  );
}

/**
 * One labelled fact. The label stays quiet and the value carries the weight —
 * a column of these is meant to be scanned, not read.
 */
export function Fact({
  label,
  children,
  mono = false
}: {
  label: ReactNode;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className='flex items-baseline justify-between gap-4 py-1.5'>
      <span className='text-muted-foreground shrink-0 text-xs'>{label}</span>
      <span
        className={cn(
          'min-w-0 truncate text-right text-sm font-medium',
          mono && 'font-mono text-xs'
        )}
      >
        {children}
      </span>
    </div>
  );
}

/** The dash every missing value renders as, so absence looks deliberate. */
export function Empty({ children = '—' }: { children?: ReactNode }) {
  return <span className='text-muted-foreground font-normal'>{children}</span>;
}

/**
 * A headline number in the strip under the title. Big enough to read at a
 * glance, because these four answer "what happened" before anything else does.
 */
export function Stat({
  label,
  value,
  icon: Icon,
  tone = 'neutral'
}: {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
}) {
  return (
    <div className='bg-card flex min-w-0 flex-1 items-center gap-3 rounded-xl border p-3'>
      {Icon ? (
        <div
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-lg border',
            TONE_CLASSES[tone]
          )}
        >
          <Icon className='size-4' />
        </div>
      ) : null}
      <div className='min-w-0'>
        <p className='text-muted-foreground text-xs'>{label}</p>
        <p className='truncate text-sm font-semibold'>{value}</p>
      </div>
    </div>
  );
}
