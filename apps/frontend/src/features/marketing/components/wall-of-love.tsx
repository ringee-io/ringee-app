import type { CSSProperties, ReactNode } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { Heart, Mail, Sparkles, ThumbsUp, Video } from 'lucide-react';

import { cn } from '@ringee/frontend-shared/lib/utils';
import {
  homeWallEntries,
  WALL_OF_LOVE,
  type WallEntry,
  type WallSource
} from '../content/wall-of-love';
import { LINKEDIN_URL, TRUSTPILOT_URL } from '../site';
import { ButtonLink, Container, Section, SectionHeading } from './primitives';
import type { WallCardData, WallCardLabels } from './wall-of-love-card';
import {
  LinkedInMark,
  NETWORK_NAMES,
  TrustpilotMark,
  WhatsAppMark,
  XMark
} from './wall-of-love-marks';
import { WallGrid, WallShowcase } from './wall-of-love-motion';
import { STAGE_BADGE, WallStageBackdrop } from './wall-of-love-stage';
import styles from './wall-of-love.module.css';

type Translate = ReturnType<typeof useTranslations>;

function linkLabel(entry: WallEntry, t: Translate): string {
  const name = entry.author.name;
  if (entry.source === 'video') return t('openVideo', { name });
  const network = NETWORK_NAMES[entry.source];
  if (entry.source === 'trustpilot') return t('openReview', { name, network });
  if (entry.source === 'linkedin' && entry.kind === 'comment')
    return t('openComment', { name, network });
  return t('openPost', { name, network });
}

/**
 * The entries as cards: dates and every string a card shows, translated here
 * on the server, so the client-side takeover can render the same cards.
 */
function useWallCards(entries: WallEntry[]): {
  cards: WallCardData[];
  labels: WallCardLabels;
} {
  const t = useTranslations('marketing.wallOfLove.card');
  const format = useFormatter();

  const labels: WallCardLabels = {
    more: t('more'),
    less: t('less'),
    comment: t('comment'),
    viewScreenshot: t('viewScreenshot'),
    close: t('close'),
    rewarded: t('rewarded')
  };

  const cards = entries.map((entry): WallCardData => {
    const name = entry.author.name;
    return {
      entry,
      date: format.dateTime(new Date(entry.date), { dateStyle: 'medium' }),
      linkLabel: entry.url ? linkLabel(entry, t) : undefined,
      playLabel: t('playVideo', { name }),
      screenshotTitle:
        entry.source === 'email'
          ? t('emailScreenshotTitle', { name })
          : t('screenshotTitle', { name }),
      ratingLabel:
        entry.source === 'trustpilot'
          ? t('rating', { rating: entry.rating })
          : undefined,
      stats:
        entry.source === 'linkedin'
          ? {
              reactions: entry.reactions
                ? t('reactions', { count: entry.reactions })
                : undefined,
              comments: entry.comments
                ? t('comments', { count: entry.comments })
                : undefined,
              reposts: entry.reposts
                ? t('reposts', { count: entry.reposts })
                : undefined
            }
          : undefined
    };
  });

  return { cards, labels };
}

/** The home page's share of the wall, with the way to the rest. */
export function WallOfLoveSection() {
  const t = useTranslations('marketing.wallOfLove');
  const { cards: allCards, labels } = useWallCards(WALL_OF_LOVE);
  const featured = new Set(homeWallEntries().map((entry) => entry.id));
  const cards = allCards.filter((card) => featured.has(card.entry.id));
  if (cards.length === 0) return null;

  return (
    <Section id='wall-of-love' className='py-16 sm:py-20'>
      <Container>
        <SectionHeading
          eyebrow={t('eyebrow')}
          title={t('title')}
          description={t('description')}
        />
        <WallShowcase
          className='mt-12'
          cards={cards}
          allCards={allCards}
          labels={labels}
          takeover={{
            badge: t('takeover.badge'),
            title: t('takeover.title'),
            description: t('takeover.description'),
            close: t('takeover.close'),
            page: t('takeover.page')
          }}
        />
        <div className='mt-8 flex justify-center'>
          <ButtonLink href='/wall-of-love' variant='secondary' withArrow>
            {t('seeAll')}
          </ButtonLink>
        </div>
      </Container>
    </Section>
  );
}

/** Network marks floating around the page's hero. Decoration only. */
const FLOATING_MARKS: {
  position: string;
  delay: string;
  tilt: string;
  mark: ReactNode;
}[] = [
  {
    position: 'left-[6%] top-[8rem]',
    delay: '0s',
    tilt: '-6deg',
    mark: <LinkedInMark className='h-7 w-7 dark:text-[#4A9FEA]' />
  },
  {
    position: 'left-[15%] top-[19rem]',
    delay: '-2.5s',
    tilt: '5deg',
    mark: <Heart className='h-6 w-6 fill-pink-400 text-pink-400' />
  },
  {
    position: 'left-[5%] top-[29rem]',
    delay: '-5s',
    tilt: '-4deg',
    mark: <WhatsAppMark className='h-7 w-7' />
  },
  {
    position: 'right-[7%] top-[7rem]',
    delay: '-1.5s',
    tilt: '6deg',
    mark: <TrustpilotMark className='h-7 w-7' />
  },
  {
    position: 'right-[16%] top-[18rem]',
    delay: '-4s',
    tilt: '-5deg',
    mark: <ThumbsUp className='h-6 w-6 fill-[#4A9FEA] text-[#4A9FEA]' />
  },
  {
    position: 'right-[5%] top-[28rem]',
    delay: '-3s',
    tilt: '4deg',
    mark: <XMark className='h-5 w-5 text-neutral-900 dark:text-white' />
  }
];

