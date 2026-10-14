'use client';

import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useMemo } from 'react';
import type {
  AutomationCapability,
  AutomationCard,
  AutomationPanel,
  AutomationSummary,
  InboundNumberRef,
  InboundRouteOption,
  ReminderCallNowResult,
  UpcomingReminderCall
} from './types';

const BASE = '/ai-voice-agent-automations';

interface QuickAgentBody {
  /** Reuse an agent the workspace already has instead of creating one. */
  agentId?: string;
  name?: string;
  /** Base language of a new agent's voice — the interface language. */
  language?: string;
  /** A new agent's voice, picked in the rail; wins over `language`. */
  voiceId?: string;
}

/**
 * One typed client for the rail. Configuration routes are admin-only on the
 * server; the rail hides them from members, but the server is the boundary.
 */
export function useAutomationApi() {
  const api = useApi();

  return useMemo(
    () => ({
      /** Whether the rail is on for this workspace at all — cheap and ungated. */
      access: () =>
        api.get<{ hasAccess: boolean; automations?: boolean }>(
          '/ai-voice-agents-access'
        ),
      summary: () => api.get<AutomationSummary>(`${BASE}/summary`),
      panel: () => api.get<AutomationPanel>(BASE),

      reminderScope: (calendarIds: string[], offsetMinutes: number) =>
        api.get<{ meetings: number; calls: number }>(
          `${BASE}/reminders/scope`,
          {
            calendarIds: calendarIds.join(','),
            offsetMinutes: String(offsetMinutes)
          }
        ),
      upcomingReminderCalls: () =>
        api.get<UpcomingReminderCall[]>(`${BASE}/reminders/upcoming`),

      setupReminders: (
        body: QuickAgentBody & {
          callerNumberId?: string;
          calendarIds: string[];
          offsetMinutes: number;
        }
      ) => api.post<AutomationCard>(`${BASE}/reminders/setup`, body),
      setupReceptionist: (
        body: QuickAgentBody & {
          numbers: InboundNumberRef[];
          fallback?: {
            destinationType: 'user' | 'ring_group';
            destinationId: string;
          } | null;
        }
      ) =>
        api.post<{
          card: AutomationCard;
          failed: Array<{ number: InboundNumberRef; error: string }>;
        }>(`${BASE}/receptionist/setup`, body),
      setupScheduling: (
        body: QuickAgentBody & { callerNumberId?: string; calendarId?: string }
      ) => api.post<AutomationCard>(`${BASE}/scheduling/setup`, body),
      setEnabled: (capability: AutomationCapability, enabled: boolean) =>
        api.post<AutomationCard>(`${BASE}/${capability}/enabled`, { enabled }),
      /** Deletes the trigger — never its agent; the card comes back not set up. */
      removeAutomation: (capability: AutomationCapability) =>
        api.delete<AutomationCard>(`${BASE}/${capability}`),

      confirmationCall: (meetingId: string) =>
        api.post<ReminderCallNowResult>(
          `${BASE}/meetings/${meetingId}/confirmation-call`
        ),
      scheduleCall: (body: {
        contactId: string;
        responsibleUserId?: string;
        firstName?: string;
        fromNumberId?: string;
      }) =>
        api.post<{ id: string; status: string }>(
          `${BASE}/scheduling/calls`,
          body
        ),
      completeEmail: (deliveryId: string, email: string) =>
        api.post<{ queued: boolean }>(
          `${BASE}/emails/${deliveryId}/lead-email`,
          { email }
        ),

      /** The numbers the receptionist could answer, and what each does today. */
      inboundNumbers: () =>
        api.get<InboundRouteOption[]>('/inbound-routes/numbers')
    }),
    [api]
  );
}
