'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Mic, PhoneOff } from 'lucide-react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@ringee/frontend-shared/components/ui/card';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Label } from '@ringee/frontend-shared/components/ui/label';
import { useVoiceAgentApi } from '../api';
import type { VoiceAgentVariable } from '../types';

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
  const api = useVoiceAgentApi();
  const [phase, setPhase] = useState<Phase>('idle');
  const [values, setValues] = useState<Record<string, string>>({});
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
        toast.error('The test connection failed');
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
      toast.error(
        error instanceof Error ? error.message : 'Could not start the test'
      );
      await stop();
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Test agent</CardTitle>
        <CardDescription>
          Talk to the agent from your browser. Fill in the values you want it to
          use, then start the conversation.
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='grid gap-3 sm:grid-cols-2'>
          {variables.map((variable) => (
            <div key={variable.key} className='space-y-2'>
              <Label htmlFor={`test-${variable.key}`}>{variable.label}</Label>
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
              />
            </div>
          ))}
        </div>

        <div className='flex items-center gap-3'>
          {phase === 'live' ? (
            <Button variant='destructive' onClick={() => void stop()}>
              <PhoneOff className='mr-2 size-4' />
              End conversation
            </Button>
          ) : (
            <Button
              onClick={() => void start()}
              disabled={phase === 'connecting'}
            >
              {phase === 'connecting' ? (
                <Loader2 className='mr-2 size-4 animate-spin' />
              ) : (
                <Mic className='mr-2 size-4' />
              )}
              Start web conversation
            </Button>
          )}
          {phase === 'live' ? (
            <span className='text-muted-foreground text-sm'>
              Connected — speak into your microphone.
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
