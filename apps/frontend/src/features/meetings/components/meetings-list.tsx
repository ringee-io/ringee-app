'use client';

import { useEffect, useState, useCallback } from 'react';
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
import { useReactTable, getCoreRowModel, ColumnDef } from '@tanstack/react-table';
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
  Link2
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
      toast.error('Failed to load meetings');
    } finally {
      setIsLoading(false);
    }
  }, [api, tab, debouncedSearch]);

  useEffect(() => {
    fetchMeetings();
  }, [fetchMeetings]);

  const handleCancel = async (id: string) => {
    setCancellingId(id);
    try {
      await api.patch(`/meetings/${id}/cancel`, {});
      toast.success('Meeting cancelled');
      setSelectedMeeting(null);
      fetchMeetings();
    } catch {
      toast.error('Failed to cancel meeting');
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
        <div className='relative flex-1 max-w-sm'>
          <Search className='text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2' />
          <Input
            placeholder='Search by contact name...'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className='pl-9 h-9'
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className='absolute right-3 top-1/2 -translate-y-1/2'
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
            Upcoming
          </TabsTrigger>
          <TabsTrigger value='all' className='gap-1.5'>
            <List className='h-3.5 w-3.5' />
            All
          </TabsTrigger>
          <TabsTrigger value='calendar' className='gap-1.5'>
            <CalendarDays className='h-3.5 w-3.5' />
            Calendar
          </TabsTrigger>
          <TabsTrigger value='integrations' className='gap-1.5'>
            <Link2 className='h-3.5 w-3.5' />
            Integrations
          </TabsTrigger>
        </TabsList>

        {/* Upcoming tab */}
        <TabsContent value='upcoming' className='mt-4'>
          {isLoading ? (
            <DataTableSkeleton columnCount={5} rowCount={5} withPagination={false} />
          ) : upcoming.length === 0 ? (
            <EmptyState />
          ) : (
            <MeetingRows meetings={upcoming} onSelect={setSelectedMeeting} />
          )}
        </TabsContent>

        {/* All tab */}
        <TabsContent value='all' className='mt-4'>
          {isLoading ? (
            <DataTableSkeleton columnCount={5} rowCount={7} withPagination={false} />
          ) : meetings.length === 0 ? (
            <EmptyState />
          ) : (
            <div className='space-y-6'>
              {upcoming.length > 0 && (
                <div>
                  <p className='text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wider'>
                    Upcoming
                  </p>
                  <MeetingRows
                    meetings={upcoming}
                    onSelect={setSelectedMeeting}
                  />
                </div>
              )}
              {past.length > 0 && (
                <div>
                  <p className='text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wider'>
                    Past
                  </p>
                  <MeetingRows meetings={past} onSelect={setSelectedMeeting} />
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
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function MeetingDetail({
  meeting,
  onCancel,
  cancellingId
}: {
  meeting: Meeting;
  onCancel: (id: string) => void;
  cancellingId: string | null;
}) {
  return (
    <>
      <SheetHeader>
        <SheetTitle className='text-base'>
          {meeting.title || 'Meeting'}
        </SheetTitle>
        <StatusBadge status={meeting.status} />
      </SheetHeader>
      <div className='mt-6 space-y-5'>
        {/* Date & time */}
        <div className='flex items-start gap-3'>
          <div className='bg-emerald-500/10 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg'>
            <CalendarCheck className='h-4 w-4 text-emerald-500' />
          </div>
          <div>
            <p className='text-sm font-medium'>
              {format(new Date(meeting.scheduledAt), 'EEEE, MMMM d, yyyy')}
            </p>
            <p className='text-muted-foreground text-sm'>
              {format(new Date(meeting.scheduledAt), 'h:mm a')} &middot;{' '}
              {meeting.duration} min
            </p>
          </div>
        </div>

        <Separator />

        {/* Contact */}
        <div className='flex items-start gap-3'>
          <div className='bg-blue-500/10 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg'>
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
                <p className='text-muted-foreground text-xs uppercase tracking-wider'>
                  Location
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
                <p className='text-muted-foreground text-xs uppercase tracking-wider'>
                  Notes
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
                  From call on{' '}
                  {format(new Date(meeting.call.createdAt), 'MMM d, yyyy')}
                </p>
                {meeting.call.durationSeconds != null && (
                  <p className='text-muted-foreground text-xs'>
                    Duration:{' '}
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
              Cancel Meeting
            </Button>
          )}
      </div>
    </>
  );
}

// --- DataTable Configuration --- //

function getColumns(onSelect: (m: Meeting) => void): ColumnDef<Meeting>[] {
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
      header: 'Date & Time',
      cell: ({ row }) => {
        const m = row.original;
        return (
          <div>
            <p className='text-sm font-medium'>
              {format(new Date(m.scheduledAt), 'EEE, MMM d')} at{' '}
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
      header: 'Contact',
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
      header: 'Duration',
      cell: ({ row }) => {
        const m = row.original;
        return (
          <div className='text-muted-foreground flex items-center gap-1 text-xs'>
            <Clock className='h-3 w-3' />
            {m.duration}m
          </div>
        );
      }
    },
    {
      accessorKey: 'status',
      header: () => <div className='text-right'>Status</div>,
      cell: ({ row }) => (
        <div className='text-right'>
          <StatusBadge status={row.original.status} />
        </div>
      )
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <div className='flex justify-end'>
          <Button variant='ghost' size='sm' onClick={() => onSelect(row.original)}>
            View Details
          </Button>
        </div>
      ),
      meta: { className: 'w-[100px]' }
    }
  ];
}

function MeetingRows({
  meetings,
  onSelect
}: {
  meetings: Meeting[];
  onSelect: (m: Meeting) => void;
}) {
  const table = useReactTable({
    data: meetings,
    columns: getColumns(onSelect),
    getCoreRowModel: getCoreRowModel()
  });

  return <DataTable table={table} />;
}

function StatusBadge({
  status
}: {
  status: 'scheduled' | 'completed' | 'cancelled' | 'rescheduled';
}) {
  if (status === 'scheduled') return null;
  const variant = status === 'cancelled' ? 'destructive' : 'secondary';
  return (
    <Badge variant={variant} className='text-[10px] capitalize'>
      {status}
    </Badge>
  );
}

function EmptyState() {
  return (
    <div className='flex flex-col items-center justify-center py-20 text-center border rounded-md bg-card shadow-sm'>
      <div className='bg-muted mb-4 flex h-16 w-16 items-center justify-center rounded-full'>
        <CalendarCheck className='text-muted-foreground/50 h-8 w-8' />
      </div>
      <h3 className='text-base font-semibold'>No meetings yet</h3>
      <p className='text-muted-foreground mt-1 max-w-xs text-sm'>
        Book your first meeting during a call. Every booked meeting shows up
        here.
      </p>
    </div>
  );
}

function FullCalendarView({
  currentDate,
  onDateChange,
  meetings,
  onSelectMeeting
}: {
  currentDate: Date;
  onDateChange: (date: Date) => void;
  meetings: Meeting[];
  onSelectMeeting: (m: Meeting) => void;
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

  const weekDaysLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const hours = Array.from({ length: 24 }).map((_, i) => i);

  return (
    <div className='flex flex-col rounded-xl border bg-card shadow-sm'>
      {/* Header */}
      <div className='flex items-center justify-between border-b p-4 sm:p-5'>
        <div className='flex items-center gap-4'>
          <h2 className='text-lg font-semibold tracking-tight w-[160px]'>
            {view === 'day' ? format(currentDate, 'MMMM d, yyyy') : format(currentDate, 'MMMM yyyy')}
          </h2>
          <div className='flex items-center gap-1 bg-muted/40 p-1 rounded-lg'>
            {(['month', 'week', 'day'] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  'px-3 py-1.5 text-xs font-bold capitalize rounded-md transition-all',
                  view === v ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
        <div className='flex items-center gap-1.5'>
          <Button variant='outline' size='icon' onClick={handlePrev} className='h-8 w-8'>
            <ChevronLeft className='h-4 w-4' />
          </Button>
          <Button variant='outline' size='icon' onClick={handleNext} className='h-8 w-8'>
            <ChevronRight className='h-4 w-4' />
          </Button>
        </div>
      </div>

      {/* Grid Based on View */}
      {view === 'month' && (
        <>
          <div className='grid grid-cols-7 border-b bg-muted/10'>
            {weekDaysLabels.map((day) => (
              <div key={day} className='border-r p-2.5 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground last:border-r-0'>
                {day}
              </div>
            ))}
          </div>
          <div className='grid grid-cols-7 auto-rows-[minmax(120px,auto)]'>
            {calendarDays.map((day, i) => {
              const dayMeetings = meetings.filter((m) => isSameDay(new Date(m.scheduledAt), day));
              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    'min-h-[120px] border-r border-b p-2 transition-colors hover:bg-muted/5',
                    !isSameMonth(day, monthStart) && 'bg-muted/5 text-muted-foreground/60',
                    i % 7 === 6 && 'border-r-0'
                  )}
                >
                  <div className='flex items-center justify-between'>
                    <span className={cn(
                      'text-[13px] font-semibold',
                      isToday(day) && 'flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm'
                    )}>
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
                          'flex flex-col items-start gap-0.5 truncate rounded px-2 py-1.5 text-left transition-all hover:opacity-80 hover:shadow-sm focus:ring-1 focus:outline-none w-full bg-zinc-950',
                          m.status === 'scheduled' ? 'text-emerald-400 font-medium border border-emerald-500/30 shadow-[inset_0_0_10px_rgba(16,185,129,0.05)]' : 
                          m.status === 'completed' ? 'text-blue-400 border border-blue-500/30 shadow-[inset_0_0_10px_rgba(59,130,246,0.05)]' :
                          m.status === 'cancelled' ? 'text-red-400 border border-red-500/30 line-through opacity-70 shadow-[inset_0_0_10px_rgba(239,68,68,0.05)]' :
                          'text-amber-400 border border-amber-500/30 shadow-[inset_0_0_10px_rgba(245,158,11,0.05)]'
                        )}
                      >
                        <span className='text-[10px] font-bold uppercase tracking-wider opacity-80'>
                          {format(new Date(m.scheduledAt), 'h:mm a')}
                        </span>
                        <span className='truncate w-full text-[11px] font-semibold'>
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
          <div className='flex border-b bg-muted/10'>
            <div className='w-14 sm:w-16 shrink-0 border-r' />
            <div className='grid flex-1 grid-cols-7'>
              {weekDaysDates.map((day) => (
                <div key={day.toISOString()} className='border-r p-2 text-center last:border-r-0'>
                  <div className='text-[10px] sm:text-xs font-semibold uppercase text-muted-foreground'>{format(day, 'EEE')}</div>
                  <div className={cn('text-sm mt-1 mx-auto w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center rounded-full', isToday(day) && 'bg-primary text-primary-foreground')}>{format(day, 'd')}</div>
                </div>
              ))}
            </div>
          </div>
          <div className='flex flex-1 overflow-y-auto relative h-[500px] sm:h-[600px]'>
            <div className='w-14 sm:w-16 shrink-0 border-r bg-muted/5'>
              {hours.map(hour => (
                <div key={hour} className='h-16 border-b text-[10px] sm:text-xs text-muted-foreground text-right pr-2 pt-1 font-medium'>
                  {hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
                </div>
              ))}
            </div>
            <div className='relative flex-1 grid grid-cols-7'>
              {weekDaysDates.map((day) => (
                <div key={day.toISOString()} className='relative border-r last:border-r-0'>
                  {hours.map(hour => (
                    <div key={hour} className='h-16 border-b border-border/20' />
                  ))}
                  {meetings.filter(m => isSameDay(new Date(m.scheduledAt), day)).map(m => {
                    const date = new Date(m.scheduledAt);
                    const startHour = date.getHours() + date.getMinutes() / 60;
                    const durationHours = m.duration / 60;
                    return (
                      <button
                        key={m.id}
                        onClick={() => onSelectMeeting(m)}
                        className={cn(
                          'absolute left-1 right-1 rounded border p-1 sm:p-1.5 text-left transition-all hover:shadow-md overflow-hidden flex flex-col hover:z-10 bg-zinc-950',
                          m.status === 'scheduled' ? 'text-emerald-400 border-emerald-500/40 shadow-[inset_0_0_12px_rgba(16,185,129,0.1)] shadow-[0_4px_12px_rgba(16,185,129,0.05)]' : 
                          m.status === 'completed' ? 'text-blue-400 border-blue-500/30 shadow-[inset_0_0_12px_rgba(59,130,246,0.1)]' :
                          m.status === 'cancelled' ? 'text-red-400 border-red-500/30 line-through opacity-90 shadow-[inset_0_0_12px_rgba(239,68,68,0.05)]' :
                          'text-amber-400 border-amber-500/30 shadow-[inset_0_0_12px_rgba(245,158,11,0.1)]'
                        )}
                        style={{
                          top: `${startHour * 4}rem`,
                          height: `${Math.max(durationHours * 4, 1.5)}rem`
                        }}
                      >
                        <div className='text-[10px] sm:text-[11px] font-bold opacity-80'>{format(date, 'h:mm a')}</div>
                        <div className='truncate text-[10px] sm:text-xs font-semibold leading-tight mt-0.5'>{m.title || m.contact.name || m.contact.phoneNumber}</div>
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
          <div className='flex border-b bg-muted/10'>
            <div className='w-14 sm:w-16 shrink-0 border-r' />
            <div className='flex-1 border-r p-2 text-center'>
              <div className='text-[10px] sm:text-xs font-semibold uppercase text-muted-foreground'>{format(currentDate, 'EEEE')}</div>
              <div className={cn('text-sm mt-1 mx-auto w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center rounded-full', isToday(currentDate) && 'bg-primary text-primary-foreground')}>{format(currentDate, 'd')}</div>
            </div>
          </div>
          <div className='flex flex-1 overflow-y-auto relative h-[500px] sm:h-[600px]'>
            <div className='w-14 sm:w-16 shrink-0 border-r bg-muted/5'>
              {hours.map(hour => (
                <div key={hour} className='h-16 border-b text-[10px] sm:text-xs text-muted-foreground text-right pr-2 pt-1 font-medium'>
                  {hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
                </div>
              ))}
            </div>
            <div className='relative flex-1 border-r'>
              {hours.map(hour => (
                <div key={hour} className='h-16 border-b border-border/20' />
              ))}
              {meetings.filter(m => isSameDay(new Date(m.scheduledAt), currentDate)).map(m => {
                  const date = new Date(m.scheduledAt);
                  const startHour = date.getHours() + date.getMinutes() / 60;
                  const durationHours = m.duration / 60;
                  return (
                    <button
                      key={m.id}
                      onClick={() => onSelectMeeting(m)}
                      className={cn(
                        'absolute left-2 right-4 rounded-md border p-2 text-left transition-all hover:shadow-md overflow-hidden flex flex-col hover:z-10 bg-zinc-950',
                        m.status === 'scheduled' ? 'text-emerald-400 border-emerald-500/40 shadow-[inset_0_0_15px_rgba(16,185,129,0.15)] shadow-[0_4px_12px_rgba(16,185,129,0.05)]' : 
                        m.status === 'completed' ? 'text-blue-400 border-blue-500/30 shadow-[inset_0_0_15px_rgba(59,130,246,0.1)]' :
                        m.status === 'cancelled' ? 'text-red-400 border-red-500/30 line-through opacity-90 shadow-[inset_0_0_15px_rgba(239,68,68,0.05)]' :
                        'text-amber-400 border-amber-500/30 shadow-[inset_0_0_15px_rgba(245,158,11,0.1)]'
                      )}
                      style={{
                        top: `${startHour * 4}rem`,
                        height: `${Math.max(durationHours * 4, 1.5)}rem`
                      }}
                    >
                      <div className='text-xs sm:text-sm font-bold opacity-80'>{format(date, 'h:mm a')}</div>
                      <div className='truncate text-xs sm:text-sm font-semibold mt-0.5'>{m.title || m.contact.name || m.contact.phoneNumber}</div>
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
