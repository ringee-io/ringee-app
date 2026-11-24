'use client';

import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  DialerProvider,
  type DialerDisposition,
  type DialerSlots
} from '@ringee/dialer-ui';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import {
  DEFAULT_WORKSPACE_LABELS,
  type DialerWorkspaceLabels
} from '@ringee/dialer-ui/data/types';
import { InCallScript } from './in-call-script';
import { InCallContactInfo } from './in-call-contact-info';
import { BookMeetingForm } from './book-meeting.form';
import { ScheduleCallbackForm } from './schedule-callback.form';
import { VoicemailDropSlot } from '@/features/voicemail';
import { DISPOSITIONS_CHANGED_EVENT } from '@/features/dispositions/events';
import {
  CallSubtitles,
  LiveTranscriptPanel,
  TranscriptDialog,
  TranscribeCallButton,
  useCallTranscription,
  useRecordingSettings
} from '@/features/transcription';

import { offerOutcomeInvitation } from '@/features/ai-voice-agents/automations/follow-up/follow-up-invitation';
/**
 * Renders the live subtitles overlay. Lives in its own component so the
 * transcription hook runs for the lifetime of the active modal (the slot is
 * only mounted while a call is active), exactly as the old inline modal did.
 */
function SubtitlesSlot({
  callId,
  show
}: {
  callId?: string | null;
  show: boolean;
}) {
  const { data } = useCallTranscription(callId, {
    live: true,
    enabled: !!callId
  });
  return <CallSubtitles data={data} show={show} />;
}

/** How long the post-call view reuses the workspace's dispositions. */
const DISPOSITIONS_TTL_MS = 5 * 60_000;

/**
 * Supplies the web app's data client + the full set of rich panels to the
 * shared Active Call Modal. The extension mounts the same modal with a leaner
 * provider — the modal component itself is identical and shared.
 */
