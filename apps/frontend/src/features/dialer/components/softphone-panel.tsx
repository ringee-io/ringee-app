'use client';

import { useEffect, useRef, useState } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useDialerSessionStore } from '../store/dialer-session.store';
import { useDialerLeadStore } from '../store/dialer-lead.store';
import { useDialerAttemptStore } from '../store/dialer-attempt.store';
import { useDialerCall } from '../hooks/use-dialer-call';
import { shortcutAllowed } from '@ringee/frontend-shared/lib/shortcuts';
import { useTelnyxStore } from '@/features/calls/store/telnyx.store';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@ringee/frontend-shared/components/ui/popover';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { DtmfKeypad } from '@ringee/dialer-ui';
import {
  Phone,
  PhoneCall,
  PhoneOff,
  PhoneOutgoing,
  Mic,
  MicOff,
  Pause,
  Play,
  Circle,
  SkipForward,
  Grid3X3,
  Captions,
  CaptionsOff,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import {
  CallSubtitles,
  TranscriptDialog,
  TranscribeCallButton,
  useCallTranscription,
  useRecordingSettings
} from '@/features/transcription';
import { useTranslations } from 'next-intl';

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

type BarState = 'waiting' | 'preview' | 'dialing' | 'live' | 'ended' | 'idle';

const STATE_ICON: Record<BarState, { icon: typeof Phone; className: string }> =
  {
    waiting: { icon: Phone, className: 'bg-muted text-muted-foreground' },
    preview: { icon: Phone, className: 'bg-primary/10 text-primary' },
    dialing: {
      icon: PhoneOutgoing,
      className:
        'animate-pulse bg-amber-500/15 text-amber-600 dark:text-amber-400'
    },
    live: {
      icon: PhoneCall,
      className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
    },
    ended: { icon: PhoneOff, className: 'bg-muted text-muted-foreground' },
    idle: { icon: Phone, className: 'bg-muted text-muted-foreground' }
  };

interface Props {
  campaignId: string;
  sessionId: string;
  /** The Ringee call behind the live leg, once the server has created it. */
  transcriptionCallId: string | null;
}

/**
 * The call bar across the top of the workspace: who is on the line, for how
 * long, and every control for the call — dial and skip before it; mute, hold,
 * record, keypad and hang-up during it. A bar rather than a column, so the
 * script gets the middle of the screen.
 */
export function SoftphonePanel({
  campaignId,
  sessionId,
  transcriptionCallId
}: Props) {
  const api = useApi();
  const t = useTranslations('dialer.softphone');
  const status = useDialerSessionStore((s) => s.status);
  const currentLead = useDialerLeadStore((s) => s.currentLead);
  const callStatus = useDialerAttemptStore((s) => s.callStatus);
  const callDuration = useDialerAttemptStore((s) => s.callDuration);

  const {
    activeCall,
    callState,
    isMuted,
    isOnHold,
    isRecording,
    isRecordingLoading,
    toggleMute,
    toggleHold,
    toggleRecord,
    sendDTMF,
    hangup
  } = useDialerCall();
  const lineReady = useTelnyxStore((s) => s.status === 'registered');
  const [dialRequested, setDialRequested] = useState(false);

  const [showDTMF, setShowDTMF] = useState(false);
  const [showSubtitles, setShowSubtitles] = useState(true);
  // When auto-record / auto-transcribe is enforced by the workspace settings,
  // the manual toggles are disabled (the backend starts them on answer).
  const { settings: recordingSettings } = useRecordingSettings();
  const [transcriptDialogOpen, setTranscriptDialogOpen] = useState(false);
  const [localTimer, setLocalTimer] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Local call timer — start when Telnyx call becomes active. A call on hold is
  // still connected; counting it as not would reset the timer to zero.
  const isConnected = callState === 'active' || callState === 'held';
  const isDialingWebRTC =
    callState === 'new' ||
    callState === 'trying' ||
    callState === 'requesting' ||
    callState === 'early' ||
    callState === 'answering';

  useEffect(() => {
    if (isConnected) {
      setLocalTimer(0);
      timerRef.current = setInterval(() => {
        setLocalTimer((t) => t + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (!isDialingWebRTC) {
        setLocalTimer(0);
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isConnected, isDialingWebRTC]);

  const displayDuration = callDuration > 0 ? callDuration : localTimer;

  const isInCall =
    isConnected || callStatus === 'answered' || callStatus === 'in_call';
  const isDialing =
    isDialingWebRTC || callStatus === 'dialing' || callStatus === 'ringing';

  const { data: transcriptionData } = useCallTranscription(
    transcriptionCallId,
    {
      live: isInCall,
      enabled: isInCall
    }
  );

  // Attach the remote audio stream
  const audioRef = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    // Before answer, Telnyx already plays the quiet local ringback. Waiting
    // until active avoids stacking carrier early media on top of that tone.
    if (
      activeCall &&
      callState === 'active' &&
      (activeCall as any).remoteStream &&
      audioRef.current
    ) {
      audioRef.current.srcObject = (activeCall as any).remoteStream;
      audioRef.current.play().catch(() => {});
    }
  }, [activeCall, callState]);

  // The keypad belongs to the call it was opened on.
  useEffect(() => {
    if (!isInCall) setShowDTMF(false);
  }, [isInCall]);

  // One Dial / Skip request at a time: a double click used to race two dials
  // for the same lead.
  async function handleDial() {
    if (dialRequested) return;
    setDialRequested(true);
    try {
      await api.post('/dialer/dial', { sessionId, campaignId });
    } catch (err: any) {
      toast.error(err?.message || t('dialFailed'));
    } finally {
      setDialRequested(false);
    }
  }

  async function handleSkip() {
    if (dialRequested) return;
    setDialRequested(true);
    try {
      await api.post('/dialer/skip', { sessionId, campaignId });
    } catch (err: any) {
      toast.error(err?.message || t('skipFailed'));
    } finally {
      setDialRequested(false);
    }
  }

  async function handleHangup() {
    await hangup();
  }

  // Preview mode: Enter dials the lead on screen, S skips it.
  const previewing = !!currentLead && !activeCall && status === 'reserved';
  const shortcutActions = useRef({ handleDial, handleSkip });
  shortcutActions.current = { handleDial, handleSkip };
  useEffect(() => {
    if (!previewing) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key !== 'enter' && key !== 's') return;
      if (!shortcutAllowed(event, 'activation')) return;
      event.preventDefault();
      if (key === 'enter') {
        if (lineReady) void shortcutActions.current.handleDial();
      } else {
        void shortcutActions.current.handleSkip();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [previewing, lineReady]);

  // The controls stay up for as long as a call is under way, lead or no lead:
  // a live call must never lose its hang-up button. A lead still in preview
  // has no leg yet — it gets Dial and Skip instead.
  const showControls = !previewing && (isInCall || isDialing);
  const state: BarState = previewing
    ? 'preview'
    : isInCall
      ? 'live'
      : isDialing
        ? 'dialing'
        : !currentLead
          ? 'waiting'
          : callStatus === 'ended'
            ? 'ended'
            : 'idle';
  const { icon: StateIcon, className: stateIconClass } = STATE_ICON[state];

  const contact = currentLead?.contact;
  const leadName = contact
    ? contact.name ||
      [contact.firstName, contact.lastName].filter(Boolean).join(' ') ||
      null
    : null;

  return (
    <div className='bg-background flex min-h-16 shrink-0 flex-wrap items-center gap-x-5 gap-y-2 border-b px-4 py-2'>
      <audio ref={audioRef} autoPlay playsInline className='hidden' />
      <TranscriptDialog
        open={transcriptDialogOpen}
        onOpenChange={setTranscriptDialogOpen}
        callId={transcriptionCallId}
      />
      <CallSubtitles
        data={transcriptionData}
        show={isInCall && showSubtitles}
      />

      {/* Who is on the line — or what the session is waiting for */}
      <div className='flex min-w-0 items-center gap-3'>
        <span
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
            stateIconClass
          )}
        >
          {state === 'waiting' && status === 'paused' ? (
            <Pause className='h-4 w-4' />
          ) : (
            <StateIcon className='h-4 w-4' />
          )}
        </span>
        {contact ? (
          <div className='min-w-0'>
            <p className='truncate text-sm font-semibold'>
              {leadName ?? contact.phoneNumber}
            </p>
            {leadName ? (
              <p className='text-muted-foreground truncate text-xs tabular-nums'>
                {contact.phoneNumber}
              </p>
            ) : null}
          </div>
        ) : (
          <p className='text-muted-foreground text-sm'>
            {status === 'paused' ? t('paused') : t('waiting')}
          </p>
        )}
      </div>

      {/* Where the call is */}
      {state === 'live' || state === 'dialing' || state === 'ended' ? (
        <div className='flex flex-wrap items-center gap-2'>
          {state === 'live' ? (
            <span className='font-mono text-xl font-semibold tabular-nums'>
              {formatDuration(displayDuration)}
            </span>
          ) : state === 'dialing' ? (
            <span className='text-muted-foreground animate-pulse text-sm'>
              {t('dialing')}
            </span>
          ) : (
            <span className='text-muted-foreground text-sm'>{t('ended')}</span>
          )}
          {isRecording ? (
            <span className='inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-400'>
              <Circle className='h-2 w-2 fill-current' />
              {t('recording')}
            </span>
          ) : null}
          {isOnHold ? (
            <span className='rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400'>
              {t('onHold')}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Before the call: dial or skip the lead on screen */}
      {previewing ? (
        <div className='ml-auto flex items-center gap-2'>
          <Button
            onClick={handleDial}
            disabled={dialRequested || !lineReady}
            aria-keyshortcuts='Enter'
            className='h-10 bg-emerald-600 px-4 text-white hover:bg-emerald-700'
          >
            {dialRequested ? <Loader2 className='animate-spin' /> : <Phone />}
            {t('dial')}
            <kbd className='rounded border border-white/30 px-1 font-mono text-[10px] opacity-80'>
              Enter
            </kbd>
          </Button>
          <Button
            variant='outline'
            onClick={handleSkip}
            disabled={dialRequested}
            aria-keyshortcuts='S'
            className='h-10 px-4'
          >
            <SkipForward />
            {t('skip')}
            <kbd className='bg-muted text-muted-foreground rounded border px-1 font-mono text-[10px]'>
              S
            </kbd>
          </Button>
        </div>
      ) : null}

      {/* During the call */}
      {showControls ? (
        <div className='ml-auto flex flex-wrap items-center gap-2'>
          <Button
            variant={isMuted ? 'destructive' : 'outline'}
            size='icon'
            className='h-10 w-10 rounded-full'
            onClick={toggleMute}
            disabled={!isInCall}
            title={isMuted ? t('unmute') : t('mute')}
            aria-label={isMuted ? t('unmute') : t('mute')}
            aria-pressed={isMuted}
          >
            {isMuted ? <MicOff /> : <Mic />}
          </Button>
          <Button
            variant={isOnHold ? 'secondary' : 'outline'}
            size='icon'
            className='h-10 w-10 rounded-full'
            onClick={toggleHold}
            disabled={!isInCall}
            title={isOnHold ? t('resume') : t('hold')}
            aria-label={isOnHold ? t('resume') : t('hold')}
            aria-pressed={isOnHold}
          >
            {isOnHold ? <Play /> : <Pause />}
          </Button>
          <Button
            variant={isRecording ? 'destructive' : 'outline'}
            size='icon'
            className='h-10 w-10 rounded-full'
            onClick={toggleRecord}
            disabled={
              !isInCall ||
              isRecordingLoading ||
              recordingSettings.recordAllCalls
            }
            title={
              recordingSettings.recordAllCalls
                ? t('autoRecording')
                : isRecording
                  ? t('stopRecording')
                  : t('startRecording')
            }
            aria-label={isRecording ? t('stopRecording') : t('startRecording')}
            aria-pressed={isRecording}
          >
            <Circle className={cn(isRecording && 'fill-white')} />
          </Button>
          <Popover open={showDTMF} onOpenChange={setShowDTMF}>
            <PopoverTrigger asChild>
              <Button
                variant={showDTMF ? 'secondary' : 'outline'}
                size='icon'
                className='h-10 w-10 rounded-full'
                disabled={!isInCall}
                title={t('sendDtmf')}
                aria-label={t('sendDtmf')}
              >
                <Grid3X3 />
              </Button>
            </PopoverTrigger>
            <PopoverContent align='end' className='w-auto p-3'>
              <DtmfKeypad onSendDTMF={sendDTMF} />
            </PopoverContent>
          </Popover>

          <span
            aria-hidden
            className='bg-border mx-1 hidden h-6 w-px sm:block'
          />

          <TranscribeCallButton
            callId={transcriptionCallId}
            mode='active'
            autoTranscribeEnabled={recordingSettings.transcribeRealtime}
            className='h-10 rounded-full px-4'
            onView={() => setTranscriptDialogOpen(true)}
          />
          <Button
            variant={showSubtitles ? 'secondary' : 'outline'}
            size='icon'
            className='h-10 w-10 rounded-full'
            onClick={() => setShowSubtitles((prev) => !prev)}
            title={showSubtitles ? t('hideSubtitles') : t('showSubtitles')}
            aria-label={showSubtitles ? t('hideSubtitles') : t('showSubtitles')}
            aria-pressed={showSubtitles}
          >
            {showSubtitles ? <Captions /> : <CaptionsOff />}
          </Button>

          <span
            aria-hidden
            className='bg-border mx-1 hidden h-6 w-px sm:block'
          />

          <Button
            variant='destructive'
            className='h-10 rounded-full px-5'
            onClick={handleHangup}
          >
            <PhoneOff />
            {t('hangup')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
