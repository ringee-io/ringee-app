'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { motion, useReducedMotion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  Cpu,
  Gift,
  Phone,
  PhoneCall
} from 'lucide-react';
import { formatForDisplay } from '@ringee/dialer-core/phone';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  DialogDescription,
  DialogTitle
} from '@ringee/frontend-shared/components/ui/dialog';
import { cn } from '@ringee/frontend-shared/lib/utils';
import type { SkippedPerson } from '../../hooks/use.first.list.builder';
import { LineOptions, type ListReadyLine } from './call-line';

export type { ListReadyLine } from './call-line';

/** The last step: the list is ready, the gift is in, and the way to call. */
export function ListReady({
  name,
  count,
  rewardGranted,
  skipped,
  onStart,
  line = null,
  onConfigureFollowUp = null
}: {
  name: string;
  count: number;
  rewardGranted: number;
  skipped: SkippedPerson[];
  onStart: () => void;
  line?: ListReadyLine | null;
  onConfigureFollowUp?: (() => void) | null;
}) {
  const t = useTranslations('onboarding.firstList.ready');
  const tList = useTranslations('onboarding.firstList');
  const reduceMotion = useReducedMotion();
  const [showSkipped, setShowSkipped] = useState(false);
  // The gift just landed on an empty balance (BILL-022): the balance shown
  // by the page may not have caught up with it yet.
  const noCredit = line?.hasCredit === false && rewardGranted <= 0;

  return (
    <>
      {/* Scrolls inside the dialog's capped height, like every other step, so
          "Start calling" below stays reachable on a short screen. */}
      <div className='min-h-0 flex-1 overflow-y-auto'>
        <div className='flex flex-col items-center px-6 pt-7 pb-5 text-center'>
          <motion.span
            initial={reduceMotion ? false : { scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 360, damping: 18 }}
            className='flex size-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-600/25 dark:bg-emerald-500'
          >
            <Check className='size-7' strokeWidth={2.75} />
          </motion.span>
          <DialogTitle className='mt-4 text-xl font-semibold tracking-tight'>
            {t('title')}
          </DialogTitle>
          <DialogDescription className='mt-1.5 max-w-sm text-[14px] leading-relaxed'>
            {t('description', { count, name })}
          </DialogDescription>
        </div>

        <div className='space-y-3 px-6 pb-6'>
          {rewardGranted > 0 ? (
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18, duration: 0.25 }}
              className='flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 dark:border-emerald-500/25 dark:bg-emerald-500/[0.08]'
            >
              <span className='flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white dark:bg-emerald-500'>
                <Gift className='size-5' />
              </span>
              <span className='min-w-0'>
                <span className='block text-[15px] font-semibold'>
                  {t('rewardTitle', {
                    amount: `$${rewardGranted.toFixed(2)}`
                  })}
                </span>
                <span className='text-muted-foreground block text-[13px] leading-snug'>
                  {t('rewardHint')}
                </span>
              </span>
            </motion.div>
          ) : null}

          {line ? (
            <div className='rounded-xl border p-3.5 text-[13px]'>
              <p className='flex items-center gap-2 font-semibold'>
                <PhoneCall className='size-4 shrink-0 text-emerald-600 dark:text-emerald-400' />
                {line.kind === 'shared_number'
                  ? t('line.shared')
                  : line.kind === 'none'
                    ? t('line.none')
                    : line.auto || !line.number
                      ? t('line.ownAuto')
                      : t('line.own', { number: line.number })}
              </p>
              <p className='text-muted-foreground mt-1 leading-snug'>
                {line.kind === 'shared_number'
                  ? t('line.sharedHint')
                  : line.kind === 'none'
                    ? t('line.noneHint')
                    : line.auto || !line.number
                      ? t('line.ownAutoHint')
                      : t('line.ownHint')}
              </p>
              {line.kind === 'none' ? (
                <LineOptions surface='first_list_ready' className='mt-3' />
              ) : null}
              {noCredit ? (
                <div className='mt-2 flex flex-wrap items-center justify-between gap-2'>
                  <p className='text-amber-700 dark:text-amber-300'>
                    {t('line.noCredit')}
                  </p>
                  {line.topUp}
                </div>
              ) : null}
            </div>
          ) : null}

          {onConfigureFollowUp ? (
            <div className='bg-muted/40 flex gap-3 rounded-xl border p-3.5'>
              <span className='flex size-9 shrink-0 items-center justify-center rounded-lg bg-sky-500/15 text-sky-500'>
                <Cpu className='size-4' aria-hidden />
              </span>
              <div className='min-w-0'>
                <p className='text-[14px] leading-snug font-semibold'>
                  {t('followUp.text')}
                </p>
                <p className='text-muted-foreground mt-0.5 text-[12px]'>
                  {t('followUp.hint')}
                </p>
                <Button
                  variant='outline'
                  size='sm'
                  className='mt-2'
                  onClick={onConfigureFollowUp}
                >
                  {t('followUp.cta')}
                </Button>
              </div>
            </div>
          ) : null}

          {skipped.length > 0 ? (
            <div className='rounded-lg border text-sm'>
              <button
                type='button'
                onClick={() => setShowSkipped((open) => !open)}
                aria-expanded={showSkipped}
                className='hover:bg-muted/40 flex w-full items-center justify-between gap-2 rounded-lg px-3.5 py-2.5 text-left transition-colors'
              >
                <span className='flex items-center gap-2 font-medium'>
                  <AlertTriangle className='size-4 shrink-0 text-amber-600 dark:text-amber-400' />
                  {t('skipped', { count: skipped.length })}
                </span>
                <span className='text-muted-foreground flex items-center gap-1 text-xs'>
                  {t('why')}
                  <ChevronDown
                    className={cn(
                      'size-4 transition-transform',
                      showSkipped && 'rotate-180'
                    )}
                  />
                </span>
              </button>
              {showSkipped ? (
                <ul className='text-muted-foreground max-h-32 space-y-1 overflow-y-auto border-t px-3.5 py-2.5 text-xs'>
                  {skipped.map((person, index) => (
                    <li key={index}>
                      {person.row !== undefined
                        ? tList('skippedRow', {
                            row: person.row,
                            message: person.message
                          })
                        : tList('skippedPerson', {
                            phone: formatForDisplay(person.phoneNumber ?? ''),
                            message: person.message
                          })}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className='shrink-0 border-t px-6 py-4'>
        <Button
          autoFocus
          onClick={onStart}
          className='h-11 w-full gap-2.5 bg-emerald-600 text-[15px] font-semibold text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500'
        >
          <Phone />
          {t('cta')}
          <ArrowRight />
        </Button>
        <p className='text-muted-foreground mt-2.5 text-center text-xs'>
          {t.rich('keyHint', {
            key: (chunks) => (
              <kbd className='bg-muted border-border mx-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded border px-1.5 font-mono text-[11px] leading-none font-medium'>
                {chunks}
              </kbd>
            )
          })}
        </p>
      </div>
    </>
  );
}
