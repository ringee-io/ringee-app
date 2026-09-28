import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowRight, Check, X } from 'lucide-react';

import { buildMetadata } from '@/features/marketing/seo';
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
  COMPARISONS,
  getComparison,
  type ComparisonRow
} from '@/features/marketing/content/comparisons';
import { getAlternatives } from '@/features/marketing/content/alternatives';
import { SOLUTIONS } from '@/features/marketing/content/solutions';

type Params = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return COMPARISONS.map((comparison) => ({ slug: comparison.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const comparison = getComparison(slug);
  if (!comparison) return {};
  return buildMetadata({
    title: comparison.metaTitle,
    description: comparison.metaDescription,
    path: `/compare/${comparison.slug}`
  });
}

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
            aria-label='Advantage'
          />
        ) : null}
        <span>{value}</span>
      </span>
    </td>
  );
}

export default async function ComparePage({ params }: Params) {
  const { slug } = await params;
  const comparison = getComparison(slug);
  if (!comparison) notFound();

  const path = `/compare/${comparison.slug}`;
  const alternatives = getAlternatives(comparison.slug);
  const related = SOLUTIONS.map((solution) => ({
    name: solution.name,
    href: solution.path,
    tagline: solution.tagline
  }));

  return (
    <DetailLayout
      items={[
        { name: 'Home', href: '/' },
        { name: 'Alternatives', href: '/alternatives' },
        { name: `vs ${comparison.competitor}`, href: path }
      ]}
      cta={<CtaSection />}
    >
      <DetailHero
        eyebrow='Comparison'
        title={comparison.h1}
        intro={comparison.intro}
      />

      {comparison.summary ? (
        <Section className='pt-0 pb-0'>
          <Container>
            <Card className='border-emerald-500/25 bg-emerald-500/5'>
              <h2 className='text-lg font-semibold'>The short answer</h2>
              <CheckList items={comparison.summary} className='mt-4' />
            </Card>
          </Container>
        </Section>
      ) : null}

      <Section>
        <Container>
          <SectionHeading
            title={`Ringee vs ${comparison.competitor} at a glance`}
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
            A check marks the side a row favors. Comparison reflects each
            product&apos;s general positioning. Vendor features and pricing
            change — verify {comparison.competitor}&apos;s current details on
            its own website.
          </p>
        </Container>
      </Section>

      {comparison.perSeat ? (
        <Section id='cost' className='bg-muted/20'>
          <Container>
            <SectionHeading
              title='What your team would pay'
              description={`${comparison.competitor} is priced per user. Enter the per-user price you pay or were quoted to compare it with Ringee’s flat team plan.`}
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
                Why teams choose Ringee
              </h2>
              <CheckList items={comparison.whyRingee} className='mt-6' />
            </div>
            <div>
              <h2 className='text-2xl font-bold tracking-tight'>
                When {comparison.competitor} may fit better
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
              href={`/alternatives/${alternatives.slug}`}
              className='mt-10 inline-flex items-center gap-1.5 font-semibold text-emerald-700 hover:underline dark:text-emerald-400'
            >
              See the best {comparison.competitor} alternatives
              <ArrowRight className='h-4 w-4' aria-hidden />
            </Link>
          ) : null}
        </Container>
      </Section>

      {comparison.switching ? (
        <HowItWorksSteps
          title={`Switching from ${comparison.competitor}`}
          steps={comparison.switching}
        />
      ) : null}

      <RelatedLinks title='Explore Ringee' items={related} />
      <FaqSection faqs={comparison.faqs} />
    </DetailLayout>
  );
}
