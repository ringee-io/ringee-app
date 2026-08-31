'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { Loader2, Mic, PhoneOff, Sparkles } from 'lucide-react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Card, CardContent } from '@ringee/frontend-shared/components/ui/card';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Label } from '@ringee/frontend-shared/components/ui/label';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { useVoiceAgentApi } from '../api';
import { describeApiError } from '../lib/api-error';
import type { VoiceAgentVariable } from '../types';
import { controlClass } from './fields/field';

type Phase = 'idle' | 'connecting' | 'live';

/** Call states that mean the media path is up and audio should be playing. */
const AUDIBLE = new Set(['active', 'held']);
/** Call states that mean the leg is gone for good. */
const FINISHED = new Set(['hangup', 'destroy', 'purge']);

/**
 * Telnyx recommends pinning Opus for assistant calls. `getCapabilities` is not
 * available everywhere, so a browser that cannot answer just negotiates
 * normally rather than failing the call.
 */
function preferredCodecs() {
  try {
    const codecs = RTCRtpReceiver.getCapabilities('audio')?.codecs ?? [];
    const opus = codecs.filter((codec) =>
      codec.mimeType.toLowerCase().includes('opus')
    );
    return opus.length > 0 ? opus : undefined;
  } catch {
    return undefined;
  }
}

/** Whatever the SDK put in an error event, as a sentence. */
function describeTelnyxEvent(event: unknown): string | null {
  if (!event) return null;
  if (typeof event === 'string') return event;
  const record = event as {
    message?: unknown;
    error?: { message?: unknown };
    cause?: unknown;
  };
  const candidate = record.message ?? record.error?.message ?? record.cause;
  return typeof candidate === 'string' && candidate.trim() ? candidate : null;
}

interface TelnyxCallLike {
  hangup: () => void;
  remoteStream?: MediaStream;
  localStream?: MediaStream;
}

interface TelnyxClientLike {
  disconnect: () => void;
  off?: (event: string) => void;
}

/**
 * Test the agent in the browser (§14) — voice, greeting, knowledge, behaviour
 * and tools, without dialing anyone.
 *
 * The conversation runs over WebRTC straight to the assistant. The agent is
 * opened to that anonymous connection only for the length of the session, and
 * closed again as soon as the user stops (or the tab goes away, which the
 * server sweep handles).
 */
