'use client';

import { useCallSession } from '../use-call-session';
import { SessionStatusBar } from './session-status-bar';
import { SessionLeadPanel } from './session-lead-panel';
import { SessionSoftphonePanel } from './session-softphone-panel';
import { SessionDispositionPanel } from './session-disposition-panel';
import { SessionLoadingView } from './session-loading-view';
import { SessionErrorView } from './session-error-view';

interface Props {
  token: string;
}

export function CallSessionWorkspace({ token }: Props) {
  const {
    phase,
    error,
    session,
    creditsOk,
    creditBalance,
    callerIdNumber,
    items,
    activeItem,
    busy,
    transientError,
    stats,
    mode,
    telnyxStatus,
    call,
    actions
  } = useCallSession(token);

  if (phase === 'loading') return <SessionLoadingView />;
  if (phase === 'error' && error) {
    return <SessionErrorView error={error} onRetry={actions.reload} />;
  }
  if (!session) {
    return (
      <SessionErrorView
        error={{
          title: 'Session unavailable',
          message: 'Please retry, or ask the sender for a new link.',
          variant: 'generic'
        }}
        onRetry={actions.reload}
      />
    );
  }

  return (
    <div className='bg-background flex h-[100dvh] flex-col'>
      <SessionStatusBar
        title={session.title ?? 'Ringee call session'}
        phase={phase}
        creditsOk={creditsOk}
        creditBalance={creditBalance}
        expiresAt={session.expiresAt}
        telnyxStatus={telnyxStatus}
        mode={mode}
        onModeChange={actions.setMode}
        stats={{
          total: stats.total,
          completed: stats.completed,
          remaining: stats.remaining,
          contactRate: stats.contactRate
        }}
      />

      {transientError && (
        <div className='border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300'>
          {transientError}
        </div>
      )}

      <div className='grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-3'>
        <div className='overflow-y-auto border-r'>
          <SessionLeadPanel
            items={items}
            activeItem={activeItem}
            phase={phase}
            onSelect={actions.selectItem}
          />
        </div>

        <div className='flex items-center justify-center border-r'>
          <SessionSoftphonePanel
            phase={phase}
            activeItem={activeItem}
            call={call}
            busy={busy}
            creditsOk={creditsOk}
            telnyxStatus={telnyxStatus}
            callerIdNumber={callerIdNumber}
            onDial={actions.dial}
            onSkip={actions.skip}
            onHangup={actions.hangup}
            onToggleMute={actions.toggleMute}
            onToggleHold={actions.toggleHold}
            onToggleRecording={actions.toggleRecording}
            onSendDTMF={actions.sendDTMF}
          />
        </div>

        <div className='overflow-y-auto'>
          <SessionDispositionPanel
            phase={phase}
            activeItem={activeItem}
            busy={busy}
            onSave={actions.saveOutcome}
          />
        </div>
      </div>

      <footer className='bg-muted/30 text-muted-foreground border-t px-4 py-2 text-center text-[11px]'>
        Powered by Ringee — calls placed via this browser via Telnyx WebRTC.
        Mode:{' '}
        <span className='text-foreground font-semibold capitalize'>{mode}</span>{' '}
        dialer · Outcomes sync automatically to the owner's Ringee account.
      </footer>
    </div>
  );
}
