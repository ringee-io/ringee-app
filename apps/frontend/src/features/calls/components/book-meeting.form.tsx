'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { es } from 'date-fns/locale/es';
import { startOfToday } from 'date-fns';
import { CalendarCheck, CalendarPlus, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Calendar } from '@ringee/frontend-shared/components/ui/calendar';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Label } from '@ringee/frontend-shared/components/ui/label';
import { Textarea } from '@ringee/frontend-shared/components/ui/textarea';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { ApiError } from '@ringee/frontend-shared/lib/api';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { toast } from 'sonner';
import Link from 'next/link';
import { settingsHash } from '@/features/settings/lib/settings-nav';
import {
  atTime,
  browserTimeZone,
  DURATIONS
} from '@/features/meetings/components/calendar/calendar-utils';
import { useOpenSlots } from '@/features/meetings/components/calendar/use-meetings-data';
import type { RingeeCalendar } from '@/features/meetings/components/calendar/types';
import { offerMeetingInvitation } from '@/features/ai-voice-agents/automations/follow-up/follow-up-invitation';

interface BookMeetingFormProps {
  contactId: string;
  callId?: string | null;
  onBooked: () => void;
  onCancel: () => void;
  layout?: 'workspace';
  onPendingChange?: (pending: boolean) => void;
}

