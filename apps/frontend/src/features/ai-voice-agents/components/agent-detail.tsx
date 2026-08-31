'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  AlertTriangle,
  AudioLines,
  Building2,
  ClipboardList,
  Library,
  Loader2,
  Mic,
  PhoneCall,
  RotateCw,
  Settings2,
  Trash2
} from 'lucide-react';
import {
  Alert,
  AlertDescription,
  AlertTitle
} from '@ringee/frontend-shared/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@ringee/frontend-shared/components/ui/alert-dialog';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { Switch } from '@ringee/frontend-shared/components/ui/switch';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from '@ringee/frontend-shared/components/ui/tabs';
import { useVoiceAgentApi } from '../api';
import { FIELD_STEPS, useAgentDraft } from '../hooks/use-agent-draft';
import { describeApiError } from '../lib/api-error';
import { flagEmoji } from '../lib/voice-format';
import type { VoiceAgent, VoiceAgentTypeInfo } from '../types';
import { AgentScreen } from './agent-screen';
import { AgentStatusBadge } from './agent-status-badge';
import { CallsTable } from './calls-table';
import { KnowledgePanel } from './knowledge-panel';
import { CompanySection } from './sections/company-section';
import { ResultsSection } from './sections/results-section';
import { SetupSection } from './sections/setup-section';
import { VoiceSection } from './sections/voice-section';
import { StartCallDialog } from './start-call-dialog';
import { TestPanel } from './test-panel';

const TABS = [
  { value: 'setup', label: 'Setup', icon: Settings2 },
  { value: 'voice', label: 'Voice', icon: AudioLines },
  { value: 'company', label: 'Company', icon: Building2 },
  { value: 'results', label: 'Results', icon: ClipboardList },
  { value: 'knowledge', label: 'Knowledge', icon: Library },
  { value: 'test', label: 'Test', icon: Mic },
  { value: 'calls', label: 'Calls', icon: PhoneCall }
] as const;

export function AgentDetail({ agentId }: { agentId: string }) {
  const api = useVoiceAgentApi();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [agent, setAgent] = useState<VoiceAgent>();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [typeInfo, setTypeInfo] = useState<VoiceAgentTypeInfo>();
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [loaded, types] = await Promise.all([
        api.get(agentId),
        api.listTypes().catch(() => [])
      ]);
      setAgent(loaded);
      setTypeInfo(types.find((t) => t.type === loaded.type));
    } catch (error) {
      setLoadError(describeApiError(error, 'Could not open this agent.'));
    } finally {
      setLoading(false);
    }
  }, [api, agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const leave = () => router.push('/dashboard/ai-voice-agents');

  if (loading) {
    return (
      <AgentScreen title='Loading agent…' onClose={leave}>
        <div className='space-y-4'>
          <Skeleton className='h-10 w-full rounded-lg' />
          <Skeleton className='h-96 w-full rounded-lg' />
        </div>
      </AgentScreen>
    );
  }

  if (loadError || !agent) {
    return (
      <AgentScreen title='Agent' onClose={leave}>
        <Alert variant='destructive' className='rounded-lg'>
          <AlertTriangle className='size-4' />
          <AlertTitle>This agent did not open</AlertTitle>
          <AlertDescription className='flex flex-wrap items-center gap-3'>
            {loadError ?? 'Could not open this agent.'}
            <Button
              variant='outline'
              size='sm'
              className='rounded-lg'
              onClick={() => void load()}
            >
              <RotateCw className='size-3.5' />
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      </AgentScreen>
    );
  }

  return (
    <AgentDetailView
      key={agent.id}
      agent={agent}
      typeInfo={typeInfo}
      initialTab={searchParams.get('tab') ?? 'setup'}
      onChanged={setAgent}
      onClose={leave}
      onDeleted={leave}
    />
  );
}

/**
 * The agent itself, once loaded.
 *
 * Split out so the draft state is created from a real agent rather than from
 * `undefined` and then patched — a form whose initial values arrive one render
 * late is exactly how an edit screen loses the first thing you type.
 */
