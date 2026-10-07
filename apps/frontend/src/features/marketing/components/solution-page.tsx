import type { Metadata } from 'next';
import { Check } from 'lucide-react';

import { buildMetadata } from '../seo';
import {
  languageAlternates,
  marketingLocaleFromPath,
  type MarketingLocale
} from '../locale';
import { marketingLabels } from '../labels';
import { LanguageLink } from './language-link';
import { SITE_URL } from '../site';
import type { SolutionContent, SolutionSection } from '../content/solutions';
import { CtaSection } from './cta-section';
import { DetailLayout } from './detail-layout';
import {
  DetailHero,
  HowItWorksSteps,
  NamedSection,
  RelatedLinks,
  WhoForAndBenefits
} from './detail';
import { FaqSection } from './faq';
import { JsonLd } from './json-ld';
import { MarketingVideo } from './marketing-video';
import {
  ButtonLink,
  Card,
  Container,
  Section,
  SectionHeading
} from './primitives';

export function solutionMetadata(solution: SolutionContent): Metadata {
  return buildMetadata({
    title: solution.metaTitle,
    description: solution.metaDescription,
    path: solution.path,
    locale: marketingLocaleFromPath(solution.path),
    languages: languageAlternates(solution.path.replace(/^\/es(?=\/)/, ''))
  });
}

/** A comparison table in the same style as the /compare pages. */
function SolutionTable({
  section
}: {
  section: Extract<SolutionSection, { kind: 'table' }>;
}) {
  const [labelHeader, ...valueHeaders] = section.columns;
  return (
    <>
      <div className='border-border/70 overflow-x-auto rounded-2xl border'>
        <table className='w-full border-collapse text-left text-sm'>
          <thead>
            <tr className='border-border/70 bg-muted/40 border-b'>
              <th className='p-4 font-semibold'>{labelHeader || ' '}</th>
              {valueHeaders.map((header) => (
                <th key={header} className='p-4 font-semibold'>
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {section.rows.map(([label, ...values]) => (
              <tr
                key={label}
                className='border-border/50 border-b last:border-0'
              >
                <th
                  scope='row'
                  className='text-foreground p-4 align-top font-medium'
                >
                  {label}
                </th>
                {values.map((value, index) => (
                  <td
                    key={`${label}-${valueHeaders[index]}`}
                    className='text-muted-foreground p-4 align-top'
                  >
                    {value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {section.note ? (
        <p className='text-muted-foreground mt-4 max-w-3xl text-sm text-pretty'>
          {section.note}
        </p>
      ) : null}
    </>
  );
}

function SolutionSectionBlock({
  section,
  muted
}: {
  section: SolutionSection;
  muted: boolean;
}) {
  const body =
    section.kind === 'table' ? (
      <SolutionTable section={section} />
    ) : section.kind === 'cards' ? (
      <div className='grid gap-5 sm:grid-cols-2'>
        {section.items.map((item) => (
          <Card key={item.title} className='h-full'>
            <h3 className='text-lg font-semibold'>{item.title}</h3>
            <p className='text-muted-foreground mt-2 text-sm text-pretty'>
              {item.description}
            </p>
          </Card>
        ))}
      </div>
    ) : section.kind === 'video' ? (
      <MarketingVideo id={section.video} className='max-w-3xl' />
    ) : (
      <ul className='flex max-w-3xl flex-col gap-3'>
        {section.items.map((item) => (
          <li key={item} className='flex items-start gap-3'>
            <Check
              className='mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400'
              aria-hidden
            />
            <span className='text-muted-foreground'>{item}</span>
          </li>
        ))}
      </ul>
    );

  return (
    <NamedSection
      title={section.title}
      description={section.description}
      muted={muted}
    >
      {body}
    </NamedSection>
  );
}

/**
 * The template behind every solution page (`content/solutions.ts`). It is made
 * of the same detail primitives as the feature and integration pages, in the
 * order a buyer reads: what it is, who it is for, what it does, how to start,
 * the comparisons and guardrails, what it costs, then the FAQ.
 */
export function SolutionPage({
  solution,
  locale = marketingLocaleFromPath(solution.path)
}: {
  solution: SolutionContent;
  locale?: MarketingLocale;
}) {
  const labels = marketingLabels(locale);
  const crumbs = [
    { name: labels.home, href: '/' },
    ...(solution.parent ? [solution.parent] : []),
    { name: solution.name, href: solution.path }
  ];

  return (
    <DetailLayout
      items={crumbs}
      cta={
        <CtaSection
          title={solution.cta.title}
          description={solution.cta.description}
          ai={solution.ai}
          primaryLabel={labels.primaryLabel}
        />
      }
    >
      <LanguageLink path={solution.path} locale={locale} />
      <DetailHero
        eyebrow={solution.eyebrow}
        title={solution.h1}
        intro={solution.intro}
        primaryLabel={labels.primaryLabel}
        secondaryLabel={labels.secondaryLabel}
        video={solution.video}
      />

      <WhoForAndBenefits
        whoFor={solution.whoFor}
        benefits={solution.benefits}
        whoForTitle={labels.whoFor}
        benefitsTitle={labels.benefits}
      />

      <NamedSection title={solution.capabilitiesTitle} muted>
        <div className='grid gap-5 sm:grid-cols-2 lg:grid-cols-3'>
          {solution.capabilities.map((capability) => (
            <Card key={capability.title} className='h-full'>
              <h3 className='text-lg font-semibold'>{capability.title}</h3>
              <p className='text-muted-foreground mt-2 text-sm text-pretty'>
                {capability.description}
              </p>
            </Card>
          ))}
        </div>
      </NamedSection>

      <HowItWorksSteps
        title={solution.howItWorksTitle}
        steps={solution.howItWorks}
      />

      {solution.sections.map((section, index) => (
        <SolutionSectionBlock
          key={section.id}
          section={section}
          muted={index % 2 === 1}
        />
      ))}

      <Section id='pricing'>
        <Container>
          <SectionHeading title={solution.pricing.title} align='left' as='h2' />
          <div className='mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start'>
            <div className='flex max-w-3xl flex-col gap-4'>
              {solution.pricing.body.map((paragraph) => (
                <p
                  key={paragraph.slice(0, 40)}
                  className='text-muted-foreground text-lg text-pretty'
                >
                  {paragraph}
                </p>
              ))}
            </div>
            <div className='flex flex-col gap-3 sm:flex-row lg:flex-col'>
              <ButtonLink href='/pricing' variant='secondary'>
                {labels.plans}
              </ButtonLink>
              <ButtonLink href='/phone-numbers' variant='secondary'>
                {labels.rates}
              </ButtonLink>
            </div>
          </div>
        </Container>
      </Section>

      <RelatedLinks title={labels.related} items={solution.related} />
      <FaqSection faqs={solution.faqs} title={labels.faq} />

      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          inLanguage: locale,
          '@id': `${SITE_URL}${solution.path}#webpage`,
          url: `${SITE_URL}${solution.path}`,
          name: solution.metaTitle,
          description: solution.metaDescription,
          isPartOf: { '@id': `${SITE_URL}/#website` },
          about: { '@id': `${SITE_URL}/#software` }
        }}
      />
    </DetailLayout>
  );
}
