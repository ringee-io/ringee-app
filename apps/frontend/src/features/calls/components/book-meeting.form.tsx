'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form } from '@ringee/frontend-shared/components/ui/form';
import { FormInput } from '@ringee/frontend-shared/components/forms/form-input';
import { FormSelect } from '@ringee/frontend-shared/components/forms/form-select';
import { FormTextarea } from '@ringee/frontend-shared/components/forms/form-textarea';
import { useLocale, useTranslations } from 'next-intl';
import { de } from 'date-fns/locale/de';
import { enGB } from 'date-fns/locale/en-GB';
import { es } from 'date-fns/locale/es';
import { fr } from 'date-fns/locale/fr';
import { it } from 'date-fns/locale/it';
import { nl } from 'date-fns/locale/nl';
import { pt } from 'date-fns/locale/pt';
import { startOfToday, type Locale } from 'date-fns';
import { CalendarCheck, CalendarPlus, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Calendar } from '@ringee/frontend-shared/components/ui/calendar';
import { Label } from '@ringee/frontend-shared/components/ui/label';
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

const CALENDAR_LOCALES: Record<string, Locale> = {
  'en-GB': enGB,
  es,
  fr,
  pt,
  de,
  it,
  nl
};

interface BookMeetingFormProps {
  contactId: string;
  callId?: string | null;
  onBooked: () => void;
  onCancel: () => void;
  layout?: 'workspace';
  disabled?: boolean;
  onPendingChange?: (pending: boolean) => boolean | void;
}

