import type { ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Check, X } from 'lucide-react';

import { cn } from '@ringee/frontend-shared/lib/utils';
import { localizedHref } from '../locale';
import { MarketingLink as Link } from './marketing-link';
import { Container, Section, SectionHeading } from './primitives';
import styles from './audience-fit.module.css';

/** Who Ringee is for, and who it is not; copy is `marketing.home.audience`. */
const FIT = ['solo', 'week', 'minutes', 'agents'] as const;
const NOT_FIT = ['procurement', 'rollout', 'seats', 'blackBox'] as const;

/** The roles a reader recognizes themselves in, each with its use case. */
const ROLES = [
  { id: 'founders', href: '/use-cases/startups' },
  { id: 'sdrs', href: '/use-cases/sdr-teams' },
  { id: 'freelancers', href: '/use-cases/freelancers' },
  { id: 'agencies', href: '/use-cases/agencies' },
  { id: 'recruiters', href: '/use-cases/recruiters' },
  { id: 'salesTeams', href: '/use-cases/outbound-sales' }
] as const;

function FitItem({ icon, children }: { icon: ReactNode; children: string }) {
  return (
    <li className={cn(styles.item, 'flex items-start gap-3.5')}>
      {icon}
      <span>{children}</span>
    </li>
  );
}

/**
 * "Sorry, enterprises": the home page's fit check. The reader finds their
 * role and their reasons on one side, and the buyer Ringee is not built for
 * on the other. Every line is a stance or something the product does today
 * (no per-user fees, access without a sales call, AI voice agents, open
 * source), never a figure.
 */
export function AudienceFitSection() {
  const t = useTranslations('marketing.home.audience');
  // One URL in every language; Spanish readers get a Spanish page wherever
  // one exists.
  const locale = useLocale().startsWith('es') ? 'es' : 'en';

  return (
    <Section id='who-its-for' className='py-16 sm:py-20'>
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

        <div className='mt-12 grid gap-5 lg:grid-cols-[1.12fr_0.88fr] lg:items-start lg:gap-6'>
          <article className='relative overflow-hidden rounded-[2rem] rounded-tl-[4.5rem] bg-emerald-50 p-7 ring-1 ring-emerald-900/10 ring-inset sm:p-10 dark:bg-emerald-950/40 dark:ring-emerald-400/15'>
            <div
              aria-hidden
              className='pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-emerald-400/20 blur-3xl dark:bg-emerald-500/15'
            />
            <h3 className='relative text-2xl font-semibold tracking-tight sm:text-[1.75rem]'>
              {t('fit.title')}
            </h3>
            <ul className='relative mt-7 space-y-5 text-lg leading-snug font-medium sm:text-xl'>
              {FIT.map((key) => (
                <FitItem
                  key={key}
                  icon={
                    <span className='mt-px flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white shadow-sm shadow-emerald-700/30'>
                      <Check aria-hidden className='h-4 w-4' strokeWidth={3} />
                    </span>
                  }
                >
                  {t(`fit.items.${key}`)}
                </FitItem>
              ))}
            </ul>

            <div className='relative mt-9 border-t border-emerald-900/10 pt-6 dark:border-emerald-400/15'>
              <p className='text-sm font-semibold text-emerald-800 dark:text-emerald-300'>
                {t('roles.label')}
              </p>
              <ul className='mt-3 flex flex-wrap gap-1.5'>
                {ROLES.map((role) => (
                  <li key={role.id}>
                    <Link
                      href={localizedHref(role.href, locale)}
                      className='inline-flex h-9 items-center rounded-full bg-white px-3.5 text-sm font-medium text-neutral-800 ring-1 ring-emerald-900/10 transition ring-inset hover:-translate-y-0.5 hover:ring-emerald-600/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 dark:bg-white/[0.06] dark:text-neutral-100 dark:ring-white/10 dark:hover:ring-emerald-400/40'
                    >
                      {t(`roles.items.${role.id}`)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </article>

          <article className='border-border bg-muted/30 rounded-[2rem] rounded-br-[4.5rem] border border-dashed p-7 sm:p-10 lg:mt-16'>
            <h3 className='text-muted-foreground text-xl font-semibold tracking-tight sm:text-2xl'>
              {t('notFit.title')}
            </h3>
            <ul className='text-muted-foreground mt-7 space-y-5 text-base leading-snug sm:text-lg'>
              {NOT_FIT.map((key) => (
                <FitItem
                  key={key}
                  icon={
                    <span className='flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400'>
                      <X aria-hidden className='h-3.5 w-3.5' strokeWidth={3} />
                    </span>
                  }
                >
                  {t(`notFit.items.${key}`)}
                </FitItem>
              ))}
            </ul>
          </article>
        </div>
      </Container>
    </Section>
  );
}
