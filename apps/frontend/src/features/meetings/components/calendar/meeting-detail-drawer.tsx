'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  CalendarDays,
  CircleCheck,
  Clock,
  Copy,
  Cpu,
  FileText,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  PhoneOutgoing,
  Trash2,
  TriangleAlert,
  X
} from 'lucide-react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { useAutomationApi } from '@/features/ai-voice-agents/automations/api';
import { describeApiError } from '@/features/ai-voice-agents/lib/api-error';
import { useDial } from '@/features/calls/hooks/use.dial';
import { SectionLabel, SideDrawer } from './calendar-parts';
import {
  contactName,
  firstName,
  initials,
  isUpcoming,
  meetingEnd,
  meetingStart,
  useCalendarFormat
} from './calendar-utils';
import type { CalendarMeeting, RingeeCalendar } from './types';

function Fact({
  icon,
  tone = 'muted',
  children
}: {
  icon: React.ReactNode;
  tone?: 'muted' | 'green' | 'amber';
  children: React.ReactNode;
}) {
  return (
    <div className='flex min-w-0 items-start gap-2.5'>
      <span
        className={cn(
          'grid size-7 shrink-0 place-items-center rounded-lg [&_svg]:size-3.5',
          tone === 'green'
            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
            : tone === 'amber'
              ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
              : 'bg-muted text-muted-foreground'
        )}
      >
        {icon}
      </span>
      <div className='grid min-w-0 flex-1 gap-px'>{children}</div>
    </div>
  );
}

const muted = 'text-muted-foreground text-[12.8px]';

/**
 * A meeting's detail, on the right, with nothing of the old sheet lost:
 * status, calendar, the external copy (and its retry), date and time,
 * attendance with "Call to confirm now", the contact, location, notes, the
 * call it came from, cancel and copy ID.
 */
