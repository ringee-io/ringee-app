'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { CalendarDays, Clock, Cpu, Loader2 } from 'lucide-react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle
} from '@ringee/frontend-shared/components/ui/dialog';
import {
  contactName,
  firstName,
  meetingStart,
  useCalendarFormat
} from './calendar-utils';
import type { CalendarMeeting } from './types';

/**
 * "Cancel meeting" asks first and says what happens. The meeting is not
 * deleted: it stays in the history as Cancelled, so booked-meeting numbers
 * keep it.
 */
export function CancelMeetingDialog({
  meeting,
  provider,
  aiCallAt,
  onClose,
  onCancelled
}: {
  meeting: CalendarMeeting;
  provider: string | null;
  aiCallAt: Date | null;
  onClose: () => void;
  onCancelled: (meeting: CalendarMeeting) => void;
}) {
  const t = useTranslations('meetings.page.cancel');
  const fmt = useCalendarFormat();
  const api = useApi();
  const [cancelling, setCancelling] = useState(false);
  const start = meetingStart(meeting);
  const name = contactName(meeting);
  const strong = (chunks: React.ReactNode) => (
    <b className='text-foreground font-medium'>{chunks}</b>
  );

  const confirm = async () => {
    setCancelling(true);
    try {
      const updated = await api.patch<CalendarMeeting>(
        `/meetings/${meeting.id}/cancel`,
        {}
      );
      onCancelled(updated);
    } catch {
      toast.error(t('failed'));
      setCancelling(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        role='alertdialog'
        showCloseButton={false}
        className='gap-3.5 rounded-xl p-[21px] text-base sm:max-w-[440px]'
      >
        <div className='grid gap-[3px]'>
          <DialogTitle className='text-[16.8px] leading-snug font-semibold'>
            {t('title')}
          </DialogTitle>
          <DialogDescription className='text-[12.8px]'>
            {t.rich('what', {
              title: meeting.title || t('untitled'),
              name,
              day: fmt.shortDay(start),
              time: fmt.time(start),
              strong
            })}
          </DialogDescription>
        </div>
        <ul className='grid gap-[7px]'>
          {provider ? (
            <Line icon={<CalendarDays />}>
              {t.rich('removes', { provider, name: firstName(name), strong })}
            </Line>
          ) : null}
          {aiCallAt && meeting.attendanceStatus !== 'confirmed' ? (
            <Line icon={<Cpu />}>
              {t.rich('aiCalledOff', {
                day: fmt.shortDay(aiCallAt),
                time: fmt.time(aiCallAt),
                strong
              })}
            </Line>
          ) : null}
          <Line icon={<Clock />}>{t.rich('history', { strong })}</Line>
        </ul>
        <div className='flex justify-end gap-[7px] border-t pt-3.5'>
          <Button
            type='button'
            variant='outline'
            onClick={onClose}
            disabled={cancelling}
          >
            {t('keep')}
          </Button>
          <Button
            type='button'
            variant='destructive'
            onClick={() => void confirm()}
            disabled={cancelling}
          >
            {cancelling ? <Loader2 className='animate-spin' /> : null}
            {t('confirm')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Line({
  icon,
  children
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <li className='text-muted-foreground [&_svg]:text-foreground flex items-start gap-2 text-[12.8px] leading-[1.45] [&_svg]:mt-0.5 [&_svg]:size-3.5 [&_svg]:shrink-0'>
      {icon}
      <span>{children}</span>
    </li>
  );
}
