import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight } from 'lucide-react';

import { buildMetadata } from '@/features/marketing/seo';
import { DetailLayout } from '@/features/marketing/components/detail-layout';
import {
  Card,
  Container,
  Section,
  SectionHeading
} from '@/features/marketing/components/primitives';
import { CtaSection } from '@/features/marketing/components/cta-section';
import { FaqSection } from '@/features/marketing/components/faq';
import { COMPARISONS } from '@/features/marketing/content/comparisons';

export const metadata: Metadata = buildMetadata({
  title: 'Ringee Alternatives — Aircall, JustCall, Kixie & Orum',
  description:
    'Compare Ringee to per-seat outbound calling tools like Aircall, JustCall, Kixie, and Orum. Flat team pricing, pay-as-you-go calling, open source, self-hostable, and agentic by design.',
  path: '/alternatives'
});

const DIFFERENTIATORS = [
  {
    title: 'Flat pricing, no per-seat tax',
    body: 'Free for one person, then a flat $20/month per organization with unlimited users. A 12-person team pays $20/month flat instead of roughly $360/month on a typical ~$30/seat tool.'
  },
  {
    title: 'Open source & self-hostable',
    body: 'The whole stack is MIT-licensed and on GitHub. Audit the code or run Ringee on your own infrastructure — something the proprietary alternatives do not offer.'
  },
  {
    title: 'Agentic by design',
    body: 'Ringee ships an MCP server, so Claude, ChatGPT, MCP agents, and the CLI can prospect, build lists, log outcomes, and book follow-ups. A human always takes the call.'
  },
  {
    title: 'Pay-as-you-go calling',
    body: 'Calling credits are billed separately from $0.012/min, so you only pay for the minutes you actually use instead of bundled-minute tiers.'
  }
];

const ALTERNATIVES_FAQS = [
  {
    question: 'What is the best alternative to per-seat calling software?',
    answer:
      'If you want to avoid per-seat pricing, Ringee offers a free plan for individuals and a flat $20/month organization plan with unlimited users, plus pay-as-you-go calling. It is also open source and self-hostable, unlike Aircall, JustCall, Kixie, and Orum.'
  },
  {
    question: 'How does Ringee compare to Aircall, JustCall, Kixie, and Orum?',
    answer:
      'All four are proprietary, SaaS-only tools priced per user. Ringee is open source, self-hostable, flat-priced with unlimited users, pay-as-you-go on calling, and natively driven by AI agents through an MCP server. See the individual comparison pages for a side-by-side table.'
  },
  {
    question: 'Is there a free Ringee plan?',
    answer:
      'Yes. The Freelancer plan is $0/month and includes every feature for one person. You only pay for the calling credits you use.'
  }
];

export default function AlternativesPage() {
  return (
    <DetailLayout
      items={[
        { name: 'Home', href: '/' },
        { name: 'Alternatives', href: '/alternatives' }
      ]}
      cta={<CtaSection />}
    >
      <Section className='pt-8 pb-4'>
        <Container className='max-w-3xl'>
          <h1 className='text-4xl font-bold tracking-tight text-balance sm:text-5xl'>
            Ringee alternatives and comparisons
          </h1>
          <p className='text-muted-foreground mt-6 text-lg text-pretty'>
            Most outbound calling tools charge per seat, keep your data locked
            in, and were built before AI agents could do real work. Ringee is
            the flat-priced, open-source, agentic alternative. Here is how it
            compares to the tools teams evaluate most.
          </p>
        </Container>
      </Section>

      <Section>
        <Container>
          <div className='grid gap-6 sm:grid-cols-2'>
            {COMPARISONS.map((comparison) => (
              <Link key={comparison.slug} href={`/compare/${comparison.slug}`}>
                <Card className='hover:border-foreground/30 flex h-full flex-col transition-colors'>
                  <div className='flex items-center justify-between gap-2'>
                    <h2 className='text-xl font-semibold'>
                      Ringee vs {comparison.competitor}
                    </h2>
                    <ArrowRight className='text-muted-foreground h-4 w-4' />
                  </div>
                  <p className='text-muted-foreground mt-2 text-sm text-pretty'>
                    {comparison.competitorBlurb}
                  </p>
                </Card>
              </Link>
            ))}
          </div>
        </Container>
      </Section>

      <Section className='bg-muted/20'>
        <Container>
          <SectionHeading
            eyebrow='Why switch'
            title='What sets Ringee apart'
            description='The differences that show up no matter which tool you compare against.'
          />
          <div className='mt-10 grid gap-6 md:grid-cols-2'>
            {DIFFERENTIATORS.map((item) => (
              <Card key={item.title} className='h-full'>
                <h3 className='text-lg font-semibold'>{item.title}</h3>
                <p className='text-muted-foreground mt-2 text-sm text-pretty'>
                  {item.body}
                </p>
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      <FaqSection faqs={ALTERNATIVES_FAQS} />
    </DetailLayout>
  );
}
