import type { ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  BellRing,
  Bot,
  Cable,
  CalendarClock,
  Check,
  Hash,
  PhoneCall,
  RefreshCw,
  Sparkles,
  Target,
  type LucideIcon
} from 'lucide-react';

import { cn } from '@ringee/frontend-shared/lib/utils';
import {
  CALL_RATE_FROM,
  PHONE_NUMBER_COUNTRIES
} from '../content/phone-numbers';
import { localizedHref } from '../locale';
import { MarketingLink as Link } from './marketing-link';
import { Container, Section, SectionHeading } from './primitives';
import {
  FeatureCarouselTrack,
  type FeatureCarouselSlide
} from './feature-carousel-track';
import {
  FeatureVisual,
  type FeatureVisualId
} from './feature-carousel-visuals';
import styles from './feature-carousel.module.css';

type GroupId = 'calling' | 'agents' | 'ai' | 'crm';

const GROUPS: { id: GroupId; icon: LucideIcon }[] = [
  { id: 'calling', icon: PhoneCall },
  { id: 'agents', icon: Bot },
  { id: 'ai', icon: Sparkles },
  { id: 'crm', icon: Target }
];

type CardId =
  | 'global'
  | 'rotation'
  | 'numbers'
  | 'byoc'
  | 'campaigns'
  | 'receptionist'
  | 'appointments'
  | 'reminders'
  | 'customize'
  | 'insights'
  | 'assistants'
  | 'prospecting'
  | 'followUp'
  | 'crmSync';

type CardSpec = {
  id: CardId;
  href: string;
  points: string[];
  /** The product scene on a tall or wide card. */
  visual?: FeatureVisualId;
  /** The mark on a compact card, which has no scene. */
  icon?: LucideIcon;
};

/**
 * The carousel, in reading order. Each slide is a shape: an arch with one big
 * number, a wide card with a large scene, a tall card, or a pair of compact
 * cards. Copy is `marketing.home.features.cards.<id>`; every claim there is
 * something the product does today (BUSINESS_RULES names the rules behind
 * the rotation, agent and calendar cards).
 */
const SLIDES: {
  kind: 'arch' | 'wide' | 'tall' | 'pair';
  group: GroupId;
  night?: boolean;
  cards: CardSpec[];
}[] = [
  {
    kind: 'arch',
    group: 'calling',
    cards: [
      {
        id: 'global',
        href: '/features/outbound-calling',
        points: ['screens', 'click', 'payg']
      }
    ]
  },
  {
    kind: 'wide',
    group: 'calling',
    cards: [
      {
        id: 'rotation',
        href: '/features/caller-id-rotation',
        points: ['local', 'cap', 'health'],
        visual: 'rotation'
      }
    ]
  },
  {
    kind: 'pair',
    group: 'calling',
    cards: [
      {
        id: 'numbers',
        href: '/phone-numbers',
        points: ['countries', 'verified', 'inbound'],
        icon: Hash
      },
      {
        id: 'byoc',
        href: '/byoc',
        points: ['sip', 'selfHosted', 'openSource'],
        icon: Cable
      }
    ]
  },
  {
    kind: 'tall',
    group: 'calling',
    cards: [
      {
        id: 'campaigns',
        href: '/sales-dialer',
        points: ['modes', 'rules', 'dnc'],
        visual: 'campaigns'
      }
    ]
  },
  {
    kind: 'wide',
    group: 'agents',
    night: true,
    cards: [
      {
        id: 'receptionist',
        href: '/ai-voice-agents',
        points: ['always', 'transfer', 'followUp'],
        visual: 'receptionist'
      }
    ]
  },
  {
    kind: 'tall',
    group: 'agents',
    cards: [
      {
        id: 'appointments',
        href: '/ai-voice-agents',
        points: ['availability', 'callback', 'sync'],
        visual: 'appointments'
      }
    ]
  },
  {
    kind: 'pair',
    group: 'agents',
    cards: [
      {
        id: 'reminders',
        href: '/ai-voice-agents',
        points: ['answer', 'callback', 'human'],
        icon: BellRing
      },
      {
        id: 'customize',
        href: '/ai-voice-agents',
        points: ['clone', 'knowledge', 'model'],
        icon: AudioLines
      }
    ]
  },
  {
    kind: 'tall',
    group: 'ai',
    cards: [
      {
        id: 'insights',
        href: '/features/call-transcription',
        points: ['live', 'objections', 'next'],
        visual: 'insights'
      }
    ]
  },
  {
    kind: 'wide',
    group: 'ai',
    cards: [
      {
        id: 'assistants',
        href: '/features/ai-call-automation',
        points: ['analyze', 'automate', 'act'],
        visual: 'assistants'
      }
    ]
  },
  {
    kind: 'tall',
    group: 'crm',
    cards: [
      {
        id: 'prospecting',
        href: '/integrations/apollo',
        points: ['search', 'reveal', 'linkedin'],
        visual: 'prospecting'
      }
    ]
  },
  {
    kind: 'pair',
    group: 'crm',
    cards: [
      {
        id: 'followUp',
        href: '/features/call-outcomes',
        points: ['outcomes', 'callbacks', 'meetings'],
        icon: CalendarClock
      },
      {
        id: 'crmSync',
        href: '/features/crm-sync',
        points: ['crms', 'webhooks', 'api'],
        icon: RefreshCw
      }
    ]
  }
];

