'use client';

import { useState } from 'react';

import { Card } from './primitives';
import { PRICING } from '../site';

const RINGEE_ORG_PRICE = PRICING.organization.price; // 20

/**
 * Subscription-cost comparison. Compares a generic per-seat model (seats ×
 * adjustable per-seat price) against Ringee's flat Organization plan. This is
 * a real arithmetic calculator — it does not reference any specific competitor
 * and excludes calling credits, which are billed separately on Ringee.
 */
export function PricingCalculator() {
  const [seats, setSeats] = useState(5);
  const [perSeat, setPerSeat] = useState(30);

  const traditionalMonthly = Math.max(0, seats) * Math.max(0, perSeat);
  const ringeeMonthly = RINGEE_ORG_PRICE;
  const monthlySavings = Math.max(0, traditionalMonthly - ringeeMonthly);
  const annualSavings = monthlySavings * 12;

  const format = (value: number) =>
    value.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    });

  return (
    <Card className='mx-auto max-w-3xl'>
      <h3 className='text-xl font-semibold'>Compare the cost of per-seat pricing</h3>
      <p className='text-muted-foreground mt-2 text-sm'>
        Many calling tools charge per user. Ringee charges a flat{' '}
        {format(RINGEE_ORG_PRICE)}/month per organization with unlimited users.
        Adjust the numbers below to compare subscription cost.
      </p>

      <div className='mt-6 grid gap-6 sm:grid-cols-2'>
        <label className='flex flex-col gap-2'>
          <span className='text-sm font-medium'>
            Team size: <span className='font-bold'>{seats}</span> users
          </span>
          <input
            type='range'
            min={1}
            max={50}
            value={seats}
            onChange={(event) => setSeats(Number(event.target.value))}
            className='accent-primary'
            aria-label='Team size in users'
          />
        </label>

        <label className='flex flex-col gap-2'>
          <span className='text-sm font-medium'>
            Assumed price per seat (/month)
          </span>
          <div className='border-border/70 flex items-center rounded-md border px-3'>
            <span className='text-muted-foreground'>$</span>
            <input
              type='number'
              min={0}
              value={perSeat}
              onChange={(event) => setPerSeat(Number(event.target.value))}
              className='w-full bg-transparent px-2 py-2 outline-none'
              aria-label='Assumed price per seat per month'
            />
          </div>
        </label>
      </div>

      <div className='mt-6 grid gap-4 sm:grid-cols-2'>
        <div className='border-border/70 rounded-xl border p-4'>
          <p className='text-muted-foreground text-sm'>Per-seat model</p>
          <p className='mt-1 text-2xl font-bold'>
            {format(traditionalMonthly)}
            <span className='text-muted-foreground text-sm font-normal'>
              /mo
            </span>
          </p>
          <p className='text-muted-foreground mt-1 text-xs'>
            {seats} × {format(perSeat)}
          </p>
        </div>
        <div className='border-primary/40 bg-primary/5 rounded-xl border p-4'>
          <p className='text-muted-foreground text-sm'>Ringee Organization</p>
          <p className='mt-1 text-2xl font-bold'>
            {format(ringeeMonthly)}
            <span className='text-muted-foreground text-sm font-normal'>
              /mo
            </span>
          </p>
          <p className='text-muted-foreground mt-1 text-xs'>
            Flat, unlimited users
          </p>
        </div>
      </div>

      <div className='border-border/60 mt-6 rounded-xl border border-dashed p-4 text-center'>
        <p className='text-muted-foreground text-sm'>
          Estimated subscription savings
        </p>
        <p className='mt-1 text-3xl font-bold'>
          {format(monthlySavings)}/mo
        </p>
        <p className='text-muted-foreground mt-1 text-sm'>
          About {format(annualSavings)} per year
        </p>
      </div>

      <p className='text-muted-foreground mt-4 text-xs'>
        This compares subscription cost only and uses your own per-seat
        assumption. Calling minutes are billed separately as credits on Ringee.
      </p>
    </Card>
  );
}
