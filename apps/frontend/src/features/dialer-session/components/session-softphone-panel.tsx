'use client';

import { useEffect, useState } from 'react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  CheckCircle2,
  Circle,
  Grid3X3,
  Loader2,
  Mic,
  MicOff,
  Pause,
  Phone,
  PhoneOff,
  Play,
  SkipForward,
  X
} from 'lucide-react';
import type { SessionItemDto } from '../api';
import type { CallSessionPhase } from '../use-call-session';

interface CallState {
  state: 'idle' | 'dialing' | 'ringing' | 'connected' | 'held' | 'ended';
  isMuted: boolean;
  isOnHold: boolean;
  isRecording: boolean;
  isRecordingLoading: boolean;
}

interface Props {
  phase: CallSessionPhase;
  activeItem: SessionItemDto | null;
  call: CallState;
  busy: boolean;
  creditsOk: boolean;
  telnyxStatus:
    | 'idle'
    | 'connecting'
    | 'registered'
    | 'reconnecting'
    | 'disconnected'
    | 'error';
  callerIdNumber: string | null;
  /** True when the owner's workspace auto-records every call. */
  recordAllCalls?: boolean;
  onDial: () => void | Promise<void>;
  onSkip: () => void | Promise<void>;
  onHangup: () => void | Promise<void>;
  onToggleMute: () => void | Promise<void>;
  onToggleHold: () => void | Promise<void>;
  onToggleRecording: () => void | Promise<void>;
  onSendDTMF: (digit: string) => void;
}

