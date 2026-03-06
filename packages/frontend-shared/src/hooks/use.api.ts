'use client';

import { useMemo } from 'react';
import { useAuth } from '@clerk/nextjs';
import { ApiClient } from '../lib/api';

export function useApi() {
  const { getToken } = useAuth();

  return useMemo(() => {
    return new ApiClient({
      getAuthToken: async () => {
        return await getToken();
      },
      mockDelayMs: 10,
      mocks: {
        '/credits/balance': async () => {
          return {
            balance: 146,
            freeCallTrial: false
          };
        }
      }
    });
  }, [getToken]);
}
