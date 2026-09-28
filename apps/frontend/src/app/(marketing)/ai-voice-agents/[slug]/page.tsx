import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import {
  SolutionPage,
  solutionMetadata
} from '@/features/marketing/components/solution-page';
import {
  AI_VOICE_AGENT_SOLUTIONS,
  getSolution
} from '@/features/marketing/content/solutions';

type Params = { params: Promise<{ slug: string }> };

/** Use-case pages under the AI Voice Agents hub (outbound calling, AI SDR). */
function load(slug: string) {
  const solution = getSolution(slug);
  return solution?.parent?.href === '/ai-voice-agents' ? solution : undefined;
}

export function generateStaticParams() {
  return AI_VOICE_AGENT_SOLUTIONS.map((solution) => ({ slug: solution.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const solution = load(slug);
  return solution ? solutionMetadata(solution) : {};
}

export default async function AiVoiceAgentSolutionPage({ params }: Params) {
  const { slug } = await params;
  const solution = load(slug);
  if (!solution) notFound();

  return <SolutionPage solution={solution} />;
}
