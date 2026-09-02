'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle
} from '@ringee/frontend-shared/components/ui/sheet';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from '@ringee/frontend-shared/components/ui/tabs';
import { DataTable } from '@ringee/frontend-shared/components/ui/table/data-table';
import { DataTableSkeleton } from '@ringee/frontend-shared/components/ui/table/data-table-skeleton';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { DropdownMenuItem } from '@ringee/frontend-shared/components/ui/dropdown-menu';
import { TableRowActions } from '@ringee/frontend-shared/components/ui/table/table-row-actions';
import {
  useReactTable,
  getCoreRowModel,
  ColumnDef
} from '@tanstack/react-table';
import { cn } from '@ringee/frontend-shared/lib/utils';
import {
  format,
  isPast,
  isSameDay,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isToday,
  isSameMonth,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  addDays,
  subDays,
  parseISO
} from 'date-fns';
import {
  CalendarCheck,
  Clock,
  Phone,
  User,
  Search,
  X,
  Loader2,
  MapPin,
  FileText,
  CalendarDays,
  List,
  ChevronLeft,
  ChevronRight,
  Link2,
  Eye
} from 'lucide-react';
import { toast } from 'sonner';
import { CalendarIntegrations } from './calendar-integrations';

interface Meeting {
  id: string;
  title?: string;
  scheduledAt: string;
  duration: number;
  location?: string;
  notes?: string;
  status: 'scheduled' | 'completed' | 'cancelled' | 'rescheduled';
  contact: {
    id: string;
    name?: string;
    phoneNumber: string;
    company?: string;
  };
  call?: {
    id: string;
    durationSeconds?: number;
    createdAt: string;
    recordings?: { id: string; url?: string }[];
  };
  createdAt: string;
}

