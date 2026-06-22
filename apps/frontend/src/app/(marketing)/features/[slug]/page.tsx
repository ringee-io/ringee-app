import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { buildMetadata } from '@/features/marketing/seo';
import { CtaSection } from '@/features/marketing/components/cta-section';
import { DetailLayout } from '@/features/marketing/components/detail-layout';
import { FaqSection } from '@/features/marketing/components/faq';
import {
  DetailHero,
  HowItWorksSteps,
  RelatedLinks,
  WhoForAndBenefits
} from '@/features/marketing/components/detail';
import { FEATURES, getFeature } from '@/features/marketing/content/features';

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
      <WhoForAndBenefits whoFor={feature.whoFor} benefits={feature.benefits} />
      <HowItWorksSteps steps={feature.howItWorks} />
      <RelatedLinks title='Related features' items={related} />
      <FaqSection faqs={feature.faqs} />
    </DetailLayout>
  );
}
