import { useLocale, useTranslations } from 'next-intl';
import {
  ArrowRight,
  Bot,
  Check,
  PhoneCall,
  Sparkles,
  Target,
  type LucideIcon
} from 'lucide-react';

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

type GroupId = 'calling' | 'agents' | 'ai' | 'crm';

const GROUPS: { id: GroupId; icon: LucideIcon }[] = [
  { id: 'calling', icon: PhoneCall },
  { id: 'agents', icon: Bot },
  { id: 'ai', icon: Sparkles },
  { id: 'crm', icon: Target }
];

/**
 * One card per feature: what it does, the job it does for the reader, and
 * the page that goes deeper. Copy is `marketing.home.features.cards.<id>`;
 * every claim there is something the product does today (BUSINESS_RULES
 * names the rules behind the rotation, agent and calendar cards).
 */
const CARDS: {
  id: FeatureVisualId;
  group: GroupId;
  href: string;
  points: string[];
}[] = [
  {
    id: 'global',
    group: 'calling',
    href: '/features/outbound-calling',
    points: ['screens', 'click', 'payg']
  },
  {
    id: 'rotation',
    group: 'calling',
    href: '/features/caller-id-rotation',
    points: ['local', 'cap', 'health']
  },
  {
    id: 'numbers',
    group: 'calling',
    href: '/phone-numbers',
    points: ['countries', 'verified', 'inbound']
  },
  {
    id: 'campaigns',
    group: 'calling',
    href: '/sales-dialer',
    points: ['modes', 'rules', 'dnc']
  },
  {
    id: 'byoc',
    group: 'calling',
    href: '/byoc',
    points: ['sip', 'selfHosted', 'openSource']
  },
  {
    id: 'appointments',
    group: 'agents',
    href: '/ai-voice-agents',
    points: ['availability', 'callback', 'sync']
  },
  {
    id: 'receptionist',
    group: 'agents',
    href: '/ai-voice-agents',
    points: ['always', 'transfer', 'followUp']
  },
  {
    id: 'reminders',
    group: 'agents',
    href: '/ai-voice-agents',
    points: ['answer', 'callback', 'human']
  },
  {
    id: 'customize',
    group: 'agents',
    href: '/ai-voice-agents',
    points: ['clone', 'knowledge', 'model']
  },
  {
    id: 'assistants',
    group: 'ai',
    href: '/features/ai-call-automation',
    points: ['analyze', 'automate', 'act']
  },
  {
    id: 'insights',
    group: 'ai',
    href: '/features/call-transcription',
    points: ['live', 'objections', 'next']
  },
  {
    id: 'prospecting',
    group: 'crm',
    href: '/integrations/apollo',
    points: ['search', 'reveal', 'linkedin']
  },
  {
    id: 'followUp',
    group: 'crm',
    href: '/features/call-outcomes',
    points: ['outcomes', 'callbacks', 'meetings']
  },
  {
    id: 'crmSync',
    group: 'crm',
    href: '/features/crm-sync',
    points: ['crms', 'webhooks', 'api']
  }
];

/** Values the copy quotes, from the same sources the pricing pages use. */
const COPY_VALUES = {
  rate: CALL_RATE_FROM,
  countries: PHONE_NUMBER_COUNTRIES.length
};

function FeatureCard({
  card,
  group,
  href,
  more
}: {
  card: (typeof CARDS)[number];
  group: { label: string; icon: LucideIcon };
  href: string;
  more: string;
}) {
  const t = useTranslations(`marketing.home.features.cards.${card.id}`);
  const GroupIcon = group.icon;

  return (
    <article className='group border-border/70 bg-card text-card-foreground relative flex h-full w-[calc(100vw-4.5rem)] max-w-[24rem] flex-col rounded-[1.75rem] border p-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_32px_-24px_rgba(15,23,42,0.35)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_1px_2px_rgba(15,23,42,0.04),0_28px_56px_-28px_rgba(15,23,42,0.45)] sm:w-[24rem] lg:w-[27.5rem] lg:max-w-none dark:hover:border-white/20'>
      <FeatureVisual id={card.id} />
      <div className='flex flex-1 flex-col px-3.5 pt-6 pb-4 sm:px-4'>
        <p className='inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide text-emerald-700 uppercase dark:text-emerald-400'>
          <GroupIcon aria-hidden className='h-3.5 w-3.5' />
          {group.label}
        </p>
        <h3 className='mt-2.5 text-2xl leading-tight font-semibold tracking-tight text-balance sm:text-[1.625rem]'>
          <Link
            href={href}
            className='after:absolute after:inset-0 after:rounded-[1.75rem] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-emerald-500'
          >
            {t('title', COPY_VALUES)}
          </Link>
        </h3>
        <p className='text-foreground/70 mt-3 text-base leading-relaxed text-pretty sm:text-[1.0625rem]'>
          {t('useCase', COPY_VALUES)}
        </p>
        <ul className='mt-5 space-y-2.5 text-[0.9375rem] leading-snug'>
          {card.points.map((point) => (
            <li key={point} className='flex gap-2.5'>
              <Check
                aria-hidden
                className='mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400'
              />
              <span>
                <strong className='font-semibold'>
                  {t(`points.${point}.label`, COPY_VALUES)}
                </strong>{' '}
                <span className='text-muted-foreground'>
                  {t(`points.${point}.text`, COPY_VALUES)}
                </span>
              </span>
            </li>
          ))}
        </ul>
        <span
          aria-hidden
          className='mt-auto inline-flex items-center gap-1.5 pt-6 text-sm font-semibold text-emerald-700 dark:text-emerald-400'
        >
          {more}
          <ArrowRight className='h-4 w-4 transition-transform duration-300 group-hover:translate-x-1' />
        </span>
      </div>
    </article>
  );
}

/**
 * Home: every feature and voice agent as a large card in a full-width
 * carousel, grouped so a reader can jump to calling, agents, AI or CRM.
 */
export function FeatureCarouselSection() {
  const t = useTranslations('marketing.home.features');
  // The home page is one URL in every language; send Spanish readers to a
  // Spanish page wherever one exists.
  const locale = useLocale().startsWith('es') ? 'es' : 'en';

  const groups = GROUPS.map((group) => ({
    ...group,
    label: t(`groups.${group.id}`)
  }));
  const groupById = new Map(groups.map((group) => [group.id, group]));

  const slides: FeatureCarouselSlide[] = CARDS.map((card) => ({
    id: card.id,
    group: card.group,
    card: (
      <FeatureCard
        card={card}
        group={groupById.get(card.group)!}
        href={localizedHref(card.href, locale)}
        more={t('more')}
      />
    )
  }));

  return (
    <Section id='features' className='py-16 sm:py-20'>
      <Container>
        <SectionHeading
          eyebrow={t('eyebrow')}
          title={t('title')}
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
