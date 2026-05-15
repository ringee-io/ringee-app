'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { IconAlertTriangleFilled } from '@tabler/icons-react';
import { AgentSelector } from './agent-selector';
import { ChatInput, ChatInputHandle } from './chat-input';
import { ChatMessages } from './chat-messages';
import { ConfirmationCard } from './confirmation-card';
import { ConversationList } from './conversation-list';
import { EmptyState } from './empty-state';
import { ProspectResultsPanel } from './prospect-results-panel';
import { useAiConversation } from '../hooks/use-ai-conversation';
import type {
  AiAgentDescriptor,
  AiAgentId,
  AiConversation
} from '../types';

const DEFAULT_AGENT: AiAgentId = 'prospecting_expert';
// sessionStorage key for a message queued in the empty state before the new
// conversation route exists. RingeeAiView unmounts during the route change, so
// we cannot keep this in React state.
const PENDING_SEND_KEY = 'ringee:ai:pending-send';

interface PendingSendRecord {
  conversationId: string;
  text: string;
}

function readPendingSend(): PendingSendRecord | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(PENDING_SEND_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingSendRecord;
    if (!parsed?.conversationId || typeof parsed.text !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writePendingSend(record: PendingSendRecord) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(PENDING_SEND_KEY, JSON.stringify(record));
  } catch {
    // ignore quota / disabled storage
  }
}

function clearPendingSend() {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(PENDING_SEND_KEY);
  } catch {
    // ignore
  }
}

interface ConnectionListItem {
  provider: string;
  status: string;
}

interface Props {
  conversationId: string | null;
}

