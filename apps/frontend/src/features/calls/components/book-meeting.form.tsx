'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { ScrollArea } from '@ringee/frontend-shared/components/ui/scroll-area';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { addDays, format, isSameDay, isToday, startOfToday } from 'date-fns';
import { ChevronLeft, ChevronRight, Loader2, CalendarPlus } from 'lucide-react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { toast } from 'sonner';
import { Input } from '@ringee/frontend-shared/components/ui/input';

interface AvailabilitySlot {
  time: string;
  available: boolean;
  eventName?: string;
}

const DURATIONS = [
  { value: 15, label: '15m' },
  { value: 30, label: '30m' },
  { value: 45, label: '45m' },
  { value: 60, label: '1h' }
];

interface BookMeetingFormProps {
  contactId: string;
  callId?: string | null;
  onBooked: () => void;
  onCancel: () => void;
}

export function BookMeetingForm({
  contactId,
  callId,
  onBooked,
  onCancel
}: BookMeetingFormProps) {
  const api = useApi();
  const [weekStart, setWeekStart] = useState(startOfToday());
  const [selectedDate, setSelectedDate] = useState(startOfToday());
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [duration, setDuration] = useState(30);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // New state
  const [contactEmail, setContactEmail] = useState('');
  const [isEmailMissing, setIsEmailMissing] = useState(false);
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [isInitializing, setIsInitializing] = useState(true);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  useEffect(() => {
    let mounted = true;
    async function init() {
      setIsInitializing(true);
      try {
        const [contact, calendarIntegrations] = await Promise.all([
          api.get(`/contacts/${contactId}`),
          api.get('/calendar/integrations')
        ]);
        
        if (!mounted) return;

        if (contact.email) {
          setContactEmail(contact.email);
        } else {
          setIsEmailMissing(true);
        }

        setIntegrations(calendarIntegrations);
        if (calendarIntegrations.length > 0) {
          setSelectedProvider(calendarIntegrations[0].provider);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (mounted) setIsInitializing(false);
      }
    }
    init();
    return () => { mounted = false; };
  }, [contactId, api]);

  const fetchAvailability = useCallback(async (date: Date, providerStr?: string) => {
    setIsLoadingSlots(true);
    try {
      const dateStr = format(date, 'yyyy-MM-dd');
      const url = providerStr 
        ? `/calendar/availability?date=${dateStr}&provider=${providerStr}` 
        : `/calendar/availability?date=${dateStr}`;
      const data = await api.get<AvailabilitySlot[]>(url);
      setSlots(data);
    } catch {
      // No calendar connected - generate all available slots client-side
      const now = new Date();
      const isDateToday = isSameDay(date, now);
      const generated: AvailabilitySlot[] = [];
      for (let h = 8; h < 20; h++) {
        for (const m of [0, 30]) {
          if (isDateToday) {
            const slotTime = new Date(date);
            slotTime.setHours(h, m, 0, 0);
            if (slotTime <= now) continue;
          }
          generated.push({
            time: `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`,
            available: true
          });
        }
      }
      setSlots(generated);
    } finally {
      setIsLoadingSlots(false);
    }
  }, [api]);

  useEffect(() => {
    if (!isInitializing) {
      fetchAvailability(selectedDate, selectedProvider);
      setSelectedTime(null);
    }
  }, [selectedDate, selectedProvider, isInitializing, fetchAvailability]);

  const handleSubmit = async () => {
    if (!selectedTime) return;
    
    if (isEmailMissing && !contactEmail) {
      toast.error('Please provide an email for the contact');
      return;
    }

    setIsSubmitting(true);

    try {
      const [hours, minutes] = selectedTime.split(':').map(Number);
      const scheduledAt = new Date(selectedDate);
      scheduledAt.setHours(hours, minutes, 0, 0);

      await api.post('/meetings', {
        contactId,
        callId: callId || undefined,
        scheduledAt: scheduledAt.toISOString(),
        duration,
        attendeeEmail: contactEmail || undefined,
        provider: selectedProvider || undefined
      });

      toast.success(
        `Meeting booked -- ${format(scheduledAt, 'EEE, MMM d')} at ${format(scheduledAt, 'h:mm a')}`
      );
      onBooked();
    } catch {
      toast.error('Failed to book meeting');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatSlotTime = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return format(d, 'h:mm a');
  };

  const prevWeek = () => setWeekStart((d) => addDays(d, -7));
  const nextWeek = () => setWeekStart((d) => addDays(d, 7));

  const availableSlots = slots.filter((s) => s.available);
  const firstAvailableTime = availableSlots[0]?.time;

  return (
    <div className='flex flex-col gap-3'>
      {/* Day strip */}
      <div className='flex items-center gap-1'>
        <button
          onClick={prevWeek}
          className='text-muted-foreground hover:text-foreground flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors'
          disabled={isSameDay(weekStart, startOfToday())}
        >
          <ChevronLeft className='h-4 w-4' />
        </button>

        <div className='flex flex-1 gap-1'>
          {days.map((day) => {
            const isSelected = isSameDay(day, selectedDate);
            const isPast = day < startOfToday();
            return (
              <button
                key={day.toISOString()}
                disabled={isPast}
                onClick={() => setSelectedDate(day)}
                className={cn(
                  'flex flex-1 flex-col items-center rounded-lg py-1.5 text-[10px] font-medium transition-all',
                  isPast && 'cursor-not-allowed opacity-30',
                  isSelected
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'hover:bg-muted/60'
                )}
              >
                <span className='uppercase'>{format(day, 'EEE')}</span>
                <span className='text-xs font-semibold'>{format(day, 'd')}</span>
              </button>
            );
          })}
        </div>

        <button
          onClick={nextWeek}
          className='text-muted-foreground hover:text-foreground flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors'
        >
          <ChevronRight className='h-4 w-4' />
        </button>
      </div>

      {/* Time slots */}
      <ScrollArea className='h-[180px]'>
        {isLoadingSlots || isInitializing ? (
          <div className='flex flex-col gap-1.5'>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className='bg-muted/40 h-9 animate-pulse rounded-md' />
            ))}
          </div>
        ) : slots.length === 0 ? (
          <div className='text-muted-foreground flex h-[160px] items-center justify-center text-sm'>
            No available slots
          </div>
        ) : (
          <div className='grid grid-cols-3 gap-1.5'>
            {slots.map((slot) => (
              <button
                key={slot.time}
                disabled={!slot.available}
                onClick={() => setSelectedTime(slot.time)}
                className={cn(
                  'rounded-md border px-2 py-2 text-xs font-medium transition-all',
                  !slot.available &&
                    'text-muted-foreground/50 cursor-not-allowed border-transparent bg-muted/20 line-through',
                  slot.available &&
                    selectedTime === slot.time &&
                    'border-emerald-500 bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/20',
                  slot.available &&
                    selectedTime !== slot.time &&
                    'border-border/50 bg-card hover:border-emerald-500/30 hover:bg-emerald-500/5'
                )}
              >
                {formatSlotTime(slot.time)}
              </button>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Duration pills */}
      <div className='flex items-center gap-1.5'>
        <span className='text-muted-foreground text-[10px] font-medium uppercase tracking-wider'>
          Duration
        </span>
        <div className='flex gap-1'>
          {DURATIONS.map((d) => (
            <button
              key={d.value}
              onClick={() => setDuration(d.value)}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-all',
                duration === d.value
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted/40 hover:bg-muted'
              )}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {/* Dynamic Inputs */}
      {!isInitializing && (
        <div className="flex flex-col gap-3">
          {isEmailMissing && (
            <div className="space-y-1.5">
              <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground block">
                Contact Email
              </label>
              <Input 
                type="email"
                placeholder="Required for calendar invite" 
                value={contactEmail} 
                onChange={(e) => setContactEmail(e.target.value)}
                className="h-8 text-xs placeholder:text-muted-foreground/50 border-border/80"
              />
            </div>
          )}

          {integrations.length > 1 && (
            <div className="space-y-1.5">
              <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground block">
                Select Calendar
              </label>
              <div className="flex gap-2">
                {integrations.map((i) => (
                  <button
                    key={i.id}
                    onClick={() => setSelectedProvider(i.provider)}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-2 rounded-md border text-xs font-medium transition-all h-8",
                      selectedProvider === i.provider 
                        ? 'bg-primary text-primary-foreground border-transparent'
                        : 'bg-card border-border hover:bg-muted/50 text-muted-foreground'
                    )}
                  >
                    {i.provider === 'google' ? 'Google' : 'Microsoft'}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Confirm bar */}
      <div className='mt-1 flex gap-2'>
        <Button variant='ghost' size='sm' onClick={onCancel} className='flex-1'>
          Cancel
        </Button>
        <Button
          size='sm'
          onClick={handleSubmit}
          disabled={!selectedTime || isSubmitting}
          className='flex-1 bg-emerald-600 text-white hover:bg-emerald-700'
        >
          {isSubmitting ? (
            <Loader2 className='h-3.5 w-3.5 animate-spin' />
          ) : (
            <>
              <CalendarPlus className='mr-1.5 h-3.5 w-3.5' />
              Confirm
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
