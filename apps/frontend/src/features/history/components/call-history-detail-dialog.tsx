'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { parseAsString, useQueryState } from 'nuqs';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle
} from '@ringee/frontend-shared/components/ui/dialog';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { CallListRowActions } from '@/features/calls/components/call-list-row-actions';
import {
  useCallDetailApi,
  type CallDetailNavigation
} from '@/features/call-detail/api';
import { CallDetail } from '@/features/call-detail';

const callIdQuery = parseAsString.withOptions({
  history: 'push',
  shallow: true
});

/** Opens a history call without leaving the current filtered result set. */
export function HistoryCallRowActions({
  callId,
  recordingUrl,
  callFrom,
  callTo,
  phoneNumber
}: {
  callId: string;
  recordingUrl?: string | null;
  callFrom?: string;
  callTo?: string;
  phoneNumber?: string;
}) {
  const [, setCallId] = useQueryState('callId', callIdQuery);

  return (
    <CallListRowActions
      callId={callId}
      recordingUrl={recordingUrl}
      callFrom={callFrom}
      callTo={callTo}
      phoneNumber={phoneNumber}
      onView={() => void setCallId(callId)}
    />
  );
}

/** Full-screen call review with navigation scoped to the active history filters. */
export function CallHistoryDetailDialog() {
  const t = useTranslations('calls.detail');
  const api = useCallDetailApi();
  const searchParams = useSearchParams();
  const [callId, setCallId] = useQueryState('callId', callIdQuery);
  const [navigation, setNavigation] = useState<CallDetailNavigation>();
  const [navigationFailed, setNavigationFailed] = useState(false);

  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  const memberId = searchParams.get('memberId');
  const filters = useMemo(
    () => ({ dateFrom, dateTo, memberId }),
    [dateFrom, dateTo, memberId]
  );

  const loadNavigation = useCallback(async () => {
    if (!callId) {
      setNavigation(undefined);
      setNavigationFailed(false);
      return;
    }

    setNavigation(undefined);
    setNavigationFailed(false);
    try {
      setNavigation(await api.getNavigation(callId, filters));
    } catch {
      setNavigationFailed(true);
    }
  }, [api, callId, filters]);

  useEffect(() => {
    void loadNavigation();
  }, [loadNavigation]);

  const close = useCallback(() => {
    void setCallId(null, { history: 'replace', shallow: true });
  }, [setCallId]);

  const goTo = useCallback(
    (nextId: string | null | undefined) => {
      if (!nextId) return;
      void setCallId(nextId, { history: 'replace', shallow: true });
    },
    [setCallId]
  );

  useEffect(() => {
    if (!callId) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      ) {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (
        target?.closest('input, textarea, select, [contenteditable="true"]')
      ) {
        return;
      }

      if (event.key === 'ArrowLeft' && navigation?.previousId) {
        event.preventDefault();
        goTo(navigation.previousId);
      } else if (event.key === 'ArrowRight' && navigation?.nextId) {
        event.preventDefault();
        goTo(navigation.nextId);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [callId, goTo, navigation?.nextId, navigation?.previousId]);

  return (
    <Dialog
      open={Boolean(callId)}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className='data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100 top-0 left-0 flex h-dvh max-h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 p-0 shadow-none sm:max-w-none'
      >
        <DialogTitle className='sr-only'>{t('dialogTitle')}</DialogTitle>
        <DialogDescription className='sr-only'>
          {t('dialogDescription')}
        </DialogDescription>

        <header className='bg-background/95 z-10 shrink-0 border-b backdrop-blur'>
          <div className='mx-auto flex min-h-16 w-full max-w-7xl items-center justify-between gap-3 px-3 sm:px-6'>
            <Button
              type='button'
              variant='ghost'
              className='h-11 rounded-lg px-3'
              onClick={close}
            >
              <ArrowLeft className='size-4' />
              <span className='hidden sm:inline'>{t('back')}</span>
              <span className='sr-only sm:hidden'>{t('back')}</span>
            </Button>

            <nav
              className='flex items-center gap-2'
              aria-label={t('navigationLabel')}
            >
              <Button
                type='button'
                variant='outline'
                className='h-11 rounded-lg px-3'
                aria-label={t('previous')}
                aria-keyshortcuts='ArrowLeft'
                disabled={!navigation?.previousId}
                onClick={() => goTo(navigation?.previousId)}
              >
                <ChevronLeft className='size-4' />
                <span className='hidden md:inline'>{t('previous')}</span>
              </Button>

              <div
                className='text-muted-foreground flex min-w-24 justify-center text-xs tabular-nums sm:min-w-32 sm:text-sm'
                aria-live='polite'
              >
                {navigationFailed ? (
                  <span>{t('navigationUnavailable')}</span>
                ) : navigation ? (
                  <span>
                    {t('position', {
                      position: navigation.position,
                      total: navigation.total
                    })}
                  </span>
                ) : (
                  <Skeleton className='h-4 w-20 rounded' />
                )}
              </div>

              <Button
                type='button'
                variant='outline'
                className='h-11 rounded-lg px-3'
                aria-label={t('next')}
                aria-keyshortcuts='ArrowRight'
                disabled={!navigation?.nextId}
                onClick={() => goTo(navigation?.nextId)}
              >
                <span className='hidden md:inline'>{t('next')}</span>
                <ChevronRight className='size-4' />
              </Button>
            </nav>
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
