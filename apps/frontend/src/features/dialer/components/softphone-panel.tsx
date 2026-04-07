'use client';

import { useEffect, useRef, useState } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useDialerSessionStore } from '../store/dialer-session.store';
import { useDialerLeadStore } from '../store/dialer-lead.store';
import { useDialerAttemptStore } from '../store/dialer-attempt.store';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Pause,
  Play,
  Voicemail,
  SkipForward,
} from 'lucide-react';

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
  const status = useDialerSessionStore((s) => s.status);
  const currentLead = useDialerLeadStore((s) => s.currentLead);
  const callStatus = useDialerAttemptStore((s) => s.callStatus);
  const callDuration = useDialerAttemptStore((s) => s.callDuration);
  const attemptId = useDialerAttemptStore((s) => s.attemptId);

  const [muted, setMuted] = useState(false);
  const [held, setHeld] = useState(false);
  const [localTimer, setLocalTimer] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Local call timer
  useEffect(() => {
    if (callStatus === 'answered' || callStatus === 'in_call') {
      timerRef.current = setInterval(() => {
        setLocalTimer((t) => t + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setLocalTimer(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [callStatus]);

  const displayDuration = callDuration > 0 ? callDuration : localTimer;

  const isInCall = callStatus === 'answered' || callStatus === 'in_call';
  const isDialing = callStatus === 'dialing' || callStatus === 'ringing';

  async function handleDial() {
    try {
      await api.post('/dialer/dial', { sessionId, campaignId });
    } catch {
      // handled
    }
  }

  async function handleSkip() {
    try {
      await api.post('/dialer/skip', { sessionId, campaignId });
    } catch {
      // handled
    }
  }

  async function handleVoicemailDrop() {
    if (!attemptId) return;
    try {
      await api.post('/dialer/voicemail-drop', { callAttemptId: attemptId });
    } catch {
      // handled
    }
  }

  // Waiting state (no lead, session ready)
  if (!currentLead && (status === 'ready' || status === 'paused')) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <Phone className="mb-3 h-16 w-16 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">
          {status === 'paused' ? 'Session paused' : 'Waiting for next lead...'}
        </p>
      </div>
    );
  }

  // Preview mode — lead assigned but not dialing yet
  if (currentLead && !callStatus && status === 'reserved') {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-8">
        <div className="text-center">
          <p className="text-lg font-semibold">{currentLead.contact.name}</p>
          <p className="text-sm text-muted-foreground">
            {currentLead.contact.phoneNumber}
          </p>
        </div>
        <div className="flex gap-3">
          <Button size="lg" onClick={handleDial}>
            <Phone className="mr-2 h-5 w-5" />
            Dial
          </Button>
          <Button variant="outline" size="lg" onClick={handleSkip}>
            <SkipForward className="mr-2 h-5 w-5" />
            Skip
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-6 p-8">
      {/* Call duration / status */}
      <div className="text-center">
        {isDialing && (
          <div className="text-lg text-muted-foreground">
            {callStatus === 'ringing' ? 'Ringing...' : 'Dialing...'}
          </div>
        )}
        {isInCall && (
          <div className="text-4xl font-mono font-bold tabular-nums">
            {formatDuration(displayDuration)}
          </div>
        )}
        {callStatus === 'ended' && (
          <div className="text-lg text-muted-foreground">Call ended</div>
        )}
        {currentLead && (
          <p className="mt-1 text-sm text-muted-foreground">
            {currentLead.contact.name} &middot; {currentLead.contact.phoneNumber}
          </p>
        )}
      </div>

      {/* Call controls */}
      {(isInCall || isDialing) && (
        <div className="flex items-center gap-3">
          <Button
            variant={muted ? 'destructive' : 'outline'}
            size="icon"
            className="h-12 w-12 rounded-full"
            onClick={() => setMuted(!muted)}
            disabled={!isInCall}
          >
            {muted ? (
              <MicOff className="h-5 w-5" />
            ) : (
              <Mic className="h-5 w-5" />
            )}
          </Button>

          <Button
            variant={held ? 'secondary' : 'outline'}
            size="icon"
            className="h-12 w-12 rounded-full"
            onClick={() => setHeld(!held)}
            disabled={!isInCall}
          >
            {held ? (
              <Play className="h-5 w-5" />
            ) : (
              <Pause className="h-5 w-5" />
            )}
          </Button>

          <Button
            variant="outline"
            size="icon"
            className="h-12 w-12 rounded-full"
            onClick={handleVoicemailDrop}
            disabled={!isInCall}
            title="Drop voicemail"
          >
            <Voicemail className="h-5 w-5" />
          </Button>

          <Button
            variant="destructive"
            size="icon"
            className="h-14 w-14 rounded-full"
            title="Hang up"
          >
            <PhoneOff className="h-6 w-6" />
          </Button>
        </div>
      )}
    </div>
  );
}
