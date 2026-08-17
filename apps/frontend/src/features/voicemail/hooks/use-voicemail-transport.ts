'use client';

import { useMemo } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import type {
  CreateVoicemailAssetInput,
  VoicemailAsset,
  VoicemailTransport
} from '../types';

export interface AuthenticatedVoicemailTarget {
  /** Destination in E.164 — the number the drop will dial. */
  phoneNumber: string;
  contactId?: string | null;
  /** The call this drop follows up on, for timeline attribution. */
  callId?: string | null;
  /** Origin channel, stamped on the resulting Call row. */
  source?: string;
}

/**
 * Voicemail transport for the Clerk-authenticated dashboard (manual dialer,
 * campaign dialer, inbox).
 */
export function useVoicemailTransport(
  target: AuthenticatedVoicemailTarget
): VoicemailTransport {
  const api = useApi();
  const { phoneNumber, contactId, callId, source } = target;

  return useMemo<VoicemailTransport>(
    () => ({
      list: () => api.get<VoicemailAsset[]>('/voicemail-assets'),
      upload: async (blob, filename) => {
        const fd = new FormData();
        fd.append('file', blob, filename);
        return api.upload<{ url: string }>('/voicemail-assets/upload', fd);
      },
      create: (input: CreateVoicemailAssetInput) =>
        api.post<VoicemailAsset>('/voicemail-assets', input),
      send: (assetId: string) =>
        api.post('/voicemail-assets/send', {
          assetId,
          toNumber: phoneNumber,
          contactId: contactId || undefined,
          callId: callId || undefined,
          source
        })
    }),
    [api, phoneNumber, contactId, callId, source]
  );
}
