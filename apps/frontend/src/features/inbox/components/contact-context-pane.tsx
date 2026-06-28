'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Avatar,
  AvatarFallback
} from '@ringee/frontend-shared/components/ui/avatar';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Textarea } from '@ringee/frontend-shared/components/ui/textarea';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@ringee/frontend-shared/components/ui/popover';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import {
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  StickyNote,
  CalendarClock,
  CalendarPlus,
  UserPlus,
  ExternalLink,
  Building2,
  Mail,
  Loader2
} from 'lucide-react';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { useTranslations } from 'next-intl';
import { InboxThread } from '../types';
import {
  threadDisplayName,
  useThreadActions,
  useThreadActivity,
  ThreadActivity
} from '../hooks/use-inbox';
import { ContactPicker, PickableContact } from './contact-picker';

interface Props {
  thread: InboxThread;
  onChanged: () => void;
}

interface FullContact {
  id: string;
  company?: string | null;
  email?: string | null;
  jobTitle?: string | null;
}

const POSITIVE_OUTCOMES = new Set([
  'meeting_booked',
  'sale',
  'interested',
  'follow_up',
  'callback_scheduled'
]);
const NEGATIVE_OUTCOMES = new Set(['not_interested', 'wrong_number']);

function defaultScheduleValue(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function formatDuration(seconds: number | null): string | null {
  if (!seconds || seconds <= 0) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function ContactContextPane({ thread, onChanged }: Props) {
  const t = useTranslations('inbox.contextPane');
  const api = useApi();
  const actions = useThreadActions(onChanged);
  const [full, setFull] = useState<FullContact | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createName, setCreateName] = useState('');
  const [activityKey, setActivityKey] = useState(0);
  const { activity, loading: activityLoading } = useThreadActivity(
    thread.contactId ? thread.id : null,
    activityKey
  );

  const target = thread.participantNumberE164 ?? thread.participantNumber;

  useEffect(() => {
    if (!thread.contactId) {
      setFull(null);
      return;
    }
    let active = true;
    api
      .get<FullContact>(`/contacts/${thread.contactId}`)
      .then((c) => active && setFull(c ?? null))
      .catch(() => active && setFull(null));
    return () => {
      active = false;
    };
  }, [api, thread.contactId]);

  function call() {
    window.dispatchEvent(
      new CustomEvent('ringee:dial', { detail: { number: target } })
    );
  }

  function focusNote() {
    window.dispatchEvent(new CustomEvent('ringee:inbox-note'));
  }

  async function linkExisting(contact: PickableContact) {
    setLinkOpen(false);
    try {
      await actions.linkContact(thread.id, contact.id);
      toast.success(t('linkedToast'));
    } catch {
      toast.error(t('linkError'));
    }
  }

  async function createAndLink() {
    setCreating(true);
    try {
      const [firstName, ...rest] = createName.trim().split(' ');
      const created = await api.post<{ id: string }>('/contacts', {
        phoneNumber: target,
        firstName: firstName || undefined,
        lastName: rest.length ? rest.join(' ') : undefined
      });
      if (created?.id) {
        await actions.linkContact(thread.id, created.id);
        toast.success(t('createdToast'));
        setCreateName('');
      }
    } catch {
      toast.error(t('createError'));
    } finally {
      setCreating(false);
    }
  }

  const displayName = threadDisplayName(thread);
  const initials = displayName
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className='hidden w-80 shrink-0 flex-col border-l xl:flex'>
      {/* Header */}
      <div className='flex flex-col items-center gap-2 border-b p-5 text-center'>
        <Avatar className='h-14 w-14'>
          <AvatarFallback className='text-base'>
            {initials || '?'}
          </AvatarFallback>
        </Avatar>
        <div className='min-w-0'>
          <p className='truncate text-sm font-semibold'>{displayName}</p>
          <p className='text-muted-foreground truncate text-xs'>{target}</p>
        </div>
        {full?.company && (
          <p className='text-muted-foreground flex items-center gap-1 text-xs'>
            <Building2 className='h-3 w-3' /> {full.company}
          </p>
        )}
        {full?.email && (
          <p className='text-muted-foreground flex items-center gap-1 text-xs'>
            <Mail className='h-3 w-3' /> {full.email}
          </p>
        )}
      </div>

      {/* Quick actions */}
      <div className='space-y-2 border-b p-3'>
        <p className='text-muted-foreground px-1 text-[11px] font-medium tracking-wide uppercase'>
          {t('quickActions')}
        </p>
        <div className='grid grid-cols-2 gap-2'>
          <Button variant='outline' size='sm' onClick={call}>
            <Phone className='mr-1 h-4 w-4' /> {t('call')}
          </Button>
          <Button variant='outline' size='sm' onClick={focusNote}>
            <StickyNote className='mr-1 h-4 w-4' /> {t('note')}
          </Button>
          {thread.contactId && (
            <>
              <SchedulePopover
                mode='callback'
                contactId={thread.contactId}
                onScheduled={() => setActivityKey((k) => k + 1)}
                trigger={
                  <Button variant='outline' size='sm'>
                    <CalendarClock className='mr-1 h-4 w-4' /> {t('callback')}
                  </Button>
                }
              />
              <SchedulePopover
                mode='meeting'
                contactId={thread.contactId}
                contactName={displayName}
                onScheduled={() => setActivityKey((k) => k + 1)}
                trigger={
                  <Button variant='outline' size='sm'>
                    <CalendarPlus className='mr-1 h-4 w-4' /> {t('meeting')}
                  </Button>
                }
              />
            </>
          )}
        </div>
        {thread.contactId && (
          <Button
            asChild
            variant='ghost'
            size='sm'
            className='w-full justify-start'
          >
            <Link href={`/dashboard/contact/${thread.contactId}`}>
              <ExternalLink className='mr-2 h-4 w-4' /> {t('viewProfile')}
            </Link>
          </Button>
        )}
      </div>

      {/* Scrollable context */}
      <div className='min-h-0 flex-1 overflow-y-auto p-3'>
        {!thread.contactId ? (
          <div className='space-y-2'>
            <p className='text-muted-foreground px-1 text-xs'>
              {t('unknownNumber')}
            </p>
            <div className='flex gap-2'>
              <Input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder={t('namePlaceholder')}
                className='h-8 text-xs'
              />
              <Button
                size='sm'
                disabled={creating}
                onClick={createAndLink}
                className='shrink-0'
              >
                {creating ? (
                  <Loader2 className='h-4 w-4 animate-spin' />
                ) : (
                  t('create')
                )}
              </Button>
            </div>
            <Popover open={linkOpen} onOpenChange={setLinkOpen}>
              <PopoverTrigger asChild>
                <Button variant='outline' size='sm' className='w-full'>
                  <UserPlus className='mr-1 h-4 w-4' /> {t('linkExisting')}
                </Button>
              </PopoverTrigger>
              <PopoverContent align='end' className='w-72 p-0'>
                <ContactPicker autoFocus onPick={linkExisting} />
              </PopoverContent>
            </Popover>
          </div>
        ) : (
          <ActivityTimeline activity={activity} loading={activityLoading} />
        )}
      </div>
    </div>
  );
}

