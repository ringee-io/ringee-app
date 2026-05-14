'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  CalendarDays,
  Clock,
  ExternalLink,
  MapPin,
  Phone,
  Video
} from 'lucide-react';
import {
  Avatar,
  AvatarFallback
} from '@ringee/frontend-shared/components/ui/avatar';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useDialerStore } from '../../store/dialer.store';
import { useTelnyxStore } from '../../store/telnyx.store';
import { useCall } from '../../hooks/use.call';
import { getInitials, isToday as isTodayDate } from './shared';

interface Meeting {
  id: string;
  title?: string;
  scheduledAt: string;
  duration: number;
  location?: string;
  status: 'scheduled' | 'completed' | 'cancelled' | 'rescheduled';
  contact: {
    id: string;
    name?: string;
    phoneNumber: string;
    company?: string;
  };
}

function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

export function TodayTab() {
  const t = useTranslations('dialer.sidePanel.today');
  const api = useApi();
  const { setNumber } = useDialerStore();
  const { activeCall } = useTelnyxStore();
  const { handleCall } = useCall();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyNumber, setBusyNumber] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const isBusy =
    !!activeCall &&
    ['pending', 'ringing', 'answered', 'recording'].includes(
      activeCall.state || ''
    );

  useEffect(() => {
    mountedRef.current = true;
    (async () => {
      try {
        const data = await api.get<{ data: Meeting[] }>(
          '/meetings?upcoming=true&limit=50'
        );
        if (!mountedRef.current) return;

        setMeetings(data.data);
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

  async function handleDial(meeting: Meeting) {
    const phone = meeting.contact.phoneNumber;
    if (!phone || busyNumber || isBusy) return;
    setBusyNumber(phone);
    setNumber(phone);
    try {
      await handleCall(phone);
    } finally {
      setBusyNumber(null);
    }
  }

  if (loading) {
    return (
      <div className='space-y-2 p-3'>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className='h-16 w-full' />
        ))}
      </div>
    );
  }

  if (meetings.length === 0) {
    return (
      <div className='flex flex-col items-center px-4 py-10 text-center'>
        <CalendarDays className='text-muted-foreground mb-3 h-10 w-10' />
        <h3 className='text-sm font-semibold'>{t('emptyTitle')}</h3>
        <p className='text-muted-foreground mt-1 text-xs'>
          {t('emptyDescription')}
        </p>
      </div>
    );
  }

  return (
    <ul className='divide-border divide-y'>
      {meetings.map((meeting) => {
        const time = new Date(meeting.scheduledAt).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit'
        });
        const contactName = meeting.contact.name || meeting.contact.phoneNumber;
        const title = meeting.title || contactName;
        const locationIsUrl = meeting.location && isUrl(meeting.location);

        return (
          <li
            key={meeting.id}
            className='hover:bg-muted/40 flex items-start gap-3 px-3 py-2.5 transition'
          >
            <div className='flex w-12 shrink-0 flex-col items-center text-center'>
              <span className='text-sm font-semibold tabular-nums'>{time}</span>
              <span className='text-muted-foreground flex items-center gap-0.5 text-[10px]'>
                <Clock className='h-2.5 w-2.5' />
                {meeting.duration}m
              </span>
            </div>

            <Avatar className='size-8 shrink-0'>
              <AvatarFallback className='text-[10px] font-semibold'>
                {getInitials(
                  meeting.contact.name || null,
                  meeting.contact.phoneNumber
                )}
              </AvatarFallback>
            </Avatar>

            <div className='min-w-0 flex-1'>
              <Link
                href={`/dashboard/meetings?id=${meeting.id}`}
                target='_blank'
                className='block truncate text-sm font-medium hover:underline'
              >
                {title}
              </Link>
              <div className='text-muted-foreground mt-0.5 truncate text-xs'>
                {meeting.title ? contactName : meeting.contact.phoneNumber}
              </div>
              {meeting.location && (
                <div className='text-muted-foreground mt-0.5 flex items-center gap-1 text-xs'>
                  {locationIsUrl ? (
                    <Video className='h-3 w-3 shrink-0' />
                  ) : (
                    <MapPin className='h-3 w-3 shrink-0' />
                  )}
                  {locationIsUrl ? (
                    <a
                      href={meeting.location}
                      target='_blank'
                      rel='noopener noreferrer'
                      className='truncate hover:underline'
                    >
                      {t('joinLink')}
                    </a>
                  ) : (
                    <span className='truncate'>{meeting.location}</span>
                  )}
                </div>
              )}
            </div>

            <div className='flex shrink-0 items-center gap-1'>
              {locationIsUrl && (
                <Button
                  size='icon'
                  variant='ghost'
                  asChild
                  className='h-8 w-8'
                  title={t('actions.join')}
                >
                  <a
                    href={meeting.location}
                    target='_blank'
                    rel='noopener noreferrer'
                  >
                    <ExternalLink className='h-3.5 w-3.5' />
                  </a>
                </Button>
              )}
              <Button
                size='icon'
                variant='ghost'
                disabled={busyNumber === meeting.contact.phoneNumber || isBusy}
                onClick={() => handleDial(meeting)}
                className='h-8 w-8 text-green-600 hover:bg-green-100 hover:text-green-700 dark:hover:bg-green-500/20'
                title={t('actions.callContact')}
              >
                <Phone className='h-3.5 w-3.5' />
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
