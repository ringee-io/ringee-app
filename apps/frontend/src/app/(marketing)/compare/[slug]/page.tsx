import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { buildMetadata } from '@/features/marketing/seo';
import { languageAlternates } from '@/features/marketing/locale';
import { ComparisonPage } from '@/features/marketing/components/comparison-page';
import {
  COMPARISONS,
  getComparison
} from '@/features/marketing/content/comparisons';

type Params = { params: Promise<{ slug: string }> };
export function generateStaticParams() {
  return COMPARISONS.map((page) => ({ slug: page.slug }));
}
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const page = getComparison(slug);
  if (!page) notFound();
  return buildMetadata({
    title: page.metaTitle,
    description: page.metaDescription,
    path: `/compare/${page.slug}`,
    locale: 'en',
    languages: languageAlternates(`/compare/${page.slug}`)
  });
}
export default async function Page({ params }: Params) {
  const { slug } = await params;
  const page = getComparison(slug);
  if (!page) notFound();
  return <ComparisonPage comparison={page} locale='en' />;
}
