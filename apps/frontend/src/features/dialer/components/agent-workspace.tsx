'use client';

import { useCallback } from 'react';
import { useDialerSessionStore } from '../store/dialer-session.store';
import { useDialerSession } from '../hooks/use-dialer-session';
import { useDialerEvents } from '../hooks/use-dialer-events';
import { useDialerCall } from '../hooks/use-dialer-call';
import { DialerStatusBar } from './dialer-status-bar';
import { LeadPanel } from './lead-panel';
import { SoftphonePanel } from './softphone-panel';
import { DispositionPanel } from './disposition-panel';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Card, CardContent } from '@ringee/frontend-shared/components/ui/card';
import { Play, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Props {
  campaignId: string;
}

export function AgentWorkspace({ campaignId }: Props) {
  const router = useRouter();
  const {
    sessionId,
    status,
    startSession,
    endSession,
    pauseSession,
    resumeSession
  } = useDialerSession(campaignId);

  const { dial } = useDialerCall();

  // When backend sends call.initiate via SSE, place the actual WebRTC call.
  // Forward the attemptId so it can be linked to the call's webhooks.
  const handleCallInitiate = useCallback(
    (data: {
      attemptId: string;
      phoneNumber: string;
      callerIdNumber: string | null;
    }) => {
      dial(data.phoneNumber, data.callerIdNumber, data.attemptId);
    },
    [dial]
  );

  // Connect SSE for real-time events, with call initiate callback
  useDialerEvents(sessionId, handleCallInitiate);

  // Not connected — show start screen
  if (!sessionId) {
    return (
      <div className='flex h-[calc(100dvh-52px)] flex-col'>
        <div className='flex items-center gap-2 border-b px-4 py-3'>
          <Button
            variant='ghost'
            size='icon'
            onClick={() => router.push(`/dashboard/campaigns/${campaignId}`)}
          >
            <ArrowLeft className='h-4 w-4' />
          </Button>
          <h1 className='text-lg font-semibold'>Agent Workspace</h1>
        </div>
        <div className='flex flex-1 items-center justify-center'>
          <Card className='w-full max-w-md'>
            <CardContent className='flex flex-col items-center py-12'>
              <Play className='text-muted-foreground mb-4 h-16 w-16' />
              <h2 className='text-xl font-semibold'>Ready to start dialing?</h2>
              <p className='text-muted-foreground mt-2 text-center text-sm'>
                Start a session to begin making calls for this campaign. The
                dialer will automatically assign leads based on the campaign
                configuration.
              </p>
              <Button className='mt-6' size='lg' onClick={startSession}>
                <Play className='mr-2 h-5 w-5' />
                Start Session
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className='flex h-[calc(100dvh-52px)] flex-col'>
      <DialerStatusBar
        campaignId={campaignId}
        status={status}
        onPause={pauseSession}
        onResume={resumeSession}
        onEnd={endSession}
      />

      <div className='grid flex-1 grid-cols-1 gap-0 overflow-hidden md:grid-cols-3'>
        {/* Left — Lead Panel */}
        <div className='overflow-y-auto border-r'>
          <LeadPanel />
        </div>

        {/* Center — Softphone */}
        <div className='flex items-center justify-center border-r'>
          <SoftphonePanel campaignId={campaignId} sessionId={sessionId} />
        </div>

        {/* Right — Disposition */}
        <div className='overflow-y-auto'>
          <DispositionPanel campaignId={campaignId} sessionId={sessionId} />
        </div>
      </div>
    </div>
  );
}