export function FrontendDialerProvider({ children }: { children: ReactNode }) {
  const locale = useLocale();
  const api = useApi();
  const { settings: recordingSettings } = useRecordingSettings();
  const t = useTranslations('calls.callbacks');
  const tFollow = useTranslations('calls.automaticFollowUp');
  const tWorkspace = useTranslations('calls.workspace');

  const slots = useMemo<DialerSlots>(
    () => ({
      renderContactInfo: ({
        contactId,
        profileActionsContainer,
        refreshKey
      }) => (
        <InCallContactInfo
          key={contactId}
          contactId={contactId}
          profileActionsContainer={profileActionsContainer}
          refreshKey={refreshKey}
          showActivities
        />
      ),
      renderScript: () => <InCallScript continuous />,
      renderBookMeeting: ({
        contactId,
        callId,
        onBooked,
        onCancel,
        layout,
        disabled,
        onPendingChange
      }) => (
        <BookMeetingForm
          key={contactId}
          layout={layout}
          disabled={disabled}
          onPendingChange={onPendingChange}
          contactId={contactId}
          callId={callId}
          onBooked={onBooked}
          onCancel={onCancel}
        />
      ),
      renderScheduleCallback: ({
        contactId,
        callId,
        onScheduled,
        onCancel
      }) => (
        <ScheduleCallbackForm
          contactId={contactId}
          callId={callId}
          onScheduled={onScheduled}
          onCancel={onCancel}
        />
      ),
      renderSubtitles: ({ callId, show }) => (
        <SubtitlesSlot callId={callId} show={show} />
      ),
      renderLiveTranscriptPanel: ({ callId }) => (
        <LiveTranscriptPanel callId={callId} />
      ),
      renderTranscriptDialog: ({ open, onOpenChange, callId }) => (
        <TranscriptDialog
          open={open}
          onOpenChange={onOpenChange}
          callId={callId}
        />
      ),
      renderVoicemailDrop: ({
        phoneNumber,
        contactId,
        callId,
        onSent,
        onCancel
      }) => (
        <VoicemailDropSlot
          phoneNumber={phoneNumber}
          contactId={contactId}
          callId={callId}
          source='web'
          onSent={onSent}
          onCancel={onCancel}
        />
      ),
      renderTranscribeButton: ({ callId, mode, onView }) =>
        mode === 'active' ? (
          <TranscribeCallButton
            callId={callId}
            mode='active'
            size='sm'
            autoTranscribeEnabled={recordingSettings.transcribeRealtime}
            className='h-12 min-w-11 cursor-pointer flex-col gap-1 border-0 bg-transparent px-2 text-xs font-normal shadow-none xl:px-3'
            onView={onView}
          />
        ) : (
          <TranscribeCallButton callId={callId} mode='history' />
        )
    }),
    [recordingSettings.transcribeRealtime]
  );

  // The workspace's dispositions, fetched while a call is up and reused for a
  // few minutes so the post-call view opens filled. An edit in Settings drops
  // the copy, so the next call shows it.
  const dispositions = useRef<{
    rows: DialerDisposition[];
    at: number;
  } | null>(null);
  const dispositionsRequest = useRef<Promise<DialerDisposition[]> | null>(null);
  // Bumped by every edit. A request that started before one answers with the
  // old list: it must not put that list back into the copy the edit dropped.
  const dispositionsGeneration = useRef(0);
  useEffect(() => {
    const forget = () => {
      dispositionsGeneration.current += 1;
      dispositions.current = null;
      dispositionsRequest.current = null;
    };
    window.addEventListener(DISPOSITIONS_CHANGED_EVENT, forget);
    return () => window.removeEventListener(DISPOSITIONS_CHANGED_EVENT, forget);
  }, []);

  const data = useMemo(
    () => ({
      // Outcome save AND skip/close share this request — with no `outcome` the
      // backend just pushes the CRM call-log note immediately. With a
      // disposition, the backend records the outcome it maps to.
      saveCallOutcome: async (input: {
        callId?: string | null;
        callSessionId?: string | null;
        outcome?: string;
        outcomeNote?: string;
        dispositionId?: string | null;
      }) => {
        const accepted = await api.post<
          import('@ringee/dialer-ui/data/types').OutcomeAcceptance
        >('/meetings/call-outcome', {
          callId: input.callId || undefined,
          callSessionId: input.callSessionId || undefined,
          outcome: input.outcome || undefined,
          callbackTimezone:
            input.outcome === 'callback_scheduled'
              ? Intl.DateTimeFormat().resolvedOptions().timeZone
              : undefined,
          outcomeNote: input.outcomeNote || undefined,
          dispositionId: input.dispositionId || undefined
        });
        // Stage 4C: only an outcome the server durably accepted invites.
        offerOutcomeInvitation(input, accepted);
        return accepted;
      },
      listDispositions: () => {
        const cached = dispositions.current;
        if (cached && Date.now() - cached.at < DISPOSITIONS_TTL_MS) {
          return Promise.resolve(cached.rows);
        }
        if (!dispositionsRequest.current) {
          const generation = dispositionsGeneration.current;
          const request: Promise<DialerDisposition[]> = api
            .get<DialerDisposition[]>('/dispositions/defaults')
            .then((rows) => {
              if (generation === dispositionsGeneration.current) {
                dispositions.current = { rows, at: Date.now() };
              }
              return rows;
            })
            .finally(() => {
              if (dispositionsRequest.current === request) {
                dispositionsRequest.current = null;
              }
            });
          dispositionsRequest.current = request;
        }
        const fresh = dispositionsRequest.current;
        // A stale copy still opens the view at once; the fresh one is next.
        if (!cached) return fresh;
        fresh.catch(() => undefined);
        return Promise.resolve(cached.rows);
      }
    }),
    [api]
  );

  return (
    <DialerProvider
      locale={locale}
      data={data}
      recordingSettings={{
        recordAllCalls: recordingSettings.recordAllCalls,
        transcribeRealtime: recordingSettings.transcribeRealtime
      }}
      slots={slots}
      labels={{
        workspace: Object.fromEntries(
          Object.keys(DEFAULT_WORKSPACE_LABELS).map((key) => [
            key,
            tWorkspace(key)
          ])
        ) as DialerWorkspaceLabels,
        followUpPreparing: tFollow('preparing'),
        followUpAccepted: tFollow('accepted'),
        followUpBlocked: tFollow('blocked'),
        followUpStopped: tFollow('stopped'),
        followUpPolicyTime: tFollow('policyTime'),
        followUpAgreedTime: tFollow('agreedTime'),
        callbackBadge: t('badge'),
        callbackDisposition: t('disposition')
      }}
      notify={(kind, message) =>
        kind === 'error' ? toast.error(message) : toast.success(message)
      }
    >
      {children}
    </DialerProvider>
  );
}