/** Order and marks of the source counts under the hero. */
const SOURCES: { source: WallSource; mark: ReactNode }[] = [
  {
    source: 'linkedin',
    mark: <LinkedInMark className='h-4 w-4 dark:text-[#4A9FEA]' />
  },
  { source: 'whatsapp', mark: <WhatsAppMark className='h-4 w-4' /> },
  {
    source: 'email',
    mark: <Mail className='h-4 w-4 text-neutral-600 dark:text-white/80' />
  },
  { source: 'trustpilot', mark: <TrustpilotMark className='h-4 w-4' /> },
  {
    source: 'x',
    mark: <XMark className='h-3.5 w-3.5 text-neutral-900 dark:text-white' />
  },
  {
    source: 'video',
    mark: <Video className='h-4 w-4 text-neutral-600 dark:text-white/80' />
  }
];

/**
 * `/wall-of-love`: a stage in the site's theme with a moving aurora, rising
 * hearts and floating network marks, the whole wall on it, and how to get on
 * it.
 */
export function WallOfLoveStage() {
  const t = useTranslations('marketing.wallOfLove.page');
  const { cards, labels } = useWallCards(WALL_OF_LOVE);
  const counts = new Map<WallSource, number>();
  for (const entry of WALL_OF_LOVE)
    counts.set(entry.source, (counts.get(entry.source) ?? 0) + 1);

  return (
    <section
      className={cn(
        styles.stage,
        'mx-2 mt-2 rounded-[1.75rem] sm:mx-4 sm:rounded-[2rem] lg:mx-6'
      )}
    >
      <WallStageBackdrop />
      <div aria-hidden className='pointer-events-none absolute inset-0'>
        {FLOATING_MARKS.map(({ position, delay, tilt, mark }) => (
          <span
            key={position}
            style={{ '--delay': delay, '--tilt': tilt } as CSSProperties}
            className={cn(
              styles.float,
              'absolute hidden h-16 w-16 items-center justify-center rounded-2xl border border-black/[0.06] bg-white/70 shadow-[0_10px_30px_rgba(15,23,42,0.08)] backdrop-blur-md lg:flex dark:border-white/10 dark:bg-white/[0.06] dark:shadow-[0_10px_40px_rgba(0,0,0,0.45)]',
              position
            )}
          >
            {mark}
          </span>
        ))}
      </div>

      <Container className='relative pt-20 pb-14 text-center sm:pt-28 sm:pb-16'>
        <p className={STAGE_BADGE}>
          <Heart
            aria-hidden
            className={cn(
              'h-3.5 w-3.5 fill-pink-400 text-pink-400',
              styles.beat
            )}
          />
          {t('badge')}
        </p>
        <h1 className='mx-auto mt-6 max-w-4xl text-5xl font-bold tracking-tight text-balance sm:text-7xl'>
          {t.rich('title', {
            brand: (chunks) => (
              <span className='bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-600 bg-clip-text text-transparent dark:from-emerald-300 dark:via-teal-200 dark:to-cyan-300'>
                {chunks}
              </span>
            )
          })}
        </h1>
        <p className='text-muted-foreground mx-auto mt-6 max-w-2xl text-lg text-pretty'>
          {t('description')}
        </p>
        <ul className='mt-8 flex flex-wrap justify-center gap-2.5'>
          {SOURCES.filter(({ source }) => counts.get(source)).map(
            ({ source, mark }) => (
              <li
                key={source}
                className='inline-flex items-center gap-2 rounded-full border border-black/[0.06] bg-white/60 px-3.5 py-1.5 text-sm text-neutral-700 backdrop-blur dark:border-white/10 dark:bg-white/[0.06] dark:text-white/80'
              >
                {mark}
                {t(`sources.${source}`, { count: counts.get(source) ?? 0 })}
              </li>
            )
          )}
        </ul>
      </Container>

      <Container className='relative pb-16 sm:pb-20'>
        <WallGrid cards={cards} labels={labels} />
        <div className='mx-auto mt-8 flex max-w-3xl flex-col items-center gap-5 rounded-2xl border border-black/[0.06] bg-white/60 px-6 py-8 text-center backdrop-blur dark:border-white/10 dark:bg-white/[0.04]'>
          <p className='text-foreground/80 flex items-start gap-2 text-base text-pretty sm:items-center'>
            <Sparkles
              aria-hidden
              className='mt-1 h-4 w-4 shrink-0 text-emerald-600 sm:mt-0 dark:text-emerald-300'
            />
            {t('join')}
          </p>
          <div className='flex flex-wrap justify-center gap-3'>
            <a
              href={LINKEDIN_URL}
              target='_blank'
              rel='noreferrer noopener'
              className='bg-foreground text-background inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold shadow-lg transition-transform hover:scale-[1.03] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 active:scale-[0.98]'
            >
              <LinkedInMark className='h-4 w-4 text-[#4A9FEA] dark:text-[#0A66C2]' />
              {t('linkedin')}
            </a>
            <a
              href={TRUSTPILOT_URL}
              target='_blank'
              rel='noreferrer noopener'
              className='inline-flex h-11 items-center gap-2 rounded-xl border border-black/15 bg-white/60 px-5 text-sm font-semibold text-neutral-900 transition hover:scale-[1.03] hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 active:scale-[0.98] dark:border-white/20 dark:bg-white/5 dark:text-white dark:hover:bg-white/10'
            >
              <TrustpilotMark className='h-4 w-4' />
              {t('trustpilot')}
            </a>
          </div>
        </div>
      </Container>
    </section>
  );
}
