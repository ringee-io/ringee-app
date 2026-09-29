import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { buildMetadata } from '@/features/marketing/seo';
import { languageAlternates } from '@/features/marketing/locale';
import { AlternativesPage } from '@/features/marketing/components/alternatives-page';
import {
  ES_ALTERNATIVES,
  getEsAlternatives
} from '@/features/marketing/content/es/alternatives';

type Params = { params: Promise<{ slug: string }> };
export function generateStaticParams() {
  return ES_ALTERNATIVES.map((page) => ({ slug: page.slug }));
}
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const page = getEsAlternatives(slug);
  if (!page) notFound();
  return buildMetadata({
    title: page.metaTitle,
    description: page.metaDescription,
    path: `/es/alternatives/${page.slug}`,
    locale: 'es',
    languages: languageAlternates(`/alternatives/${page.slug}`)
  });
}
export default async function Page({ params }: Params) {
  const { slug } = await params;
  const page = getEsAlternatives(slug);
  if (!page) notFound();
  return <AlternativesPage page={page} locale='es' />;
}
