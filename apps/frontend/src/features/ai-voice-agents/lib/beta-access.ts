import { apiServer } from '@ringee/frontend-shared/lib/api.server';

/**
 * AI Voice Agents beta access, resolved by the API.
 *
 * The dashboard deliberately keeps NO copy of the allowlist: this and
 * `VoiceAgentBetaGuard` read the same source, so the UI gate and the server
 * boundary cannot drift.
 *
 * This is a UX gate only; the real enforcement is `VoiceAgentBetaGuard` on
 * every `/ai-voice-agents` route.
 */
export async function fetchHasVoiceAgentAccess(): Promise<boolean> {
  try {
    const res = await apiServer.get<{ hasAccess: boolean }>(
      '/ai-voice-agents-access'
    );
    return !!res?.hasAccess;
  } catch {
    // Fail closed: an unreachable API must not open a closed beta.
    return false;
  }
}
