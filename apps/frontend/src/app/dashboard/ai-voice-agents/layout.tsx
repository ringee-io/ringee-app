import { redirect } from 'next/navigation';
import { fetchHasVoiceAgentAccess } from '@/features/ai-voice-agents/lib/beta-access';

/**
 * Closed beta gate for the whole `/dashboard/ai-voice-agents` subtree — the
 * list, the wizard and every agent detail page.
 *
 * The sidebar entry is already disabled for anyone outside the beta; this stops
 * the URL, the Cmd-K bar and a stale bookmark from getting in behind it. Real
 * enforcement is `VoiceAgentBetaGuard` on the API.
 */
export default async function AiVoiceAgentsLayout({
  children
}: {
  children: React.ReactNode;
}) {
  if (!(await fetchHasVoiceAgentAccess())) {
    redirect('/dashboard/overview');
  }

  return <>{children}</>;
}
