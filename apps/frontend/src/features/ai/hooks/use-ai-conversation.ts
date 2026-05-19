'use client';

import { useCallback, useEffect, useState } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { ApiError } from '@ringee/frontend-shared/lib/api';
import { useCreditStore } from '@/features/credit/store/credit.store';
import type {
  AiConversation,
  AiMessage,
  AiToolEvent,
  DedupAction,
  DuplicateSearchMatch,
  DuplicateSearchNotice,
  ProspectPreview,
  StreamMessage
} from '../types';
import { useAiStream } from './use-ai-stream';

/** Parse a duplicate_search_detected tool-event payload into a notice. */
function parseDuplicateNotice(
  toolEventId: string,
  payload: Record<string, unknown>
): DuplicateSearchNotice | null {
  const match = payload.match as DuplicateSearchMatch | undefined;
  const relationship = payload.relationship;
  if (
    !match ||
    (relationship !== 'identical' && relationship !== 'similar')
  ) {
    return null;
  }
  return {
    toolEventId,
    relationship,
    match,
    recommendedActions:
      (payload.recommendedActions as DedupAction[] | undefined) ?? [],
    message: String(payload.message ?? '')
  };
}

export interface PendingConfirmation {
  confirmationId: string;
  action: 'reveal' | 'save' | 'list_create';
  summary: string;
  payload: Record<string, unknown>;
  estimatedCreditCost: number | null;
  resolved: boolean;
  accepted?: boolean;
}

export interface ProspectResultGroup {
  toolEventId: string;
  jobId: string;
  provider: string;
  filtersSummary: string;
  results: ProspectPreview[];
}

export interface AiConversationState {
  conversation: AiConversation | null;
  messages: AiMessage[];
  toolEvents: AiToolEvent[];
  prospectGroups: ProspectResultGroup[];
  /** Active "you already ran this" prompts, cleared once new results arrive. */
  duplicateSearches: DuplicateSearchNotice[];
  pendingConfirmations: PendingConfirmation[];
  streamingAssistantId: string | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
}

/**
 * Owns conversation state for the AI page: loads history, subscribes to the
 * SSE stream, applies deltas, exposes commands (sendMessage, confirm, decline).
 */
