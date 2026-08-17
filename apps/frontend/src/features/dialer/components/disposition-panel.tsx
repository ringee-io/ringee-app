'use client';

import { useState } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useDialerAttemptStore } from '../store/dialer-attempt.store';
import { useDialerSessionStore } from '../store/dialer-session.store';
import { useDialerLeadStore } from '../store/dialer-lead.store';
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

interface Props {
  campaignId: string;
  sessionId: string;
}

export function DispositionPanel({ campaignId, sessionId }: Props) {
  const api = useApi();
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
  const [submitting, setSubmitting] = useState(false);
  const [showVoicemail, setShowVoicemail] = useState(false);
  const [voicemailSent, setVoicemailSent] = useState(false);

  const selectedDispo = availableDispositions.find(
    (d) => d.code === selectedCode
  );
  const showCallbackFields = selectedDispo?.triggersCallback;

  async function handleSubmit() {
    if (!attemptId || !selectedCode) return;
    // A callback disposition needs a scheduled date to actually create the callback.
    if (showCallbackFields && !callbackDate) {
      toast.error(t('callbackRequired'));
      return;
    }
    setSubmitting(true);
    try {
      const body: any = {
        callAttemptId: attemptId,
        dispositionCode: selectedCode,
        note: note || undefined
      };
      if (showCallbackFields && callbackDate) {
        body.callbackScheduledAt = new Date(callbackDate).toISOString();
        body.callbackNote = callbackNote || undefined;
      }
      await api.post('/dialer/dispose', body);
      // Reset local state — SSE session.state event will transition us to ready
      setSelectedCode(null);
      setNote('');
      setCallbackDate('');
      setCallbackNote('');
      setShowVoicemail(false);
      setVoicemailSent(false);
      toast.success(t('saved'));
    } catch (err: any) {
      toast.error(err?.message || t('saveFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  // Show disposition panel when we have dispositions AND:
  // - call has ended, OR
  // - we're in wrap_up, OR
  // - dispositions were explicitly required by the backend, OR
  // - we have an attempt but no active call (fallback for WebRTC state misses)
  const callActive =
    callStatus === 'dialing' ||
    callStatus === 'ringing' ||
    callStatus === 'answered' ||
    callStatus === 'in_call';

  const showPanel =
    availableDispositions.length > 0 &&
    attemptId != null &&
    (dispositionRequired ||
      callStatus === 'ended' ||
      status === 'wrap_up' ||
      // Fallback: if we have an attempt + dispositions but no active call status,
      // the call likely ended without the state propagating
      (!callActive && callStatus !== null && callStatus !== 'created'));

  if (!showPanel) {
    return (
      <div className='flex h-full flex-col items-center justify-center p-6 text-center'>
        <ClipboardList className='text-muted-foreground mb-3 h-10 w-10' />
        <h3 className='font-semibold'>{t('title')}</h3>
        <p className='text-muted-foreground mt-1 text-sm'>
          {callActive
            ? t('availableAfterCall')
            : attemptId
              ? t('waiting')
              : t('selectAfterCall')}
        </p>
      </div>
    );
  }

  return (
    <div className='flex h-full flex-col p-4'>
      <h3 className='mb-3 text-sm font-semibold'>{t('select')}</h3>

      {/* Disposition buttons grid */}
      <div className='grid grid-cols-2 gap-2'>
        {availableDispositions.map((d) => (
          <Button
            key={d.code}
            variant={selectedCode === d.code ? 'default' : 'outline'}
            size='sm'
            className='justify-start'
            style={
              selectedCode === d.code && d.color
                ? { backgroundColor: d.color, borderColor: d.color }
                : d.color
                  ? { borderColor: `${d.color}60`, color: d.color }
                  : undefined
            }
            onClick={() => setSelectedCode(d.code)}
          >
            {d.label}
          </Button>
        ))}
      </div>

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
              <div className='space-y-1'>
                <Label htmlFor='callback-date' className='text-xs'>
                  {t('dateTime')}
                </Label>
                <Input
                  id='callback-date'
                  type='datetime-local'
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

      {/* Submit */}
      <div className='mt-auto pt-4'>
        <Button
          className='w-full'
          disabled={!selectedCode || submitting}
          onClick={handleSubmit}
        >
          {submitting && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
          {t('submit')}
        </Button>
      </div>
    </div>
  );
}