/** Values the copy quotes, from the same sources the pricing pages use. */
const COPY_VALUES = {
  rate: CALL_RATE_FROM,
  countries: PHONE_NUMBER_COUNTRIES.length
};

type CardProps = {
  card: CardSpec;
  group: { label: string; icon: LucideIcon };
  href: string;
  more: string;
};

/** Phone-width cards share one width; desktop shapes set their own. */
const PHONE_WIDTH = 'w-[calc(100vw-4.5rem)] max-w-[24rem]';

const CARD_SHADOW =
  'shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_32px_-24px_rgba(15,23,42,0.35)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_1px_2px_rgba(15,23,42,0.04),0_28px_56px_-28px_rgba(15,23,42,0.45)]';

const FOCUS_RING =
  'has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-4 has-[a:focus-visible]:outline-emerald-500';

function GroupTag({
  group,
  className
}: {
  group: CardProps['group'];
  className?: string;
}) {
  const Icon = group.icon;
  return (
    <p
      className={cn(
        'inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide text-emerald-700 uppercase dark:text-emerald-400',
        className
      )}
    >
      <Icon aria-hidden className='h-3.5 w-3.5' />
      {group.label}
    </p>
  );
}

/**
 * The card's title is its link; its overlay makes the whole card clickable.
 * The focus ring is drawn by the card (FOCUS_RING), so it follows its shape.
 */
function CardLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className='after:absolute after:inset-0 focus-visible:outline-none'
    >
      {children}
    </Link>
  );
}

function MoreLabel({
  children,
  className
}: {
  children: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'mt-auto inline-flex items-center gap-1.5 pt-6 text-sm font-semibold text-emerald-700 dark:text-emerald-400',
        className
      )}
    >
      {children}
      <ArrowRight className='h-4 w-4 transition-transform duration-300 group-hover:translate-x-1' />
    </span>
  );
}

