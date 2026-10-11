'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Play } from 'lucide-react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Card, CardContent } from '@ringee/frontend-shared/components/ui/card';
import { cn } from '@ringee/frontend-shared/lib/utils';

/**
 * "Ready to start dialing?" — the one step between a campaign and its calling
 * session. The workspace shows it before a session runs; the Call page shows
 * it under the campaign it is about to call. The button waits for the phone
 * line: a session started before the line registers would be handed a lead it
 * cannot dial, and pause on the spot.
 */
export function SessionStartCard({
  onStart,
  starting = false,
  lineReady,
  error,
  shortcut,
  className
}: {
  onStart: () => void;
  starting?: boolean;
  lineReady: boolean;
  error?: string | null;
  /** The key that presses the button, and how it is shown on it. */
  shortcut?: { key: string; hint: ReactNode };
  className?: string;
}) {
  const t = useTranslations('dialer.workspace');
  const tCallStatus = useTranslations('calls.activeCallStatus');
  const waiting = starting || !lineReady;

  return (
    <Card className={cn('w-full max-w-md', className)}>
      <CardContent className='flex flex-col items-center py-12'>
        <div className='mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10'>
          <Play className='h-8 w-8 text-emerald-600 dark:text-emerald-400' />
        </div>
        <h2 className='text-xl font-semibold'>{t('ready')}</h2>
        <p className='text-muted-foreground mt-2 max-w-md text-center text-sm'>
          {t('description')}
        </p>
        {error && (
          <p className='text-destructive mt-4 max-w-sm text-center text-sm'>
            {error}
          </p>
        )}
        <Button
          className='mt-6 bg-emerald-600 text-white hover:bg-emerald-700'
          size='lg'
          onClick={onStart}
          disabled={waiting}
          aria-keyshortcuts={shortcut?.key}
        >
          {waiting ? (
            <Loader2 className='mr-2 h-5 w-5 animate-spin' />
          ) : (
            <Play className='mr-2 h-5 w-5' />
          )}
          {starting
            ? t('starting')
            : lineReady
              ? t('start')
              : tCallStatus('connecting')}
          {shortcut && !waiting ? shortcut.hint : null}
        </Button>
      </CardContent>
    </Card>
  );
}
