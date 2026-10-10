'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { motion, useReducedMotion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  Gift,
  Phone
} from 'lucide-react';
import { formatForDisplay } from '@ringee/dialer-core/phone';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  DialogDescription,
  DialogTitle
} from '@ringee/frontend-shared/components/ui/dialog';
import { cn } from '@ringee/frontend-shared/lib/utils';
import type { SkippedPerson } from '../../hooks/use.first.list.builder';

/** The last step: the list is ready, the gift is in, and the way to call. */
export function ListReady({
  name,
  count,
  rewardGranted,
  skipped,
  onStart
}: {
  name: string;
  count: number;
  rewardGranted: number;
  skipped: SkippedPerson[];
  onStart: () => void;
}) {
  const t = useTranslations('onboarding.firstList.ready');
  const tList = useTranslations('onboarding.firstList');
  const reduceMotion = useReducedMotion();
  const [showSkipped, setShowSkipped] = useState(false);

  return (
    <>
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

      <div className='border-t px-6 py-4'>
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
