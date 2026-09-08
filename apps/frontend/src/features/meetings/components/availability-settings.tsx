'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useEffect, useState } from 'react';
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
import {
  Bot,
  Clock3,
  Infinity as InfinityIcon,
  Loader2,
  Plus,
  RotateCcw,
  Trash2,
  Users
} from 'lucide-react';
import { toast } from 'sonner';

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
const DEFAULT_WINDOW: AvailabilityWindow = {
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  startTime: '09:00',
  endTime: '18:00',
  capacity: 1
};

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
}

export function AvailabilitySettings() {
  const api = useApi();
  const t = useTranslations('meetings.availability');
  const [isLoading, setIsLoading] = useState(true);
  const form = useForm<AvailabilityForm>({
    resolver: zodResolver(availabilityFormSchema),
    defaultValues: { windows: [DEFAULT_WINDOW] }
  });
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'windows'
  });
  const windows = useWatch({ control: form.control, name: 'windows' });

  const load = useCallback(async () => {
    setIsLoading(true);
    form.clearErrors('root');
    try {
      const settings = await api.get<AvailabilitySettingsResponse>(
        '/calendar/availability-settings'
      );
      form.reset({
        windows:
          settings.configured && settings.windows.length > 0
            ? settings.windows.map(({ id: _id, ...window }) => window)
            : [DEFAULT_WINDOW]
      });
    } catch {
      form.setError('root', { message: t('loadFailed') });
    } finally {
      setIsLoading(false);
    }
  }, [api, form, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = form.handleSubmit(async (values) => {
    form.clearErrors('root');
    try {
      const saved = await api.put<AvailabilitySettingsResponse>(
        '/calendar/availability-settings',
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

  if (isLoading) return <AvailabilitySettingsSkeleton />;

  return (
    <form onSubmit={save} className='space-y-6'>
      <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
        <div>
          <div className='flex flex-wrap items-center gap-2'>
            <h3 className='text-base font-semibold'>{t('title')}</h3>
            <Badge variant='secondary'>{t('ringeeBadge')}</Badge>
          </div>
          <p className='text-muted-foreground mt-1 max-w-2xl text-sm leading-relaxed'>
            {t('description')}
          </p>
        </div>
        <Button
          type='submit'
          disabled={form.formState.isSubmitting || !form.formState.isDirty}
          className='min-h-11 shrink-0 sm:min-h-9'
        >
          {form.formState.isSubmitting ? (
            <Loader2 className='size-4 animate-spin' />
          ) : null}
          {t('save')}
        </Button>
      </div>

      <Alert className='border-primary/20 bg-primary/5 rounded-xl'>
        <Bot className='size-4' />
        <AlertDescription>{t('agentHint')}</AlertDescription>
      </Alert>

      {form.formState.errors.root?.message ? (
        <Alert variant='destructive' className='rounded-xl'>
          <AlertDescription className='flex flex-wrap items-center justify-between gap-2'>
            <span>{form.formState.errors.root.message}</span>
            <Button type='button' variant='outline' size='sm' onClick={load}>
              <RotateCcw className='size-4' />
              {t('retry')}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className='space-y-4'>
        {fields.map((field, index) => {
          const capacity = windows[index]?.capacity;
          const errors = form.formState.errors.windows?.[index];
          return (
            <section
              key={field.id}
              className='border-border/40 bg-card rounded-xl border p-4 sm:p-5'
              aria-labelledby={`availability-window-${index}`}
            >
              <div className='mb-4 flex items-center justify-between gap-3'>
                <div className='flex items-center gap-2'>
                  <Clock3 className='text-primary size-4' />
                  <h4
                    id={`availability-window-${index}`}
                    className='text-sm font-semibold'
                  >
                    {t('window', { number: index + 1 })}
                  </h4>
                </div>
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  onClick={() => remove(index)}
                  disabled={fields.length === 1}
                  aria-label={t('removeWindow', { number: index + 1 })}
                  className='text-muted-foreground hover:text-destructive min-h-11 min-w-11 sm:min-h-9 sm:min-w-9'
                >
                  <Trash2 className='size-4' />
                </Button>
              </div>

              <div className='space-y-5'>
                <Controller
                  control={form.control}
                  name={`windows.${index}.daysOfWeek`}
                  render={({ field: daysField }) => (
                    <div>
                      <Label>{t('days')}</Label>
                      <div className='mt-2 flex flex-wrap gap-2'>
                        {DAY_ORDER.map((day) => {
                          const active = daysField.value.includes(day);
                          return (
                            <button
                              key={day}
                              type='button'
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
                              className={`focus-visible:ring-ring min-h-11 min-w-11 cursor-pointer rounded-lg border px-3 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none sm:min-h-9 ${
                                active
                                  ? 'border-primary bg-primary text-primary-foreground'
                                  : 'border-border/50 bg-background hover:border-primary/50 hover:bg-muted'
                              }`}
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

                <div className='grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(240px,1.3fr)]'>
                  <div>
                    <Label htmlFor={`availability-start-${index}`}>
                      {t('start')}
                    </Label>
                    <Input
                      id={`availability-start-${index}`}
                      type='time'
                      step={60}
                      className='mt-2 min-h-11 sm:min-h-9'
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
                      className='mt-2 min-h-11 sm:min-h-9'
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

                  <div className='border-border/40 bg-muted/20 rounded-lg border p-3'>
                    <div className='flex items-center justify-between gap-3'>
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
                      <Controller
                        control={form.control}
                        name={`windows.${index}.capacity`}
                        render={({ field: capacityField }) => (
                          <Switch
                            id={`availability-unlimited-${index}`}
                            checked={capacityField.value === null}
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

                    {capacity !== null ? (
                      <Controller
                        control={form.control}
                        name={`windows.${index}.capacity`}
                        render={({ field: capacityField }) => (
                          <div className='mt-3'>
                            <Label htmlFor={`availability-capacity-${index}`}>
                              {t('capacity')}
                            </Label>
                            <Input
                              id={`availability-capacity-${index}`}
                              type='number'
                              min={1}
                              max={10_000}
                              value={capacityField.value ?? 1}
                              onChange={(event) =>
                                capacityField.onChange(
                                  Number(event.target.value)
                                )
                              }
                              className='mt-2 min-h-11 sm:min-h-9'
                              aria-invalid={Boolean(errors?.capacity)}
                            />
                            <p className='text-muted-foreground mt-1.5 text-xs'>
                              {t('capacityHint')}
                            </p>
                          </div>
                        )}
                      />
                    ) : (
                      <p className='text-muted-foreground mt-3 text-xs'>
                        {t('unlimitedHint')}
                      </p>
                    )}
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
              </div>
            </section>
          );
        })}
      </div>

      <Button
        type='button'
        variant='outline'
        onClick={() =>
          append({
            daysOfWeek: [1, 2, 3, 4, 5],
            startTime: '18:00',
            endTime: '19:00',
            capacity: 1
          })
        }
        disabled={fields.length >= 50}
        className='min-h-11 w-full border-dashed sm:w-auto'
      >
        <Plus className='size-4' />
        {t('addWindow')}
      </Button>
    </form>
  );
}

export function AvailabilitySettingsSkeleton() {
  return (
    <div className='space-y-4'>
      <div className='space-y-2'>
        <Skeleton className='h-5 w-44' />
        <Skeleton className='h-4 w-full max-w-xl' />
      </div>
      <Skeleton className='h-16 w-full rounded-xl' />
      <Skeleton className='h-64 w-full rounded-xl' />
    </div>
  );
}
