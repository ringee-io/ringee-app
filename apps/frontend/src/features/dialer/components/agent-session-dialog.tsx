'use client';

import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle
} from '@ringee/frontend-shared/components/ui/dialog';
import { useDialerSessionStore } from '../store/dialer-session.store';
import {
  isLiveCallState,
  useDialerCallStore
} from '../store/dialer-call.store';
import { AgentWorkspace } from './agent-workspace';

/**
 * The campaign's calling session, full screen over the campaign page — the
 * same shell as the call detail, so starting to call never navigates away.
 *
 * Closing unmounts the workspace, which ends the session the way leaving the
 * dialer page always has (`useDialerSession`). That is why only the
 * workspace's own back button closes it while a session runs — it confirms
 * first and refuses over a live call — and Escape or a stray click do not.
 */
export function AgentSessionDialog({
  campaignId,
  campaignName,
  open,
  onClose
}: {
  campaignId: string;
  campaignName?: string;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('dialer.workspace');
  const sessionActive = useDialerSessionStore((s) => s.sessionId !== null);
  const callLive = useDialerCallStore((s) => isLiveCallState(s.state));
  const locked = sessionActive || callLive;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !locked) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(event) => {
          if (locked) event.preventDefault();
        }}
        onInteractOutside={(event) => event.preventDefault()}
        className='data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100 top-0 left-0 flex h-dvh max-h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0 shadow-none sm:max-w-none'
      >
        <DialogTitle className='sr-only'>
          {campaignName ? t('dialogTitle', { name: campaignName }) : t('title')}
        </DialogTitle>
        <DialogDescription className='sr-only'>
          {t('dialogDescription')}
        </DialogDescription>
        <AgentWorkspace
          campaignId={campaignId}
          campaignName={campaignName}
          onExit={onClose}
          className='h-dvh'
        />
      </DialogContent>
    </Dialog>
  );
}
