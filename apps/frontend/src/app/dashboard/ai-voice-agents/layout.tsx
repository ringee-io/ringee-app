import { redirect } from 'next/navigation';
import { fetchHasVoiceAgentAccess } from '@/features/ai-voice-agents/lib/access';

/**
 * Access gate for the whole `/dashboard/ai-voice-agents` subtree — the list,
 * the wizard and every agent detail page: an organization workspace, or a
 * personal workspace the API reports as enrolled in the pilot.
 *
 * The navigation entry is already disabled where there is no access; this
 * stops a stale bookmark from getting in behind it. The API remains the
 * security boundary.
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
