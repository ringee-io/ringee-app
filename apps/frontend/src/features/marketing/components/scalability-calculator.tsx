'use client';

import { useState } from 'react';

import { Card } from './primitives';
import { PRICING } from '../site';

const RINGEE_ORG_PRICE = PRICING.organization.price; // 20
const MAX_SEATS = 20;
const DEFAULT_SEATS = 12;
const DEFAULT_PER_SEAT = 30;

const format = (value: number) =>
  value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  });

/**
 * Scalability cost comparison for the homepage. As the team grows toward 20
 * members a per-seat tool's bill climbs linearly, while Ringee stays flat: a
 * solo user pays no subscription (Freelancer), and a whole team is a flat
 * Organization price no matter how many you add — you only pay for the minutes
 * you use. The per-seat assumption is adjustable, like the
 * pricing-page calculator. This is plain arithmetic — it names no competitor and
 * excludes calling credits, which are billed separately on Ringee.
 */
export function ScalabilityCalculator() {
  const [seats, setSeats] = useState(DEFAULT_SEATS);
  const [perSeat, setPerSeat] = useState(DEFAULT_PER_SEAT);

  const safeSeats = Math.max(0, seats);
  const safePerSeat = Math.max(0, perSeat);

  // Solo (one seat) is the Freelancer plan — no subscription, pay only for
  // minutes; a team is the flat Organization price for unlimited members.
  const isSolo = safeSeats <= 1;
  const ringeePlan = isSolo
    ? PRICING.freelancer.name
    : PRICING.organization.name;
  const ringeeMonthly = isSolo ? PRICING.freelancer.price : RINGEE_ORG_PRICE;

  const perSeatMonthly = safeSeats * safePerSeat;
  const monthlySavings = Math.max(0, perSeatMonthly - ringeeMonthly);
  const annualSavings = monthlySavings * 12;

  // Bars scale against the per-seat bill at full capacity so Ringee reads as a
  // flat sliver next to the climbing per-seat bar. Floor keeps both visible.
  const denominator = Math.max(MAX_SEATS * safePerSeat, ringeeMonthly, 1);
  const barWidth = (value: number) =>
    `${Math.min(100, Math.max(value > 0 ? 4 : 0, (value / denominator) * 100))}%`;

  return (
    <Card className='mx-auto max-w-3xl'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <h3 className='text-xl font-semibold'>
            The most economical way to scale
          </h3>
          <p className='text-muted-foreground mt-1 text-sm'>
            Per-seat tools bill you for every new hire. On Ringee a solo user
            pays no subscription, and a whole team is a flat{' '}
            {format(RINGEE_ORG_PRICE)}/month for unlimited members — you only
            pay for the minutes you use.
          </p>
        </div>
        <div className='text-right'>
          <p className='text-3xl font-bold tabular-nums'>
            {format(monthlySavings)}
          </p>
          <p className='text-muted-foreground text-xs'>saved per month</p>
        </div>
      </div>

      <div className='mt-6 grid gap-6 sm:grid-cols-2'>
        <label className='flex flex-col gap-2'>
          <span className='text-sm font-medium'>
            Team size: <span className='font-bold tabular-nums'>{seats}</span>{' '}
            {seats === 1 ? 'member' : 'members'}
          </span>
          <input
            type='range'
            min={1}
            max={MAX_SEATS}
            value={seats}
            onChange={(event) => setSeats(Number(event.target.value))}
            className='accent-emerald-600'
            aria-label='Team size in members'
          />
        </label>

        <label className='flex flex-col gap-2'>
          <span className='text-sm font-medium'>
            Their price per seat (/month)
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

      <div className='mt-8 flex flex-col gap-5'>
        <div>
          <div className='flex items-baseline justify-between text-sm'>
            <span className='text-muted-foreground'>Per-seat tool</span>
            <span className='font-semibold tabular-nums'>
              {format(perSeatMonthly)}
              <span className='text-muted-foreground font-normal'>/mo</span>
            </span>
          </div>
          <div className='bg-muted/60 mt-2 h-3 overflow-hidden rounded-full'>
            <div
              className='bg-muted-foreground/40 h-full rounded-full transition-all duration-300'
              style={{ width: barWidth(perSeatMonthly) }}
            />
          </div>
          <p className='text-muted-foreground mt-1 text-xs tabular-nums'>
            {safeSeats} × {format(safePerSeat)}
          </p>
        </div>

        <div>
          <div className='flex items-baseline justify-between text-sm'>
            <span className='font-medium'>Ringee {ringeePlan}</span>
            <span className='font-semibold tabular-nums'>
              {format(ringeeMonthly)}
              <span className='text-muted-foreground font-normal'>/mo</span>
            </span>
          </div>
          <div className='bg-muted/60 mt-2 h-3 overflow-hidden rounded-full'>
            <div
              className='h-full rounded-full bg-emerald-600 transition-all duration-300'
              style={{ width: barWidth(ringeeMonthly) }}
            />
          </div>
          <p className='text-muted-foreground mt-1 text-xs'>
            {isSolo
              ? 'No subscription · pay only for minutes'
              : 'Flat price · unlimited members'}
          </p>
        </div>
      </div>

      <p className='text-muted-foreground mt-6 text-xs'>
        About <span className='font-semibold'>{format(annualSavings)}</span> a
        year at {seats} {seats === 1 ? 'member' : 'members'}. Subscription cost
        only — calling minutes are billed separately as credits on Ringee.
      </p>
    </Card>
  );
}
