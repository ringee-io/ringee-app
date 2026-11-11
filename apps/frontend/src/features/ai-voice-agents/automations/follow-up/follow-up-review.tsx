'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ArrowLeft, Check, RotateCw } from 'lucide-react';
import { useAnalytics } from '@ringee/frontend-shared/hooks/use.analytics';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { describeApiError } from '@ringee/frontend-shared/lib/api-error';
import { useVoiceAgentsRail } from '../store';
import type { FollowUpEntrySource, FollowUpRowKey } from '../types';
import { ActivatedView } from './activated-view';
import { ActivationPanel } from './activation-panel';
import { AiCapabilities } from './ai-capabilities';
import { ConfigRows } from './config-rows';
import { readFollowUpReturn, type FollowUpReturn } from './entry';
import { formatTime } from './format';
import { useFollowUpReview } from './use-follow-up-review';

const ENTRY_SOURCES: FollowUpEntrySource[] = [
  'first_list',
  'interested_outcome',
  'meeting_booked',
  'ai_voice_agents_navigation'
];

/**
 * The shared "Automatic follow-up" screen (Stage 4C) — the same for a
 * freelancer and an organization, reached from the first list, an Interested
 * outcome, a booked meeting and the AI Voice Agents navigation. Opening it
 * changes nothing; saving rows is "configuration saved"; only "Activate"
 * authorizes Ringee to call. The active call stays mounted throughout: this
 * is a dashboard page, and the call lives in the dashboard shell.
 */
