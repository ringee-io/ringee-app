'use client';

import { cn } from '@ringee/frontend-shared/lib/utils';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Phone,
  PhoneMissed,
  Voicemail,
  Mic,
  StickyNote,
  CalendarClock,
  AlertCircle,
  PhoneOutgoing,
  PhoneIncoming
} from 'lucide-react';
import { InboxEvent } from '../types';
import { EncryptedAudio } from './encrypted-audio';
import { useTranslations } from 'next-intl';

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatDuration(sec?: number | null) {
  if (!sec || sec <= 0) return null;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

function MessageBubble({ event }: { event: InboxEvent }) {
  const outbound = event.direction === 'outbound';
  const failed = event.kind === 'message_failed' || event.status === 'failed';
  const hasMedia = event.mediaUrls.length > 0;

  return (
    <div
      className={cn(
        'flex w-full',
        outbound ? 'justify-end' : 'justify-start'
      )}
    >
      <div
        className={cn(
          'max-w-[75%] rounded-2xl px-4 py-2 text-sm shadow-sm',
          outbound
            ? 'rounded-br-sm bg-primary text-primary-foreground'
            : 'rounded-bl-sm bg-muted',
          failed && 'border border-red-400'
        )}
      >
        {hasMedia && (
          <div className='mb-2 grid grid-cols-2 gap-1.5'>
            {event.mediaUrls.map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={url}
                alt='media'
                className='h-32 w-full rounded-md object-cover'
              />
            ))}
          </div>
        )}
        {event.body && <p className='whitespace-pre-wrap'>{event.body}</p>}
        <div
          className={cn(
            'mt-1 flex items-center gap-1.5 text-[10px]',
            outbound ? 'text-primary-foreground/70' : 'text-muted-foreground'
          )}
        >
          <span>{formatTime(event.occurredAt)}</span>
          {event.status && (
            <span className='uppercase tracking-wide'>· {event.status}</span>
          )}
          {failed && <AlertCircle className='h-3 w-3' />}
        </div>
      </div>
    </div>
  );
}

