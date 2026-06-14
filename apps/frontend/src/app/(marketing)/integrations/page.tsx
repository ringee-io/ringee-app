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
  INTEGRATION_CATEGORIES,
  integrationsByCategory
} from '@/features/marketing/content/integrations';

export const metadata: Metadata = buildMetadata({
  title: 'Integrations — Apollo, Prospeo, Attio, Odoo, ChatGPT, Claude | Ringee',
  description:
    'Connect Ringee to your lead sources, CRMs, and AI tools. Integrations for Apollo, Prospeo, Attio, Odoo, ChatGPT, Claude, MCP-compatible agents, and CLI workflows.',
  path: '/integrations'
});

export default function IntegrationsPage() {
  return (
    <>
      <Breadcrumbs
        items={[
          { name: 'Home', href: '/' },
          { name: 'Integrations', href: '/integrations' }
        ]}
      />
      <Section className='pt-8 pb-4'>
        <Container className='max-w-3xl'>
          <h1 className='text-4xl font-bold tracking-tight text-balance sm:text-5xl'>
            Integrations for the whole outbound loop
          </h1>
          <p className='text-muted-foreground mt-6 text-lg text-pretty'>
            Pull leads from your enrichment tools, keep your CRM in sync with
            every call, and drive outbound from the AI tools you already use.
          </p>
        </Container>
      </Section>

      {INTEGRATION_CATEGORIES.map((category) => {
        const items = integrationsByCategory(category.name);
        if (!items.length) return null;
        return (
          <Section key={category.name} className='py-10'>
            <Container>
              <div className='flex items-center gap-3'>
                <category.icon className='text-primary h-6 w-6' />
                <SectionHeading title={category.name} align='left' as='h2' />
              </div>
              <p className='text-muted-foreground mt-2'>{category.blurb}</p>
              <div className='mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4'>
                {items.map((integration) => (
                  <Link
                    key={integration.slug}
                    href={`/integrations/${integration.slug}`}
                  >
                    <Card className='hover:border-foreground/30 flex h-full flex-col transition-colors'>
                      <div className='flex items-center justify-between gap-2'>
                        <integration.icon className='text-primary h-6 w-6' />
                        <ArrowRight className='text-muted-foreground h-4 w-4' />
                      </div>
                      <h3 className='mt-4 text-lg font-semibold'>
                        {integration.name}
                      </h3>
                      <p className='text-muted-foreground mt-2 text-sm'>
                        {integration.tagline}
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
