import { useLocale, useTranslations } from 'next-intl';
import { ArrowRight } from 'lucide-react';

import { cn } from '@ringee/frontend-shared/lib/utils';
import { marketingLabels } from '../labels';
import { CTA } from '../site';
import { TeamPlanNote } from './team-plan-note';
import { ButtonLink, Container } from './primitives';
import styles from './cta-section.module.css';

/**
 * The call to action that closes every marketing page, standing on the
 * footer's giant logo: a title, a line of copy and one button.
 *
 * The footer renders it with the default copy (`placement='footer'`). A page
 * that wants its own copy ends with a `CtaSection`, which replaces the
 * footer's (`cta-section.module.css`), so a page never shows two. The default
 * copy follows the request's language, like the rest of the conversion copy.
 */
export function CtaSection({
  title,
  description,
  primaryHref = CTA.primary.href,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
  ai = false,
  placement = 'page'
}: {
  title?: string;
  description?: string;
  primaryHref?: string;
  primaryLabel?: string;
  /** A second destination specific to the page, such as its npm package. */
  secondaryHref?: string;
  secondaryLabel?: string;
  /** Adds the note that AI voice agents need the team plan. */
  ai?: boolean;
  placement?: 'page' | 'footer';
}) {
  const t = useTranslations('marketing.conversion');
  const labels = marketingLabels(useLocale().startsWith('es') ? 'es' : 'en');

  return (
    <section
      data-cta={placement}
      className={cn(
        placement === 'footer' && styles.footer,
        'pt-16 pb-10 text-center sm:pt-24 sm:pb-14'
      )}
    >
      <Container className='flex flex-col items-center'>
        <h2
          data-toc-ignore
          className='max-w-4xl text-4xl font-bold tracking-tight text-balance sm:text-5xl lg:text-6xl'
        >
          {title ?? labels.ctaTitle}
        </h2>
        <p className='text-muted-foreground mt-5 max-w-2xl text-lg text-pretty sm:text-xl'>
          {description ?? t('description')}
        </p>
        <div className='mt-8 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row sm:gap-4'>
          <ButtonLink href={primaryHref} size='lg'>
            {primaryLabel ?? labels.primaryLabel}
            <ArrowRight className='h-4 w-4' aria-hidden />
          </ButtonLink>
          {secondaryHref && secondaryLabel ? (
            <ButtonLink href={secondaryHref} variant='secondary' size='lg'>
              {secondaryLabel}
            </ButtonLink>
          ) : null}
        </div>
        {ai ? <TeamPlanNote ai className='mt-5' /> : null}
      </Container>
    </section>
  );
}
