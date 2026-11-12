'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Globe2, PhoneOutgoing } from 'lucide-react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { useAnalytics } from '@ringee/frontend-shared/hooks/use.analytics';
import { cn } from '@ringee/frontend-shared/lib/utils';

/** The line a first call goes out on, and whether there is credit for it. */
export interface ListReadyLine {
  kind: 'own_number' | 'shared_number' | 'none';
  /** The own number, formatted; null for the shared line, none, or `auto`. */
  number: string | null;
  /** Caller-ID rotation picks one of the workspace's numbers per call. */
  auto?: boolean;
  /** False when the balance cannot pay for a call (managers only see it). */
  hasCredit: boolean | null;
  /** The top-up control for the ready step, rendered by the host. */
  topUp?: React.ReactNode;
}

/** Where the blocker is shown, for the readiness analytics (bounded). */
export type LineSurface = 'test_call_modal' | 'first_list_ready';

/**
 * No line to call from: the two ways to get one — a number bought in Ringee,
 * which calls local numbers too, or one the person already has, verified,
 * which only places international calls.
 */
export function LineOptions({
  surface,
  className
}: {
  surface: LineSurface;
  className?: string;
}) {
  const t = useTranslations('onboarding.firstList.ready.line');
  const { capture } = useAnalytics();

  useEffect(() => {
    capture('readiness_blocker_shown', { blocker: 'no_line', surface });
  }, [capture, surface]);

  const recover = (action: 'buy_number' | 'verify_number') =>
    capture('readiness_recovery_started', {
      blocker: 'no_line',
      action,
      surface
    });

  return (
    <div className={cn('grid gap-2 text-[13px]', className)}>
      <div className='bg-background rounded-lg border border-emerald-500/30 p-3 dark:bg-transparent'>
        <p className='font-semibold'>{t('buyTitle')}</p>
        <p className='text-muted-foreground mt-0.5 leading-snug'>
          {t('buyText')}
        </p>
        <Button asChild size='sm' className='mt-2'>
          <Link
            href='/dashboard/buy-number?tab=buy'
            onClick={() => recover('buy_number')}
          >
            {t('buyCta')}
          </Link>
        </Button>
      </div>
      <div className='bg-background rounded-lg border p-3 dark:bg-transparent'>
        <p className='font-semibold'>{t('verifyTitle')}</p>
        <p className='text-muted-foreground mt-0.5 leading-snug'>
          {t('verifyText')}
        </p>
        <Button asChild size='sm' variant='outline' className='mt-2'>
          <Link
            href='/dashboard/buy-number?tab=caller-ids'
            onClick={() => recover('verify_number')}
          >
            {t('verifyCta')}
          </Link>
        </Button>
      </div>
    </div>
  );
}

/**
 * The test call's first step, above the number to call: the line Ringee will
 * call from, so where the call comes from never reads as where it goes. The
 * shared US line says what it is for and that returned calls don't reach the
 * person; no line at all says so and offers the ways to get one.
 */
export function CallOrigin({ line }: { line: ListReadyLine }) {
  const t = useTranslations('onboarding.firstList.testCall');
  const tLine = useTranslations('onboarding.firstList.ready.line');

  const tone =
    line.kind === 'shared_number'
      ? 'border-sky-200 bg-sky-50/80 dark:border-sky-500/25 dark:bg-sky-500/[0.07]'
      : line.kind === 'none'
        ? 'border-amber-300/70 bg-amber-50/70 dark:border-amber-500/25 dark:bg-amber-500/[0.07]'
        : 'bg-muted/30';
  const Icon =
    line.kind === 'shared_number'
      ? Globe2
      : line.kind === 'none'
        ? AlertTriangle
        : PhoneOutgoing;

  let title: React.ReactNode;
  let hint: string;
  if (line.kind === 'shared_number') {
    title = t('shared');
    hint = t('sharedHint');
  } else if (line.kind === 'none') {
    title = t('noLine');
    hint = t('noLineHint');
  } else if (line.auto || !line.number) {
    title = t('auto');
    hint = tLine('ownAutoHint');
  } else {
    title = (
      <span className='font-mono tabular-nums' translate='no'>
        {line.number}
      </span>
    );
    hint = tLine('ownHint');
  }

  return (
    <section
      aria-label={t('from')}
      className={cn('rounded-xl border p-4', tone)}
    >
      <p className='text-muted-foreground text-[11px] font-semibold tracking-wider uppercase'>
        {t('from')}
      </p>
      <div className='mt-2 flex items-start gap-3'>
        <span
          aria-hidden
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-full',
            line.kind === 'shared_number'
              ? 'bg-sky-600 text-white dark:bg-sky-500'
              : line.kind === 'none'
                ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                : 'bg-background text-foreground border'
          )}
        >
          <Icon className='size-[18px]' />
        </span>
        <div className='min-w-0 space-y-1'>
          <p className='text-[15px] leading-snug font-semibold text-pretty'>
            {title}
          </p>
          <p className='text-muted-foreground text-[13px] leading-snug text-pretty'>
            {hint}
          </p>
        </div>
      </div>
      {line.kind === 'none' ? (
        <LineOptions surface='test_call_modal' className='mt-3' />
      ) : null}
    </section>
  );
}
