'use client';

import { useTranslations } from 'next-intl';

/**
 * Loading state.
 *
 * Mirrors the real layout (summary + credit card + three stage rows) so the
 * page does not jump when the data arrives. `aria-busy` plus a visually hidden
 * label means a screen reader hears "loading" rather than a wall of empty
 * boxes.
 */
export function JourneySkeleton() {
  const t = useTranslations('journey');

  return (
    <div
      aria-busy='true'
      aria-live='polite'
      className='flex animate-pulse flex-col gap-6 motion-reduce:animate-none'
    >
      <span className='sr-only'>{t('loading')}</span>

      <div className='space-y-2'>
        <div className='bg-muted h-6 w-32 rounded' />
        <div className='bg-muted h-4 w-72 max-w-full rounded' />
      </div>

      <div className='grid gap-4 lg:grid-cols-3'>
        <div className='bg-card space-y-3 rounded-2xl border p-5 lg:col-span-2'>
          <div className='bg-muted h-3 w-20 rounded' />
          <div className='bg-muted h-6 w-48 max-w-full rounded' />
          <div className='bg-muted h-4 w-full rounded' />
          <div className='bg-muted h-2 w-full rounded-full' />
          <div className='bg-muted h-16 w-full rounded-xl' />
        </div>
        <div className='bg-card space-y-3 rounded-2xl border p-5'>
          <div className='bg-muted h-3 w-16 rounded' />
          <div className='bg-muted h-8 w-24 rounded' />
          <div className='bg-muted h-3 w-full rounded' />
          <div className='bg-muted h-3 w-full rounded' />
        </div>
      </div>

      <div className='flex flex-col gap-3'>
        {[0, 1, 2].map((row) => (
          <div key={row} className='bg-card/50 rounded-2xl border p-5'>
            <div className='flex gap-4'>
              <div className='bg-muted size-10 shrink-0 rounded-xl' />
              <div className='flex-1 space-y-2'>
                <div className='bg-muted h-4 w-40 max-w-full rounded' />
                <div className='bg-muted h-3 w-full rounded' />
                <div className='bg-muted h-3 w-2/3 rounded' />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
