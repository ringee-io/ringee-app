'use client';

import { Phone } from 'lucide-react';

import { cn } from '@ringee/frontend-shared/lib/utils';

import { CONTACT_PHONE, siteText } from '../site';
import { useMarketingLocale } from '../locale.client';
import styles from './call-us.module.css';

/**
 * Floating phone line rendered on every marketing page, in the bottom-left
 * corner (Ask AI holds the centre, the chat launcher the right). It is a
 * `tel:` link: a phone dials straight away, a desktop hands the number to its
 * calling app. Below `md` only the green call key shows, which keeps it clear
 * of Ask AI on narrow screens; its "open 24/7" status shrinks to the dot on
 * the key's rim. The pill is inverted against the page — dark on the light
 * theme, light on the dark one.
 */
export function CallUs() {
  const locale = useMarketingLocale();
  const label = siteText('Call us', locale);
  const status = siteText('Open 24/7', locale);

  return (
    <a
      href={`tel:${CONTACT_PHONE.e164}`}
      aria-label={`${label}, ${status}: ${CONTACT_PHONE.display}`}
      className={cn(
        styles.trigger,
        'group bg-foreground text-background focus-visible:ring-offset-background border-background/15 fixed bottom-4 left-4 z-40 inline-flex items-center gap-2.5 rounded-full border p-1 shadow-lg shadow-black/15 transition-all hover:border-emerald-500/60 hover:shadow-xl focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:outline-none sm:bottom-6 sm:left-6 md:pr-4'
      )}
    >
      <span
        className={cn(
          styles.key,
          'flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white transition-colors group-hover:bg-emerald-500'
        )}
      >
        <Phone className={cn(styles.icon, 'size-4')} />
      </span>
      <LiveDot className='ring-foreground absolute top-0.5 right-0.5 size-2.5 rounded-full ring-2 md:hidden' />
      <span className='hidden flex-col md:flex'>
        <span className='flex items-center gap-2 text-[11px] leading-3.5 font-medium'>
          <span className='text-background/70'>{label}</span>
          <span className='inline-flex items-center gap-1 text-emerald-400 dark:text-emerald-700'>
            <LiveDot className='size-1.5' />
            {status}
          </span>
        </span>
        <span className='text-sm leading-4 font-semibold tabular-nums'>
          {CONTACT_PHONE.display}
        </span>
      </span>
    </a>
  );
}

/** The green "line is open" light: a solid dot with a slow halo around it. */
function LiveDot({ className }: { className: string }) {
  return (
    <span className={cn('relative flex', className)}>
      <span
        className={cn(
          styles.live,
          'absolute inset-0 rounded-full bg-emerald-400 opacity-0'
        )}
      />
      <span className='relative size-full rounded-full bg-emerald-500' />
    </span>
  );
}
