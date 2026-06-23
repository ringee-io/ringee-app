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
import { JsonLd } from '@/features/marketing/components/json-ld';
import { ScalabilityCalculator } from '@/features/marketing/components/scalability-calculator';
import {
  PRICING,
  SIGN_UP_URL,
  SITE_LAST_MODIFIED,
  SITE_URL
} from '@/features/marketing/site';

export const metadata: Metadata = buildMetadata({
  title: 'Pricing — Free Freelancer, $20/mo Organization | Ringee',
  description:
    'Ringee pricing: Freelancer is $0/month with every feature; Organization is $20/month with unlimited users. Pay-as-you-go calling, no per-seat fees.',
  path: '/pricing'
});

const PLANS = [
  {
    name: PRICING.freelancer.name,
    price: PRICING.freelancer.price,
    period: 'forever',
    description: PRICING.freelancer.blurb,
    cta: 'Start calling for free',
    highlighted: false,
    tagline: 'For one person — every feature, just no team.',
    features: [
      'Single user — your own solo workspace',
      'Manual dialer — call from your browser and iOS',
      'Contacts, notes, and call outcomes',
      'Callbacks and meeting scheduling (Google Calendar)',
      'Call recording and real-time transcription',
      'Lead prospecting with Apollo and Prospeo',
      'CRM sync with Attio and Odoo',
      'Full AI automation — ChatGPT, Claude, MCP, CLI, and webhooks',
      'Pay only for the calling credits you use'
    ]
  },
  {
    name: PRICING.organization.name,
    price: PRICING.organization.price,
    period: 'per organization / month',
    description: PRICING.organization.blurb,
    cta: 'Start calling for free',
    highlighted: true,
    tagline: 'For teams that run outbound together.',
    features: [
      'Everything in Freelancer, plus:',
      'Create an organization for your team',
      'Unlimited team members — invite and call together',
      'Calling campaigns',
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
      'No. The Organization plan is a flat $20/month for the whole organization, with unlimited users. There is no per-seat pricing.'
  },
  {
    question: 'How are calling credits billed?',
    answer:
      'Calling is pay-as-you-go. Minutes are paid separately from your subscription as credits, and per-minute rates depend on the destination you call. You only pay for the calls you place.'
  },
  {
    question: 'What is the difference between Freelancer and Organization?',
    answer:
      'Freelancer gives one person every Ringee feature — manual dialer, recording and real-time transcription, meetings with Google Calendar, lead prospecting, CRM sync, and full AI automation via ChatGPT, Claude, MCP, and the CLI — for free. The Organization plan adds only what a team needs: an organization, unlimited members you can invite, and calling campaigns, all for a flat $20/month.'
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
            Affordable pricing, no per-seat fees
          </h1>
          <p className='text-muted-foreground mt-6 text-lg text-pretty'>
            Start free as a freelancer with every feature, or run your whole
            team on a flat $20 per month per organization with unlimited users.
            Calling is pay-as-you-go — credits are billed separately, so you
            only pay for the minutes you use.
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
                  href={SIGN_UP_URL}
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
            Both plans are pay-as-you-go — calling credits are billed
            separately, so you only pay for the minutes you use. There is no
            expensive per-seat pricing; add as many users as you need on the
            Organization plan.
          </p>
        </Container>
      </Section>

      <Section className='bg-muted/20'>
        <Container>
          <SectionHeading
            eyebrow='Cost comparison'
            title='See what you save versus per-seat pricing'
            description='Per-seat tools get expensive fast as you add users. Ringee stays flat.'
          />
          <div className='mt-10'>
            <ScalabilityCalculator />
          </div>
        </Container>
      </Section>

      <FaqSection faqs={PRICING_FAQS} />

      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: 'Ringee',
          description:
            'Affordable outbound calling software with flat, per-organization pricing and no per-seat fees.',
          url: `${SITE_URL}/pricing`,
          brand: { '@type': 'Brand', name: 'Ringee' },
          dateModified: SITE_LAST_MODIFIED,
          offers: [
            {
              '@type': 'Offer',
              name: 'Freelancer',
              price: '0',
              priceCurrency: 'USD',
              availability: 'https://schema.org/InStock',
              url: `${SITE_URL}/pricing`,
              description:
                'Every Ringee feature for one person. Pay only for calling credits.'
            },
            {
              '@type': 'Offer',
              name: 'Organization',
              price: '20',
              priceCurrency: 'USD',
              availability: 'https://schema.org/InStock',
              url: `${SITE_URL}/pricing`,
              description: 'Per organization, per month. Unlimited users.'
            }
          ]
        }}
      />
    </DetailLayout>
  );
}
