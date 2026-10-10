'use client';

import { useTranslations } from 'next-intl';
import { Clock, Moon, TrendingUp } from 'lucide-react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { useOrgRole } from '@ringee/frontend-shared/hooks/use-org-role';
import { CreditPopover } from '@/features/credit/components/credit.popover';
import { useCreditStore } from '@/features/credit/store/credit.store';
import { useRotationEnabled } from '@/features/number-rotation';
import { useNumberPerformance } from '../../hooks/use.number.performance';
import { useNumbersStore } from '../../store/number.selector.store';
import { useTelnyxStore } from '../../store/telnyx.store';
import { LineStatusBadge } from '../line-status-badge';
import { NumberSelector } from '../number.selector';
import { useMyDayFormat } from './use-my-day-format';

/** Whether the line can call, the number it calls from, and the money left. */
export function YourLineCard() {
  const t = useTranslations('calls.myDay.line');
  const tDialer = useTranslations('calls.dialer');
  const lineStatus = useTelnyxStore((s) => s.status);
  // The balance and its top-up are the admin's: an organization member sees
  // neither — not even for the moment before their role has loaded.
  const { canAccessAdminFeatures, isLoaded: roleLoaded } = useOrgRole();
  const showBalance = roleLoaded && canAccessAdminFeatures;
  const {
    balance,
    canCall,
    freeCallTrial,
    status: balanceStatus
  } = useCreditStore();

  return (
    <section
      aria-labelledby='my-day-line-title'
      className='bg-card space-y-3 rounded-xl border p-4 sm:p-5'
    >
      <div className='flex items-center justify-between gap-2'>
        <h2 id='my-day-line-title' className='text-base font-semibold'>
          {t('title')}
        </h2>
        <LineStatusBadge status={lineStatus} />
      </div>

      <div>
        <NumberSelector />
        <NumberPerformanceLine />
      </div>

      {!canCall && balanceStatus === 'success' ? (
        <p className='rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400'>
          {tDialer('outboundDisabled')}
        </p>
      ) : null}

      {showBalance ? (
        <div className='border-t pt-3'>
          {balanceStatus !== 'success' ? (
            <Skeleton className='h-10 w-full' />
          ) : freeCallTrial ? (
            <div className='flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2'>
              <Clock className='mt-0.5 size-4 shrink-0 text-amber-500' />
              <div>
                <p className='text-sm font-semibold text-amber-600 dark:text-amber-400'>
                  {tDialer('freeTrial')}
                </p>
                <p className='text-muted-foreground text-xs'>
                  {tDialer('freeTrialHint')}
                </p>
              </div>
            </div>
          ) : (
            <div className='flex items-center justify-between gap-3'>
              <div>
                <p className='text-muted-foreground text-[13px]'>
                  {t('balance')}
                </p>
                <p className='text-lg font-bold tabular-nums'>
                  ${balance.toFixed(2)}
                </p>
              </div>
              <CreditPopover fetch={false}>
                <Button variant='outline' size='sm'>
                  {t('addCredit')}
                </Button>
              </CreditPopover>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}

/**
 * How the chosen number has been answered lately — only for one of the
 * workspace's own numbers, and only as what it is: a pick-up rate with its
 * sample, never a "health" or spam score.
 */
function NumberPerformanceLine() {
  const t = useTranslations('calls.myDay.line');
  const fmt = useMyDayFormat();
  const selected = useNumbersStore((s) => s.selectedNumber);
  const rotationEnabled = useRotationEnabled();
  // With rotation on, a Ringee number is picked per call: there is no single
  // number to report on.
  const numberId =
    rotationEnabled === false || selected?.source === 'external_carrier'
      ? selected?.id
      : null;
  const { performance } = useNumberPerformance(numberId);
  if (!performance) return null;

  const { calls, answered, windowDays, minSample, restingUntil } = performance;
  return (
    <div className='text-muted-foreground -mt-2 space-y-1 text-[12.5px]'>
      <p className='flex items-start gap-1.5' title={t('performanceHint')}>
        <TrendingUp className='mt-0.5 size-3.5 shrink-0' />
        {calls >= minSample
          ? t('performance', {
              rate: Math.round((answered / calls) * 100),
              calls,
              days: windowDays
            })
          : t('performanceLow', { calls, days: windowDays })}
      </p>
      {restingUntil ? (
        <p className='flex items-start gap-1.5 text-amber-700 dark:text-amber-400'>
          <Moon className='mt-0.5 size-3.5 shrink-0' />
          {t('resting', { date: fmt.day(new Date(restingUntil)) })}
        </p>
      ) : null}
    </div>
  );
}
