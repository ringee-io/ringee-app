'use client';

import { useEffect, useState } from 'react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Textarea } from '@ringee/frontend-shared/components/ui/textarea';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Label } from '@ringee/frontend-shared/components/ui/label';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { Calendar, CalendarClock, ClipboardList, Loader2 } from 'lucide-react';
import type { CallOutcome, SessionItemDto } from '../api';
import type { CallSessionPhase } from '../use-call-session';

interface OutcomeMeta {
  value: CallOutcome;
  label: string;
  tone: 'positive' | 'neutral' | 'negative';
  triggersCallback?: boolean;
  triggersMeeting?: boolean;
}

const OUTCOMES: OutcomeMeta[] = [
  {
    value: 'meeting_booked',
    label: 'Meeting booked',
    tone: 'positive',
    triggersMeeting: true
  },
  { value: 'sale', label: 'Sale', tone: 'positive' },
  { value: 'interested', label: 'Interested', tone: 'positive' },
  {
    value: 'follow_up',
    label: 'Follow up',
    tone: 'neutral',
    triggersCallback: true
  },
  {
    value: 'callback_scheduled',
    label: 'Callback scheduled',
    tone: 'neutral',
    triggersCallback: true
  },
  { value: 'not_interested', label: 'Not interested', tone: 'negative' },
  { value: 'no_answer', label: 'No answer', tone: 'neutral' },
  { value: 'voicemail', label: 'Voicemail', tone: 'neutral' },
  { value: 'wrong_number', label: 'Wrong number', tone: 'negative' },
  { value: 'gatekeeper', label: 'Gatekeeper', tone: 'neutral' }
];

interface Props {
  phase: CallSessionPhase;
  activeItem: SessionItemDto | null;
  busy: boolean;
  onSave: (
    outcome: CallOutcome,
    body: {
      outcomeNote?: string;
      callbackAt?: string;
      meeting?: {
        scheduledAt: string;
        title?: string;
        duration?: number;
        attendeeEmail?: string;
      };
    },
    action: 'continue' | 'stop'
  ) => void | Promise<void>;
}

