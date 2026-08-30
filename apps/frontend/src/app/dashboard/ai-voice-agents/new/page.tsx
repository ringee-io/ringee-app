import { notFound } from 'next/navigation';
import PageContainer from '@/components/layout/page-container';
import { Heading } from '@ringee/frontend-shared/components/ui/heading';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { NewAgent } from '@/features/ai-voice-agents/components/new-agent';
import type { VoiceAgentType } from '@/features/ai-voice-agents/types';

const TYPES: VoiceAgentType[] = [
  'appointment_booking',
  'reminders_notifications'
];

export const metadata = { title: 'New AI voice agent' };

export default async function NewAiVoiceAgentPage({
  searchParams
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  if (!type || !TYPES.includes(type as VoiceAgentType)) notFound();

  return (
    <PageContainer scrollable>
      <div className='flex flex-1 flex-col space-y-4'>
        <Heading
          title='New AI voice agent'
          description='Ringee writes the conversation. You choose the name, the voice and what to keep from each call.'
        />
        <Separator />
        <NewAgent type={type as VoiceAgentType} />
      </div>
    </PageContainer>
  );
}
