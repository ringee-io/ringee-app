import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { buildMetadata } from '@/features/marketing/seo';
import { CtaSection } from '@/features/marketing/components/cta-section';
import { DetailLayout } from '@/features/marketing/components/detail-layout';
import { FaqSection } from '@/features/marketing/components/faq';
import {
  CheckList,
  Container,
  Section
} from '@/features/marketing/components/primitives';
import {
  DetailHero,
  RelatedLinks,
  WorkflowList
} from '@/features/marketing/components/detail';
import {
  INTEGRATIONS,
  getIntegration
} from '@/features/marketing/content/integrations';

type Params = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return INTEGRATIONS.map((integration) => ({ slug: integration.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const integration = getIntegration(slug);
  if (!integration) return {};
  return buildMetadata({
    title: integration.metaTitle,
    description: integration.metaDescription,
    path: `/integrations/${integration.slug}`
  });
}

export default async function IntegrationDetailPage({ params }: Params) {
  const { slug } = await params;
  const integration = getIntegration(slug);
  if (!integration) notFound();

  const related = integration.related
    .map((relatedSlug) => getIntegration(relatedSlug))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .map((item) => ({
      name: item.name,
      href: `/integrations/${item.slug}`,
      tagline: item.tagline
    }));

  const path = `/integrations/${integration.slug}`;

  return (
    <DetailLayout
      items={[
        { name: 'Home', href: '/' },
        { name: 'Integrations', href: '/integrations' },
        { name: integration.name, href: path }
      ]}
      cta={<CtaSection />}
    >
      <DetailHero
        eyebrow={integration.category}
        title={integration.h1}
        intro={integration.intro}
      />

      <Section>
        <Container>
          <h2 className='text-2xl font-bold tracking-tight'>
            What this integration enables
          </h2>
          <CheckList items={integration.enables} className='mt-6 max-w-2xl' />
        </Container>
      </Section>

      <WorkflowList steps={integration.workflow} />

      <Section>
        <Container>
          <h2 className='text-2xl font-bold tracking-tight'>Benefits</h2>
          <CheckList items={integration.benefits} className='mt-6 max-w-2xl' />
        </Container>
      </Section>

      <RelatedLinks title='Related integrations' items={related} />
      <FaqSection faqs={integration.faqs} />
    </DetailLayout>
  );
}
