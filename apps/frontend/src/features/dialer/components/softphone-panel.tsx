'use client';

import { useEffect, useRef, useState } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useDialerSessionStore } from '../store/dialer-session.store';
import { useDialerLeadStore } from '../store/dialer-lead.store';
import { useDialerAttemptStore } from '../store/dialer-attempt.store';
import { useDialerCall } from '../hooks/use-dialer-call';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { DtmfKeypad } from '@ringee/dialer-ui';
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Pause,
  Play,
  Circle,
  SkipForward,
  Grid3X3,
  X,
  Captions,
  CaptionsOff
} from 'lucide-react';
import { toast } from 'sonner';
import {
  CallSubtitles,
  LiveTranscriptPanel,
  TranscriptDialog,
  TranscribeCallButton,
  useCallTranscription,
  useCallIdBySession,
  useRecordingSettings
} from '@/features/transcription';
import { useTranslations } from 'next-intl';

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

interface Props {
  campaignId: string;
  sessionId: string;
}

export function SoftphonePanel({ campaignId, sessionId }: Props) {
  const api = useApi();
  const t = useTranslations('dialer.softphone');
  const status = useDialerSessionStore((s) => s.status);
  const currentLead = useDialerLeadStore((s) => s.currentLead);
  const callStatus = useDialerAttemptStore((s) => s.callStatus);
  const callDuration = useDialerAttemptStore((s) => s.callDuration);

  const {
    activeCall,
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

  const [showDTMF, setShowDTMF] = useState(false);
  const [showSubtitles, setShowSubtitles] = useState(true);
  // When auto-record / auto-transcribe is enforced by the workspace settings,
  // the manual toggles are disabled (the backend starts them on answer).
  const { settings: recordingSettings } = useRecordingSettings();
  const [transcriptDialogOpen, setTranscriptDialogOpen] = useState(false);
  const [localTimer, setLocalTimer] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Local call timer — start when Telnyx call becomes active
  const callState = (activeCall as any)?.state;
  const isConnected = callState === 'active';
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

  // Resolve the Ringee callId from the Telnyx session for the Live Transcript.
  const telnyxSessionId = (activeCall as any)?.telnyxIDs?.telnyxSessionId as
    | string
    | undefined;
  const transcriptionCallId = useCallIdBySession(telnyxSessionId);
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

  async function handleDial() {
    try {
      await api.post('/dialer/dial', { sessionId, campaignId });
    } catch (err: any) {
      toast.error(err?.message || t('dialFailed'));
    }
  }

  async function handleSkip() {
    try {
      await api.post('/dialer/skip', { sessionId, campaignId });
    } catch (err: any) {
      toast.error(err?.message || t('skipFailed'));
    }
  }

  async function handleHangup() {
    await hangup();
  }

  // Hidden audio element for remote stream
  const remoteAudio = (
    <audio ref={audioRef} autoPlay playsInline style={{ display: 'none' }} />
  );

  // Waiting state (no lead, session ready)
  if (!currentLead && (status === 'ready' || status === 'paused')) {
    return (
      <div className='flex flex-col items-center justify-center p-8 text-center'>
        {remoteAudio}
        <Phone className='text-muted-foreground/40 mb-3 h-16 w-16' />
        <p className='text-muted-foreground text-sm'>
          {status === 'paused' ? t('paused') : t('waiting')}
        </p>
      </div>
    );
  }

  // Preview mode — lead assigned but not dialing yet
  if (currentLead && !activeCall && status === 'reserved') {
    return (
      <div className='flex flex-col items-center justify-center gap-4 p-8'>
        {remoteAudio}
        <div className='text-center'>
          <p className='text-lg font-semibold'>{currentLead.contact.name}</p>
          <p className='text-muted-foreground text-sm'>
            {currentLead.contact.phoneNumber}
          </p>
        </div>
        <div className='flex gap-3'>
          <Button size='lg' onClick={handleDial}>
            <Phone className='mr-2 h-5 w-5' />
            {t('dial')}
          </Button>
          <Button variant='outline' size='lg' onClick={handleSkip}>
            <SkipForward className='mr-2 h-5 w-5' />
            {t('skip')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className='flex flex-col items-center justify-center gap-6 p-8'>
      {remoteAudio}
      <TranscriptDialog
        open={transcriptDialogOpen}
        onOpenChange={setTranscriptDialogOpen}
        callId={transcriptionCallId}
      />
      <CallSubtitles
        data={transcriptionData}
        show={isInCall && showSubtitles}
      />

      {/* Call duration / status */}
      <div className='text-center'>
        {isDialing && !isInCall && (
          <div className='text-muted-foreground animate-pulse text-lg'>
            {t('dialing')}
          </div>
        )}
        {isInCall && (
          <div className='font-mono text-4xl font-bold tabular-nums'>
            {formatDuration(displayDuration)}
          </div>
        )}
        {!isInCall && !isDialing && callStatus === 'ended' && (
          <div className='text-muted-foreground text-lg'>{t('ended')}</div>
        )}
        {currentLead && (
          <p className='text-muted-foreground mt-1 text-sm'>
            {currentLead.contact.name} &middot;{' '}
            {currentLead.contact.phoneNumber}
          </p>
        )}
        {isRecording && (
          <div className='mt-1 flex items-center justify-center gap-1 text-xs text-red-500'>
            <Circle className='h-2 w-2 fill-red-500' />
            {t('recording')}
          </div>
        )}
        {isOnHold && (
          <div className='mt-1 text-xs text-yellow-500'>{t('onHold')}</div>
        )}
      </div>

      {/* Call controls */}
      {(isInCall || isDialing) && (
        <>
          <div className='flex items-center gap-3'>
            {/* Mute */}
            <Button
              variant={isMuted ? 'destructive' : 'outline'}
              size='icon'
              className='h-12 w-12 rounded-full'
              onClick={toggleMute}
              disabled={!isInCall}
              title={isMuted ? t('unmute') : t('mute')}
            >
              {isMuted ? (
                <MicOff className='h-5 w-5' />
              ) : (
                <Mic className='h-5 w-5' />
              )}
            </Button>

            {/* Hold */}
            <Button
              variant={isOnHold ? 'secondary' : 'outline'}
              size='icon'
              className='h-12 w-12 rounded-full'
              onClick={toggleHold}
              disabled={!isInCall}
              title={isOnHold ? t('resume') : t('hold')}
            >
              {isOnHold ? (
                <Play className='h-5 w-5' />
              ) : (
                <Pause className='h-5 w-5' />
              )}
            </Button>

            {/* Record */}
            <Button
              variant={isRecording ? 'destructive' : 'outline'}
              size='icon'
              className='h-12 w-12 rounded-full'
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
            >
              <Circle
                className={`h-5 w-5 ${isRecording ? 'fill-white' : ''}`}
              />
            </Button>

            {/* DTMF */}
            <Button
              variant={showDTMF ? 'secondary' : 'outline'}
              size='icon'
              className='h-12 w-12 rounded-full'
              onClick={() => setShowDTMF(!showDTMF)}
              disabled={!isInCall}
              title={t('sendDtmf')}
            >
              <Grid3X3 className='h-5 w-5' />
            </Button>

            {/* Voicemail drop is not implemented yet — hidden until the
                backend supports playbackStart. */}
          </div>

          <div className='flex flex-wrap items-center justify-center gap-2'>
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
            >
              {showSubtitles ? (
                <Captions className='h-4 w-4' />
              ) : (
                <CaptionsOff className='h-4 w-4' />
              )}
            </Button>
          </div>

          {/* Hangup button */}
          <Button
            variant='destructive'
            size='lg'
            className='h-14 w-14 rounded-full'
            onClick={handleHangup}
            title={t('hangup')}
          >
            <PhoneOff className='h-6 w-6' />
          </Button>

          {/* DTMF Pad */}
          {showDTMF && (
            <div className='bg-card relative rounded-lg border p-3'>
              <Button
                variant='ghost'
                size='icon'
                className='absolute top-1 right-1 h-6 w-6'
                onClick={() => setShowDTMF(false)}
              >
                <X className='h-3 w-3' />
              </Button>
              <DtmfKeypad className='pt-4' onSendDTMF={sendDTMF} />
            </div>
          )}
        </>
      )}

      {/* Live Transcript */}
      {isInCall && transcriptionCallId && (
        <LiveTranscriptPanel
          callId={transcriptionCallId}
          className='w-full max-w-md'
        />
      )}
    </div>
  );
}