const DTMF_KEYS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['*', '0', '#']
];

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function SessionSoftphonePanel(props: Props) {
  const {
    phase,
    activeItem,
    call,
    busy,
    creditsOk,
    telnyxStatus,
    callerIdNumber,
    recordAllCalls = false,
    onDial,
    onSkip,
    onHangup,
    onToggleMute,
    onToggleHold,
    onToggleRecording,
    onSendDTMF
  } = props;

  const [showDTMF, setShowDTMF] = useState(false);
  const [connectedSec, setConnectedSec] = useState(0);
  const [ringingSec, setRingingSec] = useState(0);

  // Reset timers on phase boundaries.
  useEffect(() => {
    if (phase !== 'in_call') setConnectedSec(0);
    if (phase !== 'dialing') setRingingSec(0);
  }, [phase]);

  useEffect(() => {
    if (call.state !== 'connected' && call.state !== 'held') return;
    const id = setInterval(() => setConnectedSec((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, [call.state]);

  useEffect(() => {
    if (call.state !== 'dialing' && call.state !== 'ringing') return;
    const id = setInterval(() => setRingingSec((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, [call.state]);

  if (phase === 'completed') {
    return (
      <div className='flex flex-col items-center justify-center gap-4 p-8 text-center'>
        <CheckCircle2 className='h-16 w-16 text-emerald-500' />
        <div>
          <h2 className='text-xl font-semibold'>All calls completed</h2>
          <p className='text-muted-foreground mt-1 text-sm'>
            Every contact in this session has been processed.
          </p>
        </div>
      </div>
    );
  }

  if (!activeItem) {
    return (
      <div className='flex flex-col items-center justify-center gap-3 p-8 text-center'>
        <Phone className='text-muted-foreground/40 h-16 w-16' />
        <p className='text-muted-foreground text-sm'>
          Pick a contact from the queue to start.
        </p>
      </div>
    );
  }

  const lineReady = telnyxStatus === 'registered';
  const dialDisabled = busy || !lineReady || !creditsOk;

  // Preview state — default flow.
  if (phase === 'preview') {
    return (
      <div className='flex flex-col items-center justify-center gap-6 p-8'>
        <div className='text-center'>
          <div className='text-muted-foreground text-xs tracking-wide uppercase'>
            Preview dialer
          </div>
          <p className='mt-2 text-2xl font-semibold'>
            {activeItem.displayName || 'Unknown contact'}
          </p>
          {activeItem.company && (
            <p className='text-muted-foreground text-sm'>
              {activeItem.company}
            </p>
          )}
          <p className='text-muted-foreground mt-2 font-mono text-sm'>
            {activeItem.phoneNumberMasked}
          </p>
          {callerIdNumber && (
            <p className='text-muted-foreground mt-1 text-xs'>
              Calling from <span className='font-mono'>{callerIdNumber}</span>
            </p>
          )}
        </div>

        <div className='flex gap-3'>
          <Button size='lg' onClick={onDial} disabled={dialDisabled}>
            <Phone className='mr-2 h-5 w-5' />
            Dial
          </Button>
          <Button variant='outline' size='lg' onClick={onSkip} disabled={busy}>
            <SkipForward className='mr-2 h-5 w-5' />
            Skip
          </Button>
        </div>

        {!lineReady && (
          <p className='text-xs text-amber-600'>
            Connecting phone line… ({telnyxStatus})
          </p>
        )}
        {!creditsOk && (
          <p className='text-xs text-red-600'>
            Not enough credits to place this call.
          </p>
        )}
      </div>
    );
  }

  // Dialing or ringing.
  if (phase === 'dialing') {
    return (
      <div className='flex flex-col items-center justify-center gap-5 p-8'>
        <div className='text-center'>
          <Loader2 className='mx-auto h-10 w-10 animate-spin text-orange-500' />
          <p className='mt-3 text-lg font-semibold'>
            {call.state === 'ringing' ? 'Ringing…' : 'Dialing…'}
          </p>
          <p className='text-muted-foreground text-sm'>
            {activeItem.displayName} · {activeItem.phoneNumberMasked}
          </p>
          <p className='mt-3 font-mono text-2xl text-orange-500 tabular-nums'>
            {formatDuration(ringingSec)}
          </p>
        </div>
        <Button
          variant='destructive'
          size='lg'
          className='h-14 w-14 rounded-full'
          onClick={onHangup}
          disabled={busy}
          title='End call'
        >
          <PhoneOff className='h-6 w-6' />
        </Button>
      </div>
    );
  }

  // In call (connected or held) — full controls.
  if (phase === 'in_call') {
    const inCall = true;
    return (
      <div className='flex flex-col items-center justify-center gap-6 p-8'>
        <div className='text-center'>
          <div className='text-xs tracking-wide text-red-500 uppercase'>
            {call.state === 'held' ? 'On hold' : 'In call'}
          </div>
          <p className='mt-2 text-xl font-semibold'>{activeItem.displayName}</p>
          <p className='text-muted-foreground text-sm'>
            {activeItem.phoneNumberMasked}
          </p>
          <p className='mt-3 font-mono text-4xl font-bold tabular-nums'>
            {formatDuration(connectedSec)}
          </p>
          {call.isRecording && (
            <div className='mt-1 flex items-center justify-center gap-1 text-xs text-red-500'>
              <Circle className='h-2 w-2 fill-red-500' />
              Recording
            </div>
          )}
          {call.isOnHold && (
            <div className='mt-1 text-xs text-yellow-600'>On hold</div>
          )}
        </div>

        <div className='flex items-center gap-3'>
          <Button
            variant={call.isMuted ? 'destructive' : 'outline'}
            size='icon'
            className='h-12 w-12 rounded-full'
            onClick={onToggleMute}
            disabled={!inCall}
            title={call.isMuted ? 'Unmute' : 'Mute'}
          >
            {call.isMuted ? (
              <MicOff className='h-5 w-5' />
            ) : (
              <Mic className='h-5 w-5' />
            )}
          </Button>

          <Button
            variant={call.isOnHold ? 'secondary' : 'outline'}
            size='icon'
            className='h-12 w-12 rounded-full'
            onClick={onToggleHold}
            disabled={!inCall}
            title={call.isOnHold ? 'Resume' : 'Hold'}
          >
            {call.isOnHold ? (
              <Play className='h-5 w-5' />
            ) : (
              <Pause className='h-5 w-5' />
            )}
          </Button>

          <Button
            variant={call.isRecording ? 'destructive' : 'outline'}
            size='icon'
            className='h-12 w-12 rounded-full'
            onClick={onToggleRecording}
            disabled={!inCall || call.isRecordingLoading || recordAllCalls}
            title={
              recordAllCalls
                ? 'Auto-recording is on for all calls'
                : call.isRecording
                  ? 'Stop recording'
                  : 'Start recording'
            }
          >
            {call.isRecordingLoading ? (
              <Loader2 className='h-5 w-5 animate-spin' />
            ) : (
              <Circle
                className={`h-5 w-5 ${call.isRecording ? 'fill-white' : ''}`}
              />
            )}
          </Button>

          <Button
            variant={showDTMF ? 'secondary' : 'outline'}
            size='icon'
            className='h-12 w-12 rounded-full'
            onClick={() => setShowDTMF((v) => !v)}
            disabled={!inCall}
            title='Send DTMF'
          >
            <Grid3X3 className='h-5 w-5' />
          </Button>
        </div>

        <Button
          variant='destructive'
          size='lg'
          className='h-14 w-14 rounded-full'
          onClick={onHangup}
          disabled={busy}
          title='End call'
        >
          <PhoneOff className='h-6 w-6' />
        </Button>

        {showDTMF && (
          <div className='bg-card relative rounded-lg border p-3 shadow-sm'>
            <Button
              variant='ghost'
              size='icon'
              className='absolute top-1 right-1 h-6 w-6'
              onClick={() => setShowDTMF(false)}
            >
              <X className='h-3 w-3' />
            </Button>
            <div className='grid grid-cols-3 gap-2 pt-4'>
              {DTMF_KEYS.flat().map((key) => (
                <Button
                  key={key}
                  variant='outline'
                  size='sm'
                  className='h-10 w-10 font-mono text-lg'
                  onClick={() => onSendDTMF(key)}
                >
                  {key}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Wrap up
  return (
    <div className='flex flex-col items-center justify-center gap-4 p-8 text-center'>
      <div className='text-xs tracking-wide text-purple-600 uppercase'>
        Wrap up
      </div>
      <p className='text-lg font-semibold'>Call ended</p>
      <p className='text-muted-foreground text-sm'>
        Record the outcome on the right to continue to the next contact.
      </p>
    </div>
  );
}
