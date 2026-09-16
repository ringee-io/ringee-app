import Link from 'next/link';
import type { Metadata } from 'next';
import { Check } from 'lucide-react';

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
import {
  JsonLd,
  softwareAppJsonLd
} from '@/features/marketing/components/json-ld';
import { ScalabilityCalculator } from '@/features/marketing/components/scalability-calculator';
import { PRICING, REQUEST_DEMO_URL, SITE_URL } from '@/features/marketing/site';

export const metadata: Metadata = buildMetadata({
  title: 'Pricing — Free Freelancer, $20/mo Organization | Ringee',
  description:
    'Ringee pricing: Freelancer is $0/month for human calling; Organization is $20/month with unlimited users, campaigns, and AI voice agents. Usage is pay as you go.',
  path: '/pricing'
});

const PLANS = [
  {
    name: PRICING.freelancer.name,
    price: PRICING.freelancer.price,
    period: 'forever',
    description: PRICING.freelancer.blurb,
    cta: 'Request Demo',
    highlighted: false,
    tagline: 'Human calling and automation for one person.',
    features: [
      'Single user — your own solo workspace',
      'Manual dialer — call from your browser and iOS',
      'Contacts, notes, and call outcomes',
      'Callbacks and meeting scheduling (Google Calendar)',
      'Call recording and real-time transcription',
      'Lead prospecting with Apollo and Prospeo',
      'CRM sync with Attio and Odoo',
      'AI orchestration — ChatGPT, Claude, MCP, CLI, and webhooks',
      'Pay only for the calling credits you use'
    ]
  },
  {
    name: PRICING.organization.name,
    price: PRICING.organization.price,
    period: 'per organization / month',
    description: PRICING.organization.blurb,
    cta: 'Request Demo',
    highlighted: true,
    tagline: 'For teams that run outbound together.',
    features: [
      'Everything in Freelancer, plus:',
      'Create an organization for your team',
      'Unlimited team members — invite and call together',
      'Calling campaigns',
      'AI voice agents that place and hold outbound calls'
      // 'Shared contacts and call activity',
      // 'Team-wide recording and transcription settings'
    ]
  }
];

const PRICING_FAQS = [
  {
    question: 'How much does Ringee cost?',
    answer:
      'The Freelancer plan is $0/month. The Organization plan is $20/month per organization and includes unlimited users. Calling credits are billed separately based on the minutes you use.'
  },
  {
    question: 'Do you charge per user?',
    answer:
      'No. The Organization plan is a flat $20/month for the whole organization, with unlimited users. There is no per-user pricing.'
  },
  {
    question: 'How are calling credits billed?',
    answer:
      'Calling is pay-as-you-go. Minutes are paid separately from your subscription as credits, and per-minute rates depend on the destination you call. You only pay for the calls you place.'
  },
  {
    question: 'What is the difference between Freelancer and Organization?',
    answer:
      'Freelancer gives one person Ringee’s human dialer, recording and real-time transcription, meetings, prospecting, CRM sync, and AI orchestration for free. The Organization plan adds unlimited members, calling campaigns, and AI voice agents for a flat $20/month subscription.'
  },
  {
    question: 'How are AI voice agent calls billed?',
    answer:
      'AI voice agents require an active Organization workspace. Each real call uses workspace credit for telephony plus voice and model usage, so its final cost depends on the destination and agent configuration. Browser test conversations do not place a phone call.'
  },
  {
    question: 'Can I start for free?',
    answer:
      'Yes. You can create a Freelancer account at no cost and place your first call after adding calling credits. No credit card is required to start.'
  },
  {
    question: 'Can I self-host instead?',
    answer:
      'Yes. Ringee is open source, so you can self-host it and run it on your own infrastructure.'
  }
];

