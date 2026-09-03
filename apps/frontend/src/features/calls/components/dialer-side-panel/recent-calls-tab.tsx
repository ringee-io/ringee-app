'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { History, Phone, PhoneOutgoing } from 'lucide-react';
import {
  Avatar,
  AvatarFallback
} from '@ringee/frontend-shared/components/ui/avatar';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useQuickDialerCall } from '../../hooks/use.quick.dialer.call';
import { formatRelativeShort, getInitials, type RelativeT } from './shared';

interface RecentCall {
  id: string;
  fromNumber: string;
  toNumber: string;
  direction: 'inbound' | 'outbound';
  status: string;
  durationSeconds: number;
  startedAt: string | null;
  contact?: { id?: string; name?: string | null } | null;
}

export function RecentCallsTab() {
  const t = useTranslations('dialer.sidePanel.recent');
  const tRel = useTranslations('dialer.sidePanel.relative');
  const relativeT: RelativeT = (key, vars) => tRel(key, vars);
  const api = useApi();
  const { handleRecall } = useQuickDialerCall();
  const [calls, setCalls] = useState<RecentCall[]>([]);
  const [loading, setLoading] = useState(true);
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
    <ul className='divide-border divide-y'>
      {calls.map((call) => {
        const name = call.contact?.name || null;
        const phoneNumber =
          call.direction === 'inbound' ? call.fromNumber : call.toNumber;
        return (
          <li
            key={call.id}
            className='hover:bg-muted/40 flex items-center gap-3 px-3 py-2 transition'
          >
            <Avatar className='size-8 shrink-0'>
              <AvatarFallback className='text-[10px] font-semibold'>
                {getInitials(name, phoneNumber)}
              </AvatarFallback>
            </Avatar>
            <div className='min-w-0 flex-1'>
              <div className='flex items-center gap-1.5'>
                <PhoneOutgoing className='h-3 w-3 shrink-0 text-blue-500' />
                <span className='truncate text-sm font-medium'>
                  {name || phoneNumber}
                </span>
              </div>
              <div className='text-muted-foreground flex items-center gap-2 text-xs'>
                {name && <span className='font-mono'>{phoneNumber}</span>}
                {call.startedAt && (
                  <>
                    {name && <span>·</span>}
                    <span>
                      {formatRelativeShort(new Date(call.startedAt), relativeT)}
                    </span>
                  </>
                )}
              </div>
            </div>
            <Button
              size='icon'
              variant='ghost'
              onClick={() => handleRecall(phoneNumber)}
              className='h-8 w-8 text-green-600 hover:bg-green-100 hover:text-green-700 dark:hover:bg-green-500/20'
              title={t('actions.redial')}
            >
              <Phone className='h-4 w-4' />
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
