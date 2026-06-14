import { Plus } from 'lucide-react';

import { Container, Section, SectionHeading } from './primitives';
import { JsonLd, faqJsonLd } from './json-ld';

export type Faq = { question: string; answer: string };

/**
 * FAQ section built on native <details>/<summary>, so every question and answer
 * is present in the server-rendered HTML (good for crawlers and works without
 * JavaScript). Also emits FAQPage structured data.
 */
export function FaqSection({
  faqs,
  title = 'Frequently asked questions',
  description,
  withJsonLd = true
}: {
  faqs: Faq[];
  title?: string;
  description?: string;
  withJsonLd?: boolean;
}) {
  if (!faqs.length) return null;
  return (
    <Section id='faq'>
      <Container className='max-w-3xl'>
        <SectionHeading title={title} description={description} />
        <div className='mt-10 flex flex-col gap-3'>
          {faqs.map((faq) => (
            <details
              key={faq.question}
              className='group border-border/70 bg-card rounded-xl border px-5 py-4 [&_summary::-webkit-details-marker]:hidden'
            >
              <summary className='flex cursor-pointer list-none items-center justify-between gap-4 text-left font-medium'>
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
