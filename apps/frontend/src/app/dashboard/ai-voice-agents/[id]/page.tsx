import { Suspense } from 'react';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { AgentDetail } from '@/features/ai-voice-agents/components/agent-detail';

export const metadata = { title: 'AI voice agent' };

/** Editing an agent opens the same full-screen panel creating one does. */
export default async function AiVoiceAgentPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    // AgentDetail reads `?tab=` to open on the tab the caller asked for.
    <Suspense fallback={<Skeleton className='h-dvh w-full' />}>
      <AgentDetail agentId={id} />
    </Suspense>
  );
}
