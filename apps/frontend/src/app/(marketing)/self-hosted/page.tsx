import type { Metadata } from 'next';
import { Check, CloudCog, ServerCog } from 'lucide-react';

import { buildMetadata } from '@/features/marketing/seo';
import {
  Card,
  CheckList,
  Container,
  CtaButtons,
  Section,
  SectionHeading
} from '@/features/marketing/components/primitives';
import { Breadcrumbs } from '@/features/marketing/components/breadcrumbs';
import { CtaSection } from '@/features/marketing/components/cta-section';
import { FaqSection } from '@/features/marketing/components/faq';
import { GITHUB_URL } from '@/features/marketing/site';

export const metadata: Metadata = buildMetadata({
  title: 'Self-Hosted Outbound Calling | Ringee',
  description:
    'Self-host Ringee on your own infrastructure for full control of your data and deployment. Available now because Ringee is open source. See what self-hosting requires.',
  path: '/self-hosted'
});

const REASONS = [
  'Keep all data on infrastructure you control',
  'Choose where recordings and contacts are stored',
  'Run the same open codebase as the hosted version',
  'Connect your own Telnyx, CRM, and storage accounts'
];

const REQUIREMENTS = [
  'A server or cloud environment to run the apps',
  'PostgreSQL and Redis',
  'A Telnyx account for telephony and numbers',
  'Clerk for authentication and Stripe for billing',
  'Object storage (S3-compatible) for recordings',
  'Comfort operating and updating your own deployment'
];

const SELF_HOSTED_FAQS = [
  {
    question: 'Is self-hosting available now?',
    answer:
      'Yes. Because Ringee is open source, you can self-host it today on your own infrastructure. It is best suited to teams comfortable running and maintaining their own deployment.'
  },
  {
    question: 'What do I need to bring?',
    answer:
      'A place to run the apps plus PostgreSQL and Redis, and accounts for the services Ringee relies on — Telnyx for telephony, Clerk for auth, Stripe for billing, and S3-compatible storage for recordings.'
  },
  {
    question: 'Is self-hosting cheaper than the cloud?',
    answer:
      'Self-hosting removes the subscription but adds the work of running infrastructure and the cost of the underlying services. The hosted plans are the simplest path for most teams.'
  },
  {
    question: 'Can I move from cloud to self-hosted later?',
    answer:
      'Self-hosting runs the same open codebase as the hosted version, so you can choose the model that fits your team as your needs change.'
  }
];

export default function SelfHostedPage() {
  return (
    <>
      <Breadcrumbs
        items={[
          { name: 'Home', href: '/' },
          { name: 'Self-hosted', href: '/self-hosted' }
        ]}
      />
      <Section className='pt-8 pb-4'>
        <Container className='max-w-3xl'>
          <div className='border-border/70 bg-muted/40 text-muted-foreground mb-6 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium'>
            <ServerCog className='h-3.5 w-3.5' /> Available now · open source
          </div>
          <h1 className='text-4xl font-bold tracking-tight text-balance sm:text-5xl'>
            Self-host Ringee for full control
          </h1>
          <p className='text-muted-foreground mt-6 text-lg text-pretty'>
            Ringee is open source, so self-hosting is available today. Run it on
            your own infrastructure to own your data and deployment end to end.
            It’s best suited to teams comfortable operating their own stack —
            everyone else can use the hosted cloud.
          </p>
          <div className='mt-8'>
            <CtaButtons
              primaryHref={GITHUB_URL}
              primaryLabel='Get the code on GitHub'
              secondaryHref='/pricing'
              secondaryLabel='Compare with cloud'
            />
          </div>
        </Container>
      </Section>

      <Section className='pt-4'>
        <Container>
          <div className='grid gap-5 md:grid-cols-2'>
            <Card>
              <ServerCog className='text-primary h-7 w-7' />
              <h2 className='mt-4 text-xl font-semibold'>Why self-host</h2>
              <CheckList items={REASONS} className='mt-5' />
            </Card>
            <Card>
              <CloudCog className='text-primary h-7 w-7' />
              <h2 className='mt-4 text-xl font-semibold'>What you’ll need</h2>
              <CheckList items={REQUIREMENTS} className='mt-5' />
            </Card>
          </div>
        </Container>
      </Section>

      <Section className='bg-muted/20'>
        <Container>
          <SectionHeading
            title='Prefer the easy path?'
            description='The hosted cloud runs the same Ringee with none of the operations work. Start free as a freelancer or run your team for a flat $20/month.'
          />
          <ul className='text-muted-foreground mx-auto mt-6 flex max-w-xl flex-col gap-2 text-sm'>
            {[
              'No infrastructure to run or update',
              'Unlimited users on the Organization plan',
              'Pay only for calling credits'
            ].map((item) => (
              <li key={item} className='flex items-center justify-center gap-2'>
                <Check className='text-primary h-4 w-4' /> {item}
              </li>
            ))}
          </ul>
        </Container>
      </Section>

      <FaqSection faqs={SELF_HOSTED_FAQS} />

      <CtaSection
        title='Start with the cloud, switch to self-hosted anytime'
        description='Create a free account to try Ringee, or grab the code and run it yourself.'
        secondaryHref={GITHUB_URL}
        secondaryLabel='View on GitHub'
      />
    </>
  );
}
