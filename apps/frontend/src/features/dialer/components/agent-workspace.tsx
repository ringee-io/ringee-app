'use client';

import { useCallback, useState } from 'react';
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
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

interface Props {
  campaignId: string;
}

export function AgentWorkspace({ campaignId }: Props) {
  const router = useRouter();
  const t = useTranslations('dialer.workspace');
  const {
    sessionId,
    status,
    startSession,
    endSession,
    pauseSession,
    resumeSession
  } = useDialerSession(campaignId);

  const { dial } = useDialerCall();
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  async function handleStart() {
    setStarting(true);
    setStartError(null);
    try {
      await startSession();
    } catch (err: any) {
      const message =
        err?.status === 403
          ? t('notAssigned')
          : err?.message || t('startFailed');
      setStartError(message);
      toast.error(message);
    } finally {
      setStarting(false);
    }
  }

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
          <h1 className='text-lg font-semibold'>{t('title')}</h1>
        </div>
        <div className='flex flex-1 items-center justify-center'>
          <Card className='w-full max-w-md'>
            <CardContent className='flex flex-col items-center py-12'>
              <Play className='text-muted-foreground mb-4 h-16 w-16' />
              <h2 className='text-xl font-semibold'>{t('ready')}</h2>
              <p className='text-muted-foreground mt-2 text-center text-sm'>
                {t('description')}
              </p>
              {startError && (
                <p className='text-destructive mt-4 max-w-sm text-center text-sm'>
                  {startError}
                </p>
              )}
              <Button
                className='mt-6'
                size='lg'
                onClick={handleStart}
                disabled={starting}
              >
                <Play className='mr-2 h-5 w-5' />
                {starting ? t('starting') : t('start')}
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
