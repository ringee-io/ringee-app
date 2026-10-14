'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CalendarCheck,
  CalendarPlus,
  CalendarX,
  Loader2,
  Mail,
  PhoneMissed,
  PhoneOff,
  UserX
} from 'lucide-react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { describeApiError } from '../../lib/api-error';
import { useAutomationApi } from '../api';
import { formatAgo } from '../lib/format';
import type { AutomationActivity, AutomationActivityKind } from '../types';

const ICONS: Record<AutomationActivityKind, typeof CalendarCheck> = {
  attendance_confirmed: CalendarCheck,
  attendance_declined: CalendarX,
  no_answer: PhoneMissed,
  call_completed: PhoneOff,
  call_failed: AlertTriangle,
  needs_email: Mail,
  needs_member: UserX,
  email_failed: AlertTriangle,
  meeting_booked: CalendarPlus
};

const ATTENTION: AutomationActivityKind[] = [
  'needs_email',
  'needs_member',
  'email_failed',
  'call_failed'
];

/**
 * What the agents did lately — at most three real events, each linked to the
 * call or the meetings it is about. A confirmation waiting for the lead's
 * address is completed right here.
 */
export function ActivityList({
  items,
  onChanged
}: {
  items: AutomationActivity[];
  onChanged: () => void;
}) {
  const t = useTranslations('aiVoiceAgents.automations.activity');
  const locale = useLocale();

  return (
    <section aria-labelledby='automation-activity-title' className='space-y-2'>
      <h3
        id='automation-activity-title'
        className='text-muted-foreground px-1 text-xs font-medium tracking-wide uppercase'
      >
        {t('title')}
      </h3>
      {items.length === 0 ? (
        <p className='text-muted-foreground px-1 text-xs'>{t('empty')}</p>
      ) : (
        <ul className='space-y-1'>
          {items.map((item) => (
            <ActivityRow
              key={item.id}
              item={item}
              when={formatAgo(item.at, locale)}
              onChanged={onChanged}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function ActivityRow({
  item,
  when,
  onChanged
}: {
  item: AutomationActivity;
  when: string;
  onChanged: () => void;
}) {
  const t = useTranslations('aiVoiceAgents.automations.activity');
  const api = useAutomationApi();
  const [completing, setCompleting] = useState(false);
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const Icon = ICONS[item.kind];
  const attention = ATTENTION.includes(item.kind);
  const href = item.callId
    ? `/dashboard/call/${item.callId}`
    : item.meetingId
      ? '/dashboard/meetings'
      : null;
  const text = t(`kinds.${item.kind}`, { name: item.label ?? t('someone') });

  const save = async () => {
    if (!item.deliveryId) return;
    setSaving(true);
    try {
      await api.completeEmail(item.deliveryId, email.trim());
      toast.success(t('emailQueued'));
      setCompleting(false);
      onChanged();
    } catch (failure) {
      toast.error(describeApiError(failure, t('emailError')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className='rounded-lg px-1 py-1.5'>
      <div className='flex items-start gap-2.5'>
        <Icon
          aria-hidden
          className={cn(
            'mt-0.5 size-4 shrink-0',
            attention
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-muted-foreground'
          )}
        />
        <div className='min-w-0 flex-1 text-xs'>
          {href ? (
            <Link
              href={href}
              className='focus-visible:ring-ring rounded-sm hover:underline focus-visible:ring-2 focus-visible:outline-none'
            >
              {text}
            </Link>
          ) : (
            <span>{text}</span>
          )}
          <p className='text-muted-foreground'>{when}</p>
        </div>
        {item.kind === 'needs_email' && item.deliveryId && !completing ? (
          <Button
            size='sm'
            variant='outline'
            className='h-11 shrink-0 rounded-lg md:h-7'
            onClick={() => setCompleting(true)}
          >
            {t('completeEmail')}
          </Button>
        ) : null}
      </div>
      {completing ? (
        <form
          className='mt-2 flex items-center gap-2 pl-6'
          onSubmit={(event) => {
            event.preventDefault();
            if (email.trim() && !saving) void save();
          }}
        >
          <Input
            type='email'
            autoFocus
            required
            aria-label={t('emailLabel', { name: item.label ?? t('someone') })}
            placeholder={t('emailPlaceholder')}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className='h-11 rounded-lg md:h-8'
          />
          <Button
            type='submit'
            size='sm'
            className='h-11 shrink-0 rounded-lg md:h-8'
            disabled={!email.trim() || saving}
          >
            {saving ? <Loader2 className='size-3.5 animate-spin' /> : null}
            {t('send')}
          </Button>
        </form>
      ) : null}
    </li>
  );
}
