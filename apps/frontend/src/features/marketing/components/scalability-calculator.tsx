'use client';

import { useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { ArrowDownRight } from 'lucide-react';

import { Card } from './primitives';
import { PRICING } from '../site';

const MAX_SEATS = 20;
const DEFAULT_SEATS = 12;
const DEFAULT_PER_SEAT = 30;

/** Illustrative subscription comparison; usage is explicitly excluded. */
export function ScalabilityCalculator() {
  const t = useTranslations('marketing.calculator');
  const formatter = useFormatter();
  const [seats, setSeats] = useState(DEFAULT_SEATS);
  const [perSeat, setPerSeat] = useState(DEFAULT_PER_SEAT);
  const format = (value: number) =>
    formatter.number(value, {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    });

  const isSolo = seats === 1;
  const ringeeMonthly = isSolo
    ? PRICING.freelancer.price
    : PRICING.organization.price;
  const perSeatMonthly = seats * perSeat;
  const monthlySavings = Math.max(0, perSeatMonthly - ringeeMonthly);
  const denominator = Math.max(perSeatMonthly, ringeeMonthly, 1);
  const barScale = (value: number) => value / denominator;

  return (
    <Card className='mx-auto h-full w-full max-w-3xl p-6 shadow-none sm:p-8'>
      <h3 className='text-xl font-semibold tracking-tight'>{t('title')}</h3>
      <p className='text-muted-foreground mt-2 text-base leading-relaxed'>
        {t('description')}
      </p>
      <div className='mt-7 grid gap-5 sm:grid-cols-2'>
        <label className='flex flex-col gap-2'>
          <span className='flex items-baseline justify-between gap-3 text-sm font-medium'>
            {t('seats')}
            <span className='text-emerald-700 tabular-nums dark:text-emerald-400'>
              {t('users', { count: seats })}
            </span>
          </span>
          <input
            type='range'
            min={1}
            max={MAX_SEATS}
            value={seats}
            onChange={(event) => setSeats(Number(event.target.value))}
            className='h-11 w-full cursor-pointer rounded-sm accent-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-500'
            aria-label={t('seats')}
            aria-valuetext={t('users', { count: seats })}
          />
        </label>
        <label className='flex flex-col gap-2'>
          <span className='text-sm font-medium'>{t('perSeat')}</span>
          <div className='border-border/80 flex min-h-11 items-center rounded-lg border px-3 focus-within:ring-2 focus-within:ring-emerald-500'>
            <span className='text-muted-foreground' aria-hidden>
              $
            </span>
            <input
              type='number'
              min={0}
              max={10000}
              step={1}
              value={perSeat}
              onChange={(event) => {
                const value = Number(event.target.value);
                setPerSeat(
                  Number.isFinite(value)
                    ? Math.min(10000, Math.max(0, value))
                    : 0
                );
              }}
              className='w-full min-w-0 bg-transparent px-2 py-2 text-base outline-none'
              aria-label={t('perSeat')}
            />
          </div>
        </label>
      </div>

      <div className='mt-7 space-y-6'>
        <div>
          <div className='flex items-baseline justify-between gap-3 text-sm'>
            <span className='text-muted-foreground'>{t('other')}</span>
            <span className='font-semibold tabular-nums'>
              {format(perSeatMonthly)}
              <span className='text-muted-foreground font-normal'>
                {t('monthly')}
              </span>
            </span>
          </div>
          <div
            className='bg-muted mt-3 h-2 overflow-hidden rounded-full'
            aria-hidden
          >
            <div
              className='bg-muted-foreground/50 h-full origin-left rounded-full transition-transform duration-200 motion-reduce:transition-none'
              style={{ transform: `scaleX(${barScale(perSeatMonthly)})` }}
            />
          </div>
          <p className='text-muted-foreground mt-2 text-xs tabular-nums'>
            {t('users', { count: seats })} × {format(perSeat)}
          </p>
        </div>
        <div>
          <div className='flex items-baseline justify-between gap-3 text-sm'>
            <span className='font-medium'>{t('ringee')}</span>
            <span className='font-semibold tabular-nums'>
              {format(ringeeMonthly)}
              <span className='text-muted-foreground font-normal'>
                {t('monthly')}
              </span>
            </span>
          </div>
          <div
            className='bg-muted mt-3 h-2 overflow-hidden rounded-full'
            aria-hidden
          >
            <div
              className='h-full origin-left rounded-full bg-emerald-600 transition-transform duration-200 motion-reduce:transition-none'
              style={{ transform: `scaleX(${barScale(ringeeMonthly)})` }}
            />
          </div>
          <p className='text-muted-foreground mt-2 text-xs'>
            {t(isSolo ? 'solo' : 'team')}
          </p>
        </div>
      </div>

      <div
        className='mt-7 rounded-xl bg-emerald-50 p-5 text-emerald-950 dark:bg-emerald-950/50 dark:text-emerald-100'
        role='status'
        aria-live='polite'
        aria-atomic='true'
      >
        <p className='flex items-center gap-2 text-sm font-medium'>
          <ArrowDownRight className='h-4 w-4' aria-hidden />
          {t('savings')}
        </p>
        <div className='mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-2'>
          <p className='text-4xl font-semibold tracking-tight tabular-nums'>
            {format(monthlySavings)}
          </p>
          <p className='text-sm'>
            {monthlySavings > 0
              ? t('annual', { amount: format(monthlySavings * 12) })
              : t('noSavings')}
          </p>
        </div>
      </div>
      <p className='text-muted-foreground mt-4 text-xs leading-relaxed'>
        {t('note')}
      </p>
    </Card>
  );
}
