'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Zap } from 'lucide-react';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Progress } from '@ringee/frontend-shared/components/ui/progress';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { CreditPopover } from '@/features/credit/components/credit.popover';
import type {
  FollowUpRequirementCode,
  FollowUpReview,
  FollowUpRowKey
} from '../types';
import type { FollowUpReturn } from './entry';
import { formatMoment, formatUsd } from './format';

const ROW_OF: Partial<Record<FollowUpRequirementCode, FollowUpRowKey>> = {
  get_number: 'number',
  choose_number: 'number',
  number_pending: 'number',
  set_availability: 'calendar'
};

/**
 * "3 · Activation and usage": manual calling and AI follow-up as two separate
 * readiness blocks — manual calling can be ready while automatic follow-up is
 * still pending — the consumption explanation and balance right above the one
 * action that matters now. Everything shown comes from the server's review.
 */
export function ActivationPanel({
  review,
  returnTo,
  includeMeeting,
  onIncludeMeetingChange,
  onOpenRow,
  onActivate,
  activating
}: {
  review: FollowUpReview;
  returnTo: FollowUpReturn | null;
  includeMeeting: boolean;
  onIncludeMeetingChange: (include: boolean) => void;
  onOpenRow: (row: FollowUpRowKey) => void;
  onActivate: () => void;
  activating: boolean;
}) {
  const t = useTranslations('aiVoiceAgents.followUp');
  const locale = useLocale();
  const {
    state,
    requirements,
    progress,
    balance,
    manualCalling,
    canConfigure
  } = review;
  const configuration = requirements.filter(
    (item) => item.code !== 'add_credit'
  );
  const first = configuration[0] ?? null;
  const fixAgent = first?.code === 'fix_agent';

  const primary = (() => {
    if (!canConfigure) return null;
    if (first) {
      if (fixAgent) {
        return (
          <Button asChild size='lg' className='w-full'>
            <Link href='/dashboard/ai-voice-agents'>
              {t('panel.requirementAction.fix_agent')}
            </Link>
          </Button>
        );
      }
      if (first.code === 'get_number') {
        return (
          <Button asChild size='lg' className='w-full'>
            <Link href='/dashboard/buy-number?tab=buy'>
              {t('panel.requirementAction.get_number')}
            </Link>
          </Button>
        );
      }
      return (
        <Button
          size='lg'
          className='w-full'
          onClick={() => {
            const row = ROW_OF[first.code];
            if (row) onOpenRow(row);
          }}
        >
          {t(`panel.requirementAction.${first.code}`)}
        </Button>
      );
    }
    if (state === 'add_credit') {
      return (
        <CreditPopover fetch={false} entryPoint='follow_up_review'>
          <Button
            size='lg'
            className='w-full bg-emerald-600 text-white hover:bg-emerald-700'
          >
            {t('panel.addCredit')}
          </Button>
        </CreditPopover>
      );
    }
    if (state === 'ready_to_activate' || state === 'pending') {
      return (
        <Button
          size='lg'
          className='w-full bg-emerald-600 text-white hover:bg-emerald-700'
          disabled={activating}
          onClick={onActivate}
        >
          {activating ? t('panel.activating') : t('panel.activate')}
        </Button>
      );
    }
    return null;
  })();

  return (
    <div className='space-y-3'>
      {/* Manual calling — independent of the AI follow-up below. */}
      <section className='rounded-xl border p-4'>
        <div className='flex items-center justify-between gap-2'>
          <h4 className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
            {t('panel.calls.title')}
          </h4>
          <Badge
            variant='outline'
            className={cn(
              manualCalling.ready
                ? 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
                : 'border-amber-500/40 text-amber-600 dark:text-amber-400'
            )}
          >
            {manualCalling.ready
              ? t('panel.calls.ready')
              : manualCalling.reason === 'no_credit'
                ? t('panel.calls.noCredit')
                : t('panel.calls.noLine')}
          </Badge>
        </div>
        <p className='mt-2 text-sm'>
          {manualCalling.line === 'shared_number'
            ? t('panel.calls.shared')
            : manualCalling.line === 'own_number'
              ? t('panel.calls.own')
              : t('panel.calls.none')}
        </p>
        {returnTo ? (
          <Link
            href={returnTo.path}
            className='text-primary mt-2 inline-block text-sm font-medium underline-offset-2 hover:underline'
          >
            {returnTo.label
              ? t('back', { name: returnTo.label })
              : t('backGeneric')}
          </Link>
        ) : null}
      </section>

      {/* Automatic follow-up */}
      <section className='rounded-xl border p-4'>
        <div className='flex items-center justify-between gap-2'>
          <h4 className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
            {t('panel.ai.title')}
          </h4>
          <Badge variant='outline' className={stateTone(state)}>
            {t(`panel.state.${state}`)}
          </Badge>
        </div>
        <div className='mt-3 flex items-center justify-between text-sm'>
          <span className='text-muted-foreground'>
            {t('panel.ai.configLabel')}
          </span>
          <span className='font-semibold tabular-nums'>
            {t('panel.ai.progress', {
              done: progress.done,
              total: progress.total
            })}
          </span>
        </div>
        <Progress
          value={(progress.done / Math.max(progress.total, 1)) * 100}
          className='mt-2 h-1.5'
        />
        <p className='mt-3 text-sm'>
          {configuration.length
            ? t('panel.missing', { count: configuration.length })
            : state === 'add_credit'
              ? t('panel.creditTitle')
              : state === 'paused'
                ? t('panel.pausedText')
                : t('panel.readyText')}
        </p>
        {configuration.length ? (
          <ul className='mt-2 space-y-1.5'>
            {configuration.map((item) => (
              <li key={item.code}>
                <button
                  type='button'
                  disabled={!canConfigure || !ROW_OF[item.code]}
                  onClick={() => {
                    const row = ROW_OF[item.code];
                    if (row) onOpenRow(row);
                  }}
                  className='w-full rounded-md border-l-2 border-amber-500 bg-amber-500/10 px-3 py-1.5 text-left text-sm font-medium disabled:cursor-default'
                >
                  {t(`panel.requirement.${item.code}`)}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {state === 'add_credit' && balance.amount !== null ? (
          <p className='text-muted-foreground mt-2 text-xs'>
            {t('panel.creditText', {
              balance: formatUsd(balance.amount, locale)
            })}
          </p>
        ) : null}
        {configuration.length ? (
          <p className='text-muted-foreground mt-3 text-xs'>
            {t('panel.keepCalling')}
          </p>
        ) : null}
      </section>

      {/* The meeting the review was opened from */}
      {review.sourceMeeting ? (
        <section className='rounded-xl border p-4'>
          <h4 className='text-sm font-semibold'>{t('panel.meeting.title')}</h4>
          <p className='text-muted-foreground mt-1 text-sm'>
            {[
              review.sourceMeeting.contactName,
              formatMoment(review.sourceMeeting.scheduledAt, locale)
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {review.sourceMeeting.coverage.covered &&
          review.sourceMeeting.coverage.fireAt ? (
            <p className='mt-2 text-sm text-emerald-600 dark:text-emerald-400'>
              {t('panel.meeting.covered', {
                date: formatMoment(review.sourceMeeting.coverage.fireAt, locale)
              })}
            </p>
          ) : review.sourceMeeting.eligible ? (
            <label className='mt-3 flex items-start gap-2 text-sm'>
              <input
                type='checkbox'
                className='mt-0.5'
                checked={includeMeeting}
                disabled={!canConfigure}
                onChange={(event) =>
                  onIncludeMeetingChange(event.target.checked)
                }
              />
              <span>
                <span className='font-medium'>
                  {t('panel.meeting.include')}
                </span>
                {review.sourceMeeting.plannedFireAt ? (
                  <span className='text-muted-foreground block text-xs'>
                    {t('panel.meeting.plannedAt', {
                      date: formatMoment(
                        review.sourceMeeting.plannedFireAt,
                        locale
                      )
                    })}
                  </span>
                ) : null}
              </span>
            </label>
          ) : (
            <p className='text-muted-foreground mt-2 text-xs'>
              {t(`meetingReason.${review.sourceMeeting.reason ?? 'not_found'}`)}
            </p>
          )}
        </section>
      ) : null}

      {/* Usage, balance and the one action */}
      <section className='bg-muted/30 rounded-xl border p-4'>
        <div className='flex gap-2.5'>
          <Zap aria-hidden className='mt-0.5 size-4 shrink-0 text-amber-500' />
          <p className='text-sm'>{t('panel.usage')}</p>
        </div>
        {balance.visible && balance.amount !== null ? (
          <div className='mt-3 flex items-center justify-between border-t pt-3 text-sm'>
            <span className='text-muted-foreground'>
              {t(`panel.balanceLabel.${review.workspaceType}`)}
            </span>
            <span className='font-semibold tabular-nums'>
              {formatUsd(balance.amount, locale)}
            </span>
          </div>
        ) : null}
      </section>

      {canConfigure ? (
        primary
      ) : (
        <section className='rounded-xl border border-dashed p-4 text-sm'>
          <p className='font-semibold'>{t('panel.memberTitle')}</p>
          {review.adminNames.length ? (
            <p className='text-muted-foreground mt-1'>
              {t('panel.memberAdmins', { names: review.adminNames.join(', ') })}
            </p>
          ) : null}
          <p className='text-muted-foreground mt-1'>{t('panel.memberCalls')}</p>
        </section>
      )}

      <p className='text-muted-foreground px-1 text-xs leading-relaxed'>
        {t('panel.footnote')}
      </p>
    </div>
  );
}

function stateTone(state: FollowUpReview['state']): string {
  switch (state) {
    case 'active':
    case 'ready_to_activate':
      return 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400';
    case 'paused':
      return 'text-muted-foreground';
    default:
      return 'border-amber-500/40 text-amber-600 dark:text-amber-400';
  }
}
