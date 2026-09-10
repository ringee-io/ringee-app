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
import {
  Archive,
  ArchiveRestore,
  Bot,
  CalendarDays,
  ExternalLink,
  Loader2,
  Plus,
  RotateCcw,
  Unplug
} from 'lucide-react';
import { toast } from 'sonner';
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
  initialCalendarId
}: {
  /** Opens straight onto one calendar, e.g. from an agent's setup screen. */
  initialCalendarId?: string;
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

  const selected = useMemo(
    () => calendars.find((calendar) => calendar.id === selectedId) ?? null,
    [calendars, selectedId]
  );

  const createCalendar = async () => {
    setCreating(true);
    try {
      const created = await api.post<RingeeCalendar>('/calendar/calendars', {
        name: t('newName'),
        timezone: browserTimeZone()
      });
      await load();
      setSelectedId(created.id);
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
    <div className='space-y-6'>
      <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
        <div>
          <h3 className='text-base font-semibold'>{t('title')}</h3>
          <p className='text-muted-foreground mt-1 max-w-2xl text-sm leading-relaxed'>
            {t('description')}
          </p>
        </div>
        <Button
          type='button'
          variant='outline'
          onClick={createCalendar}
          disabled={creating}
          className='min-h-11 shrink-0 sm:min-h-9'
        >
          {creating ? (
            <Loader2 className='size-4 animate-spin' />
          ) : (
            <Plus className='size-4' />
          )}
          {t('add')}
        </Button>
      </div>

      <Alert className='border-primary/20 bg-primary/5 rounded-xl'>
        <Bot className='size-4' />
        <AlertDescription>{t('agentHint')}</AlertDescription>
      </Alert>

      <div className='grid gap-6 lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)]'>
        <nav aria-label={t('title')} className='space-y-2'>
          {calendars.map((calendar) => {
            const active = calendar.id === selectedId;
            return (
              <button
                key={calendar.id}
                type='button'
                onClick={() => setSelectedId(calendar.id)}
                aria-current={active ? 'true' : undefined}
                className={`focus-visible:ring-ring w-full cursor-pointer rounded-xl border p-3 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none ${
                  active
                    ? 'border-primary bg-primary/5'
                    : 'border-border/40 bg-card hover:border-primary/40'
                }`}
              >
                <div className='flex items-start justify-between gap-2'>
                  <span className='truncate text-sm font-medium'>
                    {calendar.name}
                  </span>
                  {calendar.isDefault ? (
                    <Badge variant='secondary' className='shrink-0 text-[10px]'>
                      {t('globalBadge')}
                    </Badge>
                  ) : calendar.archivedAt ? (
                    <Badge variant='outline' className='shrink-0 text-[10px]'>
                      {t('archivedBadge')}
                    </Badge>
                  ) : null}
                </div>
                <p className='text-muted-foreground mt-1 truncate text-xs'>
                  {calendar.timezone}
                </p>
                <p className='text-muted-foreground mt-0.5 text-xs'>
                  {t('agentsUsing', { count: calendar.agentCount })}
                </p>
              </button>
            );
          })}
        </nav>

        {selected ? (
          <CalendarDetail
            key={selected.id}
            calendar={selected}
            onChanged={load}
          />
        ) : null}
      </div>
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
    <div className='space-y-6'>
      <section className='border-border/40 bg-card space-y-5 rounded-xl border p-4 sm:p-5'>
        <div className='flex items-center justify-between gap-3'>
          <div className='flex items-center gap-2'>
            <CalendarDays className='text-primary size-4' />
            <h4 className='text-sm font-semibold'>{t('details')}</h4>
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
        </div>

        {calendar.archivedAt ? (
          <Alert className='rounded-lg'>
            <Archive className='size-4' />
            <AlertDescription>{t('archivedHint')}</AlertDescription>
          </Alert>
        ) : null}

        <div className='grid gap-4 sm:grid-cols-2'>
          <div>
            <Label htmlFor={`calendar-name-${calendar.id}`}>{t('name')}</Label>
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

        <Button
          type='button'
          onClick={saveDetails}
          disabled={savingDetails || !detailsDirty || !name.trim()}
          className='min-h-11 sm:min-h-9'
        >
          {savingDetails ? <Loader2 className='size-4 animate-spin' /> : null}
          {t('save')}
        </Button>
      </section>

      <section className='border-border/40 bg-card space-y-4 rounded-xl border p-4 sm:p-5'>
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

      <section className='border-border/40 bg-card rounded-xl border p-4 sm:p-5'>
        <h4 className='text-sm font-semibold'>{t('agents')}</h4>
        {agents.length === 0 ? (
          <p className='text-muted-foreground mt-1 text-sm'>
            {calendar.isDefault ? t('agentsGlobalEmpty') : t('agentsEmpty')}
          </p>
        ) : (
          <ul className='mt-3 flex flex-wrap gap-2'>
            {agents.map((agent) => (
              <li key={agent.id}>
                <Badge variant='secondary'>{agent.name}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className='border-border/40 bg-card rounded-xl border p-4 sm:p-5'>
        <h4 className='mb-4 text-sm font-semibold'>{t('availability')}</h4>
        <AvailabilitySettings calendarId={calendar.id} showHeader={false} />
      </section>
    </div>
  );
}

export function CalendarsManagerSkeleton() {
  return (
    <div className='space-y-6'>
      <div className='space-y-2'>
        <Skeleton className='h-5 w-44' />
        <Skeleton className='h-4 w-full max-w-xl' />
      </div>
      <div className='grid gap-6 lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)]'>
        <div className='space-y-2'>
          <Skeleton className='h-20 w-full rounded-xl' />
          <Skeleton className='h-20 w-full rounded-xl' />
        </div>
        <div className='space-y-4'>
          <Skeleton className='h-48 w-full rounded-xl' />
          <Skeleton className='h-64 w-full rounded-xl' />
        </div>
      </div>
    </div>
  );
}
