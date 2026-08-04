import type { Metadata } from 'next';

import { buildMetadata } from '@/features/marketing/seo';
import { CtaSection } from '@/features/marketing/components/cta-section';
import { DetailLayout } from '@/features/marketing/components/detail-layout';
import { FaqSection } from '@/features/marketing/components/faq';
import { JsonLd } from '@/features/marketing/components/json-ld';
import {
  ButtonLink,
  Container,
  Section,
  SectionHeading
} from '@/features/marketing/components/primitives';
import { DOCS_URL, GITHUB_ORG_URL, SITE_URL } from '@/features/marketing/site';

export const metadata: Metadata = buildMetadata({
  title: 'About Ringee — Open-Source Outbound Calling',
  description:
    'Ringee is open-source, affordable outbound calling software built for the AI era. Learn what Ringee is, who it is for, and the principles behind how it is built.',
  path: '/about'
});

const PRINCIPLES = [
  {
    title: 'Affordable by default',
    body: 'Per-seat pricing punishes teams for growing. Ringee keeps a free Freelancer plan and a single flat $20/month Organization plan with unlimited users, plus pay-as-you-go calling from $0.012/min — so cost scales with usage, not headcount.'
  },
  {
    title: 'Agentic by design',
    body: 'Ringee ships a Model Context Protocol (MCP) server, so Claude, ChatGPT, any MCP-compatible agent, or the CLI can prospect leads, build call lists, log outcomes, and book follow-ups. Agents handle the busywork; a human always takes the call.'
  },
  {
    title: 'Open and self-hostable',
    body: 'The entire stack is open source under the MIT license and lives on GitHub. Audit the code, contribute back, or self-host Ringee on your own infrastructure and keep full control of your data.'
  },
  {
    title: 'Honest about trust',
    body: 'Ringee states plainly what it does and does not claim. It has not completed SOC 2 or ISO 27001 certification and does not pretend otherwise. Calls run on Telnyx, authentication on Clerk, and payments on Stripe.'
  }
];

const ABOUT_FAQS = [
  {
    question: 'What is Ringee?',
    answer:
      'Ringee is open-source, pay-as-you-go outbound calling software. It lets freelancers and teams call leads worldwide from the browser or iOS, run campaigns, record and transcribe calls in real time, book meetings to Google Calendar, sync CRMs, and automate outbound from Claude, ChatGPT, MCP agents, and the CLI — without per-seat pricing.'
  },
  {
    question: 'Who is Ringee for?',
    answer:
      'SDR teams, recruiters, agencies, startups, and freelancers who run outbound calling and want a fast dialer, clean activity data, and flat pricing that does not punish them for adding people.'
  },
  {
    question: 'Is Ringee really open source?',
    answer:
      'Yes. Ringee is licensed under MIT and the source is public on GitHub. You can self-host it on your own infrastructure.'
  },
  {
    question: 'How do I get in touch?',
    answer:
      'You can reach the team through the support page, open an issue or discussion on GitHub, or contact Ringee on X and LinkedIn.'
  }
];

export default function AboutPage() {
  return (
    <DetailLayout
      items={[
        { name: 'Home', href: '/' },
        { name: 'About', href: '/about' }
      ]}
      cta={<CtaSection />}
    >

      <Section className='pt-8 pb-4'>
        <Container className='max-w-3xl'>
          <h1 className='text-4xl font-bold tracking-tight text-balance sm:text-5xl'>
            About Ringee
          </h1>
          <div className='text-muted-foreground mt-6 flex flex-col gap-4 text-lg text-pretty'>
            <p>
              Ringee is open-source, pay-as-you-go outbound calling software
              built for the AI era. It gives freelancers, SDR teams, recruiters,
              agencies, and startups one place to call leads worldwide, follow
              up faster, record and transcribe conversations, and automate the
              busywork with AI — without expensive per-seat pricing.
            </p>
            <p>
              The project started from a simple frustration: outbound calling
              tools charge per seat, lock your data in, and were built before
              AI agents could do real work. Ringee takes the opposite stance —
              flat pricing, open source, self-hostable, and driven by the AI
              tools teams already use.
            </p>
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <SectionHeading
            title='What we believe'
            description='The principles that shape every decision in the product.'
            align='left'
          />
          <div className='mt-10 grid gap-6 md:grid-cols-2'>
            {PRINCIPLES.map((principle) => (
              <div
                key={principle.title}
                className='border-border/70 bg-card rounded-2xl border p-6'
              >
                <h2 className='text-xl font-semibold'>{principle.title}</h2>
                <p className='text-muted-foreground mt-3 text-pretty'>
                  {principle.body}
                </p>
              </div>
            ))}
          </div>
        </Container>
      </Section>

      <Section className='bg-muted/20'>
        <Container className='max-w-3xl'>
          <h2 className='text-2xl font-bold tracking-tight'>
            Who builds Ringee
          </h2>
          <p className='text-muted-foreground mt-4 text-pretty'>
            Ringee is built and maintained in the open by a small team that
            ships fast and listens to its users. Because the whole stack is
            public, you do not have to take that on faith — the code, the
            roadmap, and the issues are all on GitHub, and anyone can read,
            audit, or contribute to them.
          </p>
          <div className='mt-8 flex flex-wrap gap-3'>
            <ButtonLink href={GITHUB_ORG_URL} external withArrow>
              See the code on GitHub
            </ButtonLink>
            <ButtonLink
              href={DOCS_URL}
              variant='secondary'
              external
              withArrow
            >
              Developer docs
            </ButtonLink>
          </div>
        </Container>
      </Section>

      <FaqSection faqs={ABOUT_FAQS} />

      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'AboutPage',
          name: 'About Ringee',
          url: `${SITE_URL}/about`,
          description:
            'Ringee is open-source, affordable outbound calling software built for the AI era.',
          mainEntity: { '@id': `${SITE_URL}/#organization` }
        }}
      />
    </DetailLayout>
  );
}
