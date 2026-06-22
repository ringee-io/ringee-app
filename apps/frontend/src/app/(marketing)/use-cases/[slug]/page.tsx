import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { buildMetadata } from '@/features/marketing/seo';
import { CtaSection } from '@/features/marketing/components/cta-section';
import { DetailLayout } from '@/features/marketing/components/detail-layout';
import { FaqSection } from '@/features/marketing/components/faq';
import {
  DetailHero,
  ProblemSolution,
  RelatedLinks,
  WorkflowList
} from '@/features/marketing/components/detail';
import { getFeature } from '@/features/marketing/content/features';
import { USE_CASES, getUseCase } from '@/features/marketing/content/use-cases';

type Params = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return USE_CASES.map((useCase) => ({ slug: useCase.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const useCase = getUseCase(slug);
  if (!useCase) return {};
  return buildMetadata({
    title: useCase.metaTitle,
    description: useCase.metaDescription,
    path: `/use-cases/${useCase.slug}`
  });
}

export default async function UseCaseDetailPage({ params }: Params) {
  const { slug } = await params;
  const useCase = getUseCase(slug);
  if (!useCase) notFound();

  const recommended = useCase.recommendedFeatures
    .map((featureSlug) => getFeature(featureSlug))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .map((item) => ({
      name: item.name,
      href: `/features/${item.slug}`,
      tagline: item.tagline
    }));

  const path = `/use-cases/${useCase.slug}`;

  return (
    <DetailLayout
      items={[
        { name: 'Home', href: '/' },
        { name: 'Use Cases', href: '/use-cases' },
        { name: useCase.name, href: path }
      ]}
      cta={<CtaSection />}
    >
      <DetailHero
        eyebrow='Use case'
        title={useCase.h1}
        intro={useCase.intro}
      />
      <ProblemSolution
        painPoints={useCase.painPoints}
        solutions={useCase.solutions}
      />
      <RelatedLinks title='Recommended features' items={recommended} />
      <WorkflowList steps={useCase.workflow} />
      <FaqSection faqs={useCase.faqs} />
    </DetailLayout>
  );
}
