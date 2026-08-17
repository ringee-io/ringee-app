'use client';

import { useMemo } from 'react';
import type { VoicemailTransport } from '@/features/voicemail';
import { sessionApi } from '../api';

/**
 * Voicemail transport for the public session dialer. The agent has no Clerk
 * session, so every request re-presents the magic-link token and the backend
 * runs it under the session owner's workspace.
 */
export function useSessionVoicemailTransport(params: {
  sessionId: string;
  itemId: string;
  token: string;
}): VoicemailTransport {
  const { sessionId, itemId, token } = params;

  return useMemo<VoicemailTransport>(
    () => ({
      list: () => sessionApi.listVoicemailAssets(sessionId, token),
      upload: (blob, filename) =>
        sessionApi.uploadVoicemailAudio(sessionId, token, blob, filename),
      create: (input) =>
        sessionApi.createVoicemailAsset(sessionId, token, input),
      // The destination comes from the stored session item server-side, so the
      // client never gets to name a number.
      send: (assetId) =>
        sessionApi.sendVoicemail(sessionId, itemId, token, assetId)
    }),
    [sessionId, itemId, token]
  );
}
