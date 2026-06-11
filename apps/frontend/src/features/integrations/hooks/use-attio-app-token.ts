'use client';

import { useCallback, useState } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';

interface AttioTokenContext {
  userId: string;
  scope: string;
  organizationId: string | null;
  organizationName: string | null;
  userName: string | null;
}

interface GenerateTokenResponse {
  token: string;
  context: AttioTokenContext;
}

export function useAttioAppToken() {
  const api = useApi();
  const [token, setToken] = useState<string | null>(null);
  const [context, setContext] = useState<AttioTokenContext | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await api.post<GenerateTokenResponse>(
        '/integrations/attio/generate-token'
      );
      setToken(res.token);
      setContext(res.context);
      return res;
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Failed to generate token';
      setError(msg);
      throw err;
    } finally {
      setGenerating(false);
    }
  }, [api]);

  const clear = useCallback(() => {
    setToken(null);
    setContext(null);
    setError(null);
  }, []);

  return { token, context, generating, error, generate, clear };
}