function PointList({
  card,
  className,
  textClassName
}: {
  card: CardSpec;
  className?: string;
  textClassName?: string;
}) {
  const t = useTranslations(`marketing.home.features.cards.${card.id}`);
  return (
    <ul className={cn('space-y-2.5 text-[0.9375rem] leading-snug', className)}>
      {card.points.map((point) => (
        <li key={point} className='flex gap-2.5'>
          <Check
            aria-hidden
            className='mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400'
          />
          <span>
            <strong className='font-semibold'>
              {t(`points.${point}.label`, COPY_VALUES)}.
            </strong>{' '}
            <span className={cn('text-muted-foreground', textClassName)}>
              {t(`points.${point}.text`, COPY_VALUES)}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The point labels alone, for the cards with little room. */
function PointChips({
  card,
  className,
  chipClassName
}: {
  card: CardSpec;
  className?: string;
  chipClassName?: string;
}) {
  const t = useTranslations(`marketing.home.features.cards.${card.id}`);
  return (
    <ul className={cn('flex flex-wrap gap-1.5', className)}>
      {card.points.map((point) => (
        <li
          key={point}
          className={cn(
            'inline-flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-1 text-[0.8125rem] font-medium text-neutral-700 ring-1 ring-black/[0.06] ring-inset dark:bg-white/[0.06] dark:text-neutral-200 dark:ring-white/10',
            chipClassName
          )}
        >
          <Check
            aria-hidden
            className='h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400'
          />
          {t(`points.${point}.label`, COPY_VALUES)}
        </li>
      ))}
    </ul>
  );
}

/** An arch with the number that sums the feature up, turning like a globe. */
function ArchCard({ card, group, href, more }: CardProps) {
  const t = useTranslations(`marketing.home.features.cards.${card.id}`);
  return (
    <article
      className={cn(
        styles.arch,
        'group relative flex flex-col overflow-hidden text-white',
        CARD_SHADOW,
        FOCUS_RING
      )}
    >
      <div aria-hidden className={styles.rings}>
        <span style={{ width: '92%', height: '92%' }} />
        <span style={{ width: '70%', height: '70%' }} />
        <span style={{ width: '48%', height: '48%' }} />
        <span className={styles.orbit} style={{ width: '92%', height: '92%' }}>
          <i style={{ top: 'calc(50% - 3px)', left: '-3px' }} />
        </span>
        <span
          className={styles.orbit}
          style={{
            width: '70%',
            height: '70%',
            animationDuration: '13s',
            animationDirection: 'reverse'
          }}
        >
          <i style={{ top: '-3px', left: 'calc(50% - 3px)' }} />
        </span>
      </div>
      <div className='relative flex aspect-square w-full flex-col items-center justify-center px-8 pt-6 text-center'>
        <GroupTag
          group={group}
          className='text-emerald-300 dark:text-emerald-300'
        />
        <h3 className='mt-3 text-2xl leading-tight font-semibold tracking-tight'>
          <CardLink href={href}>
            {t.rich('title', {
              ...COPY_VALUES,
              stat: (chunks) => (
                <span className='my-1 block bg-gradient-to-b from-white to-emerald-200 bg-clip-text text-[5.5rem] leading-[0.95] font-bold tracking-[-0.06em] text-transparent'>
                  {chunks}
                </span>
              )
            })}
          </CardLink>
        </h3>
      </div>
      <div className='relative flex flex-1 flex-col items-center justify-center px-7 pb-8 text-center'>
        <p className='text-base leading-relaxed text-pretty text-white/80 sm:text-[1.0625rem]'>
          {t('useCase', COPY_VALUES)}
        </p>
        <PointChips
          card={card}
          className='mt-5 justify-center'
          chipClassName='bg-white/10 text-white ring-white/15 dark:bg-white/10 dark:text-white [&_svg]:text-emerald-300 dark:[&_svg]:text-emerald-300'
        />
        <MoreLabel className='mt-6 pt-0 text-emerald-300 dark:text-emerald-300'>
          {more}
        </MoreLabel>
      </div>
    </article>
  );
}

/** A wide card: the scene takes one side, so it can tell a longer story. */
function WideCard({
  card,
  group,
  href,
  more,
  night
}: CardProps & { night?: boolean }) {
  const t = useTranslations(`marketing.home.features.cards.${card.id}`);
  return (
    <article
      className={cn(
        'group relative flex flex-col rounded-[2rem] border p-2.5 lg:w-[48rem] lg:max-w-none lg:flex-row-reverse',
        PHONE_WIDTH,
        'sm:w-[24rem]',
        night
          ? 'border-white/10 bg-neutral-950 text-white dark:border-emerald-400/15 dark:bg-[#07100c]'
          : 'border-border/70 bg-card text-card-foreground dark:hover:border-white/20',
        CARD_SHADOW,
        FOCUS_RING
      )}
    >
      {card.visual ? (
        <FeatureVisual
          id={card.visual}
          night={night}
          className='rounded-[1.5rem] px-3 py-6 sm:px-5 lg:h-auto lg:w-[55%] lg:shrink-0 lg:py-0 [&>div]:transition-transform [&>div]:duration-500 lg:[&>div]:scale-[1.14] lg:group-hover:[&>div]:scale-[1.17]'
        />
      ) : null}
      <div className='flex flex-1 flex-col px-3.5 pt-6 pb-4 sm:px-4 lg:justify-center lg:px-7 lg:py-8'>
        <GroupTag
          group={group}
          className={night ? 'text-emerald-300 dark:text-emerald-300' : ''}
        />
        <h3 className='mt-2.5 text-2xl leading-tight font-semibold tracking-tight text-balance sm:text-[1.625rem] lg:text-[2.25rem]'>
          <CardLink href={href}>{t('title', COPY_VALUES)}</CardLink>
        </h3>
        <p
          className={cn(
            'mt-3 text-base leading-relaxed text-pretty sm:text-[1.0625rem] lg:mt-4 lg:text-xl',
            night ? 'text-white/75' : 'text-foreground/70'
          )}
        >
          {t('useCase', COPY_VALUES)}
        </p>
        <PointList
          card={card}
          className='mt-5 lg:mt-7 lg:space-y-3 lg:text-base'
          textClassName={night ? 'text-white/60' : undefined}
        />
        <MoreLabel
          className={cn(
            'lg:mt-9 lg:pt-0',
            night && 'text-emerald-300 dark:text-emerald-300'
          )}
        >
          {more}
        </MoreLabel>
      </div>
    </article>
  );
}

/** The everyday shape: the scene on top, the words below. */
function TallCard({ card, group, href, more }: CardProps) {
  const t = useTranslations(`marketing.home.features.cards.${card.id}`);
  return (
    <article
      className={cn(
        'group border-border/70 bg-card text-card-foreground relative flex flex-col rounded-[1.75rem] border p-2.5 sm:w-[24rem] lg:w-[26rem] lg:max-w-none dark:hover:border-white/20',
        PHONE_WIDTH,
        CARD_SHADOW,
        FOCUS_RING
      )}
    >
      {card.visual ? (
        <FeatureVisual
          id={card.visual}
          className='h-[14.5rem] shrink-0 rounded-[1.25rem]'
        />
      ) : null}
      <div className='flex flex-1 flex-col px-3.5 pt-6 pb-4 sm:px-4'>
        <GroupTag group={group} />
        <h3 className='mt-2.5 text-2xl leading-tight font-semibold tracking-tight text-balance sm:text-[1.625rem]'>
          <CardLink href={href}>{t('title', COPY_VALUES)}</CardLink>
        </h3>
        <p className='text-foreground/70 mt-3 text-base leading-relaxed text-pretty sm:text-[1.0625rem]'>
          {t('useCase', COPY_VALUES)}
        </p>
        <PointList card={card} className='mt-5' />
        <MoreLabel>{more}</MoreLabel>
      </div>
    </article>
  );
}

/**
 * Half a slide: a mark, the feature and its job, and its points as chips.
 * The pair's two cards mirror each other's big corner.
 */
function CompactCard({
  card,
  group,
  href,
  first
}: Omit<CardProps, 'more'> & { first: boolean }) {
  const t = useTranslations(`marketing.home.features.cards.${card.id}`);
  const Icon = card.icon ?? Check;
  const radius = first
    ? 'rounded-[1.5rem] rounded-tr-[4.5rem]'
    : 'rounded-[1.5rem] rounded-bl-[4.5rem]';
  return (
    <article
      className={cn(
        'group relative flex flex-1 flex-col border p-6',
        radius,
        first
          ? 'border-emerald-600/10 bg-emerald-50/80 dark:border-emerald-400/15 dark:bg-emerald-400/[0.07]'
          : 'border-border/70 bg-card text-card-foreground dark:hover:border-white/20',
        CARD_SHADOW,
        FOCUS_RING
      )}
    >
      <div className='flex items-start justify-between gap-4'>
        <GroupTag group={group} className='mt-1' />
        <span
          aria-hidden
          className={cn(
            'inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition-transform duration-500 group-hover:rotate-0',
            first
              ? '-mt-1 -mr-1 rotate-6 bg-emerald-600 text-white shadow-lg shadow-emerald-700/25 dark:bg-emerald-500 dark:text-emerald-950'
              : '-rotate-6 bg-neutral-900 text-white shadow-lg shadow-neutral-900/20 dark:bg-white dark:text-neutral-900'
          )}
        >
          <Icon className='h-6 w-6' />
        </span>
      </div>
      <h3 className='mt-3 text-xl leading-tight font-semibold tracking-tight text-balance sm:text-2xl'>
        <CardLink href={href}>{t('title', COPY_VALUES)}</CardLink>
      </h3>
      <p className='text-foreground/70 mt-2 text-[0.9375rem] leading-relaxed text-pretty sm:text-base'>
        {t('useCase', COPY_VALUES)}
      </p>
      <div className='mt-auto flex items-end justify-between gap-3 pt-4'>
        <PointChips card={card} />
        <ArrowUpRight
          aria-hidden
          className='h-5 w-5 shrink-0 text-emerald-700 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 dark:text-emerald-400'
        />
      </div>
    </article>
  );
}

/**
 * Home: every feature and voice agent as a card in a full-width carousel —
 * in shapes that change as you go, grouped so a reader can jump to calling,
 * agents, AI or CRM.
 */
export function FeatureCarouselSection() {
  const t = useTranslations('marketing.home.features');
  // The home page is one URL in every language; send Spanish readers to a
  // Spanish page wherever one exists.
  const locale = useLocale().startsWith('es') ? 'es' : 'en';
  const more = t('more');

  const groups = GROUPS.map((group) => ({
    ...group,
    label: t(`groups.${group.id}`)
  }));
  const groupById = new Map(groups.map((group) => [group.id, group]));

  const slides: FeatureCarouselSlide[] = SLIDES.map((slide) => {
    const group = groupById.get(slide.group)!;
    const props = (card: CardSpec) => ({
      card,
      group,
      href: localizedHref(card.href, locale)
    });
    const [first, second] = slide.cards;
    let content: ReactNode;
    if (slide.kind === 'arch') {
      content = <ArchCard {...props(first!)} more={more} />;
    } else if (slide.kind === 'wide') {
      content = <WideCard {...props(first!)} more={more} night={slide.night} />;
    } else if (slide.kind === 'tall') {
      content = <TallCard {...props(first!)} more={more} />;
    } else {
      content = (
        <div
          className={cn(
            'flex flex-col gap-4 sm:w-[22rem] sm:gap-6 lg:w-[23rem]',
            PHONE_WIDTH
          )}
        >
          <CompactCard {...props(first!)} first />
          <CompactCard {...props(second!)} first={false} />
        </div>
      );
    }
    return {
      id: slide.cards.map((card) => card.id).join('-'),
      group: slide.group,
      content
    };
  });

  return (
    <Section id='features' className='py-16 sm:py-20'>
      <Container>
        <SectionHeading
          eyebrow={t('eyebrow')}
          title={t.rich('title', {
            hl: (chunks) => (
              <span className='text-emerald-700 dark:text-emerald-400'>
                {chunks}
              </span>
            )
          })}
          description={t('description')}
        />
      </Container>
      <FeatureCarouselTrack
        className='mt-10'
        groups={groups.map(({ id, label, icon: Icon }) => ({
          id,
          label,
          icon: <Icon aria-hidden className='h-4 w-4' />
        }))}
        slides={slides}
        labels={{
          track: t('controls.track'),
          groups: t('controls.groups'),
          previous: t('controls.previous'),
          next: t('controls.next')
        }}
      />
    </Section>
  );
}
