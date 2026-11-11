'use client';

import { create } from 'zustand';
import type { FollowUpEntrySource } from '../types';

export const FOLLOW_UP_PATH = '/dashboard/ai-voice-agents/follow-up';

const RETURN_KEY = 'ringee.followUp.return';
const DISMISSED_KEY = 'ringee.followUp.dismissed';

/** Where "Back" goes from the review, and what it says. */
export interface FollowUpReturn {
  path: string;
  /** The person or list the user was about to call, when there is one. */
  label: string | null;
}

/** The review's URL for an entry point; the meeting travels by id only. */
export function followUpHref(input: {
  from: FollowUpEntrySource;
  meetingId?: string | null;
}): string {
  const params = new URLSearchParams({ from: input.from });
  if (input.meetingId) params.set('meetingId', input.meetingId);
  return `${FOLLOW_UP_PATH}?${params.toString()}`;
}

/**
 * Remembers where the review was opened from, for its "Back" link. The Call
 * page keeps its selected list on its own (per workspace), so returning finds
 * the same list and the same next person. Per tab; storage may be blocked.
 */
export function rememberFollowUpReturn(value: FollowUpReturn): void {
  try {
    window.sessionStorage.setItem(RETURN_KEY, JSON.stringify(value));
  } catch {
    // Without storage the review simply has no "Back" link.
  }
}

export function readFollowUpReturn(): FollowUpReturn | null {
  try {
    const raw = window.sessionStorage.getItem(RETURN_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<FollowUpReturn>;
    return typeof value.path === 'string' && value.path.startsWith('/dashboard')
      ? { path: value.path, label: value.label ?? null }
      : null;
  } catch {
    return null;
  }
}

/** One invitation to configure follow-up, offered after a saved result. */
export interface FollowUpInvitation {
  /** Interested outcome or booked meeting; a meeting wins over an outcome. */
  entrySource: Extract<
    FollowUpEntrySource,
    'interested_outcome' | 'meeting_booked'
  >;
  /** The interaction it came from — the call, else the meeting. */
  interactionKey: string;
  meetingId: string | null;
  callId: string | null;
  /** When follow-up already runs: the objective the outcome started. */
  objective: {
    state: string;
    nextActionAt: string | null;
    reason: string | null;
  } | null;
}

interface InvitationState {
  invitation: FollowUpInvitation | null;
  offer: (next: FollowUpInvitation) => void;
  dismiss: () => void;
}

function wasDismissed(key: string): boolean {
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY);
    return raw ? (JSON.parse(raw) as string[]).includes(key) : false;
  } catch {
    return false;
  }
}

function rememberDismissed(key: string): void {
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY);
    const keys = raw ? (JSON.parse(raw) as string[]) : [];
    window.localStorage.setItem(
      DISMISSED_KEY,
      JSON.stringify([...keys.filter((k) => k !== key), key].slice(-50))
    );
  } catch {
    // A dismissal that cannot be remembered only lasts this page.
  }
}

/**
 * The single follow-up invitation of the dashboard. When one interaction
 * produces both an Interested outcome and a booked meeting, only one is shown
 * and the meeting's context wins; a dismissed one never comes back for the
 * same interaction. Offering never blocks the wrap-up or the next call.
 */
export const useFollowUpInvitation = create<InvitationState>((set, get) => ({
  invitation: null,
  offer: (next) => {
    // The call's own key too: dismissing a call's outcome also dismisses a
    // meeting booked on that call.
    if (
      wasDismissed(next.interactionKey) ||
      (next.callId !== null && wasDismissed(`call:${next.callId}`))
    ) {
      return;
    }
    const current = get().invitation;
    const sameInteraction =
      current &&
      (current.interactionKey === next.interactionKey ||
        (next.callId !== null && current.callId === next.callId));
    if (
      sameInteraction &&
      current.entrySource === 'meeting_booked' &&
      next.entrySource === 'interested_outcome'
    ) {
      return;
    }
    set({ invitation: next });
  },
  dismiss: () => {
    const current = get().invitation;
    if (current) {
      rememberDismissed(current.interactionKey);
      // The call's own key, as its saved outcome offers it: dismissing a
      // meeting booked on a call also dismisses that call's outcome.
      if (current.callId) rememberDismissed(`call:${current.callId}`);
    }
    set({ invitation: null });
  }
}));