interface MeetingsResponse {
  data: Meeting[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export function MeetingsList() {
  const t = useTranslations('meetings');
  const tCommon = useTranslations('common');
  const api = useApi();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [tab, setTab] = useState('upcoming');
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [calendarDate, setCalendarDate] = useState<Date>(new Date());
  const [calendarSelectedDay, setCalendarSelectedDay] = useState<
    Date | undefined
  >(undefined);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 500);
    return () => clearTimeout(handler);
  }, [search]);

  const fetchMeetings = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (tab === 'upcoming') params.set('upcoming', 'true');
      if (debouncedSearch) params.set('search', debouncedSearch);
      params.set('limit', '100');

      const data = await api.get<MeetingsResponse>(
        `/meetings?${params.toString()}`
      );
      setMeetings(data.data);
    } catch {
      toast.error(t('toasts.failedToLoad'));
    } finally {
      setIsLoading(false);
    }
  }, [api, tab, debouncedSearch, t]);

  useEffect(() => {
    fetchMeetings();
  }, [fetchMeetings]);

  const handleCancel = async (id: string) => {
    setCancellingId(id);
    try {
      await api.patch(`/meetings/${id}/cancel`, {});
      toast.success(t('toasts.cancelled'));
      setSelectedMeeting(null);
      fetchMeetings();
    } catch {
      toast.error(t('toasts.failedToCancel'));
    } finally {
      setCancellingId(null);
    }
  };

  const upcoming = meetings.filter(
    (m) => m.status === 'scheduled' && !isPast(new Date(m.scheduledAt))
  );
  const past = meetings.filter(
    (m) => m.status !== 'scheduled' || isPast(new Date(m.scheduledAt))
  );

  return (
    <div className='flex flex-col gap-4'>
      {/* Top bar */}
      <div className='flex items-center gap-3'>
        <div className='relative max-w-sm flex-1'>
          <Search className='text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2' />
          <Input
            placeholder={t('searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className='h-9 pl-9'
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className='absolute top-1/2 right-3 -translate-y-1/2'
            >
              <X className='text-muted-foreground h-3.5 w-3.5' />
            </button>
          )}
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value='upcoming' className='gap-1.5'>
            <List className='h-3.5 w-3.5' />
            {t('tabs.upcoming')}
          </TabsTrigger>
          <TabsTrigger value='all' className='gap-1.5'>
            <List className='h-3.5 w-3.5' />
            {t('tabs.all')}
          </TabsTrigger>
          <TabsTrigger value='calendar' className='gap-1.5'>
            <CalendarDays className='h-3.5 w-3.5' />
            {t('tabs.calendar')}
          </TabsTrigger>
          <TabsTrigger value='integrations' className='gap-1.5'>
            <Link2 className='h-3.5 w-3.5' />
            {t('tabs.integrations')}
          </TabsTrigger>
        </TabsList>

        {/* Upcoming tab */}
        <TabsContent value='upcoming' className='mt-4'>
          {isLoading ? (
            <DataTableSkeleton
              columnCount={5}
              rowCount={5}
              withPagination={false}
            />
          ) : upcoming.length === 0 ? (
            <EmptyState t={t} />
          ) : (
            <MeetingRows
              meetings={upcoming}
              onSelect={setSelectedMeeting}
              t={t}
              tCommon={tCommon}
            />
          )}
        </TabsContent>

        {/* All tab */}
        <TabsContent value='all' className='mt-4'>
          {isLoading ? (
            <DataTableSkeleton
              columnCount={5}
              rowCount={7}
              withPagination={false}
            />
          ) : meetings.length === 0 ? (
            <EmptyState t={t} />
          ) : (
            <div className='space-y-6'>
              {upcoming.length > 0 && (
                <div>
                  <p className='text-muted-foreground mb-2 text-xs font-medium tracking-wider uppercase'>
                    {t('sections.upcoming')}
                  </p>
                  <MeetingRows
                    meetings={upcoming}
                    onSelect={setSelectedMeeting}
                    t={t}
                    tCommon={tCommon}
                  />
                </div>
              )}
              {past.length > 0 && (
                <div>
                  <p className='text-muted-foreground mb-2 text-xs font-medium tracking-wider uppercase'>
                    {t('sections.past')}
                  </p>
                  <MeetingRows
                    meetings={past}
                    onSelect={setSelectedMeeting}
                    t={t}
                    tCommon={tCommon}
                  />
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* Calendar tab */}
        <TabsContent value='calendar' className='mt-4'>
          <FullCalendarView
            currentDate={calendarDate}
            onDateChange={setCalendarDate}
            meetings={meetings}
            onSelectMeeting={setSelectedMeeting}
            t={t}
          />
        </TabsContent>

        {/* Integrations tab */}
        <TabsContent value='integrations' className='mt-4'>
          <CalendarIntegrations />
        </TabsContent>
      </Tabs>

      {/* Meeting detail sheet */}
      <Sheet
        open={!!selectedMeeting}
        onOpenChange={() => setSelectedMeeting(null)}
      >
        <SheetContent className='w-[400px] sm:w-[440px]'>
          {selectedMeeting && (
            <MeetingDetail
              meeting={selectedMeeting}
              onCancel={handleCancel}
              cancellingId={cancellingId}
              t={t}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

type TFunc = (
  key: string,
  values?: Record<string, string | number | Date>
) => string;

function MeetingDetail({
  meeting,
  onCancel,
  cancellingId,
  t
}: {
  meeting: Meeting;
  onCancel: (id: string) => void;
  cancellingId: string | null;
  t: TFunc;
}) {
  return (
    <>
      <SheetHeader>
        <SheetTitle className='text-base'>
          {meeting.title || t('defaultTitle')}
        </SheetTitle>
        <StatusBadge status={meeting.status} t={t} />
      </SheetHeader>
      <div className='mt-6 space-y-5'>
        {/* Date & time */}
        <div className='flex items-start gap-3'>
          <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10'>
            <CalendarCheck className='h-4 w-4 text-emerald-500' />
          </div>
          <div>
            <p className='text-sm font-medium'>
              {format(new Date(meeting.scheduledAt), 'EEEE, MMMM d, yyyy')}
            </p>
            <p className='text-muted-foreground text-sm'>
              {format(new Date(meeting.scheduledAt), 'h:mm a')} &middot;{' '}
              {meeting.duration} {t('min')}
            </p>
          </div>
        </div>

        <Separator />

        {/* Contact */}
        <div className='flex items-start gap-3'>
          <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10'>
            <User className='h-4 w-4 text-blue-500' />
          </div>
          <div>
            <p className='text-sm font-medium'>
              {meeting.contact.name || meeting.contact.phoneNumber}
            </p>
            {meeting.contact.company && (
              <p className='text-muted-foreground text-sm'>
                {meeting.contact.company}
              </p>
            )}
            <p className='text-muted-foreground text-xs'>
              {meeting.contact.phoneNumber}
            </p>
          </div>
        </div>

        {/* Location */}
        {meeting.location && (
          <>
            <Separator />
            <div className='flex items-start gap-3'>
              <div className='bg-muted flex h-8 w-8 shrink-0 items-center justify-center rounded-lg'>
                <MapPin className='text-muted-foreground h-4 w-4' />
              </div>
              <div>
                <p className='text-muted-foreground text-xs tracking-wider uppercase'>
                  {t('location')}
                </p>
                <p className='text-sm'>{meeting.location}</p>
              </div>
            </div>
          </>
        )}

        {/* Notes */}
        {meeting.notes && (
          <>
            <Separator />
            <div className='flex items-start gap-3'>
              <div className='bg-muted flex h-8 w-8 shrink-0 items-center justify-center rounded-lg'>
                <FileText className='text-muted-foreground h-4 w-4' />
              </div>
              <div>
                <p className='text-muted-foreground text-xs tracking-wider uppercase'>
                  {t('fields.notes')}
                </p>
                <p className='mt-0.5 text-sm'>{meeting.notes}</p>
              </div>
            </div>
          </>
        )}

        {/* Originating call */}
        {meeting.call && (
          <>
            <Separator />
            <div className='flex items-start gap-3'>
              <div className='bg-muted flex h-8 w-8 shrink-0 items-center justify-center rounded-lg'>
                <Phone className='text-muted-foreground h-4 w-4' />
              </div>
              <div>
                <p className='text-muted-foreground text-xs'>
                  {t('fromCall', {
                    date: format(
                      new Date(meeting.call.createdAt),
                      'MMM d, yyyy'
                    )
                  })}
                </p>
                {meeting.call.durationSeconds != null && (
                  <p className='text-muted-foreground text-xs'>
                    {t('fields.duration')}:{' '}
                    {Math.floor(meeting.call.durationSeconds / 60)}:
                    {(meeting.call.durationSeconds % 60)
                      .toString()
                      .padStart(2, '0')}
                  </p>
                )}
              </div>
            </div>
          </>
        )}

        <Separator />

        {/* Actions */}
        {meeting.status === 'scheduled' &&
          !isPast(new Date(meeting.scheduledAt)) && (
            <Button
              variant='destructive'
              size='sm'
              className='w-full'
              onClick={() => onCancel(meeting.id)}
              disabled={cancellingId === meeting.id}
            >
              {cancellingId === meeting.id ? (
                <Loader2 className='mr-1.5 h-3.5 w-3.5 animate-spin' />
              ) : null}
              {t('cancelMeeting')}
            </Button>
          )}
      </div>
    </>
  );
}

function getColumns(
  onSelect: (m: Meeting) => void,
  t: TFunc,
  tCommon: TFunc
): ColumnDef<Meeting>[] {
  return [
    {
      accessorKey: 'statusDot',
      header: '',
      cell: ({ row }) => {
        const m = row.original;
        return (
          <span
            className={cn(
              'block h-2 w-2 shrink-0 rounded-full',
              m.status === 'scheduled'
                ? 'bg-emerald-500'
                : m.status === 'cancelled'
                  ? 'bg-red-400'
                  : m.status === 'completed'
                    ? 'bg-blue-400'
                    : 'bg-amber-400'
            )}
          />
        );
      },
      meta: { className: 'w-[40px]' }
    },
    {
      accessorKey: 'datetime',
      header: t('columns.dateTime'),
      cell: ({ row }) => {
        const m = row.original;
        return (
          <div>
            <p className='text-sm font-medium'>
              {format(new Date(m.scheduledAt), 'EEE, MMM d')} {t('at')}{' '}
              {format(new Date(m.scheduledAt), 'h:mm a')}
            </p>
            {m.title && (
              <p className='text-muted-foreground truncate text-xs'>
                {m.title}
              </p>
            )}
          </div>
        );
      }
    },
    {
      accessorKey: 'contact',
      header: t('columns.contact'),
      cell: ({ row }) => {
        const m = row.original;
        return (
          <div>
            <p className='text-sm'>{m.contact.name || m.contact.phoneNumber}</p>
            {m.contact.company && (
              <p className='text-muted-foreground text-xs'>
                {m.contact.company}
              </p>
            )}
          </div>
        );
      }
    },
    {
      accessorKey: 'duration',
      header: t('columns.duration'),
      cell: ({ row }) => {
        const m = row.original;
        return (
          <div className='text-muted-foreground flex items-center gap-1 text-xs'>
            <Clock className='h-3 w-3' />
            {m.duration}
            {t('min')}
          </div>
        );
      }
    },
    {
      accessorKey: 'status',
      header: () => <div className='text-right'>{t('columns.status')}</div>,
      cell: ({ row }) => (
        <div className='text-right'>
          <StatusBadge status={row.original.status} t={t} />
        </div>
      )
    },
    {
      id: 'actions',
      size: 160,
      minSize: 160,
      header: () => <span className='sr-only'>{tCommon('actions')}</span>,
      cell: ({ row }) => (
        <TableRowActions
          label={tCommon('openActions')}
          menuLabel={tCommon('actions')}
        >
          <DropdownMenuItem onClick={() => onSelect(row.original)}>
            <Eye className='h-4 w-4' />
            {t('viewDetails')}
          </DropdownMenuItem>
        </TableRowActions>
      )
    }
  ];
}

function MeetingRows({
  meetings,
  onSelect,
  t,
  tCommon
}: {
  meetings: Meeting[];
  onSelect: (m: Meeting) => void;
  t: TFunc;
  tCommon: TFunc;
}) {
  const table = useReactTable({
    data: meetings,
    columns: getColumns(onSelect, t, tCommon),
    initialState: { columnPinning: { right: ['actions'] } },
    getCoreRowModel: getCoreRowModel()
  });

  return <DataTable table={table} />;
}

function StatusBadge({
  status,
  t
}: {
  status: 'scheduled' | 'completed' | 'cancelled' | 'rescheduled';
  t: TFunc;
}) {
  if (status === 'scheduled') return null;
  const variant = status === 'cancelled' ? 'destructive' : 'secondary';
  return (
    <Badge variant={variant} className='text-[10px] capitalize'>
      {t(`status.${status}`)}
    </Badge>
  );
}

function EmptyState({ t }: { t: TFunc }) {
  return (
    <div className='bg-card flex flex-col items-center justify-center rounded-md border py-20 text-center shadow-sm'>
      <div className='bg-muted mb-4 flex h-16 w-16 items-center justify-center rounded-full'>
        <CalendarCheck className='text-muted-foreground/50 h-8 w-8' />
      </div>
      <h3 className='text-base font-semibold'>{t('empty.noMeetings')}</h3>
      <p className='text-muted-foreground mt-1 max-w-xs text-sm'>
        {t('empty.noMeetingsDescription')}
      </p>
    </div>
  );
}

function FullCalendarView({
  currentDate,
  onDateChange,
  meetings,
  onSelectMeeting,
  t
}: {
  currentDate: Date;
  onDateChange: (date: Date) => void;
  meetings: Meeting[];
  onSelectMeeting: (m: Meeting) => void;
  t: TFunc;
}) {
  const [view, setView] = useState<'month' | 'week' | 'day'>('month');

  // Month
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);
  const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

  // Week
  const weekStart = startOfWeek(currentDate);
  const weekEnd = endOfWeek(currentDate);
  const weekDaysDates = eachDayOfInterval({ start: weekStart, end: weekEnd });

  // Navigation
  const handlePrev = () => {
    if (view === 'month') onDateChange(subMonths(currentDate, 1));
    else if (view === 'week') onDateChange(subWeeks(currentDate, 1));
    else onDateChange(subDays(currentDate, 1));
  };
  const handleNext = () => {
    if (view === 'month') onDateChange(addMonths(currentDate, 1));
    else if (view === 'week') onDateChange(addWeeks(currentDate, 1));
    else onDateChange(addDays(currentDate, 1));
  };

  const weekDaysLabels = [
    t('calendar.weekdays.sun'),
    t('calendar.weekdays.mon'),
    t('calendar.weekdays.tue'),
    t('calendar.weekdays.wed'),
    t('calendar.weekdays.thu'),
    t('calendar.weekdays.fri'),
    t('calendar.weekdays.sat')
  ];
  const hours = Array.from({ length: 24 }).map((_, i) => i);

  return (
    <div className='bg-card flex flex-col rounded-xl border shadow-sm'>
      {/* Header */}
      <div className='flex items-center justify-between border-b p-4 sm:p-5'>
        <div className='flex items-center gap-4'>
          <h2 className='w-[160px] text-lg font-semibold tracking-tight'>
            {view === 'day'
              ? format(currentDate, 'MMMM d, yyyy')
              : format(currentDate, 'MMMM yyyy')}
          </h2>
          <div className='bg-muted/40 flex items-center gap-1 rounded-lg p-1'>
            {(['month', 'week', 'day'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-bold capitalize transition-all',
                  view === v
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                )}
              >
                {t(`calendar.${v}`)}
              </button>
            ))}
          </div>
        </div>
        <div className='flex items-center gap-1.5'>
          <Button
            variant='outline'
            size='icon'
            onClick={handlePrev}
            className='h-8 w-8'
          >
            <ChevronLeft className='h-4 w-4' />
          </Button>
          <Button
            variant='outline'
            size='icon'
            onClick={handleNext}
            className='h-8 w-8'
          >
            <ChevronRight className='h-4 w-4' />
          </Button>
        </div>
      </div>

      {/* Grid Based on View */}
      {view === 'month' && (
        <>
          <div className='bg-muted/10 grid grid-cols-7 border-b'>
            {weekDaysLabels.map((day) => (
              <div
                key={day}
                className='text-muted-foreground border-r p-2.5 text-center text-xs font-semibold tracking-wider uppercase last:border-r-0'
              >
                {day}
              </div>
            ))}
          </div>
          <div className='grid auto-rows-[minmax(120px,auto)] grid-cols-7'>
            {calendarDays.map((day, i) => {
              const dayMeetings = meetings.filter((m) =>
                isSameDay(new Date(m.scheduledAt), day)
              );
              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    'hover:bg-muted/5 min-h-[120px] border-r border-b p-2 transition-colors',
                    !isSameMonth(day, monthStart) &&
                      'bg-muted/5 text-muted-foreground/60',
                    i % 7 === 6 && 'border-r-0'
                  )}
                >
                  <div className='flex items-center justify-between'>
                    <span
                      className={cn(
                        'text-[13px] font-semibold',
                        isToday(day) &&
                          'bg-primary text-primary-foreground flex h-6 w-6 items-center justify-center rounded-full shadow-sm'
                      )}
                    >
                      {format(day, 'd')}
                    </span>
                    {dayMeetings.length > 0 && (
                      <span className='rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600'>
                        {dayMeetings.length}
                      </span>
                    )}
                  </div>
                  <div className='mt-2 flex flex-col gap-1.5'>
                    {dayMeetings.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => onSelectMeeting(m)}
                        className={cn(
                          'flex w-full flex-col items-start gap-0.5 truncate rounded bg-zinc-950 px-2 py-1.5 text-left transition-all hover:opacity-80 hover:shadow-sm focus:ring-1 focus:outline-none',
                          m.status === 'scheduled'
                            ? 'border border-emerald-500/30 font-medium text-emerald-400 shadow-[inset_0_0_10px_rgba(16,185,129,0.05)]'
                            : m.status === 'completed'
                              ? 'border border-blue-500/30 text-blue-400 shadow-[inset_0_0_10px_rgba(59,130,246,0.05)]'
                              : m.status === 'cancelled'
                                ? 'border border-red-500/30 text-red-400 line-through opacity-70 shadow-[inset_0_0_10px_rgba(239,68,68,0.05)]'
                                : 'border border-amber-500/30 text-amber-400 shadow-[inset_0_0_10px_rgba(245,158,11,0.05)]'
                        )}
                      >
                        <span className='text-[10px] font-bold tracking-wider uppercase opacity-80'>
                          {format(new Date(m.scheduledAt), 'h:mm a')}
                        </span>
                        <span className='w-full truncate text-[11px] font-semibold'>
                          {m.title || m.contact.name || m.contact.phoneNumber}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {view === 'week' && (
        <div className='flex flex-1 flex-col overflow-hidden'>
          <div className='bg-muted/10 flex border-b'>
            <div className='w-14 shrink-0 border-r sm:w-16' />
            <div className='grid flex-1 grid-cols-7'>
              {weekDaysDates.map((day) => (
                <div
                  key={day.toISOString()}
                  className='border-r p-2 text-center last:border-r-0'
                >
                  <div className='text-muted-foreground text-[10px] font-semibold uppercase sm:text-xs'>
                    {format(day, 'EEE')}
                  </div>
                  <div
                    className={cn(
                      'mx-auto mt-1 flex h-6 w-6 items-center justify-center rounded-full text-sm sm:h-7 sm:w-7',
                      isToday(day) && 'bg-primary text-primary-foreground'
                    )}
                  >
                    {format(day, 'd')}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className='relative flex h-[500px] flex-1 overflow-y-auto sm:h-[600px]'>
            <div className='bg-muted/5 w-14 shrink-0 border-r sm:w-16'>
              {hours.map((hour) => (
                <div
                  key={hour}
                  className='text-muted-foreground h-16 border-b pt-1 pr-2 text-right text-[10px] font-medium sm:text-xs'
                >
                  {hour === 0
                    ? '12 AM'
                    : hour < 12
                      ? `${hour} AM`
                      : hour === 12
                        ? '12 PM'
                        : `${hour - 12} PM`}
                </div>
              ))}
            </div>
            <div className='relative grid flex-1 grid-cols-7'>
              {weekDaysDates.map((day) => (
                <div
                  key={day.toISOString()}
                  className='relative border-r last:border-r-0'
                >
                  {hours.map((hour) => (
                    <div
                      key={hour}
                      className='border-border/20 h-16 border-b'
                    />
                  ))}
                  {meetings
                    .filter((m) => isSameDay(new Date(m.scheduledAt), day))
                    .map((m) => {
                      const date = new Date(m.scheduledAt);
                      const startHour =
                        date.getHours() + date.getMinutes() / 60;
                      const durationHours = m.duration / 60;
                      return (
                        <button
                          key={m.id}
                          onClick={() => onSelectMeeting(m)}
                          className={cn(
                            'absolute right-1 left-1 flex flex-col overflow-hidden rounded border bg-zinc-950 p-1 text-left transition-all hover:z-10 hover:shadow-md sm:p-1.5',
                            m.status === 'scheduled'
                              ? 'border-emerald-500/40 text-emerald-400 shadow-[0_4px_12px_rgba(16,185,129,0.05)] shadow-[inset_0_0_12px_rgba(16,185,129,0.1)]'
                              : m.status === 'completed'
                                ? 'border-blue-500/30 text-blue-400 shadow-[inset_0_0_12px_rgba(59,130,246,0.1)]'
                                : m.status === 'cancelled'
                                  ? 'border-red-500/30 text-red-400 line-through opacity-90 shadow-[inset_0_0_12px_rgba(239,68,68,0.05)]'
                                  : 'border-amber-500/30 text-amber-400 shadow-[inset_0_0_12px_rgba(245,158,11,0.1)]'
                          )}
                          style={{
                            top: `${startHour * 4}rem`,
                            height: `${Math.max(durationHours * 4, 1.5)}rem`
                          }}
                        >
                          <div className='text-[10px] font-bold opacity-80 sm:text-[11px]'>
                            {format(date, 'h:mm a')}
                          </div>
                          <div className='mt-0.5 truncate text-[10px] leading-tight font-semibold sm:text-xs'>
                            {m.title || m.contact.name || m.contact.phoneNumber}
                          </div>
                        </button>
                      );
                    })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {view === 'day' && (
        <div className='flex flex-1 flex-col overflow-hidden'>
          <div className='bg-muted/10 flex border-b'>
            <div className='w-14 shrink-0 border-r sm:w-16' />
            <div className='flex-1 border-r p-2 text-center'>
              <div className='text-muted-foreground text-[10px] font-semibold uppercase sm:text-xs'>
                {format(currentDate, 'EEEE')}
              </div>
              <div
                className={cn(
                  'mx-auto mt-1 flex h-6 w-6 items-center justify-center rounded-full text-sm sm:h-7 sm:w-7',
                  isToday(currentDate) && 'bg-primary text-primary-foreground'
                )}
              >
                {format(currentDate, 'd')}
              </div>
            </div>
          </div>
          <div className='relative flex h-[500px] flex-1 overflow-y-auto sm:h-[600px]'>
            <div className='bg-muted/5 w-14 shrink-0 border-r sm:w-16'>
              {hours.map((hour) => (
                <div
                  key={hour}
                  className='text-muted-foreground h-16 border-b pt-1 pr-2 text-right text-[10px] font-medium sm:text-xs'
                >
                  {hour === 0
                    ? '12 AM'
                    : hour < 12
                      ? `${hour} AM`
                      : hour === 12
                        ? '12 PM'
                        : `${hour - 12} PM`}
                </div>
              ))}
            </div>
            <div className='relative flex-1 border-r'>
              {hours.map((hour) => (
                <div key={hour} className='border-border/20 h-16 border-b' />
              ))}
              {meetings
                .filter((m) => isSameDay(new Date(m.scheduledAt), currentDate))
                .map((m) => {
                  const date = new Date(m.scheduledAt);
                  const startHour = date.getHours() + date.getMinutes() / 60;
                  const durationHours = m.duration / 60;
                  return (
                    <button
                      key={m.id}
                      onClick={() => onSelectMeeting(m)}
                      className={cn(
                        'absolute right-4 left-2 flex flex-col overflow-hidden rounded-md border bg-zinc-950 p-2 text-left transition-all hover:z-10 hover:shadow-md',
                        m.status === 'scheduled'
                          ? 'border-emerald-500/40 text-emerald-400 shadow-[0_4px_12px_rgba(16,185,129,0.05)] shadow-[inset_0_0_15px_rgba(16,185,129,0.15)]'
                          : m.status === 'completed'
                            ? 'border-blue-500/30 text-blue-400 shadow-[inset_0_0_15px_rgba(59,130,246,0.1)]'
                            : m.status === 'cancelled'
                              ? 'border-red-500/30 text-red-400 line-through opacity-90 shadow-[inset_0_0_15px_rgba(239,68,68,0.05)]'
                              : 'border-amber-500/30 text-amber-400 shadow-[inset_0_0_15px_rgba(245,158,11,0.1)]'
                      )}
                      style={{
                        top: `${startHour * 4}rem`,
                        height: `${Math.max(durationHours * 4, 1.5)}rem`
                      }}
                    >
                      <div className='text-xs font-bold opacity-80 sm:text-sm'>
                        {format(date, 'h:mm a')}
                      </div>
                      <div className='mt-0.5 truncate text-xs font-semibold sm:text-sm'>
                        {m.title || m.contact.name || m.contact.phoneNumber}
                      </div>
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
