import { notFound } from 'next/navigation';
import { NewAgent } from '@/features/ai-voice-agents/components/new-agent';
import type { VoiceAgentType } from '@/features/ai-voice-agents/types';

const TYPES: VoiceAgentType[] = [
  'appointment_booking',
  'reminders_notifications'
];

export const metadata = { title: 'New AI voice agent' };

/**
 * Creating an agent is a full-screen panel, not a page inside the dashboard
 * chrome: it is one long form with a save at the end, and the route is what
 * opens it, so a refresh, a shared link and the browser's back button all keep
 * working. `NewAgent` renders the panel itself — there is no page container
 * around it, because the panel *is* the screen.
 */
export default async function NewAiVoiceAgentPage({
  searchParams
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  if (!type || !TYPES.includes(type as VoiceAgentType)) notFound();

  return <NewAgent type={type as VoiceAgentType} />;
}
