'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
  const clientRef = useRef<{ disconnect: () => void } | null>(null);
  const callRef = useRef<{ hangup: () => void } | null>(null);

  const stop = useCallback(async () => {
    try {
      callRef.current?.hangup();
    } catch {
      // The leg may already be down; closing the session is what matters.
    }
    callRef.current = null;
    try {
      clientRef.current?.disconnect();
    } catch {
      // Same.
    }
    clientRef.current = null;
    setPhase('idle');
    await api.endTestSession(agentId).catch(() => undefined);
  }, [api, agentId]);

  // A closed tab must not leave the agent reachable, so the session is ended
  // on unmount too. The server sweep is the backstop, not the first line.
  useEffect(() => () => void stop(), [stop]);

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
    try {
      const session = await api.startTestSession(agentId, values);
      const { TelnyxRTC } = await import('@telnyx/webrtc');

      const client = new TelnyxRTC({
        anonymous_login: {
          target_type: 'ai_assistant',
          target_id: session.assistantId
        }
      });
      clientRef.current = client as unknown as { disconnect: () => void };

      client.on('telnyx.ready', () => {
        const call = client.newCall({
          destinationNumber: '',
          audio: true,
          video: false
        });
        callRef.current = call as unknown as { hangup: () => void };
        setPhase('live');
      });

      client.on('telnyx.error', () => {
        toast.error(t('connectionFailed'));
        void stop();
      });

      client.on(
        'telnyx.notification',
        (notification: { call?: { state?: string } }) => {
          if (notification?.call?.state === 'hangup') void stop();
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

          {phase === 'live' ? (
            <Button size='lg' variant='destructive' onClick={() => void stop()}>
              <PhoneOff className='mr-2 size-4' />
              {t('end')}
            </Button>
          ) : (
            <Button
              size='lg'
              onClick={() => void start()}
              disabled={phase === 'connecting'}
            >
              {phase === 'connecting' ? (
                <Loader2 className='mr-2 size-4 animate-spin' />
              ) : (
                <Mic className='mr-2 size-4' />
              )}
              {t('start')}
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