function ActivityTimeline({
  activity,
  loading
}: {
  activity: ThreadActivity | null;
  loading: boolean;
}) {
  const t = useTranslations('inbox.contextPane.history');

  const items = useMemo(() => {
    if (!activity) return [];
    const merged: {
      key: string;
      sort: number;
      node: React.ReactNode;
    }[] = [];

    for (const c of activity.calls) {
      const dir = (c.direction || '').toLowerCase();
      const isOutbound = dir === 'outbound' || dir === 'outgoing';
      const missed = c.status === 'missed' || c.outcome === 'no_answer';
      const Icon = missed
        ? PhoneMissed
        : isOutbound
          ? PhoneOutgoing
          : PhoneIncoming;
      const title = missed
        ? t('callMissed')
        : isOutbound
          ? t('callOutbound')
          : t('callInbound');
      const duration = formatDuration(c.durationSeconds);
      merged.push({
        key: `call-${c.id}`,
        sort: new Date(c.createdAt).getTime(),
        node: (
          <ActivityRow
            icon={
              <Icon
                className={cn(
                  'h-4 w-4',
                  missed ? 'text-red-500' : 'text-emerald-500'
                )}
              />
            }
            title={title}
            when={c.createdAt}
            badge={c.outcome ? <OutcomeBadge outcome={c.outcome} /> : null}
            meta={duration ?? undefined}
            note={c.outcomeNote}
          />
        )
      });
    }

    for (const n of activity.notes) {
      merged.push({
        key: `note-${n.id}`,
        sort: new Date(n.createdAt).getTime(),
        node: (
          <ActivityRow
            icon={<StickyNote className='h-4 w-4 text-yellow-600' />}
            title={t('note')}
            when={n.createdAt}
            note={n.content}
          />
        )
      });
    }

    for (const m of activity.meetings) {
      merged.push({
        key: `meeting-${m.id}`,
        sort: new Date(m.scheduledAt).getTime(),
        node: (
          <ActivityRow
            icon={<CalendarPlus className='h-4 w-4 text-cyan-600' />}
            title={m.title || t('meeting')}
            when={m.scheduledAt}
            badge={<StatusBadge status={m.status} />}
            note={m.notes}
          />
        )
      });
    }

    for (const cb of activity.callbacks) {
      merged.push({
        key: `callback-${cb.id}`,
        sort: new Date(cb.scheduledAt).getTime(),
        node: (
          <ActivityRow
            icon={<CalendarClock className='h-4 w-4 text-violet-600' />}
            title={t('callback')}
            when={cb.scheduledAt}
            badge={<StatusBadge status={cb.status} />}
            note={cb.note}
          />
        )
      });
    }

    return merged.sort((a, b) => b.sort - a.sort);
  }, [activity, t]);

  if (loading && !activity) {
    return (
      <div className='text-muted-foreground flex items-center justify-center gap-2 py-8 text-xs'>
        <Loader2 className='h-3.5 w-3.5 animate-spin' /> {t('loading')}
      </div>
    );
  }

  return (
    <div className='space-y-3'>
      <p className='text-muted-foreground px-1 text-[11px] font-medium tracking-wide uppercase'>
        {t('title')}
      </p>
      {items.length === 0 ? (
        <p className='text-muted-foreground px-1 py-6 text-center text-xs'>
          {t('empty')}
        </p>
      ) : (
        <div className='space-y-3'>
          {items.map((it) => (
            <div key={it.key}>{it.node}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function ActivityRow({
  icon,
  title,
  when,
  badge,
  meta,
  note
}: {
  icon: React.ReactNode;
  title: string;
  when: string;
  badge?: React.ReactNode;
  meta?: string;
  note?: string | null;
}) {
  return (
    <div className='flex gap-2'>
      <div className='mt-0.5 shrink-0'>{icon}</div>
      <div className='min-w-0 flex-1'>
        <div className='flex items-center gap-2'>
          <span className='truncate text-xs font-medium'>{title}</span>
          {badge}
          {meta && (
            <span className='text-muted-foreground text-[11px]'>{meta}</span>
          )}
        </div>
        <p className='text-muted-foreground text-[11px]'>{formatWhen(when)}</p>
        {note && (
          <p className='bg-muted/50 mt-1 rounded-md px-2 py-1 text-xs whitespace-pre-wrap'>
            {note}
          </p>
        )}
      </div>
    </div>
  );
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  const t = useTranslations('inbox.contextPane.history.outcomes');
  const tone = POSITIVE_OUTCOMES.has(outcome)
    ? 'border-emerald-300 text-emerald-700 dark:text-emerald-400'
    : NEGATIVE_OUTCOMES.has(outcome)
      ? 'border-red-300 text-red-700 dark:text-red-400'
      : 'text-muted-foreground';
  return (
    <Badge variant='outline' className={cn('h-4 px-1.5 text-[10px]', tone)}>
      {t(outcome as never)}
    </Badge>
  );
}

function StatusBadge({ status }: { status: string }) {
  const t = useTranslations('inbox.contextPane.history.statuses');
  const tone =
    status === 'completed'
      ? 'border-emerald-300 text-emerald-700 dark:text-emerald-400'
      : status === 'cancelled' || status === 'missed'
        ? 'border-red-300 text-red-700 dark:text-red-400'
        : 'text-muted-foreground';
  return (
    <Badge variant='outline' className={cn('h-4 px-1.5 text-[10px]', tone)}>
      {t(status as never)}
    </Badge>
  );
}

function SchedulePopover({
  mode,
  contactId,
  contactName,
  trigger,
  onScheduled
}: {
  mode: 'callback' | 'meeting';
  contactId: string;
  contactName?: string;
  trigger: React.ReactNode;
  onScheduled?: () => void;
}) {
  const t = useTranslations('inbox.contextPane');
  const api = useApi();
  const [open, setOpen] = useState(false);
  const [when, setWhen] = useState(defaultScheduleValue);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    const scheduledAt = new Date(when);
    if (
      Number.isNaN(scheduledAt.getTime()) ||
      scheduledAt.getTime() <= Date.now()
    ) {
      toast.error(t('invalidDate'));
      return;
    }
    setSubmitting(true);
    try {
      if (mode === 'callback') {
        await api.post('/callbacks', {
          contactId,
          scheduledAt: scheduledAt.toISOString(),
          note: note.trim() || undefined
        });
        toast.success(t('callbackScheduled'));
      } else {
        await api.post('/meetings', {
          contactId,
          scheduledAt: scheduledAt.toISOString(),
          title: contactName ? `Meeting with ${contactName}` : undefined,
          notes: note.trim() || undefined
        });
        toast.success(t('meetingScheduled'));
      }
      setOpen(false);
      setNote('');
      onScheduled?.();
    } catch {
      toast.error(t('scheduleError'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align='end' className='w-72 space-y-2'>
        <p className='text-sm font-medium'>
          {mode === 'callback' ? t('scheduleCallback') : t('scheduleMeeting')}
        </p>
        <Input
          type='datetime-local'
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          className='text-xs'
        />
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder={t('notePlaceholder')}
          className='resize-none text-xs'
        />
        <Button
          size='sm'
          className='w-full'
          disabled={submitting}
          onClick={submit}
        >
          {submitting ? (
            <Loader2 className='h-4 w-4 animate-spin' />
          ) : (
            t('schedule')
          )}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
