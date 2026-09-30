'use client';

import { useCallback, useEffect, useState } from 'react';
import { useDialerSession } from '../hooks/use-dialer-session';
import { useDialerEvents } from '../hooks/use-dialer-events';
import { useDialerCallEngine } from '../hooks/use-dialer-call';
import {
  isLiveCallState,
  useDialerCallStore
} from '../store/dialer-call.store';
import { useTelnyxStore } from '@/features/calls/store/telnyx.store';
import { useCallIdBySession } from '@/features/transcription';
import { DialerStatusBar } from './dialer-status-bar';
import { LeadPanel } from './lead-panel';
import { SoftphonePanel } from './softphone-panel';
import { ScriptPanel } from './script-panel';
import { DispositionPanel } from './disposition-panel';
import { PanelHeader } from './panel-header';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Card, CardContent } from '@ringee/frontend-shared/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@ringee/frontend-shared/components/ui/alert-dialog';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { Play, ArrowLeft, Loader2, Users, ClipboardList } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

interface Props {
  campaignId: string;
  /** Shown in the header; the page route does not know it. */
  campaignName?: string;
  /**
   * Leave the workspace. The campaign page passes this to close its modal; the
   * standalone route falls back to navigating to the campaign.
   */
  onExit?: () => void;
  className?: string;
}

export function AgentWorkspace({
  campaignId,
  campaignName,
  onExit,
  className = 'h-[calc(100dvh-52px)]'
}: Props) {
  const router = useRouter();
  const t = useTranslations('dialer.workspace');
  const tCallStatus = useTranslations('calls.activeCallStatus');
  const {
    sessionId,
    status,
    startSession,
    endSession,
    pauseSession,
    resumeSession
  } = useDialerSession(campaignId);

  // The one place the campaign call is placed and followed.
  const { dial } = useDialerCallEngine();
  // A session started before the phone line registers would be handed a lead
  // it cannot dial, and pause on the spot.
  const lineReady = useTelnyxStore((s) => s.status === 'registered');
  const callLive = useDialerCallStore((s) => isLiveCallState(s.state));
  // The Ringee call behind the leg, which its transcript is keyed by. Resolved
  // once, here, for both the call bar and the script column's transcript tab.
  const telnyxSessionId = useDialerCallStore(
    (s) => (s.call as any)?.telnyxIDs?.telnyxSessionId as string | undefined
  );
  const transcriptionCallId = useCallIdBySession(telnyxSessionId);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  const [ending, setEnding] = useState(false);

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

  const leave = useCallback(() => {
    if (onExit) onExit();
    else router.push(`/dashboard/campaigns/${campaignId}`);
  }, [campaignId, onExit, router]);

  // Leaving is never allowed over a live call: the call would lose its screen
  // and its hang-up button. With a session running it is confirmed first,
  // because leaving ends the session and hands its lead back to the queue.
  function requestExit() {
    if (callLive) return;
    if (sessionId) setConfirmExit(true);
    else leave();
  }

  async function endAndLeave() {
    setEnding(true);
    try {
      await endSession();
    } finally {
      setEnding(false);
      setConfirmExit(false);
      leave();
    }
  }

  // A reload or a closed tab drops the WebRTC leg with the page. Ask first.
  useEffect(() => {
    if (!callLive) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [callLive]);

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

  const exitDialog = (
    <AlertDialog
      open={confirmExit}
      onOpenChange={(open) => !open && !ending && setConfirmExit(false)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('exitDialog.title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('exitDialog.description')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={ending}>
            {t('exitDialog.stay')}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={ending}
            onClick={(event) => {
              event.preventDefault();
              void endAndLeave();
            }}
          >
            {ending ? <Loader2 className='h-4 w-4 animate-spin' /> : null}
            {t('exitDialog.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  // Not connected — show start screen
  const body = !sessionId ? (
    <div className={cn('flex flex-col', className)}>
      <div className='flex items-center gap-2 border-b px-4 py-3'>
        <Button
          variant='ghost'
          size='icon'
          onClick={requestExit}
          aria-label={t('back')}
          title={t('back')}
        >
          <ArrowLeft className='h-4 w-4' />
        </Button>
        <div className='min-w-0'>
          <h1 className='truncate text-lg font-semibold'>{t('title')}</h1>
          {campaignName ? (
            <p className='text-muted-foreground truncate text-xs'>
              {campaignName}
            </p>
          ) : null}
        </div>
      </div>
      <div className='flex flex-1 items-center justify-center p-4'>
        <Card className='w-full max-w-md'>
          <CardContent className='flex flex-col items-center py-12'>
            <div className='mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10'>
              <Play className='h-8 w-8 text-emerald-600 dark:text-emerald-400' />
            </div>
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
              className='mt-6 bg-emerald-600 text-white hover:bg-emerald-700'
              size='lg'
              onClick={handleStart}
              disabled={starting || !lineReady}
            >
              {starting || !lineReady ? (
                <Loader2 className='mr-2 h-5 w-5 animate-spin' />
              ) : (
                <Play className='mr-2 h-5 w-5' />
              )}
              {starting
                ? t('starting')
                : lineReady
                  ? t('start')
                  : tCallStatus('connecting')}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  ) : (
    <div className={cn('flex flex-col', className)}>
      <DialerStatusBar
        campaignName={campaignName}
        status={status}
        onBack={requestExit}
        onPause={pauseSession}
        onResume={resumeSession}
        onEnd={endSession}
      />

      {/* The call itself — who, how long, and its controls — across the top,
          so the columns below are all content. */}
      <SoftphonePanel
        campaignId={campaignId}
        sessionId={sessionId}
        transcriptionCallId={transcriptionCallId}
      />

      {/* Stacked on small screens, the page scrolling and each column as tall
          as its content; from `lg` three columns, the script the widest, each
          scrolling on its own. `min-h-0` only there: below it, it would let
          the grid squeeze the stacked columns into a third of the screen each. */}
      <div className='grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden 2xl:grid-cols-[24rem_minmax(0,1fr)_26rem]'>
        {/* Left — who the agent is calling */}
        <section className='flex flex-col border-b lg:min-h-0 lg:border-r lg:border-b-0'>
          <PanelHeader icon={Users} title={t('columns.lead')} />
          <div className='min-h-0 flex-1'>
            <LeadPanel />
          </div>
        </section>

        {/* Center — what to say, and the live transcript */}
        <section className='flex flex-col border-b lg:min-h-0 lg:border-r lg:border-b-0'>
          <ScriptPanel transcriptionCallId={transcriptionCallId} />
        </section>

        {/* Right — the outcome, live from the moment we start dialing */}
        <section className='flex flex-col lg:min-h-0'>
          <PanelHeader icon={ClipboardList} title={t('columns.outcome')} />
          <div className='min-h-0 flex-1 lg:overflow-y-auto'>
            <DispositionPanel />
          </div>
        </section>
      </div>
    </div>
  );

  // One confirmation for both screens, so ending the session under it does
  // not unmount and replay it.
  return (
    <>
      {body}
      {exitDialog}
    </>
  );
}
