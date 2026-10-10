'use client';

import { useEffect, useRef, useState } from 'react';
import { useDialerAttemptStore } from '../store/dialer-attempt.store';
import { useDialerSessionStore } from '../store/dialer-session.store';
import { useDialerLeadStore } from '../store/dialer-lead.store';
import { useDisposeLead } from '../hooks/use-dispose-lead';
import { shortcutAllowed } from '@ringee/frontend-shared/lib/shortcuts';
import { DispositionGrid } from './disposition-grid';
import { VoicemailDropSlot } from '@/features/voicemail';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Textarea } from '@ringee/frontend-shared/components/ui/textarea';
import { Label } from '@ringee/frontend-shared/components/ui/label';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import {
  Loader2,
  ClipboardList,
  Calendar,
  Voicemail,
  Check
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

/** A `Date` as the value a `datetime-local` input holds, in local time. */
function toLocalInput(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const CALLBACK_PRESETS = [
  'inOneHour',
  'tomorrowMorning',
  'nextMonday'
] as const;
type CallbackPreset = (typeof CALLBACK_PRESETS)[number];

/** The usual "call me back …" answers, one click each, in the agent's time. */
function presetDate(preset: CallbackPreset, now = new Date()): Date {
  const date = new Date(now);
  if (preset === 'inOneHour') {
    date.setMinutes(date.getMinutes() + 60);
    // Round up to the next five minutes: nobody books 14:37.
    date.setMinutes(Math.ceil(date.getMinutes() / 5) * 5, 0, 0);
    return date;
  }
  const daysAhead =
    preset === 'tomorrowMorning' ? 1 : (8 - date.getDay()) % 7 || 7;
  date.setDate(date.getDate() + daysAhead);
  date.setHours(9, 0, 0, 0);
  return date;
}

export function DispositionPanel() {
  const t = useTranslations('dialer.disposition');
  const tVoicemail = useTranslations('voicemail');
  const attemptId = useDialerAttemptStore((s) => s.attemptId);
  const dispositionRequired = useDialerAttemptStore(
    (s) => s.dispositionRequired
  );
  const availableDispositions = useDialerAttemptStore(
    (s) => s.availableDispositions
  );
  const callStatus = useDialerAttemptStore((s) => s.callStatus);
  const status = useDialerSessionStore((s) => s.status);

  const currentLead = useDialerLeadStore((s) => s.currentLead);

  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [callbackDate, setCallbackDate] = useState('');
  const [callbackNote, setCallbackNote] = useState('');
  const [showVoicemail, setShowVoicemail] = useState(false);
  const [voicemailSent, setVoicemailSent] = useState(false);
  const { dispose, submitting } = useDisposeLead();

  const selectedDispo = availableDispositions.find(
    (d) => d.code === selectedCode
  );
  const showCallbackFields = selectedDispo?.triggersCallback;

  function resetForm() {
    setSelectedCode(null);
    setNote('');
    setCallbackDate('');
    setCallbackNote('');
    setShowVoicemail(false);
    setVoicemailSent(false);
  }

  async function handleSubmit() {
    if (!attemptId || !selectedCode) return;
    // A callback disposition needs a scheduled date to actually create the callback.
    if (showCallbackFields && !callbackDate) {
      toast.error(t('callbackRequired'));
      return;
    }
    const saved = await dispose({
      dispositionId: selectedDispo?.id,
      dispositionCode: selectedCode,
      note,
      ...(showCallbackFields && callbackDate
        ? { callbackScheduledAt: callbackDate, callbackNote }
        : {})
    });
    if (!saved) return;

    // Reset local state — SSE session.state event will transition us to ready
    resetForm();
  }

  // A new lead means a blank form, whatever became of the last one.
  useEffect(() => {
    resetForm();
  }, [attemptId]);

  // Read by the call-ended effect below, which fires on one transition and has
  // to see these as they are at that instant without re-running as they change.
  const latest = useRef({
    selectedCode,
    callbackDate,
    showCallbackFields,
    handleSubmit
  });
  latest.current = {
    selectedCode,
    callbackDate,
    showCallbackFields,
    handleSubmit
  };

  // The call just ended. An outcome the agent already picked while talking is
  // saved right here, so the dialer moves straight to the next lead. Anything
  // still missing — no outcome, or a callback without its date — leaves the
  // form up and the session waiting for the agent, which is the point.
  const settledAttemptRef = useRef<string | null>(null);
  useEffect(() => {
    if (callStatus !== 'ended' || !attemptId) return;
    if (settledAttemptRef.current === attemptId) return;
    settledAttemptRef.current = attemptId;

    const { selectedCode, callbackDate, showCallbackFields, handleSubmit } =
      latest.current;
    if (!selectedCode) return;
    if (showCallbackFields && !callbackDate) return;
    void handleSubmit();
  }, [callStatus, attemptId]);

  // Show the panel from the moment the call is under way — dialing, ringing,
  // live, or over — so the agent can pick the outcome while they are still
  // talking. It stays up after the call until the disposition is saved.
  const callActive =
    callStatus === 'dialing' ||
    callStatus === 'ringing' ||
    callStatus === 'answered' ||
    callStatus === 'in_call';

  // `dispositionRequired` is the backend saying the call is over; trust it over
  // a WebRTC state that never arrived, or a missed hangup would leave the
  // agent looking at a form they cannot submit.
  const callLive = callActive && !dispositionRequired;

  const showPanel =
    availableDispositions.length > 0 &&
    attemptId != null &&
    // Anything past `created` means a call for this lead is under way or done.
    // `dispositionRequired` and `wrap_up` are kept as a backstop for the case
    // where the backend asks for an outcome before a WebRTC state reached us.
    (dispositionRequired ||
      status === 'wrap_up' ||
      (callStatus !== null && callStatus !== 'created'));

  // 1–9 picks an outcome (during the call too — it is saved at hang-up), and
  // Enter saves it once the call is over. Neither ever ends the call.
  useEffect(() => {
    if (!showPanel) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (/^[1-9]$/.test(event.key)) {
        if (!shortcutAllowed(event, 'digit')) return;
        const option = availableDispositions[Number(event.key) - 1];
        if (!option) return;
        event.preventDefault();
        setSelectedCode(option.code);
        return;
      }
      if (event.key === 'Enter') {
        if (!shortcutAllowed(event, 'activation')) return;
        if (!latest.current.selectedCode || callLive || submitting) return;
        event.preventDefault();
        void latest.current.handleSubmit();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showPanel, availableDispositions, callLive, submitting]);

  // The column is already titled by the workspace; the panel only says what to
  // do with it right now.
  if (!showPanel) {
    return (
      <div className='flex h-full flex-col items-center justify-center p-6 text-center'>
        <ClipboardList className='text-muted-foreground mb-3 h-10 w-10' />
        <p className='text-muted-foreground max-w-xs text-sm'>
          {attemptId ? t('availableOnDial') : t('selectAfterCall')}
        </p>
      </div>
    );
  }

  return (
    <div className='flex h-full flex-col p-4'>
      <p className='text-muted-foreground mb-3 text-xs'>
        {callLive ? t('pickWhileTalking') : t('pickToContinue')}
      </p>

      <DispositionGrid
        dispositions={availableDispositions}
        selectedCode={selectedCode}
        onSelect={(d) => setSelectedCode(d.code)}
        showShortcuts
      />

      <Separator className='my-4' />

      {/* Notes */}
      <div className='space-y-3'>
        <div className='space-y-1'>
          <Label htmlFor='dispo-note' className='text-xs'>
            {t('notes')}
          </Label>
          <Textarea
            id='dispo-note'
            placeholder={t('notesPlaceholder')}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
          />
        </div>

        {/* Callback fields */}
        {showCallbackFields && (
          <>
            <Separator />
            <div className='space-y-2'>
              <div className='flex items-center gap-2 text-sm font-medium'>
                <Calendar className='h-4 w-4' />
                {t('scheduleCallback')}
              </div>
              <div className='flex flex-wrap gap-1.5'>
                {CALLBACK_PRESETS.map((preset) => (
                  <Button
                    key={preset}
                    type='button'
                    variant='outline'
                    size='sm'
                    className='h-7 px-2.5 text-xs'
                    onClick={() =>
                      setCallbackDate(toLocalInput(presetDate(preset)))
                    }
                  >
                    {t(`presets.${preset}`)}
                  </Button>
                ))}
              </div>
              <div className='space-y-1'>
                <Label htmlFor='callback-date' className='text-xs'>
                  {t('dateTime')}
                </Label>
                <Input
                  id='callback-date'
                  type='datetime-local'
                  min={toLocalInput(new Date())}
                  value={callbackDate}
                  onChange={(e) => setCallbackDate(e.target.value)}
                />
              </div>
              <div className='space-y-1'>
                <Label htmlFor='callback-note' className='text-xs'>
                  {t('callbackNote')}
                </Label>
                <Textarea
                  id='callback-note'
                  placeholder={t('callbackPlaceholder')}
                  value={callbackNote}
                  onChange={(e) => setCallbackNote(e.target.value)}
                  rows={2}
                />
              </div>
            </div>
          </>
        )}

        {/* Voicemail drop — same conditional-section shape as the callback
            fields above, so wrap-up reads as one column of steps. */}
        {currentLead?.contact.phoneNumber && (
          <>
            <Separator />
            {voicemailSent ? (
              <div className='text-muted-foreground flex items-center gap-2 text-xs'>
                <Check className='h-3.5 w-3.5' />
                {tVoicemail('sent')}
              </div>
            ) : showVoicemail ? (
              <VoicemailDropSlot
                phoneNumber={currentLead.contact.phoneNumber}
                contactId={currentLead.contact.id}
                source='campaign'
                destinationLabel={
                  currentLead.contact.name || currentLead.contact.phoneNumber
                }
                onSent={() => {
                  setVoicemailSent(true);
                  setShowVoicemail(false);
                  toast.success(tVoicemail('sent'));
                }}
                onCancel={() => setShowVoicemail(false)}
              />
            ) : (
              <Button
                type='button'
                variant='outline'
                size='sm'
                className='w-full justify-start'
                onClick={() => setShowVoicemail(true)}
              >
                <Voicemail className='mr-2 h-4 w-4' />
                {tVoicemail('title')}
              </Button>
            )}
          </>
        )}
      </div>

      {/* Submit. Disabled while the call is live: saving now would hand the
          agent their next lead mid-conversation. It is saved for them the
          moment the call ends instead. */}
      <div className='mt-auto pt-4'>
        <Button
          className='w-full'
          disabled={!selectedCode || submitting || callLive}
          onClick={handleSubmit}
          aria-keyshortcuts='Enter'
        >
          {submitting && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
          {callLive && selectedCode ? t('submitOnHangup') : t('submit')}
          {!callLive && selectedCode && !submitting ? (
            <kbd className='ml-2 rounded border border-current/30 px-1 font-mono text-[10px] opacity-70'>
              Enter
            </kbd>
          ) : null}
        </Button>
        <p className='text-muted-foreground mt-2 text-center text-[11px]'>
          {t('shortcutsHint')}
        </p>
      </div>
    </div>
  );
}
