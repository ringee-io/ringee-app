'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Sparkles, X } from 'lucide-react';
import { useAnalytics } from '@ringee/frontend-shared/hooks/use.analytics';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { useTelnyxStore } from '@/features/calls/store/telnyx.store';
import { useAutomationApi } from '../api';
import { useVoiceAgentsRail } from '../store';
import type { FollowUpResultSummary } from '../types';
import { formatMoment, formatUsd } from './format';

const SEEN_KEY = 'ringee.followUp.resultSeen';
/** At most one summary a day: routine results are not news. */
const QUIET_MS = 24 * 60 * 60_000;

function lastSeen(): { id: string; at: number } | null {
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    return raw ? (JSON.parse(raw) as { id: string; at: number }) : null;
  } catch {
    return null;
  }
}

function markSeen(id: string) {
  try {
    window.localStorage.setItem(
      SEEN_KEY,
      JSON.stringify({ id, at: Date.now() })
    );
  } catch {
    // Without storage the card can come back on the next visit; harmless.
  }
}

/**
 * The compact first-value summary (Stage 4C §11): the newest verified AI
 * result from Ringee's own records — what happened, a link to its history,
 * what it cost (settled or still pending) and one next action. Hidden during
 * a call, shown at most once a day and once per result.
 */
export function FirstResultCard() {
  const t = useTranslations('aiVoiceAgents.followUp.result');
  const locale = useLocale();
  const api = useAutomationApi();
  const { capture } = useAnalytics();
  const enabled = useVoiceAgentsRail(
    (state) => state.summary?.enabled === true
  );
  const onCall = useTelnyxStore((state) => Boolean(state.activeCall));
  const [summary, setSummary] = useState<FollowUpResultSummary | null>(null);
  const [hidden, setHidden] = useState(false);
  const viewed = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    api
      .followUpResults()
      .then((value) => {
        if (active) setSummary(value);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [api, enabled]);

  const result = summary?.results[0] ?? null;
  const seen = typeof window === 'undefined' ? null : lastSeen();
  const quiet =
    !result ||
    (seen !== null &&
      (seen.id === result.id || Date.now() - seen.at < QUIET_MS));

  useEffect(() => {
    if (!result || quiet || hidden || onCall || viewed.current === result.id)
      return;
    viewed.current = result.id;
    capture('followup_value_summary_viewed', {
      result_kind: result.kind,
      first_result: summary?.firstSinceAdoption ?? false,
      settled: result.consumption.settled
    });
  }, [capture, hidden, onCall, quiet, result, summary]);

  if (!result || quiet || hidden || onCall) return null;

  const cost =
    (result.consumption.voiceUsd ?? 0) + (result.consumption.aiUsd ?? 0);
  const close = () => {
    markSeen(result.id);
    setHidden(true);
  };

  return (
    <section
      aria-label={t('label')}
      className='rounded-xl border border-emerald-500/30 bg-emerald-500/[0.05] p-4'
    >
      <div className='flex items-start gap-3'>
        <Sparkles
          aria-hidden
          className='mt-0.5 size-4 shrink-0 text-emerald-500'
        />
        <div className='min-w-0 flex-1'>
          <p className='text-xs font-semibold tracking-wide text-emerald-700 uppercase dark:text-emerald-300'>
            {summary?.firstSinceAdoption ? t('firstTitle') : t('title')}
          </p>
          <p className='mt-1 text-sm font-semibold'>
            {t(`kind.${knownKind(result.kind)}`, {
              name: result.contactName ?? t('someone'),
              date: formatMoment(result.meetingAt, locale)
            })}
          </p>
          <p className='text-muted-foreground mt-1 text-xs'>
            {result.consumption.settled
              ? t('cost', { amount: formatUsd(cost, locale) })
              : t('costPending')}
          </p>
          <div className='mt-3 flex flex-wrap gap-2'>
            <Button asChild size='sm' variant='outline'>
              <Link
                href='/dashboard/meetings'
                onClick={() => {
                  capture('followup_value_summary_action', {
                    action: 'view_meeting'
                  });
                  close();
                }}
              >
                {t('viewMeeting')}
              </Link>
            </Button>
            <Button
              size='sm'
              variant='ghost'
              onClick={() => {
                capture('followup_value_summary_action', {
                  action: 'continue_prospecting'
                });
                close();
              }}
            >
              {t('continue')}
            </Button>
          </div>
        </div>
        <Button
          size='icon'
          variant='ghost'
          aria-label={t('dismiss')}
          onClick={close}
        >
          <X aria-hidden className='size-4' />
        </Button>
      </div>
    </section>
  );
}

function knownKind(kind: string): string {
  return ['booked', 'attendance_confirmed', 'rescheduled', 'replaced'].includes(
    kind
  )
    ? kind
    : 'other';
}
