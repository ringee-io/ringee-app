'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { useVoiceAgentApi } from '../api';
import type { VoiceAgentType, VoiceAgentTypeInfo } from '../types';
import { AgentScreen, AgentScreenContent } from './agent-screen';
import { AgentWizard } from './agent-wizard';

/** Loads the type's definition, then hands off to the create wizard. */
export function NewAgent({ type }: { type: VoiceAgentType }) {
  const t = useTranslations('aiVoiceAgents.wizard');
  const api = useVoiceAgentApi();
  const router = useRouter();
  const [typeInfo, setTypeInfo] = useState<VoiceAgentTypeInfo>();
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    void (async () => {
      const types = await api.listTypes().catch(() => []);
      setTypeInfo(types.find((t) => t.type === type));
      setLoading(false);
    })();
  }, [api, type]);

  const leave = () => router.push('/dashboard/ai-voice-agents');

  // Keep the same dialog mounted while its type definition loads. Swapping a
  // loading AgentScreen for the wizard would replay the enter animation.
  return (
    <AgentScreen onClose={leave} confirmClose={dirty}>
      {loading ? (
        <AgentScreenContent title={t('title')}>
          <div className='space-y-4'>
            <Skeleton className='h-9 w-64 rounded-lg' />
            <Skeleton className='h-96 w-full rounded-lg' />
          </div>
        </AgentScreenContent>
      ) : (
        <AgentWizard type={type} typeInfo={typeInfo} onDirtyChange={setDirty} />
      )}
    </AgentScreen>
  );
}