export function MeetingDetailDrawer({
  meeting,
  calendar,
  provider,
  now,
  aiCallAt,
  pilot,
  remindersOn,
  onClose,
  onEdit,
  onCancel,
  onChanged
}: {
  meeting: CalendarMeeting;
  calendar: RingeeCalendar | null;
  /** "Google Calendar", when the calendar copies its meetings anywhere. */
  provider: string | null;
  now: Date;
  /** When the AI agent calls to confirm, if it will. */
  aiCallAt: Date | null;
  pilot: boolean;
  remindersOn: boolean;
  onClose: () => void;
  onEdit: () => void;
  onCancel: () => void;
  onChanged: (meeting: CalendarMeeting) => void;
}) {
  const t = useTranslations('meetings.page.detail');
  const fmt = useCalendarFormat();
  const api = useApi();
  const automations = useAutomationApi();
  const { dial } = useDial();
  const [retrying, setRetrying] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmPlaced, setConfirmPlaced] = useState(false);

  const start = meetingStart(meeting);
  const end = meetingEnd(meeting);
  const upcoming = isUpcoming(meeting, now);
  const cancelled = meeting.status === 'cancelled';
  const name = contactName(meeting);
  const company = meeting.contact.company;
  const email = meeting.leadEmail || meeting.contact.email;
  const sync = meeting.externalSyncStatus ?? 'not_required';
  const attendance = meeting.attendanceStatus ?? 'pending';
  const account = calendar?.integration?.email ?? null;

  const status = cancelled
    ? { label: t('status.cancelled'), tone: 'danger' }
    : !upcoming
      ? { label: t('status.completed'), tone: 'neutral' }
      : meeting.status === 'rescheduled'
        ? { label: t('status.rescheduled'), tone: 'info' }
        : { label: t('status.scheduled'), tone: 'success' };

  const retry = async () => {
    setRetrying(true);
    try {
      const updated = await api.post<CalendarMeeting>(
        `/meetings/${meeting.id}/calendar-sync/retry`,
        {}
      );
      onChanged(updated);
      if (updated.externalSyncStatus === 'synced') {
        toast.success(t('retrySucceeded'));
      } else {
        toast.error(t('retryFailed'));
      }
    } catch {
      toast.error(t('retryFailed'));
    } finally {
      setRetrying(false);
    }
  };

  const confirmNow = async () => {
    setConfirming(true);
    try {
      const result = await automations.confirmationCall(meeting.id);
      if (result.status === 'placed') {
        setConfirmPlaced(true);
        toast.success(t('confirmCalling', { name: firstName(name) }));
      } else {
        toast.warning(t('confirmNotPlaced', { reason: result.reason ?? '—' }));
      }
    } catch (failure) {
      toast.error(describeApiError(failure, t('confirmFailed')));
    } finally {
      setConfirming(false);
    }
  };

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(meeting.id);
      toast.success(t('idCopied'));
    } catch {
      toast.error(t('idCopyFailed'));
    }
  };

  const showAttendance = !cancelled && (pilot || attendance !== 'pending');

  return (
    <SideDrawer labelledBy='mt-detail-title'>
      <div className='grid gap-1 border-b py-4 pr-4 pl-6'>
        <div className='flex min-h-8 items-center gap-1'>
          <div className='flex min-w-0 flex-1 flex-wrap items-center gap-1.5'>
            <span
              className={cn(
                'inline-flex h-[22px] items-center rounded-full px-2.5 text-xs font-semibold',
                status.tone === 'success' &&
                  'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
                status.tone === 'info' &&
                  'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
                status.tone === 'danger' &&
                  'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
                status.tone === 'neutral' && 'bg-muted text-muted-foreground'
              )}
            >
              {status.label}
            </span>
            {(calendar ?? meeting.calendar) ? (
              <span className='inline-flex h-[22px] items-center gap-[5px] rounded-md border px-2 text-xs font-medium'>
                <CalendarDays className='text-muted-foreground size-3' />
                {(calendar ?? meeting.calendar)!.name}
              </span>
            ) : null}
          </div>
          <Button
            type='button'
            variant='ghost'
            size='icon'
            className='size-8'
            onClick={() => void copyId()}
            aria-label={t('copyId')}
            title={t('copyId')}
          >
            <Copy />
          </Button>
          <Button
            type='button'
            variant='ghost'
            size='icon'
            className='size-8'
            onClick={onClose}
            aria-label={t('close')}
          >
            <X />
          </Button>
        </div>
        <h2
          id='mt-detail-title'
          className='text-[18px] leading-snug font-semibold tracking-[-0.01em]'
        >
          {meeting.title || t('untitled')}
        </h2>
        <p className='text-muted-foreground pr-1.5 text-[13px] leading-snug'>
          {company ? t('withCompany', { name, company }) : t('with', { name })}
        </p>
      </div>

      <div className='grid min-h-0 flex-1 content-start gap-6 overflow-y-auto px-6 pt-5 pb-8'>
        <section className='grid gap-2.5'>
          <SectionLabel>{t('when')}</SectionLabel>
          <Fact icon={<CalendarDays />} tone='green'>
            <p className='font-medium'>{fmt.longDay(start)}</p>
            <p className={muted}>
              {t('timeRange', {
                start: fmt.time(start),
                end: fmt.time(end),
                minutes: meeting.duration
              })}
            </p>
          </Fact>
          {provider ? (
            cancelled ? (
              sync === 'synced' ? (
                <SyncLine>
                  {t('sync.removed', { provider, name: firstName(name) })}
                </SyncLine>
              ) : sync === 'failed' ? (
                <p className='flex items-start gap-[7px] text-[12.8px] text-amber-600 dark:text-amber-400'>
                  <TriangleAlert className='mt-0.5 size-3.5 shrink-0' />
                  <span>{t('sync.removeFailed', { provider })}</span>
                </p>
              ) : null
            ) : sync === 'failed' ? (
              <div className='grid gap-1 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2.5 text-[12.8px]'>
                <b className='font-medium'>{t('sync.failedTitle')}</b>
                <p className='text-muted-foreground leading-[1.45]'>
                  {t('sync.onlyCopy', {
                    provider,
                    account: account ?? provider
                  })}
                </p>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  className='mt-1.5 justify-self-start'
                  onClick={() => void retry()}
                  disabled={retrying}
                >
                  {retrying ? <Loader2 className='animate-spin' /> : null}
                  {t('sync.retry')}
                </Button>
              </div>
            ) : sync === 'pending' ? (
              <div className='bg-muted/30 grid gap-1 rounded-lg border px-3 py-2.5 text-[12.8px]'>
                <b className='font-medium'>{t('sync.pendingTitle')}</b>
                <p className='text-muted-foreground leading-[1.45]'>
                  {t('sync.onlyCopy', {
                    provider,
                    account: account ?? provider
                  })}
                </p>
              </div>
            ) : sync === 'synced' ? (
              <SyncLine>
                {email
                  ? t('sync.synced', { provider, email })
                  : t('sync.syncedNoEmail', { provider })}
              </SyncLine>
            ) : null
          ) : null}
        </section>

        {showAttendance ? (
          <section className='grid gap-2.5'>
            <SectionLabel>{t('attendance')}</SectionLabel>
            <Fact
              icon={attendance === 'confirmed' ? <CircleCheck /> : <Clock />}
              tone={
                attendance === 'confirmed'
                  ? 'green'
                  : attendance === 'declined'
                    ? 'amber'
                    : 'muted'
              }
            >
              <p className='font-medium'>
                {t(`attendanceStatus.${attendance}`)}
              </p>
              {attendance === 'declined' && meeting.attendanceNote ? (
                <p className={muted}>“{meeting.attendanceNote}”</p>
              ) : null}
              {upcoming && attendance === 'pending' && remindersOn ? (
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  className='mt-1.5 justify-self-start'
                  onClick={() => void confirmNow()}
                  disabled={confirming || confirmPlaced}
                >
                  {confirming ? (
                    <Loader2 className='animate-spin' />
                  ) : (
                    <PhoneOutgoing />
                  )}
                  {t('callToConfirm')}
                </Button>
              ) : null}
              {upcoming && attendance === 'pending' && aiCallAt ? (
                <p className='bg-muted/55 text-muted-foreground mt-1.5 flex items-start gap-[7px] rounded-md px-[9px] py-[7px] text-[12.8px] leading-snug'>
                  <Cpu className='text-foreground mt-px size-3.5 shrink-0' />
                  <span>
                    {t.rich('aiCall', {
                      day: fmt.shortDay(aiCallAt),
                      time: fmt.time(aiCallAt),
                      hours: hoursBefore(start, aiCallAt),
                      strong: (chunks) => (
                        <b className='text-foreground font-medium'>{chunks}</b>
                      )
                    })}
                  </span>
                </p>
              ) : null}
            </Fact>
          </section>
        ) : null}

        <section className='grid gap-2.5'>
          <SectionLabel>{t('contact')}</SectionLabel>
          <div className='bg-muted/30 grid gap-2.5 rounded-lg border px-3.5 py-3'>
            <div className='flex min-w-0 items-center gap-2.5'>
              <span className='bg-muted grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold'>
                {initials(name)}
              </span>
              <div className='grid min-w-0 leading-[1.35]'>
                <b className='truncate font-semibold'>{name}</b>
                {company ? (
                  <span className='text-muted-foreground truncate text-[12.8px]'>
                    {company}
                  </span>
                ) : null}
              </div>
            </div>
            <p className='flex min-w-0 items-center gap-2 text-[13px]'>
              <Phone className='text-muted-foreground size-3.5 shrink-0' />
              <span className='font-mono tabular-nums'>
                {fmt.phone(meeting.contact.phoneNumber)}
              </span>
            </p>
            {email ? (
              <p className='flex min-w-0 items-center gap-2 text-[13px]'>
                <Mail className='text-muted-foreground size-3.5 shrink-0' />
                <span className='min-w-0 [overflow-wrap:anywhere]'>
                  {email}
                </span>
              </p>
            ) : null}
          </div>
        </section>

        {meeting.location || meeting.notes || meeting.call ? (
          <section className='grid gap-2.5'>
            <SectionLabel>{t('details')}</SectionLabel>
            {meeting.location ? (
              <Fact icon={<MapPin />}>
                <SectionLabel className='font-normal'>
                  {t('location')}
                </SectionLabel>
                <p className='[overflow-wrap:anywhere]'>{meeting.location}</p>
              </Fact>
            ) : null}
            {meeting.notes ? (
              <Fact icon={<FileText />}>
                <SectionLabel className='font-normal'>
                  {t('notes')}
                </SectionLabel>
                <p className='whitespace-pre-line'>{meeting.notes}</p>
              </Fact>
            ) : null}
            {meeting.call ? (
              <Fact icon={<Phone />}>
                <SectionLabel className='font-normal'>
                  {t('sourceCall')}
                </SectionLabel>
                <p>
                  {t('fromCall', {
                    date: fmt.date(new Date(meeting.call.createdAt))
                  })}
                </p>
                {meeting.call.durationSeconds != null ? (
                  <p className={muted}>
                    {t('callDuration')}{' '}
                    <span className='font-mono tabular-nums'>
                      {Math.floor(meeting.call.durationSeconds / 60)}:
                      {String(meeting.call.durationSeconds % 60).padStart(
                        2,
                        '0'
                      )}
                    </span>
                  </p>
                ) : null}
              </Fact>
            ) : null}
          </section>
        ) : null}
      </div>

      {upcoming ? (
        <div className='flex items-center gap-[7px] border-t px-6 pt-4 pb-5'>
          <Button
            type='button'
            variant='ghost'
            className='-ml-2.5 px-2.5 text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400'
            onClick={onCancel}
          >
            <Trash2 />
            {t('cancel')}
          </Button>
          <div className='ml-auto flex items-center gap-[7px]'>
            <Button type='button' variant='outline' onClick={onEdit}>
              <Pencil />
              {t('edit')}
            </Button>
            <Button
              type='button'
              className='bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500'
              onClick={() => void dial(meeting.contact.phoneNumber)}
            >
              <Phone />
              {t('call')}
            </Button>
          </div>
        </div>
      ) : null}
    </SideDrawer>
  );
}

function SyncLine({ children }: { children: React.ReactNode }) {
  return (
    <p className='text-muted-foreground flex items-start gap-[7px] text-[12.8px]'>
      <CircleCheck className='mt-0.5 size-3.5 shrink-0 text-emerald-500' />
      <span className='min-w-0 [overflow-wrap:anywhere]'>{children}</span>
    </p>
  );
}

/** "4": hours between the confirmation call and the meeting, rounded. */
export function hoursBefore(start: Date, callAt: Date): string {
  const hours = (start.getTime() - callAt.getTime()) / 3_600_000;
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}
