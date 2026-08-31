'use client';

import type { ReactNode } from 'react';

/**
 * One tab's worth of settings. A short title and a single line of hint — the
 * form is meant to be scanned, not read.
 */
export function Section({
  title,
  hint,
  action,
  children
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className='space-y-5'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div>
          <h3 className='text-base font-semibold'>{title}</h3>
          {hint ? (
            <p className='text-muted-foreground text-sm'>{hint}</p>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