function AgentDetailView({
  agent,
  typeInfo,
  initialTab,
  onChanged,
  onClose,
  onDeleted
}: {
  agent: VoiceAgent;
  typeInfo?: VoiceAgentTypeInfo;
  initialTab: string;
  onChanged: (agent: VoiceAgent) => void;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const api = useVoiceAgentApi();
  const draft = useAgentDraft(agent.type, agent);
  const [tab, setTab] = useState(initialTab);
  const [callsKey, setCallsKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const active = agent.status === 'active';

  const save = async () => {
    const { saved, errors } = await draft.save();
    if (!saved) {
      // Show the tab holding the first field the save refused.
      const firstBad = Object.keys(errors)[0];
      const owner = firstBad?.startsWith('extractionFields')
        ? ('results' as const)
        : firstBad
          ? FIELD_STEPS[firstBad]
          : undefined;
      if (owner) setTab(owner);
      return;
    }

    onChanged(saved);
    // The row saved even when the provider refused it — `status: error` with
    // the reason on `lastError` is the agent telling you it cannot take calls
    // yet, and claiming "Saved" over that is how a broken agent goes unnoticed.
    if (saved.status === 'error') {
      toast.warning(
        'Saved, but the agent could not be set up. See the reason above.'
      );
    } else {
      toast.success('Saved');
    }
  };

  const toggleStatus = async () => {
    setBusy(true);
    setStatusError(null);
    try {
      const updated = await api.setStatus(
        agent.id,
        active ? 'disabled' : 'active'
      );
      onChanged(updated);
      toast.success(active ? 'Agent disabled' : 'Agent activated');
    } catch (error) {
      // Activation fails for a reason the user can act on — no calendar, no
      // verified key — so it belongs on the screen, not in a toast that goes.
      setStatusError(
        describeApiError(error, 'Could not change the agent’s status.')
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    try {
      await api.remove(agent.id);
      toast.success('Agent deleted');
      onDeleted();
    } catch (error) {
      toast.error(describeApiError(error, 'Could not delete the agent.'));
    }
  };

  return (
    <AgentScreen
      title={agent.name}
      badge={<AgentStatusBadge status={agent.status} />}
      subtitle={
        <>
          {typeInfo?.title ?? agent.type}
          {draft.selectedVoice
            ? ` · ${flagEmoji(draft.selectedVoice.countryCode)} ${
                draft.selectedVoice.displayName
              }`
            : ''}
        </>
      }
      onClose={onClose}
      confirmClose={draft.dirty}
      actions={
        <>
          <label className='flex items-center gap-2 text-sm'>
            <Switch
              checked={active}
              disabled={busy}
              onCheckedChange={() => void toggleStatus()}
              aria-label={active ? 'Deactivate agent' : 'Activate agent'}
            />
            <span className='hidden sm:inline'>
              {active ? 'Active' : 'Inactive'}
            </span>
          </label>

          <StartCallDialog
            agentId={agent.id}
            variables={typeInfo?.variables ?? []}
            onStarted={() => {
              setTab('calls');
              setCallsKey((k) => k + 1);
            }}
          />

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant='ghost'
                aria-label='Delete agent'
                className='size-10 rounded-lg p-0'
              >
                <Trash2 className='size-4' />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {agent.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  The agent stops answering and its call history stays. This
                  cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className='rounded-lg'>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  className='rounded-lg'
                  onClick={() => void remove()}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      }
      footer={
        draft.dirty ? (
          <>
            <span className='text-muted-foreground flex-1 text-sm'>
              Unsaved changes
            </span>
            <Button
              className='rounded-lg'
              onClick={() => void save()}
              disabled={draft.saving}
            >
              {draft.saving ? (
                <Loader2 className='size-4 animate-spin' />
              ) : null}
              Save changes
            </Button>
          </>
        ) : undefined
      }
    >
      <div className='space-y-4'>
        {/* The setup failure comes first: nothing else on this screen matters
            while the agent cannot be built provider-side. */}
        {agent.status === 'error' && agent.lastError ? (
          <Alert variant='destructive' className='rounded-lg'>
            <AlertTriangle className='size-4' />
            <AlertTitle>This agent could not be set up</AlertTitle>
            <AlertDescription className='flex flex-wrap items-center gap-3'>
              {agent.lastError}
              <Button
                variant='outline'
                size='sm'
                className='rounded-lg'
                onClick={() => void save()}
                disabled={draft.saving}
              >
                {draft.saving ? (
                  <Loader2 className='size-3.5 animate-spin' />
                ) : (
                  <RotateCw className='size-3.5' />
                )}
                Retry setup
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {draft.saveError ? (
          <Alert variant='destructive' className='rounded-lg'>
            <AlertTriangle className='size-4' />
            <AlertDescription>{draft.saveError}</AlertDescription>
          </Alert>
        ) : null}

        {statusError ? (
          <Alert variant='destructive' className='rounded-lg'>
            <AlertTriangle className='size-4' />
            <AlertTitle>Could not activate this agent</AlertTitle>
            <AlertDescription>{statusError}</AlertDescription>
          </Alert>
        ) : null}

        {!active && draft.blockers.length > 0 ? (
          <Alert className='rounded-lg'>
            <AlertTriangle className='size-4' />
            <AlertDescription>
              Before this agent can call, it needs {draft.blockers.join(', ')}.
            </AlertDescription>
          </Alert>
        ) : null}

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className='h-auto flex-wrap justify-start rounded-lg'>
            {TABS.map(({ value, label, icon: Icon }) => (
              <TabsTrigger
                key={value}
                value={value}
                className='gap-1.5 rounded-lg'
              >
                <Icon className='size-3.5' />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value='setup' className='pt-6'>
            <SetupSection draft={draft} type={agent.type} />
          </TabsContent>

          <TabsContent value='voice' className='pt-6'>
            <VoiceSection draft={draft} />
          </TabsContent>

          <TabsContent value='company' className='pt-6'>
            <CompanySection draft={draft} agentId={agent.id} />
          </TabsContent>

          <TabsContent value='results' className='pt-6'>
            <ResultsSection draft={draft} />
          </TabsContent>

          <TabsContent value='knowledge' className='pt-6'>
            <KnowledgePanel agentId={agent.id} />
          </TabsContent>

          <TabsContent value='test' className='pt-6'>
            <TestPanel
              agentId={agent.id}
              variables={typeInfo?.variables ?? []}
            />
          </TabsContent>

          <TabsContent value='calls' className='pt-6'>
            <CallsTable agentId={agent.id} refreshKey={callsKey} />
          </TabsContent>
        </Tabs>
      </div>
    </AgentScreen>
  );
}