function CallCard({ event }: { event: InboxEvent }) {
  const t = useTranslations('inbox.events');
  const isMissed = event.kind === 'missed_call';
  const inbound = event.direction === 'inbound';
  const Icon = isMissed
    ? PhoneMissed
    : inbound
      ? PhoneIncoming
      : PhoneOutgoing;
  const recording = event.call?.recordings?.[0];

  return (
    <div
      className={cn(
        'mx-auto w-full max-w-md rounded-xl border bg-card p-3 shadow-sm',
        isMissed && 'border-red-200 bg-red-50/30 dark:bg-red-950/20'
      )}
    >
      <div className='flex items-start gap-3'>
        <div
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-full',
            isMissed
              ? 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300'
              : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300'
          )}
        >
          <Icon className='h-4 w-4' />
        </div>
        <div className='flex-1'>
          <div className='flex items-center gap-2'>
            <p className='text-sm font-medium'>
              {isMissed
                ? t('missedCall')
                : inbound
                  ? t('inboundCall')
                  : t('outboundCall')}
            </p>
            <span className='text-xs text-muted-foreground'>
              {formatTime(event.occurredAt)}
            </span>
          </div>
          <div className='mt-0.5 text-xs text-muted-foreground'>
            {event.fromNumber} → {event.toNumber}
          </div>
          <div className='mt-1 flex flex-wrap items-center gap-2 text-xs'>
            {formatDuration(event.durationSec) && (
              <Badge variant='outline'>{formatDuration(event.durationSec)}</Badge>
            )}
            {event.metadata?.outcome && (
              <Badge variant='secondary'>
                {String(event.metadata.outcome).replace(/_/g, ' ')}
              </Badge>
            )}
          </div>
          {event.body && (
            <p className='mt-2 text-xs text-muted-foreground'>{event.body}</p>
          )}
          {recording?.url && <EncryptedAudio url={recording.url} />}
          {isMissed && event.fromNumber && (
            <div className='mt-2 flex gap-2'>
              <Button
                size='sm'
                variant='outline'
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent('ringee:dial', {
                      detail: { number: event.fromNumber }
                    })
                  )
                }
              >
                <Phone className='mr-1 h-3.5 w-3.5' />
                {t('callBack')}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function VoicemailCard({ event }: { event: InboxEvent }) {
  const t = useTranslations('inbox.events');
  return (
    <div className='mx-auto w-full max-w-md rounded-xl border bg-amber-50/40 p-3 shadow-sm dark:bg-amber-950/20'>
      <div className='flex items-start gap-3'>
        <div className='flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200'>
          <Voicemail className='h-4 w-4' />
        </div>
        <div className='flex-1'>
          <div className='flex items-center gap-2'>
            <p className='text-sm font-medium'>{t('voicemailReceived')}</p>
            <span className='text-xs text-muted-foreground'>
              {formatTime(event.occurredAt)}
            </span>
            {formatDuration(event.durationSec) && (
              <Badge variant='outline'>{formatDuration(event.durationSec)}</Badge>
            )}
          </div>
          {event.audioUrl && <EncryptedAudio url={event.audioUrl} />}
          {event.transcript && (
            <p className='mt-2 text-xs italic text-muted-foreground'>
              “{event.transcript}”
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function VoiceDropCard({ event }: { event: InboxEvent }) {
  const t = useTranslations('inbox.events');
  return (
    <div className='mx-auto w-full max-w-md rounded-xl border bg-violet-50/40 p-3 shadow-sm dark:bg-violet-950/20'>
      <div className='flex items-start gap-3'>
        <div className='flex h-9 w-9 items-center justify-center rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-200'>
          <Mic className='h-4 w-4' />
        </div>
        <div className='flex-1'>
          <div className='flex items-center gap-2'>
            <p className='text-sm font-medium'>{t('voicedropSent')}</p>
            <span className='text-xs text-muted-foreground'>
              {formatTime(event.occurredAt)}
            </span>
            {formatDuration(event.durationSec) && (
              <Badge variant='outline'>{formatDuration(event.durationSec)}</Badge>
            )}
          </div>
          {event.body && (
            <p className='mt-1 text-xs text-muted-foreground'>{event.body}</p>
          )}
          {event.audioUrl && <EncryptedAudio url={event.audioUrl} />}
        </div>
      </div>
    </div>
  );
}

function NoteCard({ event }: { event: InboxEvent }) {
  const t = useTranslations('inbox.events');
  return (
    <div className='mx-auto w-full max-w-md rounded-md border-l-4 border-yellow-400 bg-yellow-50/60 p-3 dark:bg-yellow-950/20'>
      <div className='flex items-start gap-2'>
        <StickyNote className='mt-0.5 h-4 w-4 text-yellow-600' />
        <div className='flex-1'>
          <div className='flex items-center gap-2'>
            <span className='text-xs font-medium uppercase text-yellow-700 dark:text-yellow-300'>
              {t('internalNote')}
            </span>
            <span className='text-xs text-muted-foreground'>
              {formatTime(event.occurredAt)}
            </span>
          </div>
          <p className='mt-1 whitespace-pre-wrap text-sm'>{event.body}</p>
        </div>
      </div>
    </div>
  );
}

function CallbackCard({ event }: { event: InboxEvent }) {
  const t = useTranslations('inbox.events');
  const scheduled = event.metadata?.scheduledAt
    ? new Date(event.metadata.scheduledAt).toLocaleString()
    : null;

  return (
    <div className='mx-auto w-full max-w-md rounded-xl border bg-cyan-50/40 p-3 dark:bg-cyan-950/20'>
      <div className='flex items-start gap-3'>
        <div className='flex h-9 w-9 items-center justify-center rounded-full bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-200'>
          <CalendarClock className='h-4 w-4' />
        </div>
        <div className='flex-1'>
          <p className='text-sm font-medium'>
            {event.kind === 'meeting_booked'
              ? t('meetingBooked')
              : event.kind === 'callback_completed'
                ? t('callbackCompleted')
                : t('callbackScheduled')}
          </p>
          {scheduled && (
            <p className='text-xs text-muted-foreground'>{scheduled}</p>
          )}
          {event.body && (
            <p className='mt-1 text-xs text-muted-foreground'>{event.body}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function EventBubble({ event }: { event: InboxEvent }) {
  switch (event.kind) {
    case 'sms_received':
    case 'sms_sent':
    case 'mms_received':
    case 'mms_sent':
    case 'message_failed':
      return <MessageBubble event={event} />;
    case 'missed_call':
    case 'call_completed':
    case 'call_started':
    case 'call_answered':
      return <CallCard event={event} />;
    case 'voicemail_received':
      return <VoicemailCard event={event} />;
    case 'voicemail_drop_sent':
      return <VoiceDropCard event={event} />;
    case 'note_added':
      return <NoteCard event={event} />;
    case 'callback_scheduled':
    case 'callback_completed':
    case 'meeting_booked':
      return <CallbackCard event={event} />;
    default:
      return (
        <div className='mx-auto text-xs text-muted-foreground'>
          <Phone className='mr-1 inline h-3 w-3' />
          {event.title ?? event.kind}
        </div>
      );
  }
}

