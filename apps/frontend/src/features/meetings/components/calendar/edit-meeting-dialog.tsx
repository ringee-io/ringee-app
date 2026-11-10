'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { BellRing, CalendarDays, Clock, Cpu, Loader2 } from 'lucide-react';
import { addDays, isSameDay, startOfDay } from 'date-fns';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle
} from '@ringee/frontend-shared/components/ui/dialog';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Label } from '@ringee/frontend-shared/components/ui/label';
import { Textarea } from '@ringee/frontend-shared/components/ui/textarea';
import { DateStepper, Segmented, SlotGrid } from './calendar-parts';
import {
  DURATIONS,
  atTime,
  contactName,
  firstName,
  hhmm,
  meetingStart,
  useCalendarFormat
} from './calendar-utils';
import { hoursBefore } from './meeting-detail-drawer';
import { useOpenSlots } from './use-meetings-data';
import type { CalendarMeeting, RingeeCalendar } from './types';

/**
 * Edit or move a meeting — from "Edit or move" or by dragging it on the
 * calendar, which opens here at the time it was dropped. "Moves with it" says
 * what follows the meeting before it is saved.
 */
export function EditMeetingDialog({
  meeting,
  calendar,
  calendarId,
  provider,
  initial,
  now,
  aiOffsetMinutes,
  onClose,
  onSaved
}: {
  meeting: CalendarMeeting;
  calendar: RingeeCalendar | null;
  calendarId: string | null;
  provider: string | null;
  /** Where a drag dropped it; otherwise its own time. */
  initial: { date: Date; time: string } | null;
  now: Date;
  /** How long before a meeting the AI agent calls, if it calls about this one. */
  aiOffsetMinutes: number | null;
  onClose: () => void;
  onSaved: (meeting: CalendarMeeting, moved: boolean) => void;
}) {
  const t = useTranslations('meetings.page.edit');
  const tGrid = useTranslations('meetings.page.grid');
  const fmt = useCalendarFormat();
  const api = useApi();
  const start = meetingStart(meeting);
  const ownTime = hhmm(start.getHours() * 60 + start.getMinutes());

  const [date, setDate] = useState<Date>(startOfDay(initial?.date ?? start));
  const [time, setTime] = useState<string>(initial?.time ?? ownTime);
  const [duration, setDuration] = useState(meeting.duration);
  const [title, setTitle] = useState(meeting.title ?? '');
  const [location, setLocation] = useState(meeting.location ?? '');
  const [notes, setNotes] = useState(meeting.notes ?? '');
  const [saving, setSaving] = useState(false);

  const { slots, loading, failed, reload } = useOpenSlots({
    calendarId,
    date,
    duration
  });

  const when = atTime(date, time);
  const moved = when.getTime() !== start.getTime();
  const name = contactName(meeting);
  const offered = slots.includes(time);
  const ownSlot = isSameDay(date, start) && time === ownTime;

  const impact: { icon: React.ReactNode; node: React.ReactNode }[] = [];
  const strong = (chunks: React.ReactNode) => (
    <b className='text-foreground font-medium'>{chunks}</b>
  );
  if (moved) {
    if (provider) {
      impact.push({
        icon: <CalendarDays />,
        node: t.rich('impact.event', {
          provider,
          day: fmt.shortDay(when),
          time: fmt.time(when),
          name: firstName(name),
          strong
        })
      });
    }
    if (aiOffsetMinutes != null) {
      const aiAt = new Date(when.getTime() - aiOffsetMinutes * 60_000);
      if (aiAt > now) {
        impact.push({
          icon: <Cpu />,
          node: t.rich(
            meeting.attendanceStatus === 'confirmed'
              ? 'impact.aiAskAgain'
              : 'impact.ai',
            {
              day: fmt.shortDay(aiAt),
              time: fmt.time(aiAt),
              hours: hoursBefore(when, aiAt),
              strong
            }
          )
        });
      }
    } else if (meeting.attendanceStatus === 'confirmed') {
      impact.push({
        icon: <BellRing />,
        node: t.rich('impact.answerReset', { strong })
      });
    }
  } else if (duration !== meeting.duration && provider) {
    impact.push({
      icon: <CalendarDays />,
      node: t.rich('impact.ends', {
        provider,
        time: fmt.time(new Date(when.getTime() + duration * 60_000)),
        strong
      })
    });
  }

  const save = async () => {
    if (when <= now && moved) {
      toast.error(t('past'));
      return;
    }
    setSaving(true);
    try {
      const updated = await api.patch<CalendarMeeting>(
        `/meetings/${meeting.id}`,
        {
          title: title.trim() || undefined,
          scheduledAt: when.toISOString(),
          duration,
          location: location.trim(),
          notes: notes.trim()
        }
      );
      onSaved(updated, moved);
    } catch {
      toast.error(t('failed'));
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className='max-h-[calc(100vh-42px)] gap-3.5 overflow-y-auto rounded-xl p-[21px] text-base sm:max-w-[540px]'
        // Opened to change the time more often than the reason: focus the
        // dialog itself rather than select the reason's text.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (event.currentTarget as HTMLElement | null)?.focus();
        }}
      >
        <div className='grid gap-[3px] pr-6'>
          <DialogTitle className='text-[16.8px] leading-snug font-semibold'>
            {t('title')}
          </DialogTitle>
          <DialogDescription className='text-[12.8px]'>
            {meeting.contact.company
              ? t('withCompany', { name, company: meeting.contact.company })
              : t('with', { name })}
          </DialogDescription>
        </div>

        <div className='grid gap-[7px]'>
          <Label htmlFor='ed-title'>{t('reason')}</Label>
          <Input
            id='ed-title'
            value={title}
            maxLength={200}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>

        <div className='grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3.5'>
          <div className='grid gap-[7px]'>
            <span className='text-sm leading-none font-medium'>
              {t('date')}
            </span>
            <DateStepper
              date={date}
              label={fmt.shortDayYear(date)}
              onStep={(days) => setDate((d) => addDays(d, days))}
              disablePrev={isSameDay(date, now)}
            />
          </div>
          <div className='grid gap-[7px]'>
            <span className='text-sm leading-none font-medium'>
              {t('duration')}
            </span>
            <Segmented
              kind='radiogroup'
              label={t('duration')}
              value={duration}
              onChange={setDuration}
              options={DURATIONS.map((value) => ({
                value,
                label:
                  value === 60
                    ? tGrid('durationHour')
                    : tGrid('durationShort', { count: value })
              }))}
            />
          </div>
        </div>

        <div className='grid gap-[7px]'>
          <span className='text-sm leading-none font-medium'>
            {t('startTime')}{' '}
            <small className='text-muted-foreground text-xs font-normal'>
              ·{' '}
              {t('openTimesOn', {
                calendar: calendar?.name ?? t('yourCalendar')
              })}
            </small>
          </span>
          <SlotGrid
            date={date}
            slots={slots}
            value={time}
            onChange={setTime}
            loading={loading}
            failed={failed}
            onRetry={() => void reload()}
            dayName={fmt.weekdayLong(date)}
          />
          {!loading && !failed && !offered && !ownSlot ? (
            <p className='text-muted-foreground text-[12.8px]'>
              {t('notOpen', {
                time: fmt.time(when),
                calendar: calendar?.name ?? t('yourCalendar')
              })}
            </p>
          ) : null}
        </div>

        <div className='grid gap-[7px]'>
          <Label htmlFor='ed-location'>{t('location')}</Label>
          <Input
            id='ed-location'
            value={location}
            maxLength={500}
            placeholder={t('locationPlaceholder')}
            onChange={(event) => setLocation(event.target.value)}
          />
        </div>

        <div className='grid gap-[7px]'>
          <Label htmlFor='ed-notes'>{t('notes')}</Label>
          <Textarea
            id='ed-notes'
            rows={2}
            value={notes}
            maxLength={2000}
            placeholder={t('notesPlaceholder')}
            onChange={(event) => setNotes(event.target.value)}
          />
        </div>

        {impact.length > 0 ? (
          <div
            className='grid gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.06] px-3.5 py-3'
            aria-live='polite'
          >
            <p className='text-xs font-semibold tracking-[0.06em] text-emerald-600 uppercase dark:text-emerald-400'>
              {t('movesWithIt')}
            </p>
            <ul className='grid gap-[7px]'>
              {impact.map((line, index) => (
                <li
                  key={index}
                  className='text-muted-foreground [&_svg]:text-foreground flex items-start gap-2 text-[12.8px] leading-[1.45] [&_svg]:mt-0.5 [&_svg]:size-3.5 [&_svg]:shrink-0'
                >
                  {line.icon}
                  <span>{line.node}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className='flex flex-wrap items-center gap-2.5 border-t pt-3.5'>
          <p className='text-muted-foreground flex min-w-0 flex-1 items-center gap-[7px] text-[12.8px]'>
            <Clock className='size-3.5 shrink-0' />
            <span>
              {t.rich('now', {
                day: fmt.shortDay(start),
                time: fmt.time(start),
                strong
              })}
            </span>
          </p>
          <div className='ml-auto flex items-center gap-[7px]'>
            <Button type='button' variant='ghost' onClick={onClose}>
              {t('discard')}
            </Button>
            <Button
              type='button'
              onClick={() => void save()}
              disabled={saving}
              className='bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500'
            >
              {saving ? <Loader2 className='animate-spin' /> : null}
              {t('save')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
