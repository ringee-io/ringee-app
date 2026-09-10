'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import {
  Alert,
  AlertDescription
} from '@ringee/frontend-shared/components/ui/alert';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Label } from '@ringee/frontend-shared/components/ui/label';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { Switch } from '@ringee/frontend-shared/components/ui/switch';
import { cn } from '@ringee/frontend-shared/lib/utils';
import {
  Bot,
  Clock3,
  Infinity as InfinityIcon,
  Loader2,
  Plus,
  RotateCcw,
  Trash2,
  Users,
  Wand2
} from 'lucide-react';
import { toast } from 'sonner';

/** Monday-first, the way a working week is read. */
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
const WEEKDAYS = [1, 2, 3, 4, 5];
const WEEKEND = [0, 6];
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
const DEFAULT_WINDOW: AvailabilityWindow = {
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  startTime: '09:00',
  endTime: '18:00',
  capacity: 1
};

/**
 * The one-press working week: Monday to Friday, eight hours a day. It is the
 * shape most workspaces want and the slowest to build by hand — five day
 * toggles and two time fields before the first meeting can be booked.
 */
const WORKING_HOURS_START = '09:00';
const WORKING_HOURS_END = '17:00';

const availabilityWindowSchema = z
  .object({
    daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    capacity: z.number().int().min(1).max(10_000).nullable()
  })
  .refine((window) => window.endTime > window.startTime, {
    path: ['endTime'],
    message: 'endAfterStart'
  });

const availabilityFormSchema = z
  .object({
    windows: z.array(availabilityWindowSchema).min(1).max(50)
  })
  .superRefine(({ windows }, ctx) => {
    for (const day of DAY_ORDER) {
      const onDay = windows
        .map((window, index) => ({ window, index }))
        .filter(({ window }) => window.daysOfWeek.includes(day))
        .sort((left, right) =>
          left.window.startTime.localeCompare(right.window.startTime)
        );
      for (let index = 1; index < onDay.length; index += 1) {
        if (onDay[index]!.window.startTime < onDay[index - 1]!.window.endTime) {
          ctx.addIssue({
            code: 'custom',
            path: ['windows', onDay[index]!.index, 'startTime'],
            message: 'overlap'
          });
        }
      }
    }
  });

type AvailabilityWindow = {
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  capacity: number | null;
};

type AvailabilityForm = z.infer<typeof availabilityFormSchema>;

interface AvailabilitySettingsResponse {
  configured: boolean;
  windows: Array<AvailabilityWindow & { id?: string }>;
  calendarId: string;
  timezone: string;
}

interface AvailabilitySettingsProps {
  /**
   * Which calendar's windows to edit. Omitted targets the workspace's global
   * calendar, which is what this screen edited before there were several.
   */
  calendarId?: string;
  /** Rendered above the editor; the calendars screen puts its own header up. */
  showHeader?: boolean;
}

type TFunc = (key: string, values?: Record<string, string | number>) => string;

function sameDays(days: number[], other: number[]): boolean {
  return days.length === other.length && other.every((d) => days.includes(d));
}

/**
 * "Mon to Fri", "Weekends", "Mon · Wed · Fri" — the window's days as a person
 * would say them, so a card is readable without decoding seven toggles.
 */
function daysSummary(days: number[], t: TFunc): string {
  if (days.length === 0) return t('summary.none');
  if (sameDays(days, EVERY_DAY)) return t('summary.everyDay');
  if (sameDays(days, WEEKDAYS)) return t('summary.weekdays');
  if (sameDays(days, WEEKEND)) return t('summary.weekend');
  return DAY_ORDER.filter((day) => days.includes(day))
    .map((day) => t(`daysOfWeek.${day}`))
    .join(' · ');
}

/**
 * A new window starts where the last one ended, so adding one does not land on
 * top of an existing window and fail validation on the first save.
 */
function nextWindowDefaults(windows: AvailabilityWindow[]): AvailabilityWindow {
  const latest = windows.reduce(
    (end, window) => (window.endTime > end ? window.endTime : end),
    '09:00'
  );
  const [hours, minutes] = latest.split(':').map(Number);
  const startMinutes = Math.min((hours ?? 9) * 60 + (minutes ?? 0), 22 * 60);
  const endMinutes = Math.min(startMinutes + 60, 23 * 60 + 59);
  const asTime = (total: number) =>
    `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(
      total % 60
    ).padStart(2, '0')}`;

  return {
    daysOfWeek: [...WEEKDAYS],
    startTime: asTime(startMinutes),
    endTime: asTime(endMinutes),
    capacity: 1
  };
}

