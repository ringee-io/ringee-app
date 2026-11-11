'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Cpu, X } from 'lucide-react';
import { useAnalytics } from '@ringee/frontend-shared/hooks/use.analytics';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { useAutomationApi } from '../api';
import { useVoiceAgentsRail } from '../store';
import type { FollowUpMeetingCoverage } from '../types';
import {
  followUpHref,
  rememberFollowUpReturn,
  useFollowUpInvitation
} from './entry';
import { formatMoment } from './format';

/** Outcomes that start the AI's follow-up when it is active (AGENT-021). */
const FOLLOW_UP_OUTCOMES = new Set([
  'interested',
  'follow_up',
  'callback_scheduled'
]);

/** Whether this workspace is admitted to automated follow-up at all. */
function admitted(): boolean {
  return useVoiceAgentsRail.getState().summary?.enabled === true;
}

/**
 * After the server accepted a human outcome (the outcome request resolved):
 * an Interested-like outcome offers the review — or, when follow-up already
 * runs, shows the objective the server accepted for that call.
 */
export function offerOutcomeInvitation(
  input: { callId?: string | null },
  accepted: unknown
): void {
  if (!admitted() || !input.callId) return;
  const result = (accepted ?? {}) as {
    outcome?: string | null;
    followUp?: {
      state: string;
      nextActionAt: string | null;
      reason: string | null;
    };
  };
  if (!result.outcome || !FOLLOW_UP_OUTCOMES.has(result.outcome)) return;
  const schedulingOn =
    useVoiceAgentsRail.getState().summary?.capabilities.scheduling === 'active';
  // Active but no objective: the outcome was not eligible; nothing to offer.
  if (schedulingOn && !result.followUp) return;
  useFollowUpInvitation.getState().offer({
    entrySource: 'interested_outcome',
    interactionKey: `call:${input.callId}`,
    callId: input.callId,
    meetingId: null,
    objective: result.followUp
      ? {
          state: result.followUp.state,
          nextActionAt: result.followUp.nextActionAt,
          reason: result.followUp.reason
        }
      : null
  });
}

/** After a meeting was persisted (its id came back from the server). */
export function offerMeetingInvitation(input: {
  meetingId: string | null | undefined;
  callId?: string | null;
}): void {
  if (!admitted() || !input.meetingId) return;
  useFollowUpInvitation.getState().offer({
    entrySource: 'meeting_booked',
    interactionKey: `meeting:${input.meetingId}`,
    callId: input.callId ?? null,
    meetingId: input.meetingId,
    objective: null
  });
}

/**
 * The one discreet follow-up invitation (Bitácora "marcador · invitación"):
 * dismissible, never in the way of the wrap-up or the next call. When the
 * capability already runs it shows what the server accepted instead — a
 * confirmation is claimed only once the scheduler planned it.
 */
