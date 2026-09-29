import { MarketingLink as Link } from './marketing-link';
import { ArrowRight, Check, X } from 'lucide-react';

import { CtaSection } from '@/features/marketing/components/cta-section';
import { DetailLayout } from '@/features/marketing/components/detail-layout';
import { FaqSection } from '@/features/marketing/components/faq';
import {
  Card,
  CheckList,
  Container,
  Section,
  SectionHeading
} from '@/features/marketing/components/primitives';
import {
  DetailHero,
  HowItWorksSteps,
  RelatedLinks
} from '@/features/marketing/components/detail';
import { ScalabilityCalculator } from '@/features/marketing/components/scalability-calculator';
import {
  type ComparisonContent,
  type ComparisonRow
} from '@/features/marketing/content/comparisons';
import { getAlternatives } from '@/features/marketing/content/alternatives';
import { ES_SOLUTIONS } from '../content/es/solutions';
import { localizedHref, type MarketingLocale } from '../locale';
import { marketingLabels } from '../labels';
import { LanguageLink } from './language-link';
import { SOLUTIONS } from '@/features/marketing/content/solutions';

/** A cell, marked when the row favors its side. */
function Cell({
  value,
  favored,
  muted
}: {
  value: string;
  favored: boolean;
  muted?: boolean;
}) {
  return (
    <td
      className={
        muted ? 'text-muted-foreground p-4 align-top' : 'p-4 align-top'
      }
    >
      <span className='flex items-start gap-2'>
        {favored ? (
          <Check
            className='mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400'
            aria-hidden
          />
        ) : null}
        <span>{value}</span>
      </span>
    </td>
  );
}

export function ComparisonPage({
  comparison,
  locale = 'en'
}: {
  comparison: ComparisonContent;
  locale?: MarketingLocale;
}) {
  const labels = marketingLabels(locale);
  const path = localizedHref(`/compare/${comparison.slug}`, locale);
  const alternatives = getAlternatives(comparison.slug);
  const related = [
    ...(locale === 'es' ? ES_SOLUTIONS : SOLUTIONS).map((solution) => ({
      name: solution.name,
      href: solution.path,
      tagline: solution.tagline
    })),
    {
      name: labels.pricing,
      href: '/pricing',
      tagline: labels.pricingTagline
    },
    {
      name: labels.numbers,
      href: '/phone-numbers',
      tagline: labels.numbersTagline
    }
  ];

  return (
    <DetailLayout
      items={[
        { name: labels.home, href: '/' },
        { name: labels.alternatives, href: '/alternatives' },
        { name: `vs ${comparison.competitor}`, href: path }
      ]}
      cta={
        <CtaSection
          title={labels.ctaTitle}
          primaryLabel={labels.primaryLabel}
          secondaryLabel={labels.secondaryLabel}
        />
      }
    >
      <LanguageLink path={path} locale={locale} />
      <DetailHero
        eyebrow={labels.comparison}
        title={comparison.h1}
        intro={comparison.intro}
        primaryLabel={labels.primaryLabel}
        secondaryLabel={labels.secondaryLabel}
      />

      {comparison.summary ? (
        <Section className='pt-0 pb-0'>
          <Container>
            <Card className='border-emerald-500/25 bg-emerald-500/5'>
              <h2 className='text-lg font-semibold'>{labels.shortAnswer}</h2>
              <CheckList items={comparison.summary} className='mt-4' />
            </Card>
          </Container>
        </Section>
      ) : null}

      <Section>
        <Container>
          <SectionHeading
            title={labels.glance(comparison.competitor)}
            align='left'
            as='h2'
          />
          <p className='text-muted-foreground mt-4 max-w-2xl'>
            {comparison.competitorBlurb}
          </p>
          <div className='border-border/70 mt-8 overflow-x-auto rounded-2xl border'>
            <table className='w-full border-collapse text-left text-sm'>
              <thead>
                <tr className='border-border/70 bg-muted/40 border-b'>
                  <th className='p-4 font-semibold'>&nbsp;</th>
                  <th className='p-4 font-semibold'>Ringee</th>
                  <th className='p-4 font-semibold'>{comparison.competitor}</th>
                </tr>
              </thead>
              <tbody>
                {comparison.rows.map((row: ComparisonRow) => (
                  <tr
                    key={row.label}
                    className='border-border/50 border-b last:border-0'
                  >
                    <th
                      scope='row'
                      className='text-foreground p-4 align-top font-medium'
                    >
                      {row.label}
                    </th>
                    <Cell value={row.ringee} favored={row.edge === 'ringee'} />
                    <Cell
                      value={row.competitor}
                      favored={row.edge === 'competitor'}
                      muted
                    />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className='text-muted-foreground mt-4 text-xs'>
            {labels.disclaimer(comparison.competitor)}
          </p>
        </Container>
      </Section>

      {comparison.perSeat ? (
        <Section id='cost' className='bg-muted/20'>
          <Container>
            <SectionHeading
              title={labels.teamCost}
              description={labels.teamCostDescription(comparison.competitor)}
              align='left'
              as='h2'
            />
            <div className='mt-10'>
              <ScalabilityCalculator />
            </div>
          </Container>
        </Section>
      ) : null}

      <Section className={comparison.perSeat ? undefined : 'bg-muted/20'}>
        <Container>
          <div className='grid gap-10 md:grid-cols-2'>
            <div>
              <h2 className='text-2xl font-bold tracking-tight'>
                {labels.whyRingee}
              </h2>
              <CheckList items={comparison.whyRingee} className='mt-6' />
            </div>
            <div>
              <h2 className='text-2xl font-bold tracking-tight'>
                {labels.whenCompetitor(comparison.competitor)}
              </h2>
              <ul className='mt-6 flex flex-col gap-3'>
                {comparison.whenCompetitor.map((item) => (
                  <li key={item} className='flex items-start gap-3'>
                    <X
                      className='mt-0.5 h-5 w-5 shrink-0 text-rose-500/80 dark:text-rose-400/80'
                      aria-hidden
                    />
                    <span className='text-muted-foreground'>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          {alternatives ? (
            <Link
              href={localizedHref(`/alternatives/${alternatives.slug}`, locale)}
              className='mt-10 inline-flex items-center gap-1.5 font-semibold text-emerald-700 hover:underline dark:text-emerald-400'
            >
              {labels.seeAlternatives(comparison.competitor)}
              <ArrowRight className='h-4 w-4' aria-hidden />
            </Link>
          ) : null}
        </Container>
      </Section>

      {comparison.switching ? (
        <HowItWorksSteps
          title={labels.switching(comparison.competitor)}
          steps={comparison.switching}
        />
      ) : null}

      <RelatedLinks title={labels.explore} items={related} />
      <FaqSection faqs={comparison.faqs} title={labels.faq} />
    </DetailLayout>
  );
}
