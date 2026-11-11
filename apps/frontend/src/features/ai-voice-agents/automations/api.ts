'use client';

import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useMemo } from 'react';
import type {
  AutomationCapability,
  AutomationCard,
  AutomationPanel,
  AutomationSummary,
  FollowUpDraft,
  FollowUpEntrySource,
  FollowUpMeetingCoverage,
  FollowUpResultSummary,
  FollowUpReview,
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
        body: QuickAgentBody & {
          callerNumberId?: string;
          calendarId?: string;
          humanFollowUpEnabled?: boolean;
          interestedObjective?: 'booking' | 'information';
        }
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
        api.get<InboundRouteOption[]>('/inbound-routes/numbers'),

      // ── Shared follow-up review (Stage 4C) ──
      /** Read-only: opening the review never creates or plans anything. */
      followUpReview: (params: {
        meetingId?: string | null;
        timeZone?: string;
      }) =>
        api.get<FollowUpReview>(`${BASE}/follow-up`, {
          ...(params.meetingId ? { meetingId: params.meetingId } : {}),
          ...(params.timeZone ? { timeZone: params.timeZone } : {})
        }),
      /** "Configuration saved" — a draft, nothing authorized. Admins only. */
      saveFollowUp: (body: {
        draft: Partial<FollowUpDraft>;
        expectedRevision: number | null;
        entrySource?: FollowUpEntrySource;
        timeZone?: string;
        meetingId?: string;
      }) => api.put<FollowUpReview>(`${BASE}/follow-up/configuration`, body),
      /** "Activate automatic follow-up": the explicit adoption. */
      adoptFollowUp: (body: {
        requestKey: string;
        expectedRevision: number | null;
        draft?: Partial<FollowUpDraft>;
        entrySource?: FollowUpEntrySource;
        timeZone?: string;
        language?: string;
        meetingVersion?: number;
      }) =>
        api.post<{
          review: FollowUpReview;
          meetingCoverage: FollowUpMeetingCoverage | null;
        }>(`${BASE}/follow-up/adoption`, body),
      followUpMeetingCoverage: (meetingId: string) =>
        api.get<FollowUpMeetingCoverage>(
          `${BASE}/follow-up/meetings/${meetingId}/coverage`
        ),
      followUpResults: () =>
        api.get<FollowUpResultSummary>(`${BASE}/follow-up/results`)
    }),
    [api]
  );
}
