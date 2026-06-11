'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Textarea } from '@ringee/frontend-shared/components/ui/textarea';
import { cn } from '@ringee/frontend-shared/lib/utils';
import {
  addDays,
  addMinutes,
  format,
  isSameDay,
  setHours,
  setMinutes,
  setSeconds,
  startOfToday
} from 'date-fns';
import { ChevronLeft, ChevronRight, Loader2, PhoneCall } from 'lucide-react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { toast } from 'sonner';

interface ScheduleCallbackFormProps {
  contactId: string;
  callId?: string | null;
  onScheduled: () => void;
  onCancel: () => void;
}

/**
 * Default to "30 minutes from now, rounded to the next 15-min slot" so the
 * picker lands on a sensible value rather than midnight.
 */
function defaultCallbackTime(): Date {
  const now = addMinutes(new Date(), 30);
  const rounded = setSeconds(now, 0);
  const minutes = rounded.getMinutes();
  const bump = (15 - (minutes % 15)) % 15;
  return setMinutes(rounded, minutes + bump);
}

export function ScheduleCallbackForm({
  contactId,
  callId,
  onScheduled,
  onCancel
}: ScheduleCallbackFormProps) {
  const t = useTranslations('calls.callbacks.form');
  const api = useApi();

  const initial = defaultCallbackTime();
  const [weekStart, setWeekStart] = useState(startOfToday());
  const [selectedDate, setSelectedDate] = useState<Date>(initial);
  const [time, setTime] = useState<string>(format(initial, 'HH:mm'));
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const buildScheduledAt = (): Date | null => {
    const [hours, minutes] = time.split(':').map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    return setSeconds(setMinutes(setHours(selectedDate, hours), minutes), 0);
  };

  const handleSubmit = async () => {
    const scheduledAt = buildScheduledAt();
    if (!scheduledAt) {
      toast.error(t('errors.invalidTime'));
      return;
    }
    if (scheduledAt.getTime() <= Date.now()) {
      toast.error(t('errors.mustBeFuture'));
      return;
    }

    setIsSubmitting(true);
    try {
      await api.post('/callbacks', {
        contactId,
        callId: callId || undefined,
        scheduledAt: scheduledAt.toISOString(),
        note: note.trim() || undefined
      });
      toast.success(
        t('success', {
          date: format(scheduledAt, 'EEE, MMM d'),
          time: format(scheduledAt, 'h:mm a')
        })
      );
      onScheduled();
    } catch {
      toast.error(t('errors.saveFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const prevWeek = () => setWeekStart((d) => addDays(d, -7));
  const nextWeek = () => setWeekStart((d) => addDays(d, 7));

  return (
    <div className='flex flex-col gap-3'>
      {/* Day strip */}
      <div className='flex items-center gap-1'>
        <button
          onClick={prevWeek}
          className='text-muted-foreground hover:text-foreground flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors'
          disabled={isSameDay(weekStart, startOfToday())}
          type='button'
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
                type='button'
                className={cn(
                  'flex flex-1 flex-col items-center rounded-lg py-1.5 text-[10px] font-medium transition-all',
                  isPast && 'cursor-not-allowed opacity-30',
                  isSelected
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'hover:bg-muted/60'
                )}
              >
                <span className='uppercase'>{format(day, 'EEE')}</span>
                <span className='text-xs font-semibold'>
                  {format(day, 'd')}
                </span>
              </button>
            );
          })}
        </div>

        <button
          onClick={nextWeek}
          className='text-muted-foreground hover:text-foreground flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors'
          type='button'
        >
          <ChevronRight className='h-4 w-4' />
        </button>
      </div>

      {/* Time */}
      <div className='space-y-1.5'>
        <label className='text-muted-foreground block text-[10px] font-medium tracking-wider uppercase'>
          {t('timeLabel')}
        </label>
        <Input
          type='time'
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className='border-border/80 h-9 text-sm'
        />
      </div>

      {/* Note */}
      <div className='space-y-1.5'>
        <label className='text-muted-foreground block text-[10px] font-medium tracking-wider uppercase'>
          {t('noteLabel')}
        </label>
        <Textarea
          placeholder={t('notePlaceholder')}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className='min-h-[48px] resize-none text-sm'
        />
      </div>

      {/* Reminder hint */}
      <p className='text-muted-foreground text-[11px] leading-snug'>
        {t('reminderHint')}
      </p>

      {/* Actions */}
      <div className='mt-1 flex gap-2'>
        <Button
          variant='ghost'
          size='sm'
          onClick={onCancel}
          className='flex-1'
          type='button'
        >
          {t('cancel')}
        </Button>
        <Button
          size='sm'
          onClick={handleSubmit}
          disabled={isSubmitting}
          className='flex-1 bg-amber-600 text-white hover:bg-amber-700'
          type='button'
        >
          {isSubmitting ? (
            <Loader2 className='h-3.5 w-3.5 animate-spin' />
          ) : (
            <>
              <PhoneCall className='mr-1.5 h-3.5 w-3.5' />
              {t('confirm')}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