export function FollowUpInvitationCard() {
  const t = useTranslations('aiVoiceAgents.followUp.invitation');
  const tReason = useTranslations('aiVoiceAgents.followUp');
  const locale = useLocale();
  const pathname = usePathname();
  const api = useAutomationApi();
  const { capture } = useAnalytics();
  const invitation = useFollowUpInvitation((state) => state.invitation);
  const dismiss = useFollowUpInvitation((state) => state.dismiss);
  const remindersOn = useVoiceAgentsRail(
    (state) => state.summary?.capabilities.reminders === 'active'
  );
  const [coverage, setCoverage] = useState<FollowUpMeetingCoverage | null>(
    null
  );
  // A coverage that could not be read is said as unknown, with a retry —
  // never as covered, and never by hiding the invitation.
  const [coverageFailed, setCoverageFailed] = useState(false);
  const [coverageAttempt, setCoverageAttempt] = useState(0);
  const shown = useRef<string | null>(null);

  const meetingId = invitation?.meetingId ?? null;
  useEffect(() => {
    setCoverage(null);
    setCoverageFailed(false);
    if (!meetingId || !remindersOn) return;
    let active = true;
    api
      .followUpMeetingCoverage(meetingId)
      .then((value) => {
        if (active) setCoverage(value);
      })
      .catch(() => {
        if (active) setCoverageFailed(true);
      });
    return () => {
      active = false;
    };
  }, [api, meetingId, remindersOn, coverageAttempt]);

  const state = !invitation
    ? null
    : invitation.objective
      ? 'objective'
      : invitation.entrySource === 'meeting_booked' && remindersOn
        ? 'coverage'
        : 'invite';

  useEffect(() => {
    if (!invitation || !state || shown.current === invitation.interactionKey) {
      return;
    }
    shown.current = invitation.interactionKey;
    capture('followup_invitation_shown', {
      entry_source: invitation.entrySource,
      follow_up_state: state
    });
  }, [capture, invitation, state]);

  if (!invitation || !state) return null;
  // Still asking: the answer is a moment away.
  if (state === 'coverage' && !coverage && !coverageFailed) return null;

  const meeting = invitation.entrySource === 'meeting_booked';
  const href = followUpHref({
    from: invitation.entrySource,
    meetingId: invitation.meetingId
  });

  return (
    <div
      role='status'
      className='flex items-start gap-3 rounded-xl border border-sky-500/30 bg-sky-500/[0.05] p-4'
    >
      <span className='flex size-9 shrink-0 items-center justify-center rounded-lg bg-sky-500/15 text-sky-500'>
        <Cpu aria-hidden className='size-4' />
      </span>
      <div className='min-w-0 flex-1'>
        {state === 'invite' ? (
          <>
            <p className='text-sm font-semibold'>
              {meeting ? t('meeting.title') : t('interested.title')}
            </p>
            <p className='text-muted-foreground mt-0.5 text-sm'>
              {meeting ? t('meeting.text') : t('interested.text')}
            </p>
          </>
        ) : state === 'objective' && invitation.objective ? (
          <p className='text-sm'>
            {invitation.objective.state === 'blocked'
              ? t('objective.blocked', {
                  reason: tReason(
                    `objectiveReason.${invitation.objective.reason ?? 'unknown'}`
                  )
                })
              : invitation.objective.nextActionAt
                ? t('objective.scheduled', {
                    date: formatMoment(
                      invitation.objective.nextActionAt,
                      locale
                    )
                  })
                : t('objective.accepted')}
          </p>
        ) : coverage?.covered && coverage.fireAt ? (
          <p className='text-sm'>
            {t('coverage.covered', {
              date: formatMoment(coverage.fireAt, locale)
            })}
          </p>
        ) : coverageFailed ? (
          <p className='text-sm'>
            {t('coverage.unknown')}{' '}
            <button
              type='button'
              className='text-primary font-medium underline-offset-2 hover:underline'
              onClick={() => setCoverageAttempt((attempt) => attempt + 1)}
            >
              {tReason('retry')}
            </button>
          </p>
        ) : (
          <p className='text-sm'>
            {t('coverage.notCovered', {
              reason: tReason(
                `coverageReason.${coverage?.reason ?? 'not_included'}`
              )
            })}
          </p>
        )}
      </div>
      <div className='flex shrink-0 items-center gap-1'>
        <Button asChild size='sm' variant='outline'>
          <Link
            href={href}
            onClick={() =>
              rememberFollowUpReturn({
                path: pathname ?? '/dashboard/call',
                label: null
              })
            }
          >
            {state === 'invite'
              ? meeting
                ? t('meeting.cta')
                : t('interested.cta')
              : t('see')}
          </Link>
        </Button>
        <Button
          size='icon'
          variant='ghost'
          aria-label={t('dismiss')}
          onClick={() => {
            capture('followup_invitation_dismissed', {
              entry_source: invitation.entrySource
            });
            dismiss();
          }}
        >
          <X aria-hidden className='size-4' />
        </Button>
      </div>
    </div>
  );
}
