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
  Users,
} from 'lucide-react';
import type { SessionItemDto } from '../api';
import type { CallSessionPhase } from '../use-call-session';

const STATUS_ICON = {
  pending: Hash,
  calling: Phone,
  completed: CheckCircle2,
  skipped: SkipForward,
  failed: PhoneOff,
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
  gatekeeper: 'Gatekeeper',
};

const OUTCOME_TONE: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  meeting_booked: 'default',
  sale: 'default',
  interested: 'default',
  follow_up: 'secondary',
  callback_scheduled: 'secondary',
  not_interested: 'destructive',
  no_answer: 'outline',
  voicemail: 'outline',
  wrong_number: 'destructive',
  gatekeeper: 'outline',
};

interface Props {
  items: SessionItemDto[];
  activeItem: SessionItemDto | null;
  phase: CallSessionPhase;
  onSelect: (id: string) => void;
}

export function SessionLeadPanel({ items, activeItem, phase, onSelect }: Props) {
  if (items.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center">
        <Users className="mb-3 h-10 w-10 text-muted-foreground" />
        <h3 className="font-semibold">No contacts in this session</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          The owner can add contacts and re-share the link.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Active contact card */}
      {activeItem ? (
        <div className="space-y-3 p-4">
          <div className="flex items-center gap-3">
            <div className="bg-primary flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold text-primary-foreground">
              {(activeItem.displayName || '?').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold">
                {activeItem.displayName || 'Unknown contact'}
              </h2>
              <Badge variant="secondary" className="text-xs capitalize">
                {phase.replace('_', ' ')}
              </Badge>
            </div>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Phone className="h-4 w-4" />
              <span className="font-mono">{activeItem.phoneNumberMasked}</span>
            </div>
            {activeItem.company && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Building2 className="h-4 w-4" />
                <span>{activeItem.company}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-muted-foreground">
              <Hash className="h-4 w-4" />
              <span>Position #{activeItem.positionIndex + 1}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3 p-4 text-center text-sm text-muted-foreground">
          Select a pending contact from the queue.
        </div>
      )}

      <Separator />

      {/* Queue */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Queue
        </div>
        <ul className="space-y-1">
          {items.map((item) => {
            const Icon = STATUS_ICON[item.status];
            const isActive = activeItem?.id === item.id;
            const terminal =
              item.status === 'completed' ||
              item.status === 'skipped' ||
              item.status === 'failed';
            const clickable = phase === 'preview' && !terminal && item.status !== 'calling';
            return (
              <li key={item.id}>
                <button
                  type="button"
                  disabled={!clickable}
                  onClick={() => clickable && onSelect(item.id)}
                  className={
                    'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors ' +
                    (isActive
                      ? 'bg-primary/10 ring-1 ring-primary/30'
                      : clickable
                        ? 'hover:bg-muted'
                        : 'opacity-70')
                  }
                >
                  <Icon
                    className={
                      'h-4 w-4 shrink-0 ' +
                      (item.status === 'calling'
                        ? 'text-orange-500 animate-pulse'
                        : item.status === 'completed'
                          ? 'text-emerald-600'
                          : item.status === 'failed'
                            ? 'text-red-500'
                            : 'text-muted-foreground')
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">
                      {item.displayName || 'Unknown contact'}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {item.company ? `${item.company} · ` : ''}
                      {item.phoneNumberMasked}
                    </div>
                  </div>
                  {item.outcome && (
                    <Badge
                      variant={OUTCOME_TONE[item.outcome] ?? 'outline'}
                      className="ml-auto whitespace-nowrap text-[10px]"
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
