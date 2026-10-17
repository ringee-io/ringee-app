import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { IconLaurelWreath } from '@tabler/icons-react';
import { ArrowRight } from 'lucide-react';

import { cn } from '@ringee/frontend-shared/lib/utils';
import styles from './impulsate-banner.module.css';

/** Ringee's page in the Impúlsate Popular 2026 public vote. */
const VOTE_URL = 'https://www.impulsate.com.do/votar?proyecto=ringee';

/** Champagne gold, kept for the award: the laurel, the title, the prize. */
const GOLD = 'text-[#e9cf8f]';
const GOLD_TEXT =
  'bg-gradient-to-r from-[#f8e9bd] via-[#e9cf8f] to-[#d2aa60] bg-clip-text text-transparent';

const prize = (chunks: ReactNode) => (
  <strong className={cn(GOLD_TEXT, 'font-semibold tabular-nums')}>
    {chunks}
  </strong>
);

/**
 * Strip above the marketing header asking visitors to vote for Ringee, a
 * finalist in Impúlsate Popular 2026 (Banco Popular Dominicano's startup
 * programme). The most-voted project wins RD$300,000, about US$5K. Voting
 * asks only for a name and an email (confirmed with a code sent there), so
 * the strip is shown to every visitor; copy is `marketing.impulsateBanner`.
 *
 * Near-black in both themes, so it reads as one dark band over the light page
 * and stays apart from the green art below it in dark mode. Gold is kept for
 * the award; the only motion is a glint along the bottom hairline.
 *
 * Temporary: take it out once the vote closes (winners are announced on
 * 2026-11-12). The contest disqualifies projects that buy ads or influencers
 * to win votes; a banner on our own site is neither.
 */
export function ImpulsateBanner() {
  const t = useTranslations('marketing.impulsateBanner');

  return (
    <a
      href={VOTE_URL}
      target='_blank'
      rel='noreferrer noopener'
      className='group relative isolate block shrink-0 overflow-hidden bg-[#030b08] text-white focus-visible:ring-2 focus-visible:ring-[#e9cf8f]/70 focus-visible:outline-none focus-visible:ring-inset py-1'
    >
      {/* Light pooled behind the message; it rises a little on hover. */}
      <span
        aria-hidden
        className='absolute inset-0 -z-10 bg-[radial-gradient(42%_150%_at_50%_0%,rgba(16,185,129,0.3),transparent_75%)] opacity-80 transition-opacity duration-500 group-hover:opacity-100'
      />
      <span
        aria-hidden
        className={cn(styles.grain, 'absolute inset-0 -z-10')}
      />
      {/* The hairline that closes the strip, and the glint that runs it. */}
      <span
        aria-hidden
        className='absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#e9cf8f]/45 to-transparent'
      />
      <span
        aria-hidden
        className={cn(
          styles.glint,
          'absolute bottom-0 left-0 h-px w-40 bg-gradient-to-r from-transparent via-[#fbefc8] to-transparent shadow-[0_0_10px_1px_rgba(233,207,143,0.55)]'
        )}
      />

      <span className='mx-auto flex min-h-10 max-w-6xl items-center justify-center gap-2.5 px-4 py-1.5 text-[13px] leading-5 sm:min-h-11 sm:gap-3.5 lg:px-8'>
        <span className='hidden shrink-0 items-center gap-2 rounded-full border border-[#e9cf8f]/20 bg-white/[0.03] py-[3px] pr-3 pl-2 md:inline-flex'>
          <IconLaurelWreath
            aria-hidden
            stroke={1.5}
            className={cn('h-4 w-4', GOLD)}
          />
          <span
            className={cn(
              GOLD_TEXT,
              'text-[11px] font-semibold tracking-[0.14em] uppercase'
            )}
          >
            {t('finalist')}
          </span>
          <span aria-hidden className='h-3 w-px bg-white/15' />
          <span className='text-xs text-white/70'>{t('contest')}</span>
        </span>
        <IconLaurelWreath
          aria-hidden
          stroke={1.5}
          className={cn('h-4 w-4 shrink-0 md:hidden', GOLD)}
        />

        <span className='min-w-0 tracking-[-0.005em] text-white/75'>
          <span className='hidden lg:inline'>{t.rich('ask', { prize })}</span>
          <span className='lg:hidden'>{t.rich('short', { prize })}</span>
        </span>

        <span className='inline-flex shrink-0 items-center gap-1 rounded-full bg-white py-1 pr-2.5 pl-3 text-xs font-medium text-neutral-950 shadow-[0_0_0_1px_rgba(255,255,255,0.12),0_6px_20px_-6px_rgba(16,185,129,0.7)] transition-colors duration-300 group-hover:bg-[#fbf3dc]'>
          {t('cta')}
          <ArrowRight
            aria-hidden
            className='h-3.5 w-3.5 transition-transform duration-300 motion-safe:group-hover:translate-x-0.5'
          />
        </span>
      </span>
      <span className='sr-only'>{t('newTab')}</span>
    </a>
  );
}