export function AvailabilitySettings({
  calendarId,
  showHeader = true
}: AvailabilitySettingsProps = {}) {
  const api = useApi();
  const t = useTranslations('meetings.availability');
  const endpoint = calendarId
    ? `/calendar/calendars/${calendarId}/availability-settings`
    : '/calendar/availability-settings';
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [timezone, setTimezone] = useState<string | null>(null);
  const form = useForm<AvailabilityForm>({
    resolver: zodResolver(availabilityFormSchema),
    defaultValues: { windows: [] }
  });
  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: 'windows'
  });
  const windows = useWatch({ control: form.control, name: 'windows' });
  const isSubmitting = form.formState.isSubmitting;
  const isDirty = form.formState.isDirty;

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadFailed(false);
    form.clearErrors('root');
    try {
      const settings = await api.get<AvailabilitySettingsResponse>(endpoint);
      if (settings.configured && settings.windows.length === 0) {
        throw new Error('Configured availability returned no windows');
      }
      setTimezone(settings.timezone);
      form.reset({
        windows: settings.configured
          ? settings.windows.map(({ id: _id, ...window }) => window)
          : [DEFAULT_WINDOW]
      });
    } catch {
      setLoadFailed(true);
      form.setError('root', { message: t('loadFailed') });
    } finally {
      setIsLoading(false);
    }
  }, [api, endpoint, form, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = form.handleSubmit(async (values) => {
    form.clearErrors('root');
    try {
      const saved = await api.put<AvailabilitySettingsResponse>(
        endpoint,
        values
      );
      form.reset({
        windows: saved.windows.map(({ id: _id, ...window }) => window)
      });
      toast.success(t('saved'));
    } catch {
      form.setError('root', { message: t('saveFailed') });
      toast.error(t('saveFailed'));
    }
  });

  // The same windows read by day — what the calendar actually offers, which is
  // the question the editor's per-window cards cannot answer on their own.
  const week = useMemo(() => {
    const current = (windows ?? []) as AvailabilityWindow[];
    return DAY_ORDER.map((day) => ({
      day,
      ranges: current
        .filter((window) => window?.daysOfWeek?.includes(day))
        .map((window) => ({ start: window.startTime, end: window.endTime }))
        .sort((left, right) => left.start.localeCompare(right.start))
    }));
  }, [windows]);

  // Disabled rather than hidden once it matches: the row is also how someone
  // reads what "working hours" means here, and a press that changes nothing
  // would leave the form dirty for no reason.
  const isWorkingWeek = useMemo(() => {
    const current = (windows ?? []) as AvailabilityWindow[];
    const [only] = current;
    return Boolean(
      current.length === 1 &&
        only &&
        sameDays(only.daysOfWeek ?? [], WEEKDAYS) &&
        only.startTime === WORKING_HOURS_START &&
        only.endTime === WORKING_HOURS_END
    );
  }, [windows]);

  const applyWorkingHours = useCallback(() => {
    const previous = form.getValues('windows');
    const [first] = previous;
    replace([
      {
        daysOfWeek: [...WEEKDAYS],
        startTime: WORKING_HOURS_START,
        endTime: WORKING_HOURS_END,
        // Hours are what this fills in. How many people may share a time is a
        // separate decision, so an existing choice survives the autofill.
        capacity: first ? first.capacity : 1
      }
    ]);
    toast.success(t('workingHours.applied'), {
      action: {
        label: t('workingHours.undo'),
        onClick: () => replace(previous)
      }
    });
  }, [form, replace, t]);

  if (isLoading) return <AvailabilitySettingsSkeleton />;

  if (loadFailed) {
    return (
      <Alert variant='destructive' className='rounded-xl'>
        <AlertDescription className='flex flex-wrap items-center justify-between gap-2'>
          <span>{form.formState.errors.root?.message ?? t('loadFailed')}</span>
          <Button type='button' variant='outline' size='sm' onClick={load}>
            <RotateCcw className='size-4' />
            {t('retry')}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form onSubmit={save} aria-busy={isSubmitting} className='@container'>
      <div className='space-y-5'>
        {showHeader ? (
          <div className='space-y-3'>
            <div>
              <div className='flex flex-wrap items-center gap-2'>
                <h3 className='text-base font-semibold'>{t('title')}</h3>
                <Badge variant='secondary'>{t('ringeeBadge')}</Badge>
              </div>
              <p className='text-muted-foreground mt-1 max-w-2xl text-sm leading-relaxed'>
                {t('description')}
              </p>
            </div>
            <Alert className='border-primary/20 bg-primary/5 rounded-xl'>
              <Bot className='size-4' />
              <AlertDescription>{t('agentHint')}</AlertDescription>
            </Alert>
          </div>
        ) : null}

        {form.formState.errors.root?.message ? (
          <Alert variant='destructive' className='rounded-xl'>
            <AlertDescription className='flex flex-wrap items-center justify-between gap-2'>
              <span>{form.formState.errors.root.message}</span>
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={load}
                disabled={isSubmitting}
              >
                <RotateCcw className='size-4' />
                {t('retry')}
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        <WeekOverview week={week} timezone={timezone} t={t} />

        {/*
          The usual week in one press. It replaces the windows below rather than
          adding to them — a second Mon–Fri window would overlap and fail
          validation — so the toast carries the way back, and nothing reaches
          the calendar until Save.
        */}
        <div className='border-border/40 bg-card flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3'>
          <div className='flex min-w-0 items-center gap-2.5'>
            <span className='bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-lg'>
              <Wand2 className='size-4' />
            </span>
            <div className='min-w-0'>
              <p className='text-sm font-medium'>{t('workingHours.title')}</p>
              <p
                id='availability-working-hours-hint'
                className='text-muted-foreground text-xs'
              >
                {isWorkingWeek
                  ? t('workingHours.active')
                  : t('workingHours.hint')}
              </p>
            </div>
          </div>
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={applyWorkingHours}
            disabled={isSubmitting || isWorkingWeek}
            aria-describedby='availability-working-hours-hint'
            className='min-h-11 sm:min-h-9'
          >
            {t('workingHours.action')}
          </Button>
        </div>

        <div className='space-y-3'>
          {fields.map((field, index) => {
            const current = windows?.[index] as AvailabilityWindow | undefined;
            const capacity = current?.capacity;
            const errors = form.formState.errors.windows?.[index];
            return (
              <section
                key={field.id}
                className='border-border/40 bg-card rounded-xl border'
                aria-labelledby={`availability-window-${index}`}
              >
                <header className='flex items-start justify-between gap-3 border-b px-4 py-3'>
                  <div className='flex min-w-0 items-center gap-2.5'>
                    <span className='bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-lg'>
                      <Clock3 className='size-4' />
                    </span>
                    <div className='min-w-0'>
                      <h4
                        id={`availability-window-${index}`}
                        className='truncate text-sm font-semibold'
                      >
                        {current
                          ? daysSummary(current.daysOfWeek ?? [], t)
                          : t('window', { number: index + 1 })}
                      </h4>
                      <p className='text-muted-foreground mt-0.5 text-xs tabular-nums'>
                        {current
                          ? `${current.startTime} – ${current.endTime}`
                          : null}
                      </p>
                    </div>
                  </div>
                  <div className='flex shrink-0 items-center gap-1.5'>
                    <Badge
                      variant='secondary'
                      className='hidden gap-1 @md:flex'
                    >
                      {capacity === null ? (
                        <>
                          <InfinityIcon className='size-3' />
                          {t('unlimited')}
                        </>
                      ) : (
                        <>
                          <Users className='size-3' />
                          {capacity ?? 1}
                        </>
                      )}
                    </Badge>
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon'
                      onClick={() => remove(index)}
                      disabled={isSubmitting || fields.length === 1}
                      aria-label={t('removeWindow', { number: index + 1 })}
                      className='text-muted-foreground hover:text-destructive size-9'
                    >
                      <Trash2 className='size-4' />
                    </Button>
                  </div>
                </header>

                <div className='space-y-5 p-4'>
                  <Controller
                    control={form.control}
                    name={`windows.${index}.daysOfWeek`}
                    render={({ field: daysField }) => (
                      <div>
                        <div className='flex flex-wrap items-center justify-between gap-2'>
                          <Label>{t('days')}</Label>
                          <div className='flex flex-wrap gap-1'>
                            {(
                              [
                                ['weekdays', WEEKDAYS],
                                ['weekend', WEEKEND],
                                ['everyDay', EVERY_DAY]
                              ] as const
                            ).map(([key, preset]) => (
                              <button
                                key={key}
                                type='button'
                                disabled={isSubmitting}
                                onClick={() => daysField.onChange([...preset])}
                                className='text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring cursor-pointer rounded-md px-2 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none'
                              >
                                {t(`presets.${key}`)}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className='mt-2 flex flex-wrap gap-1.5'>
                          {DAY_ORDER.map((day) => {
                            const active = daysField.value.includes(day);
                            return (
                              <button
                                key={day}
                                type='button'
                                disabled={isSubmitting}
                                aria-pressed={active}
                                onClick={() =>
                                  daysField.onChange(
                                    active
                                      ? daysField.value.filter(
                                          (value) => value !== day
                                        )
                                      : [...daysField.value, day]
                                  )
                                }
                                className={cn(
                                  'focus-visible:ring-ring min-h-11 flex-1 cursor-pointer rounded-lg border px-2 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none sm:min-h-9 sm:min-w-11 sm:flex-none',
                                  active
                                    ? 'border-primary bg-primary text-primary-foreground'
                                    : 'border-border/50 bg-background hover:border-primary/50 hover:bg-muted'
                                )}
                              >
                                {t(`daysOfWeek.${day}`)}
                              </button>
                            );
                          })}
                        </div>
                        {errors?.daysOfWeek ? (
                          <p
                            className='text-destructive mt-1.5 text-xs'
                            role='alert'
                          >
                            {t('validation.days')}
                          </p>
                        ) : null}
                      </div>
                    )}
                  />

                  <div className='grid gap-4 @lg:grid-cols-2'>
                    <div>
                      <Label htmlFor={`availability-start-${index}`}>
                        {t('start')}
                      </Label>
                      <Input
                        id={`availability-start-${index}`}
                        type='time'
                        step={60}
                        disabled={isSubmitting}
                        className='mt-2 min-h-11 tabular-nums sm:min-h-9'
                        aria-invalid={Boolean(errors?.startTime)}
                        {...form.register(`windows.${index}.startTime`)}
                      />
                      {errors?.startTime ? (
                        <p
                          className='text-destructive mt-1.5 text-xs'
                          role='alert'
                        >
                          {errors.startTime.message === 'overlap'
                            ? t('validation.overlap')
                            : t('validation.time')}
                        </p>
                      ) : null}
                    </div>

                    <div>
                      <Label htmlFor={`availability-end-${index}`}>
                        {t('end')}
                      </Label>
                      <Input
                        id={`availability-end-${index}`}
                        type='time'
                        step={60}
                        disabled={isSubmitting}
                        className='mt-2 min-h-11 tabular-nums sm:min-h-9'
                        aria-invalid={Boolean(errors?.endTime)}
                        {...form.register(`windows.${index}.endTime`)}
                      />
                      {errors?.endTime ? (
                        <p
                          className='text-destructive mt-1.5 text-xs'
                          role='alert'
                        >
                          {t('validation.endAfterStart')}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className='border-border/40 bg-muted/20 rounded-lg border p-3'>
                    <div className='flex flex-wrap items-center justify-between gap-3'>
                      <div className='flex items-center gap-2'>
                        {capacity === null ? (
                          <InfinityIcon className='text-primary size-4' />
                        ) : (
                          <Users className='text-primary size-4' />
                        )}
                        <Label htmlFor={`availability-unlimited-${index}`}>
                          {t('unlimited')}
                        </Label>
                      </div>
                      <div className='flex items-center gap-3'>
                        {capacity !== null ? (
                          <Controller
                            control={form.control}
                            name={`windows.${index}.capacity`}
                            render={({ field: capacityField }) => (
                              <div className='flex items-center gap-2'>
                                <Label
                                  htmlFor={`availability-capacity-${index}`}
                                  className='text-muted-foreground text-xs font-normal'
                                >
                                  {t('capacity')}
                                </Label>
                                <Input
                                  id={`availability-capacity-${index}`}
                                  type='number'
                                  min={1}
                                  max={10_000}
                                  disabled={isSubmitting}
                                  value={capacityField.value ?? 1}
                                  onChange={(event) =>
                                    capacityField.onChange(
                                      Number(event.target.value)
                                    )
                                  }
                                  className='min-h-11 w-20 tabular-nums sm:min-h-9'
                                  aria-invalid={Boolean(errors?.capacity)}
                                />
                              </div>
                            )}
                          />
                        ) : null}
                        <Controller
                          control={form.control}
                          name={`windows.${index}.capacity`}
                          render={({ field: capacityField }) => (
                            <Switch
                              id={`availability-unlimited-${index}`}
                              checked={capacityField.value === null}
                              disabled={isSubmitting}
                              onCheckedChange={(checked) =>
                                capacityField.onChange(checked ? null : 1)
                              }
                              aria-label={t('unlimitedAria', {
                                number: index + 1
                              })}
                            />
                          )}
                        />
                      </div>
                    </div>

                    <p className='text-muted-foreground mt-2 text-xs'>
                      {capacity === null
                        ? t('unlimitedHint')
                        : t('capacityHint')}
                    </p>
                    {errors?.capacity ? (
                      <p
                        className='text-destructive mt-1.5 text-xs'
                        role='alert'
                      >
                        {t('validation.capacity')}
                      </p>
                    ) : null}
                  </div>
                </div>
              </section>
            );
          })}
        </div>

        <Button
          type='button'
          variant='outline'
          onClick={() =>
            append(nextWindowDefaults((windows ?? []) as AvailabilityWindow[]))
          }
          disabled={isSubmitting || fields.length >= 50}
          className='min-h-11 w-full border-dashed sm:min-h-10'
        >
          <Plus className='size-4' />
          {t('addWindow')}
        </Button>

        {/*
          One save affordance, pinned to the bottom of the scrolling pane so it
          is reachable however long the list of windows gets.
        */}
        <div className='bg-background/85 border-border/40 sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 backdrop-blur'>
          <p
            className='text-muted-foreground text-xs'
            role={isDirty ? 'status' : undefined}
          >
            {isDirty ? t('unsaved') : t('upToDate')}
          </p>
          <div className='flex items-center gap-2'>
            <Button
              type='button'
              variant='ghost'
              size='sm'
              onClick={() => form.reset()}
              disabled={isSubmitting || !isDirty}
            >
              {t('discard')}
            </Button>
            <Button type='submit' size='sm' disabled={isSubmitting || !isDirty}>
              {isSubmitting ? (
                <Loader2 className='size-4 animate-spin' />
              ) : null}
              {t('save')}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}

/**
 * The resulting week, day by day. Reads the form live, so it answers "what does
 * this calendar actually offer?" while the windows are still being edited.
 */
function WeekOverview({
  week,
  timezone,
  t
}: {
  week: { day: number; ranges: { start: string; end: string }[] }[];
  timezone: string | null;
  t: TFunc;
}) {
  return (
    <section className='border-border/40 bg-muted/20 rounded-xl border p-3'>
      <div className='flex flex-wrap items-baseline justify-between gap-2 px-1'>
        <h4 className='text-xs font-semibold tracking-wide uppercase'>
          {t('overview')}
        </h4>
        {timezone ? (
          <p className='text-muted-foreground text-xs'>
            {t('timesIn', { timezone })}
          </p>
        ) : null}
      </div>
      <ul className='mt-3 grid grid-cols-2 gap-2 @md:grid-cols-4 @2xl:grid-cols-7'>
        {week.map(({ day, ranges }) => (
          <li
            key={day}
            className={cn(
              'rounded-lg border p-2',
              ranges.length > 0
                ? 'border-primary/25 bg-background'
                : 'border-border/40 bg-transparent'
            )}
          >
            <p className='text-xs font-medium'>{t(`daysOfWeek.${day}`)}</p>
            {ranges.length === 0 ? (
              <p className='text-muted-foreground mt-1 text-xs'>
                {t('closed')}
              </p>
            ) : (
              ranges.map((range, index) => (
                <p
                  key={`${range.start}-${range.end}-${index}`}
                  className='text-muted-foreground mt-1 text-xs tabular-nums'
                >
                  {range.start}–{range.end}
                </p>
              ))
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function AvailabilitySettingsSkeleton() {
  return (
    <div className='space-y-4'>
      <Skeleton className='h-24 w-full rounded-xl' />
      <Skeleton className='h-64 w-full rounded-xl' />
      <Skeleton className='h-11 w-full rounded-xl' />
    </div>
  );
}
