import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowRight, Minus } from 'lucide-react';

import { buildMetadata } from '@/features/marketing/seo';
import { CtaSection } from '@/features/marketing/components/cta-section';
import { DetailLayout } from '@/features/marketing/components/detail-layout';
import { DetailHero } from '@/features/marketing/components/detail';
import { FaqSection } from '@/features/marketing/components/faq';
import {
  JsonLd,
  itemListJsonLd
} from '@/features/marketing/components/json-ld';
import {
  Card,
  CheckList,
  Container,
  CtaButtons,
  Section,
  SectionHeading
} from '@/features/marketing/components/primitives';
import {
  ALTERNATIVES,
  getAlternatives,
  type AlternativeOption
} from '@/features/marketing/content/alternatives';

type Params = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return ALTERNATIVES.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const page = getAlternatives(slug);
  if (!page) return {};
  return buildMetadata({
    title: page.metaTitle,
    description: page.metaDescription,
    path: `/alternatives/${page.slug}`
  });
}

/** Anchor id for an option, e.g. "quo-formerly-openphone". */
function optionId(option: AlternativeOption): string {
  return option.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function OptionSection({
  option,
  position
}: {
  option: AlternativeOption;
  position: number;
}) {
  return (
    <Section
      id={optionId(option)}
      className={option.isRingee ? 'bg-emerald-500/5' : undefined}
    >
      <Container>
        <SectionHeading
          title={`${position}. ${option.name}`}
          description={option.summary}
          align='left'
          as='h2'
        />
        <dl className='mt-6 grid max-w-3xl gap-4 sm:grid-cols-2'>
          <div>
            <dt className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
              Best for
            </dt>
            <dd className='mt-1'>{option.bestFor}</dd>
          </div>
          <div>
            <dt className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
              Pricing model
            </dt>
            <dd className='mt-1'>{option.pricingModel}</dd>
          </div>
        </dl>
        <div className='mt-8 grid gap-10 md:grid-cols-2'>
          <div>
            <h3 className='text-lg font-semibold'>Strengths</h3>
            <CheckList items={option.strengths} className='mt-4' />
          </div>
          <div>
            <h3 className='text-lg font-semibold'>Watch out for</h3>
            <ul className='mt-4 flex flex-col gap-3'>
              {option.watchOuts.map((item) => (
                <li key={item} className='flex items-start gap-3'>
                  <Minus
                    className='text-muted-foreground mt-0.5 h-5 w-5 shrink-0'
                    aria-hidden
                  />
                  <span className='text-muted-foreground'>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        {option.isRingee ? (
          <CtaButtons className='mt-8' />
        ) : option.compareSlug ? (
          <Link
            href={`/compare/${option.compareSlug}`}
            className='mt-8 inline-flex items-center gap-1.5 font-semibold text-emerald-700 hover:underline dark:text-emerald-400'
          >
            Ringee vs {option.name}, side by side
            <ArrowRight className='h-4 w-4' aria-hidden />
          </Link>
        ) : null}
      </Container>
    </Section>
  );
}

export default async function AlternativesListPage({ params }: Params) {
  const { slug } = await params;
  const page = getAlternatives(slug);
  if (!page) notFound();

  const path = `/alternatives/${page.slug}`;

  return (
    <DetailLayout
      items={[
        { name: 'Home', href: '/' },
        { name: 'Alternatives', href: '/alternatives' },
        { name: `${page.competitor} alternatives`, href: path }
      ]}
      cta={<CtaSection />}
    >
      <DetailHero eyebrow='Alternatives' title={page.h1} intro={page.intro} />

      <Section className='pt-0'>
        <Container>
          <div className='grid gap-6 lg:grid-cols-2'>
            <Card className='h-full'>
              <h2 className='text-xl font-semibold'>
                Why teams look beyond {page.competitor}
              </h2>
              <ul className='mt-4 flex flex-col gap-3'>
                {page.reasons.map((reason) => (
                  <li key={reason} className='flex items-start gap-3'>
                    <Minus
                      className='text-muted-foreground mt-0.5 h-5 w-5 shrink-0'
                      aria-hidden
                    />
                    <span className='text-muted-foreground'>{reason}</span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card className='h-full'>
              <h2 className='text-xl font-semibold'>How we compared them</h2>
              <dl className='mt-4 flex flex-col gap-3'>
                {page.criteria.map((criterion) => (
                  <div key={criterion.title}>
                    <dt className='font-medium'>{criterion.title}</dt>
                    <dd className='text-muted-foreground text-sm'>
                      {criterion.description}
                    </dd>
                  </div>
                ))}
              </dl>
            </Card>
          </div>
        </Container>
      </Section>

      <Section className='bg-muted/20'>
        <Container>
          <SectionHeading
            title={`${page.competitor} alternatives at a glance`}
            align='left'
            as='h2'
          />
          <div className='border-border/70 mt-8 overflow-x-auto rounded-2xl border'>
            <table className='w-full border-collapse text-left text-sm'>
              <thead>
                <tr className='border-border/70 bg-muted/40 border-b'>
                  <th className='p-4 font-semibold'>Tool</th>
                  <th className='p-4 font-semibold'>Best for</th>
                  <th className='p-4 font-semibold'>Pricing model</th>
                </tr>
              </thead>
              <tbody>
                {page.options.map((option) => (
                  <tr
                    key={option.name}
                    className='border-border/50 border-b last:border-0'
                  >
                    <th
                      scope='row'
                      className='text-foreground p-4 align-top font-medium'
                    >
                      <a
                        href={`#${optionId(option)}`}
                        className='hover:underline'
                      >
                        {option.name}
                      </a>
                    </th>
                    <td className='text-muted-foreground p-4 align-top'>
                      {option.bestFor}
                    </td>
                    <td className='text-muted-foreground p-4 align-top'>
                      {option.pricingModel}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className='text-muted-foreground mt-4 text-xs'>
            We make Ringee, so it is listed first. Descriptions of other tools
            reflect their general positioning; features and pricing change, so
            check each vendor&apos;s current details on its own website.
          </p>
        </Container>
      </Section>

      {page.options.map((option, index) => (
        <OptionSection key={option.name} option={option} position={index + 1} />
      ))}

      <FaqSection faqs={page.faqs} />

      <JsonLd
        data={itemListJsonLd({
          name: page.h1,
          items: page.options.map((option) => ({
            name: option.name,
            href: `${path}#${optionId(option)}`
          }))
        })}
      />
    </DetailLayout>
  );
}
