'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@ringee/frontend-shared/lib/utils';

type LineState = 'ready' | 'connecting' | 'offline';

/** The Telnyx connection status, as the three states a caller cares about. */
function toLineState(status: string): LineState {
  if (status === 'registered') return 'ready';
  if (status === 'disconnected') return 'offline';
  return 'connecting';
}

const DOT: Record<LineState, string> = {
  ready: 'bg-emerald-500',
  connecting: 'bg-amber-500 animate-pulse',
  offline: 'bg-red-500'
};

/**
 * Whether the phone line can place a call right now. Shown instead of dimming
 * the dialer, so a line that is still registering reads as "wait a second"
 * rather than as a broken screen.
 */
export function LineStatusBadge({
  status,
  className
}: {
  status: string;
  className?: string;
}) {
  const t = useTranslations('calls.dialer.line');
  const state = toLineState(status);

  return (
    <span
      role='status'
      title={t(`${state}Hint`)}
      className={cn(
        'text-muted-foreground inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
        className
      )}
    >
      <span className={cn('h-2 w-2 rounded-full', DOT[state])} />
      {t(state)}
    </span>
  );
}
