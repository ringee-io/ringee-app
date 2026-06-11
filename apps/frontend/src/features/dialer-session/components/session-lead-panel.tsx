'use client';

import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import {
  Building2,
  CheckCircle2,
  Hash,
  Phone,
  PhoneOff,
  SkipForward,
  Users
} from 'lucide-react';
import type { SessionItemDto } from '../api';
import type { CallSessionPhase } from '../use-call-session';

const STATUS_ICON = {
  pending: Hash,
  calling: Phone,
  completed: CheckCircle2,
  skipped: SkipForward,
  failed: PhoneOff
} as const;

const OUTCOME_LABELS: Record<string, string> = {
  meeting_booked: 'Meeting booked',
  sale: 'Sale',
  interested: 'Interested',
  follow_up: 'Follow up',
  callback_scheduled: 'Callback',
  not_interested: 'Not interested',
  no_answer: 'No answer',
  voicemail: 'Voicemail',
  wrong_number: 'Wrong number',
  gatekeeper: 'Gatekeeper'
};

const OUTCOME_TONE: Record<
  string,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  meeting_booked: 'default',
  sale: 'default',
  interested: 'default',
  follow_up: 'secondary',
  callback_scheduled: 'secondary',
  not_interested: 'destructive',
  no_answer: 'outline',
  voicemail: 'outline',
  wrong_number: 'destructive',
  gatekeeper: 'outline'
};

interface Props {
  items: SessionItemDto[];
  activeItem: SessionItemDto | null;
  phase: CallSessionPhase;
  onSelect: (id: string) => void;
}

export function SessionLeadPanel({
  items,
  activeItem,
  phase,
  onSelect
}: Props) {
  if (items.length === 0) {
    return (
      <div className='flex h-full flex-col items-center justify-center p-6 text-center'>
        <Users className='text-muted-foreground mb-3 h-10 w-10' />
        <h3 className='font-semibold'>No contacts in this session</h3>
        <p className='text-muted-foreground mt-1 text-sm'>
          The owner can add contacts and re-share the link.
        </p>
      </div>
    );
  }

  return (
    <div className='flex h-full flex-col'>
      {/* Active contact card */}
      {activeItem ? (
        <div className='space-y-3 p-4'>
          <div className='flex items-center gap-3'>
            <div className='bg-primary text-primary-foreground flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold'>
              {(activeItem.displayName || '?').charAt(0).toUpperCase()}
            </div>
            <div className='min-w-0'>
              <h2 className='truncate text-lg font-semibold'>
                {activeItem.displayName || 'Unknown contact'}
              </h2>
              <Badge variant='secondary' className='text-xs capitalize'>
                {phase.replace('_', ' ')}
              </Badge>
            </div>
          </div>

          <div className='space-y-2 text-sm'>
            <div className='text-muted-foreground flex items-center gap-2'>
              <Phone className='h-4 w-4' />
              <span className='font-mono'>{activeItem.phoneNumberMasked}</span>
            </div>
            {activeItem.company && (
              <div className='text-muted-foreground flex items-center gap-2'>
                <Building2 className='h-4 w-4' />
                <span>{activeItem.company}</span>
              </div>
            )}
            <div className='text-muted-foreground flex items-center gap-2'>
              <Hash className='h-4 w-4' />
              <span>Position #{activeItem.positionIndex + 1}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className='text-muted-foreground space-y-3 p-4 text-center text-sm'>
          Select a pending contact from the queue.
        </div>
      )}

      <Separator />

      {/* Queue */}
      <div className='flex-1 overflow-y-auto p-2'>
        <div className='text-muted-foreground px-2 pb-2 text-xs font-semibold tracking-wide uppercase'>
          Queue
        </div>
        <ul className='space-y-1'>
          {items.map((item) => {
            const Icon = STATUS_ICON[item.status];
            const isActive = activeItem?.id === item.id;
            const terminal =
              item.status === 'completed' ||
              item.status === 'skipped' ||
              item.status === 'failed';
            const clickable =
              phase === 'preview' && !terminal && item.status !== 'calling';
            return (
              <li key={item.id}>
                <button
                  type='button'
                  disabled={!clickable}
                  onClick={() => clickable && onSelect(item.id)}
                  className={
                    'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors ' +
                    (isActive
                      ? 'bg-primary/10 ring-primary/30 ring-1'
                      : clickable
                        ? 'hover:bg-muted'
                        : 'opacity-70')
                  }
                >
                  <Icon
                    className={
                      'h-4 w-4 shrink-0 ' +
                      (item.status === 'calling'
                        ? 'animate-pulse text-orange-500'
                        : item.status === 'completed'
                          ? 'text-emerald-600'
                          : item.status === 'failed'
                            ? 'text-red-500'
                            : 'text-muted-foreground')
                    }
                  />
                  <div className='min-w-0 flex-1'>
                    <div className='truncate font-medium'>
                      {item.displayName || 'Unknown contact'}
                    </div>
                    <div className='text-muted-foreground truncate text-xs'>
                      {item.company ? `${item.company} · ` : ''}
                      {item.phoneNumberMasked}
                    </div>
                  </div>
                  {item.outcome && (
                    <Badge
                      variant={OUTCOME_TONE[item.outcome] ?? 'outline'}
                      className='ml-auto text-[10px] whitespace-nowrap'
                    >
                      {OUTCOME_LABELS[item.outcome] ?? item.outcome}
                    </Badge>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