export function BookMeetingForm({
  contactId,
  callId,
  onBooked,
  onCancel,
  layout,
  disabled = false,
  onPendingChange
}: BookMeetingFormProps) {
  const api = useApi();
  const locale = useLocale();
  const t = useTranslations('meetings.booking');
  const tNew = useTranslations('meetings.page.new');
  const id = useId();
  const [calendars, setCalendars] = useState<RingeeCalendar[]>([]);
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
  const schema = useMemo(
    () =>
      z
        .object({
          selectedDate: z.date(),
          selectedTime: z.string().nullable(),
          duration: z
            .number()
            .refine(
              (value) => (DURATIONS as readonly number[]).includes(value),
              t('validation.duration')
            ),
          calendarId: z
            .string()
            .refine(
              (value) => calendars.some((item) => item.id === value),
              t('validation.calendar')
            ),
          title: z
            .string()
            .trim()
            .max(200, t('validation.maxLength', { count: 200 })),
          notes: z
            .string()
            .trim()
            .max(2000, t('validation.maxLength', { count: 2000 })),
          attendeeEmail: z
            .string()
            .trim()
            .max(320, t('validation.email'))
            .refine(
              (value) => !value || z.email().safeParse(value).success,
              t('validation.email')
            )
        })
        .superRefine((values, context) => {
          if (
            calendars.find((item) => item.id === values.calendarId)
              ?.integration &&
            !values.attendeeEmail
          ) {
            context.addIssue({
              code: 'custom',
              path: ['attendeeEmail'],
              message: t('emailRequired')
            });
          }
        }),
    [calendars, t]
  );
  type BookingValues = z.infer<typeof schema>;
  const form = useForm<BookingValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      selectedDate: startOfToday(),
      selectedTime: null,
      duration: 30,
      calendarId: '',
      title: '',
      notes: '',
      attendeeEmail: ''
    }
  });
  const [selectedDate, selectedTime, duration, calendarId, title] = useWatch({
    control: form.control,
    name: ['selectedDate', 'selectedTime', 'duration', 'calendarId', 'title']
  });
  const blocked = disabled || isSubmitting;
  // Only user edits dismiss a server error. Programmatic invalidation after a
  // conflict must leave the conflict visible until a new choice or a retry.
  useEffect(() => {
    const subscription = form.watch((_values, { name, type }) => {
      if (type !== 'change') return;
      if (name === 'calendarId') form.setValue('selectedTime', null);
      setSubmitError(null);
    });
    return () => subscription.unsubscribe();
  }, [form]);
  const selectTime = (time: string | null) => {
    if (form.getValues('selectedTime') !== time) setSubmitError(null);
    form.setValue('selectedTime', time, { shouldDirty: true });
  };
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
        form.setValue('attendeeEmail', contact.email ?? '');
        setCalendars(available);
        form.setValue(
          'calendarId',
          (available.find((item) => item.isDefault) ?? available[0])?.id ?? ''
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
  }, [api, contactId, loadRevision, form]);

  const handleSubmit = async (values: BookingValues) => {
    const {
      selectedDate: date,
      selectedTime: time,
      duration: minutes,
      title,
      notes,
      attendeeEmail
    } = values;
    const selectedCalendar = calendars.find(
      (item) => item.id === values.calendarId
    );
    if (
      disabled ||
      submitting.current ||
      !time ||
      !selectedCalendar ||
      values.calendarId !== calendarId ||
      minutes !== duration ||
      date.getTime() !== selectedDate.getTime() ||
      loading ||
      failed ||
      !slots.includes(time)
    )
      return;
    const scheduledAt = atTime(date, time);
    if (scheduledAt <= new Date()) {
      form.setValue('selectedTime', null);
      void reload();
      return;
    }
    if (onPendingChange?.(true) === false) return;
    submitting.current = true;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const meeting = await api.post<{ id: string }>('/meetings', {
        contactId,
        callId: callId || undefined,
        calendarId: selectedCalendar.id,
        scheduledAt: scheduledAt.toISOString(),
        duration: minutes,
        title: title.trim() || undefined,
        notes: notes.trim() || undefined,
        attendeeEmail: attendeeEmail || undefined,
        requireAvailableSlot: true,
        bookingTimeZone: browserZone
      });
      setBooked({ at: scheduledAt, calendar: selectedCalendar.name });
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
        form.setValue('selectedTime', null);
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
    <Form
      form={form}
      onSubmit={(event) => {
        if (disabled || submitting.current) {
          event.preventDefault();
          return;
        }
        setSubmitError(null);
        void form.handleSubmit(handleSubmit)(event);
      }}
      className='space-y-4'
    >
      <div className='space-y-2'>
        <FormSelect
          control={form.control}
          name='calendarId'
          label={t('selectCalendar')}
          placeholder={t('noCalendars')}
          options={calendars.map((item) => ({
            value: item.id,
            label: item.name
          }))}
          disabled={blocked || !calendars.length}
          className='[&_button]:h-11 [&_button]:w-full [&_label]:text-xs'
        />
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
        <FormInput
          control={form.control}
          name='title'
          label={tNew('reason')}
          placeholder={tNew('reasonPlaceholder')}
          disabled={blocked}
          className='[&_input]:h-11 [&_input]:text-sm [&_label]:text-xs'
        />
        <div className='space-y-2'>
          <Label htmlFor={`${id}-duration`} className='text-xs'>
            {t('duration')}
          </Label>
          <select
            id={`${id}-duration`}
            value={duration}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (next !== duration) setSubmitError(null);
              form.setValue('duration', next, { shouldDirty: true });
              form.setValue('selectedTime', null);
            }}
            disabled={blocked}
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
            if (date && !blocked) {
              if (date.getTime() !== selectedDate.getTime())
                setSubmitError(null);
              form.setValue('selectedDate', date, { shouldDirty: true });
              selectTime(null);
            }
          }}
          disabled={blocked ? true : { before: startOfToday() }}
          fromMonth={startOfToday()}
          weekStartsOn={1}
          locale={
            CALENDAR_LOCALES[locale] ?? CALENDAR_LOCALES[locale.split('-')[0]]
          }
          labels={{
            labelPrevious: () => t('previousMonth'),
            labelNext: () => t('nextMonth')
          }}
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
                selectTime(null);
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
                  disabled={!available || blocked}
                  aria-pressed={selectedTime === slot.time}
                  onClick={() => selectTime(slot.time)}
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
      <FormInput
        control={form.control}
        name='attendeeEmail'
        label={t('contactEmail')}
        type='email'
        placeholder={t('emailPlaceholder')}
        required={!!calendar?.integration}
        disabled={blocked}
        className='border-t pt-4 [&_input]:h-11 [&_input]:text-sm [&_label]:text-xs'
      />
      <FormTextarea
        control={form.control}
        name='notes'
        label={tNew('notes')}
        placeholder={tNew('notesPlaceholder')}
        disabled={blocked}
        config={{ maxLength: 2000, rows: 2, showCharCount: false }}
        className='[&_label]:text-xs [&_textarea]:text-sm'
      />
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
            disabled={blocked}
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
            blocked ||
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
    </Form>
  );
}

const selectClass =
  'border-input bg-background focus-visible:ring-ring h-11 w-full min-w-0 cursor-pointer rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50';