export function FollowUpReviewScreen() {
  const t = useTranslations('aiVoiceAgents.followUp');
  const locale = useLocale();
  const params = useSearchParams();
  const { capture } = useAnalytics();
  const fromParam = params.get('from');
  const entrySource = ENTRY_SOURCES.includes(fromParam as FollowUpEntrySource)
    ? (fromParam as FollowUpEntrySource)
    : null;
  const meetingId = params.get('meetingId');
  const { review, status, load, save, savedAt, adopt, adopting, coverage } =
    useFollowUpReview({ meetingId, entrySource });
  const [openRow, setOpenRow] = useState<FollowUpRowKey | null>(null);
  const [editing, setEditing] = useState(false);
  const [includeMeeting, setIncludeMeeting] = useState(true);
  const [returnTo, setReturnTo] = useState<FollowUpReturn | null>(null);
  const opened = useRef(false);

  // One auxiliary surface at a time: the rail closes when its review opens.
  useEffect(() => {
    useVoiceAgentsRail.getState().setOpen(false);
    setReturnTo(readFollowUpReturn());
  }, []);

  useEffect(() => {
    if (!review || opened.current) return;
    opened.current = true;
    capture('followup_review_opened', {
      entry_source: entrySource ?? review.activation.entrySource,
      follow_up_state: review.state,
      has_source_meeting: Boolean(review.sourceMeeting),
      can_configure: review.canConfigure,
      missing_requirements: review.requirements.map((item) => item.code)
    });
    for (const requirement of review.requirements) {
      capture('readiness_blocker_shown', {
        blocker: requirement.code,
        surface: 'follow_up_review'
      });
    }
  }, [capture, entrySource, review]);

  const saveRow: typeof save = async (changes) => {
    const result = await save(changes);
    if (result.ok) toast.success(t('toast.saved'));
    else if (result.conflict) toast.info(t('toast.conflict'));
    else toast.error(describeApiError(result.error, t('toast.saveFailed')));
    return result;
  };

  const activate = async () => {
    if (!review) return;
    capture('followup_activation_clicked', {
      entry_source: entrySource ?? review.activation.entrySource,
      include_meeting: Boolean(review.sourceMeeting?.eligible && includeMeeting)
    });
    const result = await adopt({
      includeMeeting: Boolean(review.sourceMeeting?.eligible && includeMeeting)
    });
    if (result.ok) {
      setEditing(false);
      toast.success(t('toast.activated'));
    } else {
      capture('followup_activation_failed', {
        entry_source: entrySource ?? review.activation.entrySource,
        error_code:
          (result as { error?: { status?: number } }).error?.status !==
          undefined
            ? `http_${(result as { error: { status: number } }).error.status}`
            : 'unknown'
      });
      toast.error(
        describeApiError(
          (result as { error?: unknown }).error,
          t('toast.activateFailed')
        )
      );
    }
  };

  if (status === 'loading' && !review) {
    return (
      <div className='w-full space-y-4' aria-busy>
        <Skeleton className='h-8 w-72' />
        <Skeleton className='h-4 w-96' />
        <div className='grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]'>
          <Skeleton className='h-[32rem]' />
          <Skeleton className='h-96' />
        </div>
      </div>
    );
  }

  if (status === 'error' || !review) {
    return (
      <div role='alert' className='w-full rounded-xl border p-6'>
        <p className='font-semibold'>{t('loadError')}</p>
        <Button variant='outline' className='mt-3' onClick={() => void load()}>
          <RotateCw aria-hidden />
          {t('retry')}
        </Button>
      </div>
    );
  }

  const adopted = review.activation.status === 'adopted';
  const showActivated =
    adopted &&
    !editing &&
    (review.state === 'active' ||
      review.state === 'pending' ||
      review.state === 'paused');

  return (
    <div className='w-full space-y-5'>
      {returnTo ? (
        <Link
          href={returnTo.path}
          className='text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm'
        >
          <ArrowLeft aria-hidden className='size-4' />
          {returnTo.label
            ? t('back', { name: returnTo.label })
            : t('backGeneric')}
        </Link>
      ) : null}

      <header className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
        <div className='min-w-0'>
          <h1 className='text-2xl font-bold tracking-tight'>{t('title')}</h1>
          <p className='mt-1 font-semibold'>{t('tagline')}</p>
          <p className='text-muted-foreground mt-0.5 text-sm'>
            {t('subtitle')}
          </p>
        </div>
        <div className='flex shrink-0 flex-col items-start gap-1.5 sm:items-end'>
          <Badge variant='secondary'>
            {t(`workspace.${review.workspaceType}`)}
          </Badge>
          {savedAt || review.activation.savedAt ? (
            <span className='text-muted-foreground inline-flex items-center gap-1 text-xs'>
              <Check aria-hidden className='size-3.5 text-emerald-500' />
              {savedAt
                ? t('savedJustNow')
                : t('saved', {
                    time: formatTime(review.activation.savedAt!, locale)
                  })}
            </span>
          ) : null}
        </div>
      </header>

      {!review.admitted ? (
        <div role='status' className='rounded-xl border p-5 text-sm'>
          <p className='font-semibold'>{t('notAdmitted.title')}</p>
          <p className='text-muted-foreground mt-1'>{t('notAdmitted.text')}</p>
        </div>
      ) : showActivated ? (
        <ActivatedView
          review={review}
          coverage={coverage}
          onEdit={() => setEditing(true)}
        />
      ) : (
        <div className='grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]'>
          <div className='min-w-0 space-y-5'>
            <section
              aria-labelledby='follow-up-config'
              className='rounded-2xl border'
            >
              <SectionHeader
                id='follow-up-config'
                step={1}
                title={t('sections.config.title')}
                hint={t('sections.config.hint')}
              />
              <ConfigRows
                review={review}
                save={saveRow}
                openRow={openRow}
                onOpenRowChange={setOpenRow}
                entrySource={entrySource}
              />
            </section>
            <section
              aria-labelledby='follow-up-ai'
              className='rounded-2xl border'
            >
              <SectionHeader
                id='follow-up-ai'
                step={2}
                title={t('sections.ai.title')}
                hint={t('sections.ai.hint')}
                badge={adopted ? null : t('sections.ai.proposed')}
              />
              <div className='p-4 sm:p-5'>
                <AiCapabilities review={review} save={saveRow} />
              </div>
            </section>
          </div>
          <section
            aria-labelledby='follow-up-activation'
            className='rounded-2xl border p-4 lg:sticky lg:top-4'
          >
            <h2
              id='follow-up-activation'
              className='mb-3 flex items-center gap-2 text-lg font-semibold'
            >
              <StepNumber step={3} />
              {t('sections.activation.title')}
            </h2>
            <ActivationPanel
              review={review}
              returnTo={returnTo}
              includeMeeting={includeMeeting}
              onIncludeMeetingChange={setIncludeMeeting}
              onOpenRow={(row) => {
                setOpenRow(row);
                document
                  .getElementById(`follow-up-row-${row}`)
                  ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
                capture('readiness_recovery_started', {
                  blocker:
                    review.requirements.find((item) =>
                      row === 'number'
                        ? item.row === 'number'
                        : item.row === 'calendar'
                    )?.code ?? row,
                  action: 'open_row',
                  surface: 'follow_up_review'
                });
              }}
              onActivate={() => void activate()}
              activating={adopting}
            />
          </section>
        </div>
      )}
    </div>
  );
}

function StepNumber({ step }: { step: number }) {
  return (
    <span
      aria-hidden
      className='bg-muted flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold'
    >
      {step}
    </span>
  );
}

function SectionHeader({
  id,
  step,
  title,
  hint,
  badge = null
}: {
  id: string;
  step: number;
  title: string;
  hint: string;
  badge?: string | null;
}) {
  return (
    <div className='border-b px-4 py-4 sm:px-5'>
      <h2
        id={id}
        className='flex flex-wrap items-center gap-2 text-lg font-semibold'
      >
        <StepNumber step={step} />
        {title}
        {badge ? (
          <Badge
            variant='outline'
            className='border-sky-500/40 text-sky-600 dark:text-sky-400'
          >
            {badge}
          </Badge>
        ) : null}
      </h2>
      <p className='text-muted-foreground mt-1 text-sm sm:pl-8'>{hint}</p>
    </div>
  );
}