export function TestPanel({
  agentId,
  variables
}: {
  agentId: string;
  variables: VoiceAgentVariable[];
}) {
  const t = useTranslations('aiVoiceAgents.test');
  const api = useVoiceAgentApi();
  const [phase, setPhase] = useState<Phase>('idle');
  const [values, setValues] = useState<Record<string, string>>({});
  const [seconds, setSeconds] = useState(0);
  const clientRef = useRef<TelnyxClientLike | null>(null);
  const callRef = useRef<TelnyxCallLike | null>(null);
  /**
   * Where the assistant's voice is played. Without an element to attach the
   * remote track to, the SDK still captures the microphone and still runs the
   * conversation — it just plays nothing, which is a call that looks connected
   * and is silent.
   */
  const audioRef = useRef<HTMLAudioElement>(null);
  /**
   * The SDK is handed this id rather than the node, so nothing that ends up in
   * the signalling payload can reference the React tree. Generated per instance
   * so two mounted panels cannot resolve to the same element.
   */
  const audioId = useId();
  /** Guards the teardown so a repeated end does not re-run it. */
  const stopping = useRef(false);

  const stop = useCallback(async () => {
    // `hangup` fires a notification that lands right back here, and the button,
    // the unmount and the error handler all call this too. Without this guard
    // each of those repeats the whole teardown — including the request that
    // closes the session server-side, which is a POST to the provider.
    if (stopping.current) return;
    stopping.current = true;

    const call = callRef.current;
    const client = clientRef.current;
    callRef.current = null;
    clientRef.current = null;

    try {
      call?.hangup();
    } catch {
      // The leg may already be down; closing the session is what matters.
    }
    // The browser keeps showing "microphone in use" until the capture tracks
    // themselves are stopped, and a disconnect that races the hangup can leave
    // them running.
    try {
      call?.localStream?.getTracks().forEach((track) => track.stop());
    } catch {
      // Same.
    }
    try {
      client?.off?.('telnyx.notification');
      client?.off?.('telnyx.error');
      client?.off?.('telnyx.ready');
      client?.disconnect();
    } catch {
      // Same.
    }
    if (audioRef.current) audioRef.current.srcObject = null;

    setPhase('idle');
    // The guard is released by `start`, not here: a notification that arrives
    // after the teardown has finished must not close the session a second time.
    await api.endTestSession(agentId).catch(() => undefined);
  }, [api, agentId]);

  /**
   * A closed tab must not leave the agent reachable, so the session is ended on
   * unmount too. The server sweep is the backstop, not the first line.
   *
   * The dependency list is empty on purpose and the callback is reached through
   * a ref: `stop` changes identity whenever the API client does, and an effect
   * that cleans up on every such change tears down a conversation that is
   * still running — repeatedly, once per render.
   */
  const stopRef = useRef(stop);
  stopRef.current = stop;
  useEffect(() => () => void stopRef.current(), []);

  useEffect(() => {
    if (phase !== 'live') {
      setSeconds(0);
      return;
    }
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  const start = async () => {
    setPhase('connecting');
    stopping.current = false;
    try {
      const session = await api.startTestSession(agentId, values);
      const { TelnyxRTC } = await import('@telnyx/webrtc');

      const client = new TelnyxRTC({
        anonymous_login: {
          target_type: 'ai_assistant',
          target_id: session.assistantId
        }
      });
      clientRef.current = client as unknown as TelnyxClientLike;

      client.on('telnyx.ready', () => {
        const codecs = preferredCodecs();
        const call = client.newCall({
          destinationNumber: '',
          audio: true,
          video: false,
          // The element id, never the element itself. The SDK keeps this
          // options object as the call's `dialogParams` and JSON-serializes it
          // into every signalling message (invite, ICE, bye), stripping only
          // streams and device ids — not media elements. A React-rendered node
          // carries a `__reactFiber$…` back-reference, so stringifying the
          // invite throws "Converting circular structure to JSON" inside the
          // ICE handler and the call dies at the moment it connects. The SDK
          // resolves this id with `getElementById` when it attaches the track.
          remoteElement: audioId,
          ...(codecs ? { preferred_codecs: codecs } : {})
        });
        callRef.current = call as unknown as TelnyxCallLike;
        // Telnyx answers an anonymous assistant call as it arrives, so the call
        // is treated as live from here. Waiting for `active` instead leaves the
        // panel reading "Connecting…" over a conversation that has already
        // started, which invites the tester to hang up on a working call.
        setPhase('live');
      });

      client.on('telnyx.error', (event: unknown) => {
        // The payload is the only place the provider says why an anonymous
        // call was refused. Dropping it leaves "the test connection failed"
        // as the whole diagnosis.
        const detail = describeTelnyxEvent(event);
        toast.error(
          detail
            ? `${t('connectionFailed')} — ${detail}`
            : t('connectionFailed')
        );
        void stop();
      });

      client.on(
        'telnyx.notification',
        (notification: {
          call?: { state?: string; remoteStream?: MediaStream };
        }) => {
          const state = notification?.call?.state;
          if (!state) return;

          if (FINISHED.has(state)) {
            void stop();
            return;
          }

          if (AUDIBLE.has(state)) {
            setPhase('live');
            // Belt and braces for SDK builds that expose the track on the
            // notification rather than filling `remoteElement` themselves.
            const remote = notification.call?.remoteStream;
            if (remote && audioRef.current && !audioRef.current.srcObject) {
              audioRef.current.srcObject = remote;
              void audioRef.current.play().catch(() => undefined);
            }
          }
        }
      );

      await client.connect();
    } catch (error) {
      toast.error(describeApiError(error, t('startError')));
      await stop();
    }
  };

  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(
    2,
    '0'
  )}`;

  return (
    <div className='grid gap-4 lg:grid-cols-[1fr_320px]'>
      {/* Present from the first render: the SDK needs a real element to hand
          the remote track to when the call connects. */}
      <audio id={audioId} ref={audioRef} autoPlay className='hidden' />

      <Card>
        <CardContent className='flex flex-col items-center gap-5 py-12'>
          <div
            className={cn(
              'flex size-24 items-center justify-center rounded-lg transition-colors',
              phase === 'live'
                ? 'bg-primary/15 text-primary'
                : 'bg-muted text-muted-foreground'
            )}
          >
            {phase === 'live' ? (
              <span className='relative flex size-24 items-center justify-center'>
                <span className='bg-primary/20 absolute inline-flex size-full animate-ping rounded-lg' />
                <Mic className='relative size-9' />
              </span>
            ) : phase === 'connecting' ? (
              <Loader2 className='size-9 animate-spin' />
            ) : (
              <Mic className='size-9' />
            )}
          </div>

          <div className='text-center'>
            <p className='font-medium'>
              {phase === 'live'
                ? t('live', { clock })
                : phase === 'connecting'
                  ? t('connecting')
                  : t('idleTitle')}
            </p>
            <p className='text-muted-foreground text-sm'>
              {phase === 'live' ? t('liveHint') : t('idleHint')}
            </p>
          </div>

          {phase === 'idle' ? (
            <Button size='lg' onClick={() => void start()}>
              <Mic className='mr-2 size-4' />
              {t('start')}
            </Button>
          ) : (
            <Button size='lg' variant='destructive' onClick={() => void stop()}>
              <PhoneOff className='mr-2 size-4' />
              {t('end')}
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className='space-y-4 pt-6'>
          <div>
            <p className='flex items-center gap-1.5 text-sm font-medium'>
              <Sparkles className='size-3.5' />
              {t('pretend')}
            </p>
            <p className='text-muted-foreground text-xs'>{t('pretendHint')}</p>
          </div>

          {variables.length === 0 ? (
            <p className='text-muted-foreground text-sm'>{t('nothingExtra')}</p>
          ) : (
            variables.map((variable) => (
              <div key={variable.key} className='space-y-1.5'>
                <Label htmlFor={`test-${variable.key}`} className='text-xs'>
                  {variable.label}
                </Label>
                <Input
                  id={`test-${variable.key}`}
                  value={values[variable.key] ?? ''}
                  disabled={phase !== 'idle'}
                  onChange={(e) =>
                    setValues((prev) => ({
                      ...prev,
                      [variable.key]: e.target.value
                    }))
                  }
                  placeholder={variable.description}
                  className={controlClass}
                />
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
