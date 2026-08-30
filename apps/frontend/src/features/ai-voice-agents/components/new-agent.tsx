'use client';

import { useEffect, useState } from 'react';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { useVoiceAgentApi } from '../api';
import type { VoiceAgentType, VoiceAgentTypeInfo } from '../types';
import { AgentForm } from './agent-form';

/** Loads the type's definition, then hands off to the shared form. */
export function NewAgent({ type }: { type: VoiceAgentType }) {
  const api = useVoiceAgentApi();
  const [typeInfo, setTypeInfo] = useState<VoiceAgentTypeInfo>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const types = await api.listTypes().catch(() => []);
      setTypeInfo(types.find((t) => t.type === type));
      setLoading(false);
    })();
  }, [api, type]);

  if (loading) return <Skeleton className='h-96 w-full' />;
  return <AgentForm type={type} typeInfo={typeInfo} />;
}
