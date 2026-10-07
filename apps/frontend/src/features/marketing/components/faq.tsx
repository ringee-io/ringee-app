import { Plus } from 'lucide-react';

import { cn } from '@ringee/frontend-shared/lib/utils';
import { Container, Eyebrow, Section, SectionHeading } from './primitives';
import { JsonLd, faqJsonLd } from './json-ld';

export type Faq = { question: string; answer: string };

/**
 * FAQ section built on native <details>/<summary>, so every question and answer
 * is present in the server-rendered HTML (good for crawlers and works without
 * JavaScript). Also emits FAQPage structured data.
 *
 * `split` sets the heading in a wide column of its own, beside larger
 * questions; the home page closes with it.
 */
export function FaqSection({
  faqs,
  title = 'Frequently asked questions',
  eyebrow,
  description,
  layout = 'stacked',
  withJsonLd = true
}: {
  faqs: Faq[];
  title?: string;
  eyebrow?: string;
  description?: string;
  layout?: 'stacked' | 'split';
  withJsonLd?: boolean;
}) {
  if (!faqs.length) return null;
  const split = layout === 'split';
  return (
    <Section id='faq'>
      <Container
        className={
          split
            ? 'grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)] lg:gap-16'
            : 'max-w-3xl'
        }
      >
        {split ? (
          <div className='lg:sticky lg:top-28 lg:self-start'>
            {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
            <h2 className='mt-4 text-4xl font-bold tracking-tight text-balance sm:text-5xl'>
              {title}
            </h2>
            {description ? (
              <p className='text-muted-foreground mt-5 text-lg text-pretty'>
                {description}
              </p>
            ) : null}
          </div>
        ) : (
          <SectionHeading
            eyebrow={eyebrow}
            title={title}
            description={description}
          />
        )}
        <div className={cn('flex flex-col gap-3', !split && 'mt-10')}>
          {faqs.map((faq) => (
            <details
              key={faq.question}
              className={cn(
                'group border-border/70 bg-card border [&_summary::-webkit-details-marker]:hidden',
                split ? 'rounded-2xl px-6 py-5' : 'rounded-xl px-5 py-4'
              )}
            >
              <summary
                className={cn(
                  'flex cursor-pointer list-none items-center justify-between gap-4 text-left',
                  split ? 'text-lg font-semibold' : 'font-medium'
                )}
              >
                {faq.question}
                <Plus
                  className='text-muted-foreground h-5 w-5 shrink-0 transition-transform group-open:rotate-45'
                  aria-hidden
                />
              </summary>
              <p className='text-muted-foreground mt-3 text-pretty'>
                {faq.answer}
              </p>
            </details>
          ))}
        </div>
      </Container>
      {withJsonLd ? <JsonLd data={faqJsonLd(faqs)} /> : null}
    </Section>
  );
}
