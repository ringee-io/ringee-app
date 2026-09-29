import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import {
  SolutionPage,
  solutionMetadata
} from '@/features/marketing/components/solution-page';
import {
  ES_SOLUTIONS,
  getEsSolution
} from '@/features/marketing/content/es/solutions';
type Params = { params: Promise<{ slug: string }> };
function load(slug: string) {
  const page = getEsSolution(slug);
  return page?.parent?.href === '/ai-voice-agents' ? page : undefined;
}
export function generateStaticParams() {
  return ES_SOLUTIONS.filter(
    (page) => page.parent?.href === '/ai-voice-agents'
  ).map((page) => ({ slug: page.slug }));
}
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const page = load(slug);
  if (!page) notFound();
  return solutionMetadata(page);
}
export default async function Page({ params }: Params) {
  const { slug } = await params;
  const page = load(slug);
  if (!page) notFound();
  return <SolutionPage solution={page} locale='es' />;
}
