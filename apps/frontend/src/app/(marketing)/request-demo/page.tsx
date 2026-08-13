import type { Metadata } from 'next';

import { buildMetadata } from '@/features/marketing/seo';
import {
  Card,
  CheckList,
  Container,
  Eyebrow,
  Section
} from '@/features/marketing/components/primitives';
import { RequestDemoForm } from '@/features/marketing/components/request-demo-form';
import { TrustedBy } from '@/features/marketing/components/trusted-by';

export const metadata: Metadata = buildMetadata({
  title: 'Request a Demo — Get Your Ringee Account | Ringee',
  description:
    'Request access to Ringee. We review every profile and set up your account directly — no meeting required. Browser-based international calling, campaigns, recording and AI automation.',
  path: '/request-demo'
});

const WHAT_TO_EXPECT = [
  'We personally review your profile — no bots, no automated approvals',
  'Your account created for you and delivered by email, usually within one business day — no meeting required',
  'Pricing that fits your team: flat $20/month per organization, calls from $0.012/min',
  'Setup guidance included — numbers, caller ID rotation, CRM sync, and importing your leads'
];

export default function RequestDemoPage() {
  return (
    <>
      <Section className='pt-16 pb-10 sm:pt-24'>
        <Container className='grid items-start gap-12 lg:grid-cols-[1fr_minmax(0,520px)] lg:gap-16'>
          {/* Pitch */}
          <div className='flex flex-col gap-6'>
            <div className='flex flex-col gap-4'>
              <Eyebrow>Request a demo</Eyebrow>
              <h1 className='text-4xl font-bold tracking-tight text-balance sm:text-5xl'>
                See Ringee in action
              </h1>
              <p className='text-muted-foreground max-w-xl text-lg text-pretty'>
                Tell us a little about your team. We review every request, set
                up your account for you, and send access straight to your inbox
                — no sales call, no meeting to book.
              </p>
            </div>

            <div className='flex flex-col gap-4'>
              <h2 className='text-sm font-semibold tracking-wide uppercase'>
                What to expect
              </h2>
              <CheckList items={WHAT_TO_EXPECT} />
            </div>
          </div>

          {/* Form */}
          <Card className='p-6 sm:p-8'>
            <RequestDemoForm />
          </Card>
        </Container>
      </Section>

      <TrustedBy />
    </>
  );
}