export function SessionDispositionPanel(props: Props) {
  const { phase, activeItem, busy, onSave } = props;
  const [selected, setSelected] = useState<OutcomeMeta | null>(null);
  const [note, setNote] = useState('');
  const [callbackAt, setCallbackAt] = useState('');
  const [meetingAt, setMeetingAt] = useState('');
  const [meetingTitle, setMeetingTitle] = useState('');
  const [meetingDuration, setMeetingDuration] = useState(30);
  const [meetingEmail, setMeetingEmail] = useState('');

  // Reset form when we move on from wrap_up to another item.
  useEffect(() => {
    if (phase !== 'wrap_up') {
      setSelected(null);
      setNote('');
      setCallbackAt('');
      setMeetingAt('');
      setMeetingTitle('');
      setMeetingDuration(30);
      setMeetingEmail('');
    }
  }, [phase, activeItem?.id]);

  if (phase !== 'wrap_up') {
    return (
      <div className='flex h-full flex-col items-center justify-center p-6 text-center'>
        <ClipboardList className='text-muted-foreground mb-3 h-10 w-10' />
        <h3 className='font-semibold'>Disposition</h3>
        <p className='text-muted-foreground mt-1 text-sm'>
          {phase === 'preview'
            ? 'Select a call outcome after each call.'
            : phase === 'completed'
              ? 'Session is complete — nothing more to record.'
              : phase === 'in_call' || phase === 'dialing'
                ? 'Disposition will be available after the call ends.'
                : 'Waiting…'}
        </p>
      </div>
    );
  }

  const submit = (action: 'continue' | 'stop') => {
    if (!selected) return;
    const body: Parameters<typeof onSave>[1] = {};
    if (note.trim()) body.outcomeNote = note.trim();
    if (selected.triggersCallback && callbackAt) {
      body.callbackAt = new Date(callbackAt).toISOString();
    }
    if (selected.triggersMeeting && meetingAt) {
      body.meeting = {
        scheduledAt: new Date(meetingAt).toISOString(),
        title:
          meetingTitle.trim() ||
          `Meeting with ${activeItem?.displayName ?? 'contact'}`,
        duration: meetingDuration,
        attendeeEmail: meetingEmail.trim() || undefined
      };
    }
    void onSave(selected.value, body, action);
  };

  const callbackMissing = selected?.triggersCallback && !callbackAt;
  const meetingMissing = selected?.triggersMeeting && !meetingAt;
  const canSubmit = !!selected && !busy && !callbackMissing && !meetingMissing;

  return (
    <div className='flex h-full flex-col p-4'>
      <h3 className='mb-1 text-sm font-semibold'>Select disposition</h3>
      <p className='text-muted-foreground mb-3 text-xs'>
        Outcome is required before continuing to the next contact.
      </p>

      <div className='grid grid-cols-2 gap-2'>
        {OUTCOMES.map((o) => {
          const isSelected = selected?.value === o.value;
          const toneCls =
            o.tone === 'positive'
              ? isSelected
                ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-300'
              : o.tone === 'negative'
                ? isSelected
                  ? 'bg-red-600 text-white border-red-600 hover:bg-red-700'
                  : 'border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300'
                : isSelected
                  ? 'bg-foreground text-background border-foreground'
                  : '';
          return (
            <Button
              key={o.value}
              variant={isSelected ? 'default' : 'outline'}
              size='sm'
              className={'justify-start ' + toneCls}
              onClick={() => setSelected(o)}
            >
              {o.label}
            </Button>
          );
        })}
      </div>

      <Separator className='my-4' />

      <div className='space-y-3'>
        <div className='space-y-1'>
          <Label htmlFor='dispo-note' className='text-xs'>
            Notes (optional)
          </Label>
          <Textarea
            id='dispo-note'
            placeholder='Add notes from the call...'
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
          />
        </div>

        {selected?.triggersCallback && (
          <>
            <Separator />
            <div className='space-y-2'>
              <div className='flex items-center gap-2 text-sm font-medium'>
                <CalendarClock className='h-4 w-4' />
                Schedule callback
              </div>
              <div className='space-y-1'>
                <Label htmlFor='callback-at' className='text-xs'>
                  Date &amp; time
                </Label>
                <Input
                  id='callback-at'
                  type='datetime-local'
                  value={callbackAt}
                  onChange={(e) => setCallbackAt(e.target.value)}
                />
              </div>
            </div>
          </>
        )}

        {selected?.triggersMeeting && (
          <>
            <Separator />
            <div className='space-y-2'>
              <div className='flex items-center gap-2 text-sm font-medium'>
                <Calendar className='h-4 w-4' />
                Book meeting
              </div>
              <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
                <div className='space-y-1'>
                  <Label htmlFor='meeting-at' className='text-xs'>
                    Date &amp; time
                  </Label>
                  <Input
                    id='meeting-at'
                    type='datetime-local'
                    value={meetingAt}
                    onChange={(e) => setMeetingAt(e.target.value)}
                  />
                </div>
                <div className='space-y-1'>
                  <Label htmlFor='meeting-duration' className='text-xs'>
                    Duration (min)
                  </Label>
                  <Input
                    id='meeting-duration'
                    type='number'
                    min={5}
                    max={480}
                    value={meetingDuration}
                    onChange={(e) =>
                      setMeetingDuration(Number(e.target.value) || 30)
                    }
                  />
                </div>
                <div className='space-y-1 sm:col-span-2'>
                  <Label htmlFor='meeting-title' className='text-xs'>
                    Title
                  </Label>
                  <Input
                    id='meeting-title'
                    type='text'
                    placeholder={`Meeting with ${activeItem?.displayName ?? 'contact'}`}
                    value={meetingTitle}
                    onChange={(e) => setMeetingTitle(e.target.value)}
                  />
                </div>
                <div className='space-y-1 sm:col-span-2'>
                  <Label htmlFor='meeting-email' className='text-xs'>
                    Attendee email (optional)
                  </Label>
                  <Input
                    id='meeting-email'
                    type='email'
                    placeholder='prospect@example.com'
                    value={meetingEmail}
                    onChange={(e) => setMeetingEmail(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <div className='mt-auto flex flex-col gap-2 pt-4'>
        <Button onClick={() => submit('continue')} disabled={!canSubmit}>
          {busy && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
          Save outcome &amp; continue
        </Button>
        <Button
          variant='outline'
          onClick={() => submit('stop')}
          disabled={!canSubmit}
        >
          Save outcome &amp; stop
        </Button>
      </div>
    </div>
  );
}
