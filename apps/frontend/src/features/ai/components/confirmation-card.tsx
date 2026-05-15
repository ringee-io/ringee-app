'use client';

import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  IconAlertTriangleFilled,
  IconCheck,
  IconLoader2,
  IconShieldCheck,
  IconUserPlus,
  IconX
} from '@tabler/icons-react';
import { useState } from 'react';
import type { PendingConfirmation } from '../hooks/use-ai-conversation';

interface Props {
  confirmation: PendingConfirmation;
  onAccept: (overrides?: Record<string, unknown>) => void | Promise<void>;
  onDecline: () => void | Promise<void>;
}

const ACTION_LABELS: Record<PendingConfirmation['action'], string> = {
  reveal: 'Reveal contact data',
  save: 'Save prospects to Ringee',
  list_create: 'Create list'
};

const ACTION_ICONS: Record<PendingConfirmation['action'], typeof IconUserPlus> = {
  reveal: IconShieldCheck,
  save: IconUserPlus,
  list_create: IconUserPlus
};

export function ConfirmationCard({ confirmation, onAccept, onDecline }: Props) {
  const [busy, setBusy] = useState<'approve' | 'decline' | null>(null);
  const isReveal = confirmation.action === 'reveal';
  const revealPhone = Boolean(confirmation.payload?.revealPhone);
  const ActionIcon = ACTION_ICONS[confirmation.action] ?? IconUserPlus;

  async function handle(kind: 'approve' | 'decline') {
    if (busy) return;
    setBusy(kind);
    try {
      if (kind === 'approve') await onAccept();
      else await onDecline();
    } finally {
      setBusy(null);
    }
  }

  const resolved = confirmation.resolved;

  return (
    <div
      data-state={resolved ? 'resolved' : 'pending'}
      className={[
        'group relative flex flex-col gap-3 overflow-hidden rounded-xl border p-4 shadow-sm transition-all',
        resolved
          ? 'border-border/60 bg-muted/30'
          : 'border-amber-500/60 bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent ring-2 ring-amber-500/30 ring-offset-2 ring-offset-background animate-in fade-in slide-in-from-top-2 duration-300'
      ].join(' ')}
    >
      {!resolved && (
        <span
          aria-hidden
          className='pointer-events-none absolute inset-x-0 top-0 h-0.5 animate-pulse bg-gradient-to-r from-transparent via-amber-500 to-transparent'
        />
      )}

      <div className='flex items-start gap-3'>
        <div
          className={[
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
            resolved
              ? 'bg-muted text-muted-foreground'
              : 'bg-amber-500/20 text-amber-600 dark:text-amber-300'
          ].join(' ')}
        >
          {resolved ? (
            confirmation.accepted ? (
              <IconCheck size={18} />
            ) : (
              <IconX size={18} />
            )
          ) : (
            <IconAlertTriangleFilled size={18} />
          )}
        </div>
        <div className='flex-1 min-w-0'>
          <div className='flex items-center gap-2'>
            <span
              className={[
                'text-[10px] font-bold uppercase tracking-wider',
                resolved
                  ? 'text-muted-foreground'
                  : 'text-amber-700 dark:text-amber-300'
              ].join(' ')}
            >
              {resolved ? 'Resolved' : 'Action required'}
            </span>
            <span className='flex items-center gap-1 text-xs font-medium text-muted-foreground'>
              <ActionIcon size={12} />
              {ACTION_LABELS[confirmation.action]}
            </span>
          </div>
          <p className='mt-1 text-sm font-medium leading-snug'>
            {confirmation.summary}
          </p>
        </div>
      </div>

      {isReveal && revealPhone && (
        <div className='rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200'>
          Phone reveal usually costs more credits than email reveal.
        </div>
      )}
      {typeof confirmation.estimatedCreditCost === 'number' && (
        <div className='text-xs text-muted-foreground'>
          Estimated cost: {confirmation.estimatedCreditCost} credit
          {confirmation.estimatedCreditCost === 1 ? '' : 's'}.
        </div>
      )}

      {resolved ? (
        <div className='text-xs italic text-muted-foreground'>
          {confirmation.accepted
            ? 'Approved — Ringee is processing this action.'
            : 'Declined.'}
        </div>
      ) : (
        <div className='flex items-center gap-2'>
          <Button
            variant='ghost'
            size='sm'
            onClick={() => void handle('decline')}
            disabled={busy !== null}
            className='h-9 flex-1 gap-1.5 text-sm'
          >
            {busy === 'decline' ? (
              <IconLoader2 size={15} className='animate-spin' />
            ) : (
              <IconX size={15} />
            )}
            Decline
          </Button>
          <Button
            size='sm'
            onClick={() => void handle('approve')}
            disabled={busy !== null}
            className='h-9 flex-[2] gap-1.5 bg-amber-500 text-amber-950 shadow-sm hover:bg-amber-400 dark:bg-amber-400 dark:text-amber-950 dark:hover:bg-amber-300'
          >
            {busy === 'approve' ? (
              <IconLoader2 size={15} className='animate-spin' />
            ) : (
              <IconCheck size={15} />
            )}
            Approve
          </Button>
        </div>
      )}
    </div>
  );
}
