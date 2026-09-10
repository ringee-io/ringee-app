'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@ringee/frontend-shared/components/ui/select';
import { cn } from '@ringee/frontend-shared/lib/utils';
import {
  Archive,
  ArchiveRestore,
  Bot,
  CalendarDays,
  Clock3,
  ExternalLink,
  Loader2,
  Plus,
  RotateCcw,
  Unplug
} from 'lucide-react';
import { toast } from 'sonner';
import { useCalendarConnectionResult } from '../hooks/use-calendar-connection-result';
import { AvailabilitySettings } from './availability-settings';

/** A Ringee calendar, as `GET /calendar/calendars` returns it. */
interface RingeeCalendar {
  id: string;
  name: string;
  timezone: string;
  isDefault: boolean;
  archivedAt: string | null;
  integration: {
    id: string;
    provider: 'google' | 'microsoft';
    email: string | null;
  } | null;
  externalCalendarId: string | null;
  agentCount: number;
}

interface ExternalCalendarOption {
  id: string;
  name: string;
  primary: boolean;
}

interface AgentUsingCalendar {
  id: string;
  name: string;
}

/** "Send this calendar's bookings nowhere" — the absence of a destination. */
const NO_EXTERNAL_VALUE = 'none';

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function CalendarsManager({
  initialCalendarId,
  onCalendarChange
}: {
  /** Opens straight onto one calendar, e.g. from an agent's setup screen. */
  initialCalendarId?: string;
  /**
   * Reports the calendar now on screen. The settings dialog uses it to keep the
   * URL fragment on that calendar, so reopening lands where you left off.
   */
  onCalendarChange?: (calendarId: string) => void;
} = {}) {
  const api = useApi();
  const t = useTranslations('meetings.calendars');
  const [calendars, setCalendars] = useState<RingeeCalendar[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialCalendarId ?? null
  );
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadFailed(false);
    try {
      const data = await api.get<RingeeCalendar[]>(
        '/calendar/calendars?includeArchived=true'
      );
      setCalendars(data);
      setSelectedId((current) => {
        if (current && data.some((calendar) => calendar.id === current)) {
          return current;
        }
        return data.find((calendar) => calendar.isDefault)?.id ?? null;
      });
    } catch {
      setLoadFailed(true);
    } finally {
      setIsLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  // Connecting a Google account leaves and comes back here, so the result of
  // that round-trip is announced by this pane.
  useCalendarConnectionResult(load);

  const selected = useMemo(
    () => calendars.find((calendar) => calendar.id === selectedId) ?? null,
    [calendars, selectedId]
  );

  const selectCalendar = (calendarId: string) => {
    setSelectedId(calendarId);
    onCalendarChange?.(calendarId);
  };

  const createCalendar = async () => {
    setCreating(true);
    try {
      const created = await api.post<RingeeCalendar>('/calendar/calendars', {
        name: t('newName'),
        timezone: browserTimeZone()
      });
      await load();
      selectCalendar(created.id);
      toast.success(t('created'));
    } catch {
      toast.error(t('createFailed'));
    } finally {
      setCreating(false);
    }
  };

  if (isLoading) return <CalendarsManagerSkeleton />;

  if (loadFailed) {
    return (
      <Alert variant='destructive' className='rounded-xl'>
        <AlertDescription className='flex flex-wrap items-center justify-between gap-2'>
          <span>{t('loadFailed')}</span>
          <Button type='button' variant='outline' size='sm' onClick={load}>
            <RotateCcw className='size-4' />
            {t('retry')}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className='@container space-y-5'>
      <Alert className='border-primary/20 bg-primary/5 rounded-xl'>
        <Bot className='size-4' />
        <AlertDescription>{t('agentHint')}</AlertDescription>
      </Alert>

      {/*
        A row of calendars rather than a side rail: this pane is narrow, and a
        workspace has a handful of calendars, not a directory of them.
      */}
      <div className='space-y-2'>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <Label className='text-muted-foreground text-xs tracking-wide uppercase'>
            {t('pickerLabel')}
          </Label>
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={createCalendar}
            disabled={creating}
          >
            {creating ? (
              <Loader2 className='size-4 animate-spin' />
            ) : (
              <Plus className='size-4' />
            )}
            {t('add')}
          </Button>
        </div>

        <nav aria-label={t('pickerLabel')} className='flex flex-wrap gap-2'>
          {calendars.map((calendar) => {
            const active = calendar.id === selectedId;
            return (
              <button
                key={calendar.id}
                type='button'
                onClick={() => selectCalendar(calendar.id)}
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'focus-visible:ring-ring flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none',
                  active
                    ? 'border-primary bg-primary/5'
                    : 'border-border/40 bg-card hover:border-primary/40',
                  calendar.archivedAt && !active && 'opacity-60'
                )}
              >
                <CalendarDays
                  className={cn(
                    'size-4 shrink-0',
                    active ? 'text-primary' : 'text-muted-foreground'
                  )}
                />
                <span className='max-w-[14rem] truncate text-sm font-medium'>
                  {calendar.name}
                </span>
                {calendar.isDefault ? (
                  <Badge variant='secondary' className='text-[10px]'>
                    {t('globalBadge')}
                  </Badge>
                ) : calendar.archivedAt ? (
                  <Badge variant='outline' className='text-[10px]'>
                    {t('archivedBadge')}
                  </Badge>
                ) : null}
              </button>
            );
          })}
        </nav>
      </div>

      {selected ? (
        <CalendarDetail
          key={selected.id}
          calendar={selected}
          onChanged={load}
        />
      ) : null}
    </div>
  );
}

