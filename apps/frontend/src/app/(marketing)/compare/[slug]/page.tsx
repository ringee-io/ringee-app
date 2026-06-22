import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Check, X } from 'lucide-react';

import { buildMetadata } from '@/features/marketing/seo';
import { CtaSection } from '@/features/marketing/components/cta-section';
import { DetailLayout } from '@/features/marketing/components/detail-layout';
import { FaqSection } from '@/features/marketing/components/faq';
import {
  CheckList,
  Container,
  Section,
  SectionHeading
} from '@/features/marketing/components/primitives';
import { DetailHero } from '@/features/marketing/components/detail';
import {
  COMPARISONS,
  getComparison
} from '@/features/marketing/content/comparisons';

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

export default async function ComparePage({ params }: Params) {
  const { slug } = await params;
  const comparison = getComparison(slug);
  if (!comparison) notFound();

  const path = `/compare/${comparison.slug}`;

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
                {comparison.rows.map((row) => (
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
                    <td className='p-4 align-top'>
                      <span className='flex items-start gap-2'>
                        <Check
                          className='mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400'
                          aria-hidden
                        />
                        <span>{row.ringee}</span>
                      </span>
                    </td>
                    <td className='text-muted-foreground p-4 align-top'>
                      {row.competitor}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className='text-muted-foreground mt-4 text-xs'>
            Comparison reflects each product&apos;s general positioning. Vendor
            features and pricing change — verify {comparison.competitor}&apos;s
            current details on its own website.
          </p>
        </Container>
      </Section>

      <Section className='bg-muted/20'>
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
        </Container>
      </Section>

      <FaqSection faqs={comparison.faqs} />
    </DetailLayout>
  );
}
