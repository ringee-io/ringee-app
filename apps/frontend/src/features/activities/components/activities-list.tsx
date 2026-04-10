'use client';

import { useEffect, useState, useCallback } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@ringee/frontend-shared/components/ui/popover';
import { Calendar } from '@ringee/frontend-shared/components/ui/calendar';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { format, startOfDay, endOfDay } from 'date-fns';
import {
  CalendarCheck,
  CalendarDays,
  CalendarPlus,
  ChevronDown,
  Clock,
  DollarSign,
  Filter,
  Loader2,
  Phone,
  PhoneIncoming,
  PhoneMissed,
  PhoneOff,
  PhoneOutgoing,
  ShieldAlert,
  ThumbsDown,
  ThumbsUp,
  Voicemail,
  X
} from 'lucide-react';
import { toast } from 'sonner';
import { BookMeetingForm } from '@/features/calls/components/book-meeting.form';

type CallOutcome =
  | 'meeting_booked'
  | 'sale'
  | 'interested'
  | 'follow_up'
  | 'not_interested'
  | 'no_answer'
  | 'voicemail'
  | 'wrong_number'
  | 'gatekeeper';

interface MeetingData {
  id: string;
  title?: string;
  scheduledAt: string;
  duration: number;
  location?: string;
  status: string;
}

interface CallContact {
  id: string;
  name?: string | null;
  phoneNumber?: string;
  company?: string | null;
  meetings?: MeetingData[];
}

interface ActivityCall {
  id: string;
  fromNumber: string;
  toNumber: string;
  direction: string;
  status: string;
  durationSeconds: number | null;
  startedAt: string | null;
  createdAt: string;
  outcome: CallOutcome | null;
  outcomeNote: string | null;
  contact: CallContact | null;
  meetings?: MeetingData[];
  recordings?: { id: string; url?: string | null; status?: string | null }[];
}

interface CallsResponse {
  data: ActivityCall[];
  total: number;
  page: number;
  totalPages: number;
}

const OUTCOME_CONFIG: {
  id: CallOutcome;
  label: string;
  icon: React.ElementType;
  color: string;
  badgeClass: string;
}[] = [
  {
    id: 'meeting_booked',
    label: 'Meeting Booked',
    icon: CalendarCheck,
    color: 'text-emerald-500',
    badgeClass: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
  },
  {
    id: 'sale',
    label: 'Sale',
    icon: DollarSign,
    color: 'text-green-500',
    badgeClass: 'bg-green-500/10 text-green-600 border-green-500/20'
  },
  {
    id: 'interested',
    label: 'Interested',
    icon: ThumbsUp,
    color: 'text-blue-500',
    badgeClass: 'bg-blue-500/10 text-blue-600 border-blue-500/20'
  },
  {
    id: 'follow_up',
    label: 'Follow Up',
    icon: Clock,
    color: 'text-amber-500',
    badgeClass: 'bg-amber-500/10 text-amber-600 border-amber-500/20'
  },
  {
    id: 'not_interested',
    label: 'Not Interested',
    icon: ThumbsDown,
    color: 'text-slate-400',
    badgeClass: 'bg-slate-500/10 text-slate-500 border-slate-400/20'
  },
  {
    id: 'no_answer',
    label: 'No Answer',
    icon: PhoneMissed,
    color: 'text-gray-400',
    badgeClass: 'bg-gray-500/10 text-gray-500 border-gray-400/20'
  },
  {
    id: 'voicemail',
    label: 'Voicemail',
    icon: Voicemail,
    color: 'text-purple-400',
    badgeClass: 'bg-purple-500/10 text-purple-500 border-purple-400/20'
  },
  {
    id: 'wrong_number',
    label: 'Wrong Number',
    icon: PhoneOff,
    color: 'text-red-400',
    badgeClass: 'bg-red-500/10 text-red-500 border-red-400/20'
  },
  {
    id: 'gatekeeper',
    label: 'Gatekeeper',
    icon: ShieldAlert,
    color: 'text-orange-400',
    badgeClass: 'bg-orange-500/10 text-orange-500 border-orange-400/20'
  }
];