export default function PricingPage() {
  return (
    <DetailLayout
      items={[
        { name: 'Home', href: '/' },
        { name: 'Pricing', href: '/pricing' }
      ]}
      showToc={false}
      cta={<CtaSection />}
    >
      <Section className='pt-8 pb-4'>
        <Container className='max-w-3xl text-center'>
          <h1 className='text-4xl font-bold tracking-tight text-balance sm:text-5xl'>
            Affordable pricing, no per-user fees
          </h1>
          <p className='text-muted-foreground mt-6 text-lg text-pretty'>
            Start human calling free as a freelancer, or run your whole team and
            AI voice agents on a flat $20 per month Organization plan with
            unlimited users. Calling and AI voice/model usage are billed
            separately from the subscription.
          </p>
        </Container>
      </Section>

      <Section className='pt-4'>
        <Container>
          <div className='mx-auto grid max-w-4xl gap-6 md:grid-cols-2'>
            {PLANS.map((plan) => (
              <Card
                key={plan.name}
                className={
                  plan.highlighted
                    ? 'flex flex-col border-emerald-500/40 ring-1 ring-emerald-500/20'
                    : 'flex flex-col'
                }
              >
                <div className='flex items-center justify-between'>
                  <h2 className='text-xl font-semibold'>{plan.name}</h2>
                  {plan.highlighted ? (
                    <span className='rounded-full bg-emerald-700 px-3 py-1 text-xs font-semibold text-white'>
                      Most popular
                    </span>
                  ) : null}
                </div>
                <p className='text-muted-foreground mt-1 text-sm'>
                  {plan.tagline}
                </p>
                <p className='mt-4 text-4xl font-bold'>
                  ${plan.price}
                  <span className='text-muted-foreground text-base font-normal'>
                    {' '}
                    /month
                  </span>
                </p>
                <p className='text-muted-foreground mt-1 text-sm'>
                  {plan.period === 'forever' ? 'Free forever' : plan.period}
                </p>
                <p className='text-muted-foreground mt-4 text-sm'>
                  {plan.description}
                </p>
                <ul className='mt-6 flex flex-1 flex-col gap-3'>
                  {plan.features.map((feature) => (
                    <li key={feature} className='flex items-start gap-3'>
                      <Check className='mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400' />
                      <span className='text-muted-foreground text-sm'>
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={REQUEST_DEMO_URL}
                  className={
                    plan.highlighted
                      ? 'mt-8 inline-flex h-11 items-center justify-center rounded-xl bg-emerald-700 px-6 text-sm font-semibold text-white hover:bg-emerald-700/90'
                      : 'border-border/80 hover:bg-muted/60 mt-8 inline-flex h-11 items-center justify-center rounded-xl border px-6 text-sm font-semibold'
                  }
                >
                  {plan.cta}
                </Link>
              </Card>
            ))}
          </div>
          <p className='text-muted-foreground mx-auto mt-6 max-w-2xl text-center text-sm'>
            Calling credits are billed separately, so you pay for the usage you
            create. AI voice-agent calls also include voice and model usage.
            There is no per-user price; add as many users as you need on the
            Organization plan.
          </p>
          <p className='mt-4 text-center text-sm'>
            <Link
              href='/phone-numbers'
              className='text-primary font-semibold hover:underline'
            >
              See phone number prices, call rates and AI voice agent cost for
              every country →
            </Link>
          </p>
        </Container>
      </Section>

      <Section className='bg-muted/20'>
        <Container>
          <SectionHeading
            eyebrow='Cost comparison'
            title='See what you save versus per-user pricing'
            description='Per-user tools get expensive fast as you add users. Ringee stays flat.'
          />
          <div className='mt-10'>
            <ScalabilityCalculator />
          </div>
        </Container>
      </Section>

      <FaqSection faqs={PRICING_FAQS} />

      <JsonLd
        data={softwareAppJsonLd({
          name: 'Ringee',
          description:
            'Open calling infrastructure with flat, per-organization pricing and no per-user fees. Freelancer is free for human calling; Organization is $20/month for unlimited users, campaigns, and AI voice agents.',
          url: SITE_URL
        })}
      />
    </DetailLayout>
  );
}
