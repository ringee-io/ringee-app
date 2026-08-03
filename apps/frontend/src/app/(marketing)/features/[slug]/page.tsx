import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { buildMetadata } from '@/features/marketing/seo';
import { CtaSection } from '@/features/marketing/components/cta-section';
import { DetailLayout } from '@/features/marketing/components/detail-layout';
import {
  FeatureDemo,
  type FeatureDemoKey
} from '@/features/marketing/components/feature-demo';
import { FaqSection } from '@/features/marketing/components/faq';
import {
  DetailHero,
  DocsCallout,
  HowItWorksSteps,
  RelatedLinks,
  WhoForAndBenefits
} from '@/features/marketing/components/detail';
import {
  RotationHealth,
  RotationLocalPresence,
  RotationMechanics
} from '@/features/marketing/components/caller-id-rotation';
import { FEATURES, getFeature } from '@/features/marketing/content/features';

/**
 * Feature pages that get an interactive product demo reused from the landing
 * page. Each entry maps the feature slug to the demo and the copy shown above
 * it. Slugs not listed here simply render without a demo.
 */
const FEATURE_DEMOS: Record<
  string,
  { demo: FeatureDemoKey; title: string; description: string }
> = {
  'outbound-calling': {
    demo: 'manual-dialer',
    title: 'See the dialer in action',
    description:
      'The exact in-browser dialer your team uses. Watch a number get typed and dialed, then the live call screen take over — running on sample data.'
  },
  campaigns: {
    demo: 'campaigns',
    title: 'See campaigns in action',
    description:
      'A live, auto-playing preview of the campaign workspace — the queue, softphone, and disposition your reps work through, on sample data.'
  },
  'ai-call-automation': {
    demo: 'agentic',
    title: 'Watch an AI agent run Ringee',
    description:
      'An auto-playing demo of an AI agent driving Ringee over MCP — searching contacts, creating a call session, and logging the outcome.'
  }
};

type Params = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return FEATURES.map((feature) => ({ slug: feature.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const feature = getFeature(slug);
  if (!feature) return {};
  return buildMetadata({
    title: feature.metaTitle,
    description: feature.metaDescription,
    path: `/features/${feature.slug}`
  });
}

export default async function FeatureDetailPage({ params }: Params) {
  const { slug } = await params;
  const feature = getFeature(slug);
  if (!feature) notFound();

  const related = feature.related
    .map((relatedSlug) => getFeature(relatedSlug))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .map((item) => ({
      name: item.name,
      href: `/features/${item.slug}`,
      tagline: item.tagline
    }));

  const path = `/features/${feature.slug}`;
  const demo = FEATURE_DEMOS[feature.slug];
  const isRotation = feature.slug === 'caller-id-rotation';

  return (
    <DetailLayout
      items={[
        { name: 'Home', href: '/' },
        { name: 'Features', href: '/features' },
        { name: feature.name, href: path }
      ]}
      cta={<CtaSection />}
    >
      <DetailHero
        eyebrow={feature.category}
        title={feature.h1}
        intro={feature.intro}
      />
      {demo && (
        <FeatureDemo
          demo={demo.demo}
          title={demo.title}
          description={demo.description}
        />
      )}
      {isRotation && <RotationLocalPresence />}
      <WhoForAndBenefits whoFor={feature.whoFor} benefits={feature.benefits} />
      <HowItWorksSteps steps={feature.howItWorks} />
      {isRotation && (
        <>
          <RotationMechanics />
          <RotationHealth />
        </>
      )}
      {feature.docs ? (
        <DocsCallout
          href={feature.docs.href}
          description={feature.docs.description}
        />
      ) : null}

      <RelatedLinks title='Related features' items={related} />
      <FaqSection faqs={feature.faqs} />
    </DetailLayout>
  );
}