export function useAiConversation(conversationId: string | null) {
  const api = useApi();
  const [state, setState] = useState<AiConversationState>({
    conversation: null,
    messages: [],
    toolEvents: [],
    prospectGroups: [],
    duplicateSearches: [],
    pendingConfirmations: [],
    streamingAssistantId: null,
    loading: false,
    busy: false,
    error: null
  });

  const reload = useCallback(async () => {
    if (!conversationId) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const [conv, msgs] = await Promise.all([
        api.get<AiConversation>(`/ai/conversations/${conversationId}`),
        api.get<{ messages: AiMessage[]; toolEvents: AiToolEvent[] }>(
          `/ai/conversations/${conversationId}/messages`
        )
      ]);

      const prospectGroups: ProspectResultGroup[] = msgs.toolEvents
        .filter((e) => e.kind === 'prospect_results')
        .map((e) => ({
          toolEventId: e.id,
          jobId: String((e.payload as Record<string, unknown>)?.jobId ?? ''),
          provider: String((e.payload as Record<string, unknown>)?.provider ?? ''),
          filtersSummary: String(
            (e.payload as Record<string, unknown>)?.filtersSummary ?? ''
          ),
          results:
            ((e.payload as Record<string, unknown>)?.results as ProspectPreview[]) ?? []
        }));

      // A duplicate-search prompt is "active" only while it is the most
      // recent search-related event — once a prospect_results event follows
      // it, the user has already moved past the decision.
      const lastResultsIdx = msgs.toolEvents.reduce(
        (last, e, i) => (e.kind === 'prospect_results' ? i : last),
        -1
      );
      const duplicateSearches: DuplicateSearchNotice[] = msgs.toolEvents
        .map((e, i) => ({ e, i }))
        .filter(
          ({ e, i }) =>
            e.kind === 'duplicate_search_detected' && i > lastResultsIdx
        )
        .map(({ e }) =>
          parseDuplicateNotice(
            e.id,
            (e.payload as Record<string, unknown>) ?? {}
          )
        )
        .filter((n): n is DuplicateSearchNotice => n !== null);

      // Every confirmation_request row is surfaced as a card. Older runs
      // persisted each confirmation twice (once by the tool, once by the
      // orchestrator); the orchestrator copy embedded the tool row's id under
      // payload.requestId, leaving the tool row orphaned and unresolved — a
      // stuck "Action required" card on every reload. Drop any confirmation
      // whose id is referenced as another confirmation's requestId. New runs
      // persist a single row, so this is a no-op for them.
      const confirmationEvents = msgs.toolEvents.filter(
        (e) => e.kind === 'confirmation_request'
      );
      const shadowedConfirmationIds = new Set(
        confirmationEvents
          .map((e) => (e.payload as Record<string, unknown> | null)?.requestId)
          .filter((v): v is string => typeof v === 'string')
      );
      const pendingConfirmations: PendingConfirmation[] = confirmationEvents
        .filter((e) => !shadowedConfirmationIds.has(e.id))
        .map((e) => ({
          confirmationId: e.id,
          action: ((e.payload as Record<string, unknown>)?.action as PendingConfirmation['action']) ?? 'reveal',
          summary: String((e.payload as Record<string, unknown>)?.summary ?? ''),
          payload: (e.payload as Record<string, unknown>) ?? {},
          estimatedCreditCost: null,
          resolved: e.resolved,
          accepted:
            (e.resolutionData as Record<string, unknown> | null)?.accepted === true
        }));

      setState((s) => ({
        ...s,
        conversation: conv,
        messages: msgs.messages,
        toolEvents: msgs.toolEvents,
        prospectGroups,
        duplicateSearches,
        pendingConfirmations,
        loading: false
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : String(err)
      }));
    }
  }, [api, conversationId]);

  useEffect(() => {
    if (!conversationId) {
      setState({
        conversation: null,
        messages: [],
        toolEvents: [],
        prospectGroups: [],
        duplicateSearches: [],
        pendingConfirmations: [],
        streamingAssistantId: null,
        loading: false,
        busy: false,
        error: null
      });
      return;
    }
    void reload();
  }, [conversationId, reload]);

  // SSE → state reducer
  useAiStream(conversationId, (event: StreamMessage) => {
    // Credit side-effects, kept out of the setState updater so React strict
    // mode's double-invocation can't double-apply them.
    if (event.type === 'usage') {
      const cost = Number(event.costCredits ?? 0);
      if (cost > 0) {
        const store = useCreditStore.getState();
        store.setBalance(Math.max(0, store.balance - cost));
      }
    } else if (
      event.type === 'error' &&
      event.code === 'insufficient_credit'
    ) {
      useCreditStore.getState().setBalance(0);
    }

    setState((prev) => {
      switch (event.type) {
        case 'message_started': {
          const msg: AiMessage = {
            id: String(event.messageId),
            conversationId: conversationId!,
            role: 'assistant',
            status: 'streaming',
            content: '',
            toolName: null,
            toolPayload: null,
            createdAt: String(event.createdAt ?? new Date().toISOString())
          };
          return {
            ...prev,
            messages: [...prev.messages, msg],
            streamingAssistantId: msg.id,
            busy: true
          };
        }
        case 'text_delta': {
          const id = String(event.messageId);
          return {
            ...prev,
            messages: prev.messages.map((m) =>
              m.id === id
                ? { ...m, content: (m.content ?? '') + String(event.delta) }
                : m
            )
          };
        }
        case 'message_completed': {
          const id = String(event.messageId);
          return {
            ...prev,
            messages: prev.messages.map((m) =>
              m.id === id
                ? {
                    ...m,
                    content: String(event.content ?? m.content ?? ''),
                    status: 'completed' as const
                  }
                : m
            ),
            streamingAssistantId:
              prev.streamingAssistantId === id ? null : prev.streamingAssistantId
          };
        }
        case 'tool_event': {
          const kind = String(event.kind ?? '');
          const payload = (event.payload as Record<string, unknown>) ?? {};
          if (kind === 'prospect_results') {
            const group: ProspectResultGroup = {
              toolEventId: String(event.toolEventId ?? ''),
              jobId: String(payload.jobId ?? ''),
              provider: String(payload.provider ?? ''),
              filtersSummary: String(payload.filtersSummary ?? ''),
              results: (payload.results as ProspectPreview[]) ?? []
            };
            return {
              ...prev,
              prospectGroups: [...prev.prospectGroups, group],
              // New results supersede any pending duplicate-search prompt.
              duplicateSearches: []
            };
          }
          if (kind === 'duplicate_search_detected') {
            // This event is streamed but never persisted, so it has no
            // tool-event id — synthesize a stable one for the React key.
            const noticeId =
              String(event.toolEventId || '') ||
              `dup-${Date.now()}-${prev.duplicateSearches.length}`;
            const notice = parseDuplicateNotice(noticeId, payload);
            return notice
              ? {
                  ...prev,
                  duplicateSearches: [...prev.duplicateSearches, notice]
                }
              : prev;
          }
          return prev;
        }
        case 'confirmation_request': {
          const conf: PendingConfirmation = {
            confirmationId: String(event.confirmationId ?? ''),
            action: (event.action as PendingConfirmation['action']) ?? 'reveal',
            summary: String(event.summary ?? ''),
            payload: (event.payload as Record<string, unknown>) ?? {},
            estimatedCreditCost:
              typeof event.estimatedCreditCost === 'number'
                ? event.estimatedCreditCost
                : null,
            resolved: false
          };
          return {
            ...prev,
            pendingConfirmations: [...prev.pendingConfirmations, conf]
          };
        }
        case 'confirmation_resolved': {
          const id = String(event.confirmationId ?? '');
          return {
            ...prev,
            pendingConfirmations: prev.pendingConfirmations.map((c) =>
              c.confirmationId === id
                ? { ...c, resolved: true, accepted: event.accepted === true }
                : c
            )
          };
        }
        case 'usage': {
          const id = String(event.messageId);
          const total = Number(
            event.conversationTotalCost ??
              prev.conversation?.totalCostCredits ??
              0
          );
          return {
            ...prev,
            messages: prev.messages.map((m) =>
              m.id === id
                ? {
                    ...m,
                    model: (event.model as string | null) ?? m.model ?? null,
                    inputTokens: Number(event.inputTokens ?? 0),
                    outputTokens: Number(event.outputTokens ?? 0),
                    cachedTokens: Number(event.cachedTokens ?? 0),
                    cacheWriteTokens: Number(event.cacheWriteTokens ?? 0),
                    costCredits: Number(event.costCredits ?? 0)
                  }
                : m
            ),
            conversation: prev.conversation
              ? { ...prev.conversation, totalCostCredits: total }
              : prev.conversation
          };
        }
        case 'completed': {
          return { ...prev, busy: false, streamingAssistantId: null };
        }
        case 'error': {
          return { ...prev, error: String(event.message ?? 'Unknown error'), busy: false };
        }
        default:
          return prev;
      }
    });
  });

  const sendMessage = useCallback(
    async (text: string) => {
      if (!conversationId || !text.trim()) return;
      const optimistic: AiMessage = {
        id: `local_${Date.now()}`,
        conversationId,
        role: 'user',
        status: 'completed',
        content: text,
        toolName: null,
        toolPayload: null,
        createdAt: new Date().toISOString()
      };
      setState((s) => ({
        ...s,
        messages: [...s.messages, optimistic],
        busy: true,
        error: null
      }));
      try {
        await api.post(`/ai/conversations/${conversationId}/messages`, { text });
      } catch (err) {
        const code =
          err instanceof ApiError
            ? (err.data as { code?: string } | undefined)?.code
            : undefined;
        if (code === 'INSUFFICIENT_CREDIT') {
          // Reflect the server's verdict immediately so the out-of-credit
          // panel renders without waiting for a balance refetch.
          useCreditStore.getState().setBalance(0);
        }
        setState((s) => ({
          ...s,
          busy: false,
          error: err instanceof Error ? err.message : String(err)
        }));
      }
    },
    [api, conversationId]
  );

  const confirmAction = useCallback(
    async (
      confirmationId: string,
      accepted: boolean,
      overrides?: Record<string, unknown>
    ) => {
      if (!conversationId) return;
      try {
        await api.post(
          `/ai/conversations/${conversationId}/confirm/${confirmationId}`,
          { accepted, overrides }
        );
        // The SSE confirmation_resolved event will update local state.
      } catch (err) {
        setState((s) => ({
          ...s,
          error: err instanceof Error ? err.message : String(err)
        }));
      }
    },
    [api, conversationId]
  );

  return { state, sendMessage, confirmAction, reload };
}
