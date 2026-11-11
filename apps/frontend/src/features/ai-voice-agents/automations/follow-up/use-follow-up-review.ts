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
  const [review, setReviewState] = useState<FollowUpReview | null>(null);
  const [status, setStatus] = useState<ReviewStatus>('loading');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [adopting, setAdopting] = useState(false);
  const [coverage, setCoverage] = useState<FollowUpMeetingCoverage | null>(
    null
  );
  const timeZone = useRef(browserTimeZone()).current;
  const meetingId = input.meetingId;
  // Which load the screen is waiting for: every load takes a new one, and an
  // answer meant for an earlier one — another meeting's, or one a newer load
  // replaced — is dropped, so Activate never acts on a review not on screen.
  const generation = useRef(0);
  // The review on screen, readable after an await, where state is stale.
  const reviewRef = useRef<FollowUpReview | null>(null);
  // The save still on its way. Saves run one after another and adoption waits
  // for them, so each uses the revision the previous one produced.
  const pendingSave = useRef<Promise<unknown> | null>(null);

  const setReview = useCallback((next: FollowUpReview | null) => {
    reviewRef.current = next;
    setReviewState(next);
  }, []);

  const load = useCallback(
    async (quiet = false) => {
      const request = ++generation.current;
      if (!quiet) setStatus('loading');
      try {
        const next = await api.followUpReview({ meetingId, timeZone });
        if (request !== generation.current) return null;
        setReview(next);
        setStatus('ready');
        return next;
      } catch (error) {
        if (request !== generation.current) return null;
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
    [api, captureException, meetingId, setReview, timeZone]
  );

  useEffect(() => {
    // Another meeting is another review: the previous one — and its
    // meeting's coverage — is neither shown nor activated while this loads.
    setReview(null);
    setCoverage(null);
    void load();
  }, [load, setReview]);

  /**
   * Saves the rows that changed; the server merges them over what was
   * saved. A stale revision (another window saved first) reloads.
   */
  const save = useCallback(
    async (changes: Partial<FollowUpDraft>) => {
      const previous = pendingSave.current;
      const run = (async () => {
        if (previous) await previous.catch(() => undefined);
        const current = reviewRef.current;
        if (!current) return { ok: false as const, conflict: false };
        const request = generation.current;
        setSaving(true);
        try {
          const next = await api.saveFollowUp({
            draft: changes,
            expectedRevision: current.activation.revision,
            ...(input.entrySource ? { entrySource: input.entrySource } : {}),
            ...(timeZone ? { timeZone } : {}),
            ...(meetingId ? { meetingId } : {})
          });
          if (request === generation.current) setReview(next);
          setSavedAt(new Date());
          return { ok: true as const, conflict: false };
        } catch (error) {
          const conflict = error instanceof ApiError && error.status === 409;
          if (conflict) await load(true);
          return { ok: false as const, conflict, error };
        } finally {
          setSaving(false);
        }
      })();
      pendingSave.current = run;
      try {
        return await run;
      } finally {
        if (pendingSave.current === run) pendingSave.current = null;
      }
    },
    [api, input.entrySource, load, meetingId, setReview, timeZone]
  );

  /** "Activate automatic follow-up". One request key per click. */
  const adopt = useCallback(
    async (options: { includeMeeting: boolean }) => {
      setAdopting(true);
      const requestKey = crypto.randomUUID();
      try {
        // A save still on its way is part of what the person activates.
        if (pendingSave.current) {
          await pendingSave.current.catch(() => undefined);
        }
        const current = reviewRef.current;
        if (!current) return { ok: false as const };
        const request = generation.current;
        const result = await api.adoptFollowUp({
          requestKey,
          expectedRevision: current.activation.revision,
          draft: {
            includeMeetingId:
              options.includeMeeting && current.sourceMeeting
                ? current.sourceMeeting.id
                : null
          },
          ...(input.entrySource ? { entrySource: input.entrySource } : {}),
          ...(timeZone ? { timeZone } : {}),
          language: locale,
          ...(options.includeMeeting && current.sourceMeeting
            ? { meetingVersion: current.sourceMeeting.version }
            : {})
        });
        if (request === generation.current) {
          setReview(result.review);
          setCoverage(result.meetingCoverage);
        }
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
        // Whatever failed, the screen reads the review again: the server
        // reserves a new revision before it applies anything, and a request
        // that never answered may have been applied.
        await load(true);
        return { ok: false as const, error };
      } finally {
        setAdopting(false);
      }
    },
    [
      api,
      captureException,
      input.entrySource,
      load,
      locale,
      setReview,
      timeZone
    ]
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
