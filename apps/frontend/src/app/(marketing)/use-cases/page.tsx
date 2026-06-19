import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight } from 'lucide-react';

import { buildMetadata } from '@/features/marketing/seo';
import {
  Card,
  Container,
  Section
} from '@/features/marketing/components/primitives';
import { Breadcrumbs } from '@/features/marketing/components/breadcrumbs';
import { CtaSection } from '@/features/marketing/components/cta-section';
import { USE_CASES } from '@/features/marketing/content/use-cases';

export const metadata: Metadata = buildMetadata({
  title: 'Outbound Use Cases — SDRs, Recruiters & Agencies | Ringee',
  description:
    'See how SDR teams, recruiters, agencies, freelancers, startups, and outbound sales teams use Ringee to call more leads and follow up faster — affordably.',
  path: '/use-cases'
});

export default function UseCasesPage() {
  return (
    <>
      <Breadcrumbs
        items={[
          { name: 'Home', href: '/' },
          { name: 'Use Cases', href: '/use-cases' }
        ]}
      />
      <Section className='pt-8 pb-4'>
        <Container className='max-w-3xl'>
          <h1 className='text-4xl font-bold tracking-tight text-balance sm:text-5xl'>
            Built for lean outbound teams
          </h1>
          <p className='text-muted-foreground mt-6 text-lg text-pretty'>
            Ringee gives outbound operators calling, follow-up, CRM sync, and AI
            automation without enterprise complexity. See how different teams put
            it to work.
          </p>
        </Container>
      </Section>

      <Section className='pt-4'>
        <Container>
          <div className='grid gap-5 sm:grid-cols-2 lg:grid-cols-3'>
            {USE_CASES.map((useCase) => (
              <Link key={useCase.slug} href={`/use-cases/${useCase.slug}`}>
                <Card className='hover:border-foreground/30 flex h-full flex-col transition-colors'>
                  <div className='flex items-center justify-between gap-2'>
                    <useCase.icon className='text-primary h-6 w-6' />
                    <ArrowRight className='text-muted-foreground h-4 w-4' />
                  </div>
                  <h2 className='mt-4 text-lg font-semibold'>{useCase.name}</h2>
                  <p className='text-muted-foreground mt-2 text-sm'>
                    {useCase.tagline}
                  </p>
                </Card>
              </Link>
            ))}
          </div>
        </Container>
      </Section>

      <CtaSection />
    </>
  );
}
