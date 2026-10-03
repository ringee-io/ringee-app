'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  History,
  Loader2,
  Phone,
  PhoneIncoming,
  PhoneOutgoing
} from 'lucide-react';
import {
  Avatar,
  AvatarFallback
} from '@ringee/frontend-shared/components/ui/avatar';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import {
  CallDetailDialog,
  ToneBadge,
  formatDuration,
  outcomeTone,
  useEnumLabels,
  type CallOutcome
} from '@/features/call-detail';
import { useDial } from '../../hooks/use.dial';
import { formatRelativeShort, getInitials, type RelativeT } from './shared';

interface RecentCall {
  id: string;
  fromNumber: string;
  toNumber: string;
  direction: 'inbound' | 'outbound';
  status: string;
  outcome: CallOutcome | null;
  /** The workspace disposition picked, when one was ("Demo booked"). */
  dispositionName?: string | null;
  durationSeconds: number;
  startedAt: string | null;
  contact?: { id?: string; name?: string | null } | null;
}

export function RecentCallsTab() {
  const t = useTranslations('dialer.sidePanel.recent');
  const tRel = useTranslations('dialer.sidePanel.relative');
  const relativeT: RelativeT = (key, vars) => tRel(key, vars);
  const labels = useEnumLabels();
  const api = useApi();
  const { dial, busy, dialingNumber } = useDial();
  const [calls, setCalls] = useState<RecentCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [openCallId, setOpenCallId] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    (async () => {
      try {
        const data = await api.get<{ data: RecentCall[] }>(
          `/telephony/calls?limit=10&page=1&userId=me`
        );
        if (!mountedRef.current) return;

        setCalls(data.data.slice(0, 10));
      } catch {
        // best-effort
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    })();
    return () => {
      mountedRef.current = false;
    };
  }, [api]);

  if (loading) {
    return (
      <div className='space-y-2 p-3'>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className='h-14 w-full' />
        ))}
      </div>
    );
  }

  if (calls.length === 0) {
    return (
      <div className='flex flex-col items-center px-4 py-10 text-center'>
        <History className='text-muted-foreground mb-3 h-10 w-10' />
        <h3 className='text-sm font-semibold'>{t('emptyTitle')}</h3>
        <p className='text-muted-foreground mt-1 text-xs'>
          {t('emptyDescription')}
        </p>
      </div>
    );
  }

  return (
    <>
      <ul className='divide-border divide-y'>
        {calls.map((call) => {
          const name = call.contact?.name || null;
          const inbound = call.direction === 'inbound';
          const phoneNumber = inbound ? call.fromNumber : call.toNumber;
          const DirectionIcon = inbound ? PhoneIncoming : PhoneOutgoing;
          const outcome = call.dispositionName ?? labels.outcome(call.outcome);
          return (
            <li
              key={call.id}
              className='hover:bg-muted/40 flex items-center gap-3 px-3 py-2 transition'
            >
              {/* The whole row opens the call; only the redial button dials. */}
              <button
                type='button'
                onClick={() => setOpenCallId(call.id)}
                className='flex min-w-0 flex-1 items-center gap-3 text-left'
                title={t('actions.openDetail')}
              >
                <Avatar className='size-8 shrink-0'>
                  <AvatarFallback className='text-[10px] font-semibold'>
                    {getInitials(name, phoneNumber)}
                  </AvatarFallback>
                </Avatar>
                <span className='min-w-0 flex-1'>
                  <span className='flex items-center gap-1.5'>
                    <DirectionIcon
                      className={
                        inbound
                          ? 'h-3 w-3 shrink-0 text-emerald-500'
                          : 'h-3 w-3 shrink-0 text-blue-500'
                      }
                      aria-label={inbound ? t('inbound') : t('outbound')}
                    />
                    <span className='truncate text-sm font-medium'>
                      {name || phoneNumber}
                    </span>
                  </span>
                  <span className='text-muted-foreground flex items-center gap-2 text-xs'>
                    {name && <span className='font-mono'>{phoneNumber}</span>}
                    {call.startedAt && (
                      <>
                        {name && <span>·</span>}
                        <span>
                          {formatRelativeShort(
                            new Date(call.startedAt),
                            relativeT
                          )}
                        </span>
                      </>
                    )}
                    {call.durationSeconds > 0 && (
                      <>
                        <span>·</span>
                        <span className='tabular-nums'>
                          {formatDuration(call.durationSeconds)}
                        </span>
                      </>
                    )}
                  </span>
                </span>
                {outcome ? (
                  <ToneBadge
                    tone={outcomeTone(call.outcome)}
                    className='hidden shrink-0 text-[10px] @[22rem]/sidepanel:inline-flex'
                  >
                    {outcome}
                  </ToneBadge>
                ) : null}
              </button>
              <Button
                size='icon'
                variant='ghost'
                disabled={busy}
                onClick={() => dial(phoneNumber)}
                className='h-8 w-8 shrink-0 text-green-600 hover:bg-green-100 hover:text-green-700 dark:hover:bg-green-500/20'
                title={t('actions.redial')}
                aria-label={t('actions.redial')}
              >
                {dialingNumber === phoneNumber ? (
                  <Loader2 className='h-4 w-4 animate-spin' />
                ) : (
                  <Phone className='h-4 w-4' />
                )}
              </Button>
            </li>
          );
        })}
      </ul>

      <CallDetailDialog
        callId={openCallId}
        onClose={() => setOpenCallId(null)}
      />
    </>
  );
}
