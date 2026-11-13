'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  PauseCircle,
  Phone,
  Zap
} from 'lucide-react';
import { formatForDisplay } from '@ringee/dialer-core/phone';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { CreditPopover } from '@/features/credit/components/credit.popover';
import type { FollowUpMeetingCoverage, FollowUpReview } from '../types';
import {
  formatMoment,
  formatTime,
  formatUsd,
  formatWindow,
  offsetHours
} from './format';

/**
 * After the explicit adoption: what is really running, the next action the
 * scheduler accepted (never a promise it did not), what stayed active and the
 * consumption. "Pending" and "Paused" say the specific reason and its action.
 */
export function ActivatedView({
  review,
  coverage,
  onEdit
}: {
  review: FollowUpReview;
  coverage: FollowUpMeetingCoverage | null;
  onEdit: () => void;
}) {
  const t = useTranslations('aiVoiceAgents.followUp');
  const locale = useLocale();
  const { state, draft, rows, nextActions, balance, requirements } = review;
  const offset = t('capabilities.offset', {
    hours: offsetHours(draft.reminderOffsetMinutes)
  });
  const hours = formatWindow(draft.callingHours, locale);
  const next = nextActions[0] ?? null;
  const blocking = requirements[0] ?? null;

  const tone =
    state === 'active'
      ? 'border-emerald-500/30 bg-emerald-500/[0.06]'
      : state === 'paused'
        ? 'bg-muted/40'
        : 'border-amber-500/30 bg-amber-500/[0.06]';
  const Icon =
    state === 'active' ? Check : state === 'paused' ? PauseCircle : AlertCircle;

  return (
    <div className='space-y-4'>
      <section
        className={cn(
          'flex flex-col gap-4 rounded-2xl border p-5 sm:flex-row sm:items-center',
          tone
        )}
      >
        <span
          className={cn(
            'flex size-12 shrink-0 items-center justify-center rounded-full',
            state === 'active'
              ? 'bg-emerald-500/15 text-emerald-500'
              : 'bg-amber-500/15 text-amber-500'
          )}
        >
          <Icon className='size-6' aria-hidden />
        </span>
        <div className='min-w-0 flex-1'>
          <p className='text-xs font-semibold tracking-wide text-emerald-600 uppercase dark:text-emerald-400'>
            {t('activated.eyebrow')}
          </p>
          <h2 className='mt-1 text-xl font-semibold tracking-tight sm:text-2xl'>
            {state === 'active'
              ? t('activated.title')
              : state === 'paused'
                ? t('activated.pausedTitle')
                : t('activated.pendingTitle')}
          </h2>
          <p className='text-muted-foreground mt-1 text-sm'>
            {state === 'active'
              ? t('activated.text')
              : blocking
                ? t(`activated.blocked.${blocking.code}`)
                : state === 'paused'
                  ? t('activated.pausedText')
                  : t('activated.pendingText')}
          </p>
        </div>
        <div className='flex shrink-0 items-center gap-2'>
          <Button variant='ghost' onClick={onEdit}>
            {t('activated.edit')}
          </Button>
          <Button
            asChild
            className='bg-emerald-600 text-white hover:bg-emerald-700'
          >
            <Link href='/dashboard/call'>
              <Phone aria-hidden />
              {t('activated.goCall')}
            </Link>
          </Button>
        </div>
      </section>

      <div className='grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]'>
        <div className='space-y-4'>
          {coverage ? (
            <section className='rounded-xl border p-4 text-sm'>
              {coverage.covered && coverage.fireAt ? (
                <p className='text-emerald-600 dark:text-emerald-400'>
                  {t('panel.meeting.covered', {
                    date: formatMoment(coverage.fireAt, locale)
                  })}
                </p>
              ) : (
                <p className='text-muted-foreground'>
                  {t(`coverageReason.${coverage.reason ?? 'not_included'}`)}
                </p>
              )}
            </section>
          ) : null}

          {next ? (
            <section className='rounded-xl border p-4'>
              <div className='flex items-center justify-between gap-2'>
                <h3 className='font-semibold'>{t('activated.next.title')}</h3>
              </div>
              <p className='mt-3 text-sm font-medium'>
                {t('activated.next.call', {
                  name: next.contactName ?? t('activated.next.contact')
                })}
              </p>
              <p className='text-muted-foreground text-sm'>
                {t('activated.next.detail', {
                  fire: formatMoment(next.fireAt, locale),
                  meeting: formatTime(next.meetingAt, locale)
                })}
              </p>
            </section>
          ) : (
            <section className='rounded-xl border p-4'>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <h3 className='font-semibold'>{t('activated.howTitle')}</h3>
                <span className='text-muted-foreground text-xs'>
                  {t('activated.next.none')}
                </span>
              </div>
              <ol className='mt-3 divide-y'>
                {(['1', '2', '3', '4'] as const).map((step) => (
                  <li key={step} className='flex gap-3 py-3'>
                    <span className='bg-muted flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold'>
                      {step}
                    </span>
                    <span>
                      <span className='block text-sm font-semibold'>
                        {t(`activated.steps.${step}.title`, { offset })}
                      </span>
                      <span className='text-muted-foreground block text-sm'>
                        {t(`activated.steps.${step}.text`)}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section className='rounded-xl border p-4'>
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <h3 className='font-semibold'>{t('activated.activeTitle')}</h3>
              <span className='text-muted-foreground text-xs'>
                {t('activated.activeHint')}
              </span>
            </div>
            <ul className='mt-3 divide-y'>
              {draft.capabilities.scheduling ? (
                <li className='flex gap-2.5 py-2.5'>
                  <CheckCircle2
                    aria-hidden
                    className='mt-0.5 size-4 shrink-0 text-emerald-500'
                  />
                  <span>
                    <span className='block text-sm font-semibold'>
                      {t('capabilities.scheduling.title')}
                    </span>
                    <span className='text-muted-foreground block text-sm'>
                      {t('activated.schedulingLine')}
                    </span>
                  </span>
                </li>
              ) : null}
              {draft.capabilities.reminders ? (
                <li className='flex gap-2.5 py-2.5'>
                  <CheckCircle2
                    aria-hidden
                    className='mt-0.5 size-4 shrink-0 text-emerald-500'
                  />
                  <span>
                    <span className='block text-sm font-semibold'>
                      {t('capabilities.reminders.title')}
                    </span>
                    <span className='text-muted-foreground block text-sm'>
                      {t('activated.remindersLine', { offset, ...hours })}
                    </span>
                  </span>
                </li>
              ) : null}
            </ul>
            <dl className='mt-3 grid gap-2 sm:grid-cols-3'>
              <Fact
                label={t('activated.callsFrom')}
                value={
                  rows.number.selected
                    ? formatForDisplay(rows.number.selected.phoneNumber)
                    : '—'
                }
                mono
              />
              <Fact
                label={t('activated.booksIn')}
                value={rows.calendar.selected?.name ?? '—'}
              />
              <Fact
                label={t('activated.responsible')}
                value={
                  rows.responsible.kind === 'owner'
                    ? t('activated.you')
                    : t('rows.responsible.caller')
                }
              />
            </dl>
          </section>
        </div>

        <aside className='space-y-3'>
          <section className='rounded-xl border p-4'>
            <h3 className='font-semibold'>{t('activated.usageTitle')}</h3>
            <div className='mt-3 flex gap-2.5'>
              <Zap
                aria-hidden
                className='mt-0.5 size-4 shrink-0 text-amber-500'
              />
              <p className='text-sm'>{t('activated.usageText')}</p>
            </div>
            {balance.visible && balance.amount !== null ? (
              <>
                <div className='mt-3 flex items-center justify-between border-t pt-3 text-sm'>
                  <span className='text-muted-foreground'>
                    {t(`panel.balanceLabel.${review.workspaceType}`)}
                  </span>
                  <span className='font-semibold tabular-nums'>
                    {formatUsd(balance.amount, locale)}
                  </span>
                </div>
                <CreditPopover fetch={false} entryPoint='follow_up_review'>
                  <Button variant='outline' className='mt-3 w-full'>
                    {t('activated.topUp')}
                  </Button>
                </CreditPopover>
              </>
            ) : null}
          </section>
        </aside>
      </div>
    </div>
  );
}

function Fact({
  label,
  value,
  mono = false
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className='bg-muted/40 rounded-lg p-3'>
      <dt className='text-muted-foreground text-xs'>{label}</dt>
      <dd className={cn('mt-0.5 text-sm font-semibold', mono && 'font-mono')}>
        {value}
      </dd>
    </div>
  );
}
