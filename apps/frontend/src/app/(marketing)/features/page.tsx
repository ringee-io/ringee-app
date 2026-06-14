import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight } from 'lucide-react';

import { buildMetadata } from '@/features/marketing/seo';
import {
  Card,
  Container,
  Section,
  SectionHeading
} from '@/features/marketing/components/primitives';
import { Breadcrumbs } from '@/features/marketing/components/breadcrumbs';
import { CtaSection } from '@/features/marketing/components/cta-section';
import {
  FEATURE_CATEGORIES,
  featuresByCategory
} from '@/features/marketing/content/features';

export const metadata: Metadata = buildMetadata({
  title: 'Features — Outbound Calling, Recording, Automation & Sync | Ringee',
  description:
    'Explore Ringee features for outbound teams: calling, campaigns, call outcomes, callbacks, recording, transcription, CRM sync, and AI call automation — without per-seat pricing.',
  path: '/features'
});

export default function FeaturesPage() {
  return (
    <>
      <Breadcrumbs
        items={[
          { name: 'Home', href: '/' },
          { name: 'Features', href: '/features' }
        ]}
      />
      <Section className='pt-8 pb-4'>
        <Container className='max-w-3xl'>
          <h1 className='text-4xl font-bold tracking-tight text-balance sm:text-5xl'>
            Everything you need to run outbound
          </h1>
          <p className='text-muted-foreground mt-6 text-lg text-pretty'>
            Ringee groups its capabilities into five categories: communicate
            with leads, learn from every call, automate the busywork, sync your
            data, and stay in control. Browse the full catalog below.
          </p>
        </Container>
      </Section>

      {FEATURE_CATEGORIES.map((category) => {
        const items = featuresByCategory(category.name);
        if (!items.length) return null;
        return (
          <Section key={category.name} className='py-10'>
            <Container>
              <div className='flex items-center gap-3'>
                <category.icon className='text-primary h-6 w-6' />
                <SectionHeading title={category.name} align='left' as='h2' />
              </div>
              <p className='text-muted-foreground mt-2'>{category.blurb}</p>
              <div className='mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3'>
                {items.map((feature) => (
                  <Link key={feature.slug} href={`/features/${feature.slug}`}>
                    <Card className='hover:border-foreground/30 flex h-full flex-col transition-colors'>
                      <div className='flex items-center justify-between gap-2'>
                        <feature.icon className='text-primary h-6 w-6' />
                        <ArrowRight className='text-muted-foreground h-4 w-4' />
                      </div>
                      <h3 className='mt-4 text-lg font-semibold'>
                        {feature.name}
                      </h3>
                      <p className='text-muted-foreground mt-2 text-sm'>
                        {feature.tagline}
                      </p>
                    </Card>
                  </Link>
                ))}
              </div>
            </Container>
          </Section>
        );
      })}

      <CtaSection />
    </>
  );
}
