'use client';

import { useEffect, useState } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { ScrollArea } from '@ringee/frontend-shared/components/ui/scroll-area';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { format } from 'date-fns';
import {
  Phone,
  FileText,
  Tag,
  Clock,
  PhoneIncoming,
  PhoneOutgoing,
  CalendarDays
} from 'lucide-react';

interface ContactActivity {
  id: string;
  type: 'call' | 'note' | 'tag' | 'meeting';
  date: string;
  data: Record<string, any>;
}

interface ContactData {
  id: string;
  name?: string;
  phoneNumber: string;
  company?: string;
  email?: string;
  calls?: {
    id: string;
    direction?: string;
    durationSeconds?: number;
    status: string;
    outcome?: string;
    hangupCause?: string;
    createdAt: string;
  }[];
  notes?: {
    id: string;
    content: string;
    createdAt: string;
  }[];
  tags?: {
    tag: {
      id: string;
      name: string;
      color?: string;
    };
  }[];
  meetings?: {
    id: string;
    title?: string;
    scheduledAt: string;
    duration: number;
    status: string;
    createdAt: string;
  }[];
}

interface ContactActivitiesProps {
  contactId: string;
}

export function ContactActivities({ contactId }: ContactActivitiesProps) {
  const api = useApi();
  const [contact, setContact] = useState<ContactData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!contactId) return;
    setIsLoading(true);
    api
      .get<ContactData>(`/contacts/${contactId}/activities`)
      .then(setContact)
      .catch(() => setContact(null))
      .finally(() => setIsLoading(false));
  }, [contactId, api]);

  if (isLoading) {
    return (
      <div className='space-y-2 p-3'>
        <Skeleton className='h-4 w-24' />
        <Skeleton className='h-10 w-full' />
        <Skeleton className='h-10 w-full' />
        <Skeleton className='h-10 w-full' />
      </div>
    );
  }

  if (!contact) {
    return (
      <div className='text-muted-foreground flex items-center justify-center p-6 text-sm'>
        No activity data
      </div>
    );
  }

  // Merge calls and notes into a timeline
  const activities: ContactActivity[] = [];

  contact.calls?.forEach((call) => {
    activities.push({
      id: call.id,
      type: 'call',
      date: call.createdAt,
      data: call
    });
  });

  contact.notes?.forEach((note) => {
    activities.push({
      id: note.id,
      type: 'note',
      date: note.createdAt,
      data: note
    });
  });

  contact.meetings?.forEach((meeting) => {
    activities.push({
      id: meeting.id,
      type: 'meeting',
      date: meeting.scheduledAt,
      data: meeting
    });
  });

  // Sort by date descending
  activities.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const recentActivities = activities.slice(0, 10);

  return (
    <div className='flex flex-col gap-2'>
      {/* Tags */}
      {contact.tags && contact.tags.length > 0 && (
        <div className='flex flex-wrap gap-1 px-1'>
          {contact.tags.map((t) => (
            <span
              key={t.tag.id}
              className='bg-muted/60 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium'
            >
              <span
                className='h-1.5 w-1.5 rounded-full'
                style={{ backgroundColor: t.tag.color || '#888' }}
              />
              {t.tag.name}
            </span>
          ))}
        </div>
      )}

      {/* Timeline */}
      <ScrollArea className='h-[200px]'>
        {recentActivities.length === 0 ? (
          <div className='text-muted-foreground flex items-center justify-center py-8 text-xs'>
            No recent activity
          </div>
        ) : (
          <div className='space-y-1 px-1'>
            {recentActivities.map((activity) => (
              <ActivityRow key={activity.id} activity={activity} />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

function ActivityRow({ activity }: { activity: ContactActivity }) {
  if (activity.type === 'call') {
    const call = activity.data;
    const durationLabel = call.durationSeconds
      ? `${Math.floor(call.durationSeconds / 60)}:${(call.durationSeconds % 60).toString().padStart(2, '0')}`
      : '--:--';

    return (
      <div className='hover:bg-muted/30 flex items-center gap-2.5 rounded-md px-2 py-1.5 text-xs'>
        <div className='flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-500/10'>
          {call.direction === 'inbound' ? (
            <PhoneIncoming className='h-3 w-3 text-blue-500' />
          ) : (
            <PhoneOutgoing className='h-3 w-3 text-blue-500' />
          )}
        </div>
        <div className='min-w-0 flex-1'>
          <span className='font-medium capitalize'>
            {call.direction || 'outbound'} call
          </span>
          {call.outcome && (
            <span
              className='text-muted-foreground ml-1.5'
              title={
                call.outcome === 'no_answer' && call.hangupCause
                  ? `Carrier reason: ${call.hangupCause.replace(/_/g, ' ')}`
                  : undefined
              }
            >
              &middot; {call.outcome.replace(/_/g, ' ')}
              {call.outcome === 'no_answer' &&
                call.hangupCause &&
                ` (${call.hangupCause.replace(/_/g, ' ')})`}
            </span>
          )}
        </div>
        <div className='text-muted-foreground flex shrink-0 items-center gap-1'>
          <Clock className='h-3 w-3' />
          {durationLabel}
        </div>
        <span className='text-muted-foreground shrink-0'>
          {format(new Date(activity.date), 'MMM d')}
        </span>
      </div>
    );
  }

  if (activity.type === 'note') {
    return (
      <div className='hover:bg-muted/30 flex items-start gap-2.5 rounded-md px-2 py-1.5 text-xs'>
        <div className='flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-amber-500/10'>
          <FileText className='h-3 w-3 text-amber-500' />
        </div>
        <div className='min-w-0 flex-1'>
          <p className='line-clamp-2 text-xs'>{activity.data.content}</p>
        </div>
        <span className='text-muted-foreground shrink-0'>
          {format(new Date(activity.date), 'MMM d')}
        </span>
      </div>
    );
  }

  if (activity.type === 'meeting') {
    const meeting = activity.data;
    return (
      <div className='hover:bg-muted/30 flex items-center gap-2.5 rounded-md px-2 py-1.5 text-xs'>
        <div
          className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-md',
            meeting.status === 'scheduled'
              ? 'bg-emerald-500/10'
              : meeting.status === 'completed'
                ? 'bg-blue-500/10'
                : meeting.status === 'cancelled'
                  ? 'bg-red-500/10'
                  : 'bg-amber-500/10'
          )}
        >
          <CalendarDays
            className={cn(
              'h-3 w-3',
              meeting.status === 'scheduled'
                ? 'text-emerald-500'
                : meeting.status === 'completed'
                  ? 'text-blue-500'
                  : meeting.status === 'cancelled'
                    ? 'text-red-500'
                    : 'text-amber-500'
            )}
          />
        </div>
        <div className='min-w-0 flex-1'>
          <span className='font-medium capitalize'>
            Meeting {meeting.status}
          </span>
          {meeting.title && (
            <span className='text-muted-foreground ml-1.5 truncate'>
              &middot; {meeting.title}
            </span>
          )}
        </div>
        <div className='text-muted-foreground flex shrink-0 items-center gap-1'>
          <Clock className='h-3 w-3' />
          {meeting.duration}m
        </div>
        <span className='text-muted-foreground w-12 shrink-0 text-right'>
          {format(new Date(activity.date), 'MMM d')}
        </span>
      </div>
    );
  }

  return null;
}
