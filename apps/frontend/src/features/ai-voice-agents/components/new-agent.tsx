'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { useVoiceAgentApi } from '../api';
import type { VoiceAgentType, VoiceAgentTypeInfo } from '../types';
import { AgentScreen } from './agent-screen';
import { AgentWizard } from './agent-wizard';

/** Loads the type's definition, then hands off to the create wizard. */
export function NewAgent({ type }: { type: VoiceAgentType }) {
  const t = useTranslations('aiVoiceAgents.wizard');
  const api = useVoiceAgentApi();
  const router = useRouter();
  const [typeInfo, setTypeInfo] = useState<VoiceAgentTypeInfo>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const types = await api.listTypes().catch(() => []);
      setTypeInfo(types.find((t) => t.type === type));
      setLoading(false);
    })();
  }, [api, type]);

  // The panel is up from the first frame, so the screen does not shift once the
  // type's copy arrives.
  if (loading) {
    return (
      <AgentScreen
        title={t('title')}
        onClose={() => router.push('/dashboard/ai-voice-agents')}
      >
        <div className='space-y-4'>
          <Skeleton className='h-9 w-64 rounded-lg' />
          <Skeleton className='h-96 w-full rounded-lg' />
        </div>
      </AgentScreen>
    );
  }

  return <AgentWizard type={type} typeInfo={typeInfo} />;
}
