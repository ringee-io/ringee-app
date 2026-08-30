import PageContainer from '@/components/layout/page-container';
import { AgentDetail } from '@/features/ai-voice-agents/components/agent-detail';

export const metadata = { title: 'AI voice agent' };

export default async function AiVoiceAgentPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PageContainer scrollable>
      <AgentDetail agentId={id} />
    </PageContainer>
  );
}