export function RingeeAiView({ conversationId }: Props) {
  const api = useApi();
  const router = useRouter();
  const [agents, setAgents] = useState<AiAgentDescriptor[]>([]);
  const [agentId, setAgentId] = useState<AiAgentId>(DEFAULT_AGENT);
  const [conversations, setConversations] = useState<AiConversation[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [topLevelError, setTopLevelError] = useState<string | null>(null);
  const [connectedProviders, setConnectedProviders] = useState<string[]>([]);
  // True while we have an empty-state message queued in sessionStorage for the
  // conversation that is about to mount. Drives the empty-state spinner.
  const [hasPendingSend, setHasPendingSend] = useState<boolean>(
    () => readPendingSend() !== null
  );
  const chatInputRef = useRef<ChatInputHandle | null>(null);

  const { state, sendMessage, confirmAction } = useAiConversation(conversationId);

  // Initial load: agents + conversation list + connection summary.
  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const [agentsList, convs, connections] = await Promise.all([
          api.get<AiAgentDescriptor[]>('/ai/agents'),
          api.get<AiConversation[]>(`/ai/conversations?agent=${DEFAULT_AGENT}`),
          api
            .get<ConnectionListItem[]>('/enrichment/connections')
            .catch(() => [] as ConnectionListItem[])
        ]);
        if (cancelled) return;
        setAgents(agentsList);
        setConversations(convs);
        setConnectedProviders(
          (connections ?? [])
            .filter((c) => c.status === 'active' || c.status === 'connected')
            .map((c) => c.provider)
        );
      } catch (err) {
        if (!cancelled) {
          setTopLevelError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setConversationsLoading(false);
      }
    }
    init();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh sidebar list when the active conversation changes shape.
  useEffect(() => {
    if (!state.conversation) return;
    setConversations((prev) => {
      const others = prev.filter((c) => c.id !== state.conversation!.id);
      return [state.conversation!, ...others];
    });
  }, [
    state.conversation?.id,
    state.conversation?.title,
    state.conversation?.lastMessageAt
  ]);

  // When a queued message is waiting and the new conversation is ready,
  // dispatch it through the hook (so the optimistic message renders and
  // sendMessage's closure has the current conversationId). The queue lives in
  // sessionStorage because RingeeAiView unmounts during the empty-state →
  // conversation route change.
  useEffect(() => {
    if (
      !conversationId ||
      !state.conversation ||
      state.conversation.id !== conversationId ||
      state.loading
    ) {
      return;
    }
    const pending = readPendingSend();
    if (!pending || pending.conversationId !== conversationId) return;
    clearPendingSend();
    setHasPendingSend(false);
    void sendMessage(pending.text);
  }, [conversationId, state.conversation, state.loading, sendMessage]);

  async function handleSend(text: string) {
    setTopLevelError(null);
    if (!conversationId) {
      try {
        const c = await api.post<AiConversation>('/ai/conversations', {
          agent: agentId
        });
        setConversations((prev) => [c, ...prev]);
        // Persist across the route change — RingeeAiView remounts and React
        // state would be wiped. The effect above picks this up once the new
        // conversation route mounts and finishes its initial load.
        writePendingSend({ conversationId: c.id, text });
        setHasPendingSend(true);
        router.replace(`/dashboard/ai/${c.id}`);
      } catch (err) {
        setTopLevelError(err instanceof Error ? err.message : String(err));
      }
      return;
    }
    await sendMessage(text);
  }

  function handleSelectConversation(id: string) {
    clearPendingSend();
    setHasPendingSend(false);
    router.push(`/dashboard/ai/${id}`);
  }

  function handleNewConversation() {
    clearPendingSend();
    setHasPendingSend(false);
    router.push('/dashboard/ai');
    chatInputRef.current?.focus();
  }

  function handlePickExample(text: string) {
    // Populate the input so the user can review / edit before sending.
    chatInputRef.current?.fill(text);
  }

  function handleRequestReveal(
    jobId: string,
    externalIds: string[],
    revealPhone: boolean
  ) {
    if (externalIds.length === 0) return;
    void handleSend(
      `Please request reveal of ${externalIds.length} selected prospect${
        externalIds.length === 1 ? '' : 's'
      } from job ${jobId}${
        revealPhone ? ' (including phone number)' : ''
      }. Selected ids: ${externalIds.join(', ')}.`
    );
  }

  function handleRequestSave(jobId: string, externalIds: string[]) {
    if (externalIds.length === 0) return;
    void handleSend(
      `Please save the ${externalIds.length} selected prospect${
        externalIds.length === 1 ? '' : 's'
      } from job ${jobId} into my Ringee contacts. Selected ids: ${externalIds.join(
        ', '
      )}.`
    );
  }

  const pendingOpen = useMemo(
    () => state.pendingConfirmations.filter((c) => !c.resolved),
    [state.pendingConfirmations]
  );

  // Empty state is purely route-driven: no id in the URL means a new chat.
  const showEmpty = !conversationId;

  const showRail =
    !showEmpty &&
    (state.prospectGroups.length > 0 || state.pendingConfirmations.length > 0);

  // Ref + helper so the in-chat banner can scroll the confirmation panel into
  // view when the rail is long (or in narrower viewports where it gets pushed
  // below the fold).
  const railRef = useRef<HTMLElement | null>(null);
  const firstPendingId = pendingOpen[0]?.confirmationId ?? null;
  function focusPending() {
    if (!firstPendingId) return;
    const el = document.getElementById(`confirmation-${firstPendingId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-4', 'ring-amber-500/60');
      window.setTimeout(
        () => el.classList.remove('ring-4', 'ring-amber-500/60'),
        1200
      );
      return;
    }
    railRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className='flex h-[calc(100vh-3.5rem)] w-full lg:w-[90%] mx-auto'>
      <main className='flex flex-1 flex-col'>
        <header className='flex items-center justify-between gap-3 border-b border-border/60 bg-background/60 px-4 py-3 backdrop-blur'>
          <div className='flex items-center gap-2'>
            <ConversationList
              conversations={conversations}
              activeId={conversationId}
              loading={conversationsLoading}
              onSelect={handleSelectConversation}
              onNew={handleNewConversation}
            />
            <AgentSelector
              agents={agents}
              selectedId={agentId}
              onSelect={(id) => setAgentId(id as AiAgentId)}
            />
          </div>
          {state.conversation?.title && (
            <span className='truncate text-sm font-medium text-muted-foreground'>
              {state.conversation.title}
            </span>
          )}
        </header>

        <div className='flex flex-1 overflow-hidden'>
          <div className='flex flex-1 flex-col'>
            {topLevelError && (
              <div className='border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive'>
                {topLevelError}
              </div>
            )}
            {state.error && (
              <div className='border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive'>
                {state.error}
              </div>
            )}

            {!showEmpty && pendingOpen.length > 0 && (
              <div className='border-b border-amber-500/40 bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-transparent px-4 py-2'>
                <div className='flex items-center justify-between gap-3'>
                  <div className='flex items-center gap-2 text-sm'>
                    <span className='flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/30 text-amber-700 dark:text-amber-300'>
                      <IconAlertTriangleFilled size={13} />
                    </span>
                    <span className='font-medium'>
                      {pendingOpen.length === 1
                        ? '1 action needs your approval'
                        : `${pendingOpen.length} actions need your approval`}
                    </span>
                    <span className='hidden text-xs text-muted-foreground sm:inline'>
                      {pendingOpen[0]?.summary}
                    </span>
                  </div>
                  <Button
                    size='sm'
                    onClick={focusPending}
                    className='h-7 gap-1 bg-amber-500 text-amber-950 hover:bg-amber-400 dark:bg-amber-400 dark:text-amber-950 dark:hover:bg-amber-300'
                  >
                    Review
                  </Button>
                </div>
              </div>
            )}

            {showEmpty ? (
              <EmptyState
                providersConnected={connectedProviders}
                onPick={handlePickExample}
                onSubmit={(text) => void handleSend(text)}
                sending={hasPendingSend}
              />
            ) : state.loading ? (
              <div className='flex flex-1 items-center justify-center text-sm text-muted-foreground'>
                Loading conversation…
              </div>
            ) : (
              <>
                <ChatMessages
                  messages={state.messages}
                  streamingAssistantId={state.streamingAssistantId}
                  busy={state.busy || hasPendingSend}
                />
                <ChatInput
                  ref={chatInputRef}
                  disabled={state.loading}
                  sending={state.busy || hasPendingSend}
                  onSubmit={(text) => void handleSend(text)}
                />
              </>
            )}
          </div>

          {showRail && (
            <aside
              ref={railRef}
              className='hidden w-[28rem] shrink-0 flex-col overflow-y-auto border-l border-border/60 bg-muted/10 lg:flex'
            >
              {pendingOpen.length > 0 && (
                <div className='sticky top-0 z-10 flex flex-col gap-2 border-b border-amber-500/30 bg-background/95 px-3 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/70'>
                  {pendingOpen.map((c) => (
                    <div key={c.confirmationId} id={`confirmation-${c.confirmationId}`} className='rounded-xl transition-shadow'>
                      <ConfirmationCard
                        confirmation={c}
                        onAccept={(overrides) =>
                          confirmAction(c.confirmationId, true, overrides)
                        }
                        onDecline={() => confirmAction(c.confirmationId, false)}
                      />
                    </div>
                  ))}
                </div>
              )}

              <div className='flex flex-col gap-3 px-3 py-3'>
                {state.pendingConfirmations
                  .filter((c) => c.resolved)
                  .map((c) => (
                    <ConfirmationCard
                      key={c.confirmationId}
                      confirmation={c}
                      onAccept={() => undefined}
                      onDecline={() => undefined}
                    />
                  ))}

                <ProspectResultsPanel
                  groups={state.prospectGroups}
                  onRequestReveal={handleRequestReveal}
                  onRequestSave={handleRequestSave}
                />
              </div>
            </aside>
          )}
        </div>
      </main>
    </div>
  );
}
