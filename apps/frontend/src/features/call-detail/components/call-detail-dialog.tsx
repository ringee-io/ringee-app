'use client';

import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle
} from '@ringee/frontend-shared/components/ui/dialog';
import { CallDetail } from './call-detail';

/**
 * Full-screen shell for the canonical call detail.
 *
 * History supplies its previous/next controls through `headerActions`; other
 * call listings can reuse the same review experience without inventing a
 * second detail layout or navigating away from their current context.
 */
export function CallDetailDialog({
  callId,
  onClose,
  closeLabel,
  description,
  headerActions
}: {
  callId: string | null;
  onClose: () => void;
  closeLabel?: string;
  description?: string;
  headerActions?: ReactNode;
}) {
  const t = useTranslations('calls.detail');

  return (
    <Dialog
      open={Boolean(callId)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className='data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100 top-0 left-0 flex h-dvh max-h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 p-0 shadow-none sm:max-w-none'
      >
        <DialogTitle className='sr-only'>{t('dialogTitle')}</DialogTitle>
        <DialogDescription className='sr-only'>
          {description ?? t('dialogDescription')}
        </DialogDescription>

        <header className='bg-background/95 z-10 shrink-0 border-b backdrop-blur'>
          <div className='mx-auto flex min-h-16 w-full max-w-7xl items-center justify-between gap-3 px-3 sm:px-6'>
            <Button
              type='button'
              variant='ghost'
              className='h-11 rounded-lg px-3'
              onClick={onClose}
            >
              <ArrowLeft className='size-4' />
              <span className='hidden sm:inline'>
                {closeLabel ?? t('back')}
              </span>
              <span className='sr-only sm:hidden'>
                {closeLabel ?? t('back')}
              </span>
            </Button>

            {headerActions}
          </div>
        </header>

        <main className='min-h-0 flex-1 overflow-y-auto'>
          <div className='mx-auto w-full max-w-7xl px-4 py-6 sm:px-6'>
            {callId ? (
              <CallDetail callId={callId} showBackLink={false} />
            ) : null}
          </div>
        </main>
      </DialogContent>
    </Dialog>
  );
}