export function BookMeetingForm({
  contactId,
  callId,
  onBooked,
  onCancel,
  layout,
  onPendingChange
}: BookMeetingFormProps) {
  const api = useApi();
  const locale = useLocale();
  const t = useTranslations('meetings.booking');
  const tNew = useTranslations('meetings.page.new');
  const id = useId();
  const [selectedDate, setSelectedDate] = useState(startOfToday);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [duration, setDuration] = useState(30);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [calendars, setCalendars] = useState<RingeeCalendar[]>([]);
  const [calendarId, setCalendarId] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadRevision, setLoadRevision] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [booked, setBooked] = useState<{ at: Date; calendar: string } | null>(
    null
  );
  const submitting = useRef(false);
  const browserZone = browserTimeZone();
  const [displayZone, setDisplayZone] = useState(browserZone);
  const timeZones = useMemo(
    () => [
      ...new Set([
        browserZone,
        'UTC',
        ...(Intl.supportedValuesOf?.('timeZone') ?? [])
      ])
    ],
    [browserZone]
  );
  const calendar = calendars.find((item) => item.id === calendarId);
  const { slots, allSlots, loading, failed, reload } = useOpenSlots({
    calendarId,
    date: selectedDate,
    duration,
    enabled: !initializing && !loadFailed && !!calendar && !booked
  });
  const formatAt = (at: Date, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, {
      ...options,
      timeZone: displayZone
    }).format(at);
  const dateLabel = (at: Date) =>
    formatAt(at, { weekday: 'short', month: 'short', day: 'numeric' });
  const timeLabel = (at: Date) =>
    formatAt(at, { hour: 'numeric', minute: '2-digit' });

  useEffect(() => {
    let active = true;
    setInitializing(true);
    setLoadFailed(false);
    Promise.all([
      api.get<{ email?: string | null }>(`/contacts/${contactId}`),
      api.get<RingeeCalendar[]>('/calendar/calendars')
    ])
      .then(([contact, rows]) => {
        if (!active) return;
        const available = rows.filter((item) => !item.archivedAt);
        setContactEmail(contact.email ?? '');
        setCalendars(available);
        setCalendarId(
          (available.find((item) => item.isDefault) ?? available[0])?.id ?? null
        );
      })
      .catch(() => {
        if (active) setLoadFailed(true);
      })
      .finally(() => {
        if (active) setInitializing(false);
      });
    return () => {
      active = false;
    };
  }, [api, contactId, loadRevision]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (
      submitting.current ||
      !selectedTime ||
      !calendar ||
      loading ||
      failed ||
      !slots.includes(selectedTime)
    )
      return;
    if (calendar.integration && !contactEmail.trim()) {
      setSubmitError(t('emailRequired'));
      return;
    }
    const scheduledAt = atTime(selectedDate, selectedTime);
    if (scheduledAt <= new Date()) {
      setSelectedTime(null);
      void reload();
      return;
    }
    submitting.current = true;
    onPendingChange?.(true);
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const meeting = await api.post<{ id: string }>('/meetings', {
        contactId,
        callId: callId || undefined,
        calendarId: calendar.id,
        scheduledAt: scheduledAt.toISOString(),
        duration,
        title: title.trim() || undefined,
        notes: notes.trim() || undefined,
        attendeeEmail: contactEmail.trim() || undefined,
        requireAvailableSlot: true,
        bookingTimeZone: browserZone
      });
      setBooked({ at: scheduledAt, calendar: calendar.name });
      offerMeetingInvitation({ meetingId: meeting.id, callId });
      toast.success(
        t('success', {
          date: dateLabel(scheduledAt),
          time: timeLabel(scheduledAt)
        })
      );
      onBooked();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setSubmitError(tNew('taken'));
        setSelectedTime(null);
        void reload();
      } else setSubmitError(t('failed'));
    } finally {
      submitting.current = false;
      onPendingChange?.(false);
      setIsSubmitting(false);
    }
  };

  if (initializing)
    return (
      <div className='space-y-4' aria-busy='true'>
        <Skeleton className='h-11 w-full' />
        <Skeleton className='h-11 w-full' />
        <Skeleton className='h-64 w-full' />
      </div>
    );
  if (loadFailed)
    return (
      <div role='alert' className='space-y-3 text-sm'>
        <p>{t('loadFailed')}</p>
        <Button
          type='button'
          variant='outline'
          onClick={() => setLoadRevision((value) => value + 1)}
          className='h-11 cursor-pointer'
        >
          <RefreshCw className='size-4' />
          {t('retry')}
        </Button>
      </div>
    );
  if (booked)
    return (
      <div
        role='status'
        className='space-y-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-5'
      >
        <CalendarCheck className='size-8 text-emerald-600 dark:text-emerald-400' />
        <h4 className='text-base font-semibold'>{t('booked')}</h4>
        <p className='text-sm'>
          {t('success', {
            date: dateLabel(booked.at),
            time: timeLabel(booked.at)
          })}
        </p>
        <dl className='space-y-3 text-sm'>
          <div>
            <dt className='text-muted-foreground text-xs'>
              {tNew('calendar')}
            </dt>
            <dd>{booked.calendar}</dd>
          </div>
          {title && (
            <div>
              <dt className='text-muted-foreground text-xs'>
                {tNew('reason')}
              </dt>
              <dd>{title}</dd>
            </div>
          )}
          <div>
            <dt className='text-muted-foreground text-xs'>
              {t('showTimesIn')}
            </dt>
            <dd>{displayZone.replaceAll('_', ' ')}</dd>
          </div>
        </dl>
      </div>
    );

  return (
    <form onSubmit={handleSubmit} className='space-y-4'>
      <div className='space-y-2'>
        <Label htmlFor={`${id}-calendar`} className='text-xs'>
          {t('selectCalendar')}
        </Label>
        <select
          id={`${id}-calendar`}
          value={calendarId ?? ''}
          onChange={(event) => {
            setCalendarId(event.target.value);
            setSelectedTime(null);
          }}
          className={selectClass}
          disabled={isSubmitting || !calendars.length}
        >
          {!calendars.length && <option value=''>{t('noCalendars')}</option>}
          {calendars.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <p className='text-muted-foreground text-xs'>
          {calendar?.integration
            ? `${calendar.integration.provider === 'google' ? 'Google Calendar' : 'Microsoft Outlook'}${calendar.integration.email ? ` · ${calendar.integration.email}` : ''}`
            : tNew('onlyRingee')}
        </p>
        {calendar && !calendar.integration && (
          <Link
            href={settingsHash('calendar-providers')}
            target='_blank'
            rel='noopener noreferrer'
            className='inline-flex min-h-11 items-center text-xs underline underline-offset-4'
          >
            {t('connectCalendar')}
          </Link>
        )}
      </div>
      <div className='grid grid-cols-[minmax(0,1fr)_100px] gap-3'>
        <div className='space-y-2'>
          <Label htmlFor={`${id}-title`} className='text-xs'>
            {tNew('reason')}
          </Label>
          <Input
            id={`${id}-title`}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={200}
            disabled={isSubmitting}
            placeholder={tNew('reasonPlaceholder')}
            className='h-11 text-sm'
          />
        </div>
        <div className='space-y-2'>
          <Label htmlFor={`${id}-duration`} className='text-xs'>
            {t('duration')}
          </Label>
          <select
            id={`${id}-duration`}
            value={duration}
            onChange={(event) => {
              setDuration(Number(event.target.value));
              setSelectedTime(null);
            }}
            disabled={isSubmitting}
            className={selectClass}
          >
            {DURATIONS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {t('minutes', { count: minutes })}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className='space-y-2'>
        <Label htmlFor={`${id}-zone`} className='text-xs'>
          {t('showTimesIn')}
        </Label>
        <select
          id={`${id}-zone`}
          value={displayZone}
          onChange={(event) => setDisplayZone(event.target.value)}
          className={selectClass}
        >
          {timeZones.map((zone) => (
            <option key={zone} value={zone}>
              {zone.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
      </div>
      <div className='bg-background rounded-xl border'>
        <Calendar
          mode='single'
          selected={selectedDate}
          onSelect={(date) => {
            if (date && !isSubmitting) {
              setSelectedDate(date);
              setSelectedTime(null);
            }
          }}
          disabled={isSubmitting ? true : { before: startOfToday() }}
          fromMonth={startOfToday()}
          weekStartsOn={1}
          locale={locale.startsWith('es') ? es : undefined}
          className='w-full p-3'
          classNames={{
            month: 'flex w-full flex-col gap-3',
            head_row: 'grid grid-cols-7',
            head_cell: 'text-muted-foreground text-center text-xs font-normal',
            row: 'mt-1 grid grid-cols-7',
            cell: 'relative p-0 text-center text-sm',
            day: 'flex h-10 w-full cursor-pointer items-center justify-center rounded-md p-0 text-xs font-mono hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring',
            day_selected:
              'border border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
            day_disabled: 'text-muted-foreground cursor-not-allowed opacity-30',
            day_today: 'border border-border',
            nav_button:
              'inline-flex size-11 cursor-pointer items-center justify-center rounded-md hover:bg-muted',
            caption: 'relative flex h-11 w-full items-center justify-center',
            caption_label: 'text-sm font-semibold'
          }}
        />
      </div>
      <div className='space-y-2' aria-live='polite' aria-busy={loading}>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <Label className='text-xs'>{tNew('startTime')}</Label>
          <span className='text-muted-foreground text-xs'>
            {new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
              selectedDate
            )}
          </span>
        </div>
        {loading ? (
          <div className='grid grid-cols-3 gap-2'>
            {[0, 1, 2, 3, 4, 5].map((key) => (
              <Skeleton key={key} className='h-11 w-full' />
            ))}
          </div>
        ) : failed ? (
          <div role='alert' className='space-y-2'>
            <p className='text-destructive text-xs'>
              {t('availabilityFailed')}
            </p>
            <Button
              type='button'
              variant='outline'
              onClick={() => {
                setSelectedTime(null);
                void reload();
              }}
              className='h-11 cursor-pointer'
            >
              {t('retry')}
            </Button>
          </div>
        ) : allSlots.length ? (
          <div className='grid grid-cols-3 gap-2'>
            {allSlots.map((slot) => {
              const at = atTime(selectedDate, slot.time);
              const available = slot.available && at > new Date();
              return (
                <button
                  type='button'
                  key={slot.time}
                  disabled={!available || isSubmitting}
                  aria-pressed={selectedTime === slot.time}
                  onClick={() => setSelectedTime(slot.time)}
                  title={slot.eventName}
                  className={cn(
                    'focus-visible:ring-ring min-h-11 cursor-pointer rounded-md border px-1 py-2 font-mono text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40',
                    !available
                      ? 'border-dashed line-through'
                      : selectedTime === slot.time
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                        : 'bg-background hover:bg-muted'
                  )}
                >
                  {timeLabel(at)}
                  {displayZone !== browserZone && (
                    <span className='mt-0.5 block text-[10px]'>
                      {dateLabel(at)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <p className='text-muted-foreground py-4 text-center text-sm'>
            {t('noSlots')}
          </p>
        )}
      </div>
      <div className='space-y-2 border-t pt-4'>
        <Label htmlFor={`${id}-email`} className='text-xs'>
          {t('contactEmail')}
        </Label>
        <Input
          id={`${id}-email`}
          type='email'
          value={contactEmail}
          onChange={(event) => setContactEmail(event.target.value)}
          placeholder={t('emailPlaceholder')}
          required={!!calendar?.integration}
          maxLength={320}
          disabled={isSubmitting}
          className='h-11 text-sm'
        />
      </div>
      <div className='space-y-2'>
        <Label htmlFor={`${id}-notes`} className='text-xs'>
          {tNew('notes')}
        </Label>
        <Textarea
          id={`${id}-notes`}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder={tNew('notesPlaceholder')}
          maxLength={2000}
          disabled={isSubmitting}
          rows={2}
          className='text-sm'
        />
      </div>
      {submitError && (
        <p role='alert' className='text-destructive text-xs'>
          {submitError}
        </p>
      )}
      <div className='bg-card sticky -bottom-5 -mx-4 flex gap-2 border-t px-4 py-3 xl:-mx-5 xl:px-5'>
        {layout !== 'workspace' && (
          <Button
            type='button'
            variant='ghost'
            onClick={onCancel}
            disabled={isSubmitting}
            className='h-11'
          >
            {t('cancel')}
          </Button>
        )}
        <Button
          type='submit'
          disabled={
            !selectedTime ||
            !calendar ||
            isSubmitting ||
            loading ||
            failed ||
            !slots.includes(selectedTime)
          }
          className='h-11 flex-1 cursor-pointer bg-emerald-600 text-white hover:bg-emerald-700'
        >
          {isSubmitting ? (
            <Loader2 className='size-4 animate-spin motion-reduce:animate-none' />
          ) : (
            <CalendarPlus className='size-4' />
          )}
          {tNew('book')}
        </Button>
      </div>
    </form>
  );
}

const selectClass =
  'border-input bg-background focus-visible:ring-ring h-11 w-full min-w-0 cursor-pointer rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50';
