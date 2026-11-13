import { apiServer } from '@ringee/frontend-shared/lib/api.server';

/**
 * AI Voice Agents access for the active workspace, resolved by the API.
 *
 * This is a UX gate only; the backend guard and service layer enforce the same
 * rule for every operation: every organization, and a personal workspace only
 * when it is enrolled in the pilot (AGENT-011).
 */
export async function fetchHasVoiceAgentAccess(): Promise<boolean> {
  try {
    const res = await apiServer.get<{ hasAccess: boolean }>(
      '/ai-voice-agents-access'
    );
    return !!res?.hasAccess;
  } catch {
    // Fail closed when the active workspace cannot be resolved.
    return false;
  }
}
