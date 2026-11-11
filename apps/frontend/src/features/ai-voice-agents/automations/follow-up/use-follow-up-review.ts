'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale } from 'next-intl';
import { ApiError } from '@ringee/frontend-shared/lib/api';
import { useAnalytics } from '@ringee/frontend-shared/hooks/use.analytics';
import { useAutomationApi } from '../api';
import type {
  FollowUpDraft,
  FollowUpEntrySource,
  FollowUpMeetingCoverage,
  FollowUpReview
} from '../types';
import { browserTimeZone } from './format';

export type ReviewStatus = 'loading' | 'ready' | 'error';

/**
 * The review's data: the server's review (state, rows, requirements, money),
 * saved by parts, and the explicit adoption. Every state the screen shows
 * comes from the server; nothing here decides readiness.
 */
export function useFollowUpReview(input: {
  meetingId: string | null;
  entrySource: FollowUpEntrySource | null;
}) {
  const api = useAutomationApi();
  const locale = useLocale();
  const { captureException } = useAnalytics();
  const [review, setReview] = useState<FollowUpReview | null>(null);
  const [status, setStatus] = useState<ReviewStatus>('loading');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [adopting, setAdopting] = useState(false);
  const [coverage, setCoverage] = useState<FollowUpMeetingCoverage | null>(
    null
  );
  const timeZone = useRef(browserTimeZone()).current;
  const meetingId = input.meetingId;

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setStatus('loading');
      try {
        const next = await api.followUpReview({ meetingId, timeZone });
        setReview(next);
        setStatus('ready');
        return next;
      } catch (error) {
        if (!(error instanceof ApiError) || error.status >= 500) {
          captureException(error, {
            component: 'FollowUpReview',
            operation: 'follow_up.review',
            journeyStep: 'follow_up_activation'
          });
        }
        if (!quiet) setStatus('error');
        return null;
      }
    },
    [api, captureException, meetingId, timeZone]
  );

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Saves the rows that changed; the server merges them over what was
   * saved. A stale revision (another window saved first) reloads.
   */
  const save = useCallback(
    async (changes: Partial<FollowUpDraft>) => {
      if (!review) return { ok: false as const, conflict: false };
      setSaving(true);
      try {
        const next = await api.saveFollowUp({
          draft: changes,
          expectedRevision: review.activation.revision,
          ...(input.entrySource ? { entrySource: input.entrySource } : {}),
          ...(timeZone ? { timeZone } : {}),
          ...(meetingId ? { meetingId } : {})
        });
        setReview(next);
        setSavedAt(new Date());
        return { ok: true as const, conflict: false };
      } catch (error) {
        const conflict = error instanceof ApiError && error.status === 409;
        if (conflict) await load(true);
        return { ok: false as const, conflict, error };
      } finally {
        setSaving(false);
      }
    },
    [api, input.entrySource, load, meetingId, review, timeZone]
  );

  /** "Activate automatic follow-up". One request key per click. */
  const adopt = useCallback(
    async (options: { includeMeeting: boolean }) => {
      if (!review) return { ok: false as const };
      setAdopting(true);
      const requestKey = crypto.randomUUID();
      try {
        const result = await api.adoptFollowUp({
          requestKey,
          expectedRevision: review.activation.revision,
          draft: {
            includeMeetingId:
              options.includeMeeting && review.sourceMeeting
                ? review.sourceMeeting.id
                : null
          },
          ...(input.entrySource ? { entrySource: input.entrySource } : {}),
          ...(timeZone ? { timeZone } : {}),
          language: locale,
          ...(options.includeMeeting && review.sourceMeeting
            ? { meetingVersion: review.sourceMeeting.version }
            : {})
        });
        setReview(result.review);
        setCoverage(result.meetingCoverage);
        setSavedAt(new Date());
        return { ok: true as const };
      } catch (error) {
        const expected =
          error instanceof ApiError &&
          error.status >= 400 &&
          error.status < 500;
        if (!expected) {
          captureException(error, {
            component: 'FollowUpReview',
            operation: 'follow_up.adopt',
            journeyStep: 'follow_up_activation'
          });
        }
        if (error instanceof ApiError && error.status === 409) await load(true);
        return { ok: false as const, error };
      } finally {
        setAdopting(false);
      }
    },
    [api, captureException, input.entrySource, load, locale, review, timeZone]
  );

  return {
    review,
    status,
    load,
    save,
    saving,
    savedAt,
    adopt,
    adopting,
    coverage
  };
}
