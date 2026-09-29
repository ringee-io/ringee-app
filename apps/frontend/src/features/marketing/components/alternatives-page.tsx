import { localizedHref, type MarketingLocale } from '../locale';
import { marketingLabels } from '../labels';
import { LanguageLink } from './language-link';
import { MarketingLink as Link } from './marketing-link';
import { ArrowRight, Minus } from 'lucide-react';

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
  type AlternativesContent,
  type AlternativeOption
} from '@/features/marketing/content/alternatives';

/** Anchor id for an option, e.g. "quo-formerly-openphone". */
function optionId(option: AlternativeOption): string {
  return option.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function OptionSection({
  option,
  position,
  locale
}: {
  option: AlternativeOption;
  position: number;
  locale: MarketingLocale;
}) {
  const labels = marketingLabels(locale);
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
              {labels.bestFor}
            </dt>
            <dd className='mt-1'>{option.bestFor}</dd>
          </div>
          <div>
            <dt className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
              {labels.pricingModel}
            </dt>
            <dd className='mt-1'>{option.pricingModel}</dd>
          </div>
        </dl>
        <div className='mt-8 grid gap-10 md:grid-cols-2'>
          <div>
            <h3 className='text-lg font-semibold'>{labels.strengths}</h3>
            <CheckList items={option.strengths} className='mt-4' />
          </div>
          <div>
            <h3 className='text-lg font-semibold'>{labels.watchOut}</h3>
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
          <CtaButtons
            className='mt-8'
            primaryLabel={labels.primaryLabel}
            secondaryLabel={labels.secondaryLabel}
          />
        ) : option.compareSlug ? (
          <Link
            href={localizedHref(`/compare/${option.compareSlug}`, locale)}
            className='mt-8 inline-flex items-center gap-1.5 font-semibold text-emerald-700 hover:underline dark:text-emerald-400'
          >
            {labels.sideBySide(option.name)}
            <ArrowRight className='h-4 w-4' aria-hidden />
          </Link>
        ) : null}
      </Container>
    </Section>
  );
}

export function AlternativesPage({
  page,
  locale = 'en'
}: {
  page: AlternativesContent;
  locale?: MarketingLocale;
}) {
  const labels = marketingLabels(locale);
  const path = localizedHref(`/alternatives/${page.slug}`, locale);

  return (
    <DetailLayout
      items={[
        { name: labels.home, href: '/' },
        ...(locale === 'es'
          ? []
          : [{ name: labels.alternatives, href: '/alternatives' }]),
        { name: labels.alternativesName(page.competitor), href: path }
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
        eyebrow={labels.alternatives}
        title={page.h1}
        intro={page.intro}
        primaryLabel={labels.primaryLabel}
        secondaryLabel={labels.secondaryLabel}
      />

      <Section className='pt-0'>
        <Container>
          <div className='grid gap-6 lg:grid-cols-2'>
            <Card className='h-full'>
              <h2 className='text-xl font-semibold'>
                {labels.beyond(page.competitor)}
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
              <h2 className='text-xl font-semibold'>{labels.howCompared}</h2>
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
            title={labels.alternativesGlance(page.competitor)}
            align='left'
            as='h2'
          />
          <div className='border-border/70 mt-8 overflow-x-auto rounded-2xl border'>
            <table className='w-full border-collapse text-left text-sm'>
              <thead>
                <tr className='border-border/70 bg-muted/40 border-b'>
                  <th className='p-4 font-semibold'>{labels.tool}</th>
                  <th className='p-4 font-semibold'>{labels.bestFor}</th>
                  <th className='p-4 font-semibold'>{labels.pricingModel}</th>
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
            {labels.alternativesDisclaimer}
          </p>
        </Container>
      </Section>

      {page.options.map((option, index) => (
        <OptionSection
          key={option.name}
          option={option}
          position={index + 1}
          locale={locale}
        />
      ))}

      <FaqSection faqs={page.faqs} title={labels.faq} />

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
