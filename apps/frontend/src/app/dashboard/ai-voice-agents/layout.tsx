import { redirect } from 'next/navigation';
import { fetchHasVoiceAgentAccess } from '@/features/ai-voice-agents/lib/access';

/**
 * Organization gate for the whole `/dashboard/ai-voice-agents` subtree — the
 * list, the wizard and every agent detail page.
 *
 * The navigation entry is already disabled in a personal workspace; this stops
 * a stale bookmark from getting in behind it. The API remains the security
 * boundary.
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
