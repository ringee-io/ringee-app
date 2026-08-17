'use client';

import { useMemo, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { DialerProvider, type DialerSlots } from '@ringee/dialer-ui';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { ContactActivities } from './contact-activities';
import { InCallScript } from './in-call-script';
import { InCallContactInfo } from './in-call-contact-info';
import { BookMeetingForm } from './book-meeting.form';
import { ScheduleCallbackForm } from './schedule-callback.form';
import { VoicemailDropSlot } from '@/features/voicemail';
import {
  CallSubtitles,
  LiveTranscriptPanel,
  TranscriptDialog,
  TranscribeCallButton,
  useCallTranscription,
  useRecordingSettings
} from '@/features/transcription';

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

/**
 * Supplies the web app's data client + the full set of rich panels to the
 * shared Active Call Modal. The extension mounts the same modal with a leaner
 * provider — the modal component itself is identical and shared.
 */
export function FrontendDialerProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const { settings: recordingSettings } = useRecordingSettings();
  const t = useTranslations('calls.callbacks');

  const slots = useMemo<DialerSlots>(
    () => ({
      renderContactActivities: ({ contactId }) => (
        <ContactActivities contactId={contactId} />
      ),
      renderContactInfo: ({ contactId }) => (
        <InCallContactInfo contactId={contactId} />
      ),
      renderScript: () => <InCallScript />,
      renderBookMeeting: ({ contactId, callId, onBooked, onCancel }) => (
        <BookMeetingForm
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
            className='h-12 rounded px-3 text-xs md:h-14 md:px-4 md:text-sm'
            onView={onView}
          />
        ) : (
          <TranscribeCallButton callId={callId} mode='history' />
        )
    }),
    [recordingSettings.transcribeRealtime]
  );

  const data = useMemo(
    () => ({
      // Outcome save AND skip/close share this request — with no `outcome` the
      // backend just pushes the CRM call-log note immediately.
      saveCallOutcome: (input: {
        callId?: string | null;
        callSessionId?: string | null;
        outcome?: string;
        outcomeNote?: string;
      }) =>
        api
          .post('/meetings/call-outcome', {
            callId: input.callId || undefined,
            callSessionId: input.callSessionId || undefined,
            outcome: input.outcome || undefined,
            outcomeNote: input.outcomeNote || undefined
          })
          .then(() => undefined)
    }),
    [api]
  );

  return (
    <DialerProvider
      data={data}
      recordingSettings={{
        recordAllCalls: recordingSettings.recordAllCalls,
        transcribeRealtime: recordingSettings.transcribeRealtime
      }}
      slots={slots}
      labels={{
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
