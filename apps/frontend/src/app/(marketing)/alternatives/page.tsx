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
import { FaqSection } from '@/features/marketing/components/faq';
import { ALTERNATIVES } from '@/features/marketing/content/alternatives';
import { COMPARISONS } from '@/features/marketing/content/comparisons';
import { CALL_RATE_FROM } from '@/features/marketing/content/phone-numbers';

export const metadata: Metadata = buildMetadata({
  title: 'Ringee vs Aircall, Ringover, JustCall, Dapta & More',
  description:
    'Compare Ringee with Aircall, Ringover, JustCall, Dapta, Kixie and Orum: flat pricing, AI voice agents, a progressive dialer, BYOC and open source.',
  path: '/alternatives'
});

const DIFFERENTIATORS = [
  {
    title: 'Flat pricing, no per-user tax',
    body: 'Free for one person, then a flat $20/month per organization with unlimited users. A 12-person team pays $20/month flat instead of roughly $360/month on a typical ~$30/user tool.'
  },
  {
    title: 'Open source & self-hostable',
    body: 'The whole stack is MIT-licensed and on GitHub. Audit the code or run Ringee on your own infrastructure — something the proprietary alternatives do not offer.'
  },
  {
    title: 'Human + AI calling',
    body: 'Ringee is one calling stack for both operators: teammates can dial from its apps and SDK, while configured AI voice agents place outbound calls and hold conversations. MCP connects the whole workflow.'
  },
  {
    title: 'Pay-as-you-go calling',
    body: `Calling credits are billed separately from ${CALL_RATE_FROM}/min, so you only pay for the minutes you actually use instead of bundled-minute tiers.`
  }
];

const ALTERNATIVES_FAQS = [
  {
    question: 'What is the best alternative to per-user calling software?',
    answer:
      'If you want to avoid per-user pricing, Ringee offers a free plan for individuals and a flat $20/month organization plan with unlimited users, plus pay-as-you-go calling. It is also open source and self-hostable, unlike Aircall, JustCall, Kixie, and Orum.'
  },
  {
    question:
      'How does Ringee compare to Aircall, Ringover, JustCall, Kixie, and Orum?',
    answer:
      'All five are proprietary, SaaS-only tools priced per user. Ringee is open source, self-hostable, flat-priced with unlimited users, pay-as-you-go on calling, and natively driven by AI agents through an MCP server. See the individual comparison pages for a side-by-side table.'
  },
  {
    question: 'Is there a free Ringee plan?',
    answer:
      'Yes. The Freelancer plan is $0/month for one person and includes human calling, recording, transcription, meetings, integrations, and AI orchestration. AI voice agents and campaigns require an Organization workspace.'
  }
];

export default function AlternativesPage() {
  return (
    <DetailLayout
      items={[
        { name: 'Home', href: '/' },
        { name: 'Alternatives', href: '/alternatives' }
      ]}
    >
      <Section className='pt-8 pb-4'>
        <Container className='max-w-3xl'>
          <h1 className='text-4xl font-bold tracking-tight text-balance sm:text-5xl'>
            Ringee alternatives and comparisons
          </h1>
          <p className='text-muted-foreground mt-6 text-lg text-pretty'>
            Most outbound calling tools charge per user, keep your data locked
            in, and were built before AI agents could do real work. Ringee is
            the flat-priced, open-source infrastructure where human teams and AI
            voice agents call from the same stack. Here is how it compares to
            the tools teams evaluate most.
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

      <Section className='pt-0'>
        <Container>
          <SectionHeading
            title='Looking for alternatives to one tool?'
            description='Honest shortlists of the tools teams evaluate when they leave each one — Ringee included, and listed first because we make it.'
            align='left'
          />
          <div className='mt-10 grid gap-6 sm:grid-cols-2'>
            {ALTERNATIVES.map((page) => (
              <Link key={page.slug} href={`/alternatives/${page.slug}`}>
                <Card className='hover:border-foreground/30 flex h-full flex-col transition-colors'>
                  <div className='flex items-center justify-between gap-2'>
                    <h3 className='text-lg font-semibold'>
                      {page.competitor} alternatives
                    </h3>
                    <ArrowRight className='text-muted-foreground h-4 w-4' />
                  </div>
                  <p className='text-muted-foreground mt-2 text-sm text-pretty'>
                    {page.options
                      .slice(1)
                      .map((option) => option.name)
                      .join(', ')}{' '}
                    and Ringee, compared on pricing model and fit.
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
