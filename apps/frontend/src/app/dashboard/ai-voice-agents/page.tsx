import PageContainer from '@/components/layout/page-container';
import { Heading } from '@ringee/frontend-shared/components/ui/heading';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { AgentsList } from '@/features/ai-voice-agents/components/agents-list';

export const metadata = {
  title: 'AI Voice Agents',
  description:
    'Create voice agents that book meetings and confirm appointments over the phone.'
};

export default function AiVoiceAgentsPage() {
  return (
    <PageContainer scrollable>
      <div className='flex flex-1 flex-col space-y-4'>
        <Heading
          title='AI Voice Agents'
          description='Agents that call a person, hold the conversation, and come back with a result.'
        />
        <Separator />
        <AgentsList />
      </div>
    </PageContainer>
  );
}
