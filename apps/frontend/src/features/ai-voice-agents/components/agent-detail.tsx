'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AlertTriangle, Trash2 } from 'lucide-react';
import {
  Alert,
  AlertDescription
} from '@ringee/frontend-shared/components/ui/alert';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Heading } from '@ringee/frontend-shared/components/ui/heading';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from '@ringee/frontend-shared/components/ui/tabs';
import { useVoiceAgentApi } from '../api';
import type { VoiceAgent, VoiceAgentTypeInfo } from '../types';
import { AgentForm } from './agent-form';
import { AgentStatusBadge } from './agent-status-badge';
import { CallsTable } from './calls-table';
import { KnowledgePanel } from './knowledge-panel';
import { StartCallDialog } from './start-call-dialog';
import { TestPanel } from './test-panel';

export function AgentDetail({ agentId }: { agentId: string }) {
  const api = useVoiceAgentApi();
  const router = useRouter();
  const [agent, setAgent] = useState<VoiceAgent>();
  const [typeInfo, setTypeInfo] = useState<VoiceAgentTypeInfo>();
  const [loading, setLoading] = useState(true);
  const [callsKey, setCallsKey] = useState(0);

  const load = useCallback(async () => {
    const [loaded, types] = await Promise.all([
      api.get(agentId),
      api.listTypes().catch(() => [])
    ]);
    setAgent(loaded);
    setTypeInfo(types.find((t) => t.type === loaded.type));
    setLoading(false);
  }, [api, agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading || !agent) return <Skeleton className='h-96 w-full' />;

  const toggleStatus = async () => {
    const next = agent.status === 'active' ? 'disabled' : 'active';
    try {
      const updated = await api.setStatus(agent.id, next);
      setAgent(updated);
      toast.success(next === 'active' ? 'Agent activated' : 'Agent disabled');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not change the status'
      );
    }
  };

  const remove = async () => {
    if (!confirm(`Delete ${agent.name}? This cannot be undone.`)) return;
    try {
      await api.remove(agent.id);
      toast.success('Agent deleted');
      router.push('/dashboard/ai-voice-agents');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not delete the agent'
      );
    }
  };

  return (
    <div className='flex flex-1 flex-col space-y-4'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div className='flex items-center gap-3'>
          <Heading
            title={agent.name}
            description={typeInfo?.title ?? agent.type}
          />
          <AgentStatusBadge status={agent.status} />
        </div>
        <div className='flex gap-2'>
          <StartCallDialog
            agentId={agent.id}
            variables={typeInfo?.variables ?? []}
            onStarted={() => setCallsKey((k) => k + 1)}
          />
          <Button variant='outline' onClick={toggleStatus}>
            {agent.status === 'active' ? 'Disable' : 'Activate'}
          </Button>
          <Button variant='ghost' size='icon' onClick={remove}>
            <Trash2 className='size-4' />
          </Button>
        </div>
      </div>

      {agent.status === 'error' && agent.lastError ? (
        <Alert variant='destructive'>
          <AlertTriangle className='size-4' />
          <AlertDescription>{agent.lastError}</AlertDescription>
        </Alert>
      ) : null}

      <Separator />

      <Tabs defaultValue='calls'>
        <TabsList>
          <TabsTrigger value='calls'>Calls</TabsTrigger>
          <TabsTrigger value='configuration'>Configuration</TabsTrigger>
          <TabsTrigger value='knowledge'>Knowledge</TabsTrigger>
          <TabsTrigger value='test'>Test</TabsTrigger>
        </TabsList>

        <TabsContent value='calls' className='pt-4'>
          <CallsTable agentId={agent.id} refreshKey={callsKey} />
        </TabsContent>

        <TabsContent value='configuration' className='pt-4'>
          <AgentForm agent={agent} type={agent.type} typeInfo={typeInfo} />
        </TabsContent>

        <TabsContent value='knowledge' className='pt-4'>
          <KnowledgePanel agentId={agent.id} />
        </TabsContent>

        <TabsContent value='test' className='pt-4'>
          <TestPanel agentId={agent.id} variables={typeInfo?.variables ?? []} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