const MEETING_ELIGIBLE_OUTCOMES: CallOutcome[] = [
  'meeting_booked',
  'sale',
  'interested',
  'follow_up'
];

export function ActivitiesList() {
  const api = useApi();
  const [calls, setCalls] = useState<ActivityCall[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedOutcomes, setSelectedOutcomes] = useState<CallOutcome[]>([]);
  const [bookingCallId, setBookingCallId] = useState<string | null>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [outcomeFilterOpen, setOutcomeFilterOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchCalls = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '20');
      params.set('excludeCampaignCalls', 'true');
      params.set('includeMeetings', 'true');
      params.set('orderBy', 'createdAt');
      params.set('sortDirection', 'desc');

      const dayStart = startOfDay(selectedDate);
      const dayEnd = endOfDay(selectedDate);
      params.set('dateFrom', dayStart.toISOString());
      params.set('dateTo', dayEnd.toISOString());

      for (const o of selectedOutcomes) {
        params.append('outcome', o);
      }

      const data = await api.get<CallsResponse>(
        `/telephony/calls?${params.toString()}`
      );
      setCalls(data.data);
      setTotalPages(data.totalPages);
      setTotal(data.total);
    } catch {
      toast.error('Failed to load activities');
    } finally {
      setIsLoading(false);
    }
  }, [api, page, selectedDate, selectedOutcomes]);

  useEffect(() => {
    fetchCalls();
  }, [fetchCalls]);

  useEffect(() => {
    setPage(1);
  }, [selectedDate, selectedOutcomes]);

  const toggleOutcome = (outcome: CallOutcome) => {
    setSelectedOutcomes((prev) =>
      prev.includes(outcome)
        ? prev.filter((o) => o !== outcome)
        : [...prev, outcome]
    );
  };

  const clearOutcomes = () => setSelectedOutcomes([]);

  const handleMeetingBooked = () => {
    setBookingCallId(null);
    fetchCalls();
    toast.success('Meeting booked successfully');
  };

  const getContactMeeting = (call: ActivityCall): MeetingData | null => {
    // Check meetings on the call itself first
    if (call.meetings && call.meetings.length > 0) {
      const scheduled = call.meetings.find((m) => m.status === 'scheduled');
      if (scheduled) return scheduled;
    }
    // Then check the contact's latest meeting
    if (call.contact?.meetings && call.contact.meetings.length > 0) {
      const scheduled = call.contact.meetings.find(
        (m) => m.status === 'scheduled'
      );
      if (scheduled) return scheduled;
    }
    return null;
  };

  const canScheduleMeeting = (call: ActivityCall): boolean => {
    return (
      !!call.outcome &&
      MEETING_ELIGIBLE_OUTCOMES.includes(call.outcome) &&
      !!call.contact?.id &&
      !getContactMeeting(call)
    );
  };

  return (
    <div className='flex flex-col gap-4'>
      {/* Filters */}
      <div className='flex flex-wrap items-center gap-2'>
        {/* Date picker */}
        <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
          <PopoverTrigger asChild>
            <Button variant='outline' size='sm' className='h-9 gap-2'>
              <CalendarDays className='h-4 w-4' />
              {format(selectedDate, 'EEE, MMM d, yyyy')}
              <ChevronDown className='h-3 w-3 opacity-50' />
            </Button>
          </PopoverTrigger>
          <PopoverContent className='w-auto p-0' align='start'>
            <Calendar
              mode='single'
              selected={selectedDate}
              onSelect={(date) => {
                if (date) {
                  setSelectedDate(date);
                  setDatePickerOpen(false);
                }
              }}
            />
          </PopoverContent>
        </Popover>

        {/* Disposition filter */}
        <Popover open={outcomeFilterOpen} onOpenChange={setOutcomeFilterOpen}>
          <PopoverTrigger asChild>
            <Button variant='outline' size='sm' className='h-9 gap-2'>
              <Filter className='h-4 w-4' />
              Disposition
              {selectedOutcomes.length > 0 && (
                <Badge
                  variant='secondary'
                  className='ml-1 h-5 rounded-full px-1.5 text-[10px]'
                >
                  {selectedOutcomes.length}
                </Badge>
              )}
              <ChevronDown className='h-3 w-3 opacity-50' />
            </Button>
          </PopoverTrigger>
          <PopoverContent className='w-[220px] p-2' align='start'>
            <div className='flex flex-col gap-1'>
              {OUTCOME_CONFIG.map((o) => {
                const Icon = o.icon;
                const isSelected = selectedOutcomes.includes(o.id);
                return (
                  <button
                    key={o.id}
                    onClick={() => toggleOutcome(o.id)}
                    className={cn(
                      'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
                      isSelected
                        ? 'bg-accent text-accent-foreground'
                        : 'hover:bg-muted/50'
                    )}
                  >
                    <Icon className={cn('h-4 w-4', o.color)} />
                    <span className='flex-1 text-left'>{o.label}</span>
                    {isSelected && (
                      <span className='h-2 w-2 rounded-full bg-primary' />
                    )}
                  </button>
                );
              })}
              {selectedOutcomes.length > 0 && (
                <button
                  onClick={clearOutcomes}
                  className='mt-1 flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground'
                >
                  <X className='h-3 w-3' />
                  Clear filters
                </button>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* Active filter badges */}
        {selectedOutcomes.map((o) => {
          const config = OUTCOME_CONFIG.find((c) => c.id === o);
          if (!config) return null;
          const Icon = config.icon;
          return (
            <Badge
              key={o}
              variant='outline'
              className={cn(
                'h-7 gap-1.5 pr-1.5 text-xs font-medium',
                config.badgeClass
              )}
            >
              <Icon className='h-3 w-3' />
              {config.label}
              <button
                onClick={() => toggleOutcome(o)}
                className='ml-0.5 rounded-full p-0.5 hover:bg-background/50'
              >
                <X className='h-3 w-3' />
              </button>
            </Badge>
          );
        })}

        {/* Total count */}
        <span className='ml-auto text-sm text-muted-foreground'>
          {isLoading ? '...' : `${total} call${total !== 1 ? 's' : ''}`}
        </span>
      </div>

      {/* Call list */}
      {isLoading ? (
        <div className='flex flex-col gap-3'>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className='h-24 w-full rounded-lg' />
          ))}
        </div>
      ) : calls.length === 0 ? (
        <div className='flex flex-col items-center justify-center rounded-lg border bg-card py-20 text-center shadow-sm'>
          <div className='mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted'>
            <Phone className='h-8 w-8 text-muted-foreground/50' />
          </div>
          <h3 className='text-base font-semibold'>No calls found</h3>
          <p className='mt-1 max-w-xs text-sm text-muted-foreground'>
            No general calls for{' '}
            {format(selectedDate, 'MMMM d, yyyy')}
            {selectedOutcomes.length > 0
              ? ' with the selected filters'
              : ''}
            .
          </p>
        </div>
      ) : (
        <div className='flex flex-col gap-2'>
          {calls.map((call) => (
            <ActivityCallCard
              key={call.id}
              call={call}
              meeting={getContactMeeting(call)}
              canSchedule={canScheduleMeeting(call)}
              isBooking={bookingCallId === call.id}
              onStartBooking={() => setBookingCallId(call.id)}
              onCancelBooking={() => setBookingCallId(null)}
              onMeetingBooked={handleMeetingBooked}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className='flex items-center justify-center gap-2 pt-2'>
          <Button
            variant='outline'
            size='sm'
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span className='text-sm text-muted-foreground'>
            Page {page} of {totalPages}
          </span>
          <Button
            variant='outline'
            size='sm'
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

function ActivityCallCard({
  call,
  meeting,
  canSchedule,
  isBooking,
  onStartBooking,
  onCancelBooking,
  onMeetingBooked
}: {
  call: ActivityCall;
  meeting: MeetingData | null;
  canSchedule: boolean;
  isBooking: boolean;
  onStartBooking: () => void;
  onCancelBooking: () => void;
  onMeetingBooked: () => void;
}) {
  const DirectionIcon =
    call.direction === 'inbound' ? PhoneIncoming : PhoneOutgoing;
  const directionColor =
    call.direction === 'inbound' ? 'text-green-500' : 'text-blue-500';

  const outcomeConfig = call.outcome
    ? OUTCOME_CONFIG.find((o) => o.id === call.outcome)
    : null;
  const OutcomeIcon = outcomeConfig?.icon;

  const durationLabel = call.durationSeconds
    ? `${Math.floor(call.durationSeconds / 60)}:${(call.durationSeconds % 60).toString().padStart(2, '0')}`
    : null;

  const phoneNumber =
    call.direction === 'inbound' ? call.fromNumber : call.toNumber;

  return (
    <div className='rounded-lg border bg-card p-4 shadow-sm transition-colors hover:bg-card/80'>
      <div className='flex items-start gap-4'>
        {/* Direction icon */}
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted/50'
          )}
        >
          <DirectionIcon className={cn('h-5 w-5', directionColor)} />
        </div>

        {/* Main content */}
        <div className='min-w-0 flex-1'>
          <div className='flex items-start justify-between gap-2'>
            <div>
              <p className='text-sm font-semibold'>
                {call.contact?.name || phoneNumber}
              </p>
              {call.contact?.name && (
                <p className='text-xs text-muted-foreground font-mono'>
                  {phoneNumber}
                </p>
              )}
              {call.contact?.company && (
                <p className='text-xs text-muted-foreground'>
                  {call.contact.company}
                </p>
              )}
            </div>

            <div className='flex items-center gap-2 shrink-0'>
              {/* Outcome badge */}
              {outcomeConfig && OutcomeIcon && (
                <Badge
                  variant='outline'
                  className={cn(
                    'gap-1 text-[11px] font-medium',
                    outcomeConfig.badgeClass
                  )}
                >
                  <OutcomeIcon className='h-3 w-3' />
                  {outcomeConfig.label}
                </Badge>
              )}

              {/* Status badge when no outcome */}
              {!call.outcome && (
                <Badge
                  variant='outline'
                  className='text-[11px] font-medium capitalize'
                >
                  {call.status}
                </Badge>
              )}
            </div>
          </div>

          {/* Meta row */}
          <div className='mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground'>
            <span className='capitalize'>{call.direction}</span>
            {durationLabel && (
              <span className='flex items-center gap-1'>
                <Clock className='h-3 w-3' />
                {durationLabel}
              </span>
            )}
            {call.startedAt && (
              <span>
                {format(new Date(call.startedAt), 'h:mm a')}
              </span>
            )}
            {call.outcomeNote && (
              <span className='truncate max-w-[200px]' title={call.outcomeNote}>
                &ldquo;{call.outcomeNote}&rdquo;
              </span>
            )}
          </div>

          {/* Meeting display */}
          {meeting && (
            <div className='mt-3 flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2'>
              <CalendarCheck className='h-4 w-4 shrink-0 text-emerald-500' />
              <div className='min-w-0 flex-1'>
                <p className='text-sm font-medium text-emerald-600'>
                  {meeting.title || 'Scheduled Meeting'}
                </p>
                <p className='text-xs text-emerald-600/70'>
                  {format(new Date(meeting.scheduledAt), 'EEE, MMM d')} at{' '}
                  {format(new Date(meeting.scheduledAt), 'h:mm a')} &middot;{' '}
                  {meeting.duration}m
                  {meeting.location ? ` &middot; ${meeting.location}` : ''}
                </p>
              </div>
              <Badge
                variant='outline'
                className='shrink-0 border-emerald-500/20 text-[10px] text-emerald-600'
              >
                {meeting.status}
              </Badge>
            </div>
          )}

          {/* Schedule meeting action */}
          {canSchedule && !isBooking && (
            <button
              onClick={onStartBooking}
              className='mt-3 flex items-center gap-2 rounded-md border border-dashed border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm font-medium text-emerald-600 transition-colors hover:border-emerald-500/50 hover:bg-emerald-500/10'
            >
              <CalendarPlus className='h-4 w-4' />
              Schedule Meeting
            </button>
          )}

          {/* Inline booking form */}
          {isBooking && call.contact?.id && (
            <div className='mt-3 rounded-lg border p-3'>
              <BookMeetingForm
                contactId={call.contact.id}
                callId={call.id}
                onBooked={onMeetingBooked}
                onCancel={onCancelBooking}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
