'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  CalendarCheck,
  CalendarX,
  Clock,
  Loader2,
  PhoneOutgoing
} from 'lucide-react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { describeApiError } from '../../lib/api-error';
import { useAutomationApi } from '../api';
import { useVoiceAgentsRail } from '../store';

export type MeetingAttendanceStatus = 'pending' | 'confirmed' | 'declined';

const ICONS = {
  pending: Clock,
  confirmed: CalendarCheck,
  declined: CalendarX
} as const;

/**
 * Whether the lead said they will attend (CAL-003), on a meeting's own
 * detail — and "Confirm now": a reminder call about this meeting, placed
 * immediately, when the workspace's reminders are on.
 *
 * Shown only inside the automations pilot; elsewhere a meeting reads exactly
 * as it did before.
 */
export function MeetingAttendance({
  meeting
}: {
  meeting: {
    id: string;
    status: string;
    scheduledAt: string;
    attendanceStatus?: MeetingAttendanceStatus;
    attendanceNote?: string | null;
  };
}) {
  const t = useTranslations('aiVoiceAgents.automations.attendance');
  const api = useAutomationApi();
  const pilot = useVoiceAgentsRail((state) => state.summary?.enabled === true);
  const remindersOn = useVoiceAgentsRail(
    (state) => state.summary?.capabilities.reminders === 'active'
  );
  const [calling, setCalling] = useState(false);
  // Placed: the call about this meeting is on its way; another click would
  // only be refused.
  const [placed, setPlaced] = useState(false);

  if (!pilot) return null;

  const status = meeting.attendanceStatus ?? 'pending';
  const Icon = ICONS[status];
  const upcoming =
    (meeting.status === 'scheduled' || meeting.status === 'rescheduled') &&
    new Date(meeting.scheduledAt).getTime() > Date.now();

  const callNow = async () => {
    setCalling(true);
    try {
      const result = await api.confirmationCall(meeting.id);
      if (result.status === 'placed') {
        setPlaced(true);
        toast.success(t('calling'));
      } else {
        toast.warning(t('notPlaced', { reason: result.reason ?? '—' }));
      }
    } catch (failure) {
      toast.error(describeApiError(failure, t('callError')));
    } finally {
      setCalling(false);
    }
  };

  return (
    <div className='flex items-start gap-3'>
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
          status === 'confirmed'
            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
            : status === 'declined'
              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
              : 'bg-muted text-muted-foreground'
        )}
      >
        <Icon className='h-4 w-4' aria-hidden />
      </div>
      <div className='min-w-0 flex-1 space-y-2'>
        <div>
          <p className='text-muted-foreground text-xs tracking-wider uppercase'>
            {t('label')}
          </p>
          <p className='text-sm'>{t(`status.${status}`)}</p>
          {status === 'declined' && meeting.attendanceNote ? (
            <p className='text-muted-foreground mt-0.5 text-xs'>
              “{meeting.attendanceNote}”
            </p>
          ) : null}
        </div>
        {remindersOn && upcoming && status === 'pending' ? (
          <Button
            type='button'
            size='sm'
            variant='outline'
            className='h-11 rounded-lg md:h-8'
            onClick={() => void callNow()}
            disabled={calling || placed}
          >
            {calling ? (
              <Loader2 className='h-3.5 w-3.5 animate-spin' />
            ) : (
              <PhoneOutgoing className='h-3.5 w-3.5' />
            )}
            {t('callNow')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