function CalendarDetail({
  calendar,
  onChanged
}: {
  calendar: RingeeCalendar;
  onChanged: () => Promise<void>;
}) {
  const api = useApi();
  const t = useTranslations('meetings.calendars');
  const [name, setName] = useState(calendar.name);
  const [timezone, setTimezone] = useState(calendar.timezone);
  const [savingDetails, setSavingDetails] = useState(false);
  const [busyAction, setBusyAction] = useState(false);
  const [externalOptions, setExternalOptions] = useState<
    ExternalCalendarOption[]
  >([]);
  const [externalError, setExternalError] = useState(false);
  const [agents, setAgents] = useState<AgentUsingCalendar[]>([]);

  const detailsDirty = name !== calendar.name || timezone !== calendar.timezone;

  useEffect(() => {
    void (async () => {
      try {
        setAgents(
          await api.get<AgentUsingCalendar[]>(
            `/calendar/calendars/${calendar.id}/agents`
          )
        );
      } catch {
        setAgents([]);
      }
    })();
  }, [api, calendar.id]);

  // The external calendar list only exists once an account is connected, and it
  // is only ever a destination picker — nothing here affects availability.
  useEffect(() => {
    if (!calendar.integration) {
      setExternalOptions([]);
      return;
    }
    void (async () => {
      setExternalError(false);
      try {
        setExternalOptions(
          await api.get<ExternalCalendarOption[]>(
            `/calendar/integrations/${calendar.integration!.id}/external-calendars`
          )
        );
      } catch {
        setExternalError(true);
        setExternalOptions([]);
      }
    })();
  }, [api, calendar.integration]);

  const saveDetails = async () => {
    setSavingDetails(true);
    try {
      await api.patch(`/calendar/calendars/${calendar.id}`, {
        name,
        timezone
      });
      await onChanged();
      toast.success(t('saved'));
    } catch {
      toast.error(t('saveFailed'));
    } finally {
      setSavingDetails(false);
    }
  };

  const runAction = async (action: () => Promise<unknown>, failure: string) => {
    setBusyAction(true);
    try {
      await action();
      await onChanged();
    } catch {
      toast.error(t(failure));
    } finally {
      setBusyAction(false);
    }
  };

  const connect = () => {
    const apiBase =
      process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';
    // The calendar id round-trips through OAuth state so the account lands
    // attached to this calendar rather than to the workspace at large.
    window.location.href = `${apiBase}/calendar/oauth/google?calendarId=${encodeURIComponent(
      calendar.id
    )}`;
  };

  return (
    <div className='space-y-4'>
      <section className='border-border/40 bg-card rounded-xl border'>
        <header className='flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3'>
          <div className='flex min-w-0 items-center gap-2.5'>
            <span className='bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-lg'>
              <CalendarDays className='size-4' />
            </span>
            <div className='min-w-0'>
              <h4 className='truncate text-sm font-semibold'>
                {calendar.name}
              </h4>
              <p className='text-muted-foreground mt-0.5 truncate text-xs'>
                {calendar.timezone} ·{' '}
                {t('agentsUsing', { count: calendar.agentCount })}
              </p>
            </div>
          </div>
          {!calendar.isDefault ? (
            <Button
              type='button'
              variant='outline'
              size='sm'
              disabled={busyAction}
              onClick={() =>
                runAction(
                  () =>
                    api.post(
                      `/calendar/calendars/${calendar.id}/${
                        calendar.archivedAt ? 'restore' : 'archive'
                      }`,
                      {}
                    ),
                  'archiveFailed'
                )
              }
            >
              {calendar.archivedAt ? (
                <ArchiveRestore className='size-4' />
              ) : (
                <Archive className='size-4' />
              )}
              {calendar.archivedAt ? t('restore') : t('archive')}
            </Button>
          ) : null}
        </header>

        <div className='space-y-4 p-4'>
          {calendar.archivedAt ? (
            <Alert className='rounded-lg'>
              <Archive className='size-4' />
              <AlertDescription>{t('archivedHint')}</AlertDescription>
            </Alert>
          ) : null}

          <div className='grid gap-4 @lg:grid-cols-2'>
            <div>
              <Label htmlFor={`calendar-name-${calendar.id}`}>
                {t('name')}
              </Label>
              <Input
                id={`calendar-name-${calendar.id}`}
                value={name}
                maxLength={80}
                onChange={(event) => setName(event.target.value)}
                className='mt-2 min-h-11 sm:min-h-9'
              />
            </div>
            <div>
              <Label htmlFor={`calendar-tz-${calendar.id}`}>
                {t('timezone')}
              </Label>
              <Input
                id={`calendar-tz-${calendar.id}`}
                value={timezone}
                placeholder='America/New_York'
                onChange={(event) => setTimezone(event.target.value)}
                className='mt-2 min-h-11 sm:min-h-9'
              />
              <p className='text-muted-foreground mt-1.5 text-xs'>
                {t('timezoneHint')}
              </p>
            </div>
          </div>

          <div className='flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t pt-4'>
            <span className='text-muted-foreground text-xs'>{t('agents')}</span>
            {agents.length === 0 ? (
              <span className='text-muted-foreground text-xs'>
                {calendar.isDefault ? t('agentsGlobalEmpty') : t('agentsEmpty')}
              </span>
            ) : (
              agents.map((agent) => (
                <Badge key={agent.id} variant='secondary'>
                  {agent.name}
                </Badge>
              ))
            )}
          </div>

          <Button
            type='button'
            onClick={saveDetails}
            disabled={savingDetails || !detailsDirty || !name.trim()}
            className='min-h-11 sm:min-h-9'
          >
            {savingDetails ? <Loader2 className='size-4 animate-spin' /> : null}
            {t('save')}
          </Button>
        </div>
      </section>

      <section className='border-border/40 bg-card space-y-4 rounded-xl border p-4'>
        <div>
          <h4 className='text-sm font-semibold'>{t('connection')}</h4>
          <p className='text-muted-foreground mt-1 text-sm leading-relaxed'>
            {t('connectionHint')}
          </p>
        </div>

        {calendar.integration ? (
          <div className='space-y-4'>
            <div className='border-border/40 bg-muted/20 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3'>
              <div className='min-w-0'>
                <p className='text-sm font-medium'>
                  {t(`providers.${calendar.integration.provider}`)}
                </p>
                {calendar.integration.email ? (
                  <p className='text-muted-foreground truncate text-xs'>
                    {calendar.integration.email}
                  </p>
                ) : null}
              </div>
              <Button
                type='button'
                variant='outline'
                size='sm'
                disabled={busyAction}
                onClick={() =>
                  runAction(
                    () =>
                      api.put(`/calendar/calendars/${calendar.id}/connection`, {
                        integrationId: null
                      }),
                    'disconnectFailed'
                  )
                }
              >
                <Unplug className='size-4' />
                {t('disconnect')}
              </Button>
            </div>

            {externalError ? (
              <Alert variant='destructive' className='rounded-lg'>
                <AlertDescription>{t('externalLoadFailed')}</AlertDescription>
              </Alert>
            ) : (
              <div className='max-w-md'>
                <Label htmlFor={`calendar-external-${calendar.id}`}>
                  {t('externalCalendar')}
                </Label>
                <Select
                  value={calendar.externalCalendarId ?? NO_EXTERNAL_VALUE}
                  onValueChange={(value) =>
                    runAction(
                      () =>
                        api.put(
                          `/calendar/calendars/${calendar.id}/connection`,
                          {
                            integrationId: calendar.integration!.id,
                            externalCalendarId:
                              value === NO_EXTERNAL_VALUE ? null : value
                          }
                        ),
                      'saveFailed'
                    )
                  }
                >
                  <SelectTrigger
                    id={`calendar-external-${calendar.id}`}
                    className='mt-2 min-h-11 sm:min-h-9'
                  >
                    <SelectValue placeholder={t('externalCalendar')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_EXTERNAL_VALUE}>
                      {t('externalPrimary')}
                    </SelectItem>
                    {externalOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        ) : (
          <Button type='button' variant='outline' onClick={connect}>
            <ExternalLink className='size-4' />
            {t('connectGoogle')}
          </Button>
        )}
      </section>

      {/*
        Left uncarded on purpose: the editor draws its own cards, and a third
        level of border inside the dialog reads as clutter rather than structure.
      */}
      <section className='space-y-3'>
        <div className='flex items-center gap-2'>
          <Clock3 className='text-primary size-4' />
          <h4 className='text-sm font-semibold'>{t('availability')}</h4>
        </div>
        <AvailabilitySettings calendarId={calendar.id} showHeader={false} />
      </section>
    </div>
  );
}

export function CalendarsManagerSkeleton() {
  return (
    <div className='space-y-5'>
      <Skeleton className='h-14 w-full rounded-xl' />
      <div className='flex gap-2'>
        <Skeleton className='h-10 w-40 rounded-lg' />
        <Skeleton className='h-10 w-40 rounded-lg' />
      </div>
      <Skeleton className='h-56 w-full rounded-xl' />
      <Skeleton className='h-40 w-full rounded-xl' />
    </div>
  );
}
