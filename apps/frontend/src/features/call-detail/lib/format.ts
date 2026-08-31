import type { AiVoiceAgentOutcome, CallDetail, CallOutcome } from '../types';

/**
 * Pure presentation helpers — shape, not words.
 *
 * Every label the screen shows comes from `next-intl` (`calls.detail.*`), so
 * nothing here returns copy. What lives here is the formatting that a
 * translation cannot decide: how long a call was, what it cost, and which of
 * three tones an outcome reads as.
 */

/** `not_interested` → `Not interested`. The fallback for an unmapped enum. */
export function humanize(value: string): string {
  const spaced = value.replace(/[_-]+/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Positive outcomes read green, refusals red, everything else neutral. */
export function outcomeTone(
  outcome: CallOutcome | AiVoiceAgentOutcome | null | undefined
): 'good' | 'bad' | 'neutral' {
  if (!outcome) return 'neutral';
  const good = [
    'meeting_booked',
    'sale',
    'interested',
    'appointment_booked',
    'confirmed',
    'callback_scheduled',
    'callback_requested'
  ];
  const bad = [
    'not_interested',
    'wrong_number',
    'cannot_attend',
    'no_answer',
    'no_conversation'
  ];
  if (good.includes(outcome)) return 'good';
  if (bad.includes(outcome)) return 'bad';
  return 'neutral';
}

export function sentimentTone(
  sentiment: string | null
): 'good' | 'bad' | 'neutral' {
  if (sentiment === 'positive') return 'good';
  if (sentiment === 'negative') return 'bad';
  return 'neutral';
}

/** `125` → `2:05`. Zero and null both read as a dash: neither is a duration. */
export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds < 0) return '—';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = Math.floor(seconds % 60);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(rest)}`
    : `${minutes}:${pad(rest)}`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

/**
 * Money is shown to the precision it was charged at. A sub-cent telephony cost
 * rounded to two places reads as "$0.00", which looks like a free call.
 */
export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const digits = value !== 0 && Math.abs(value) < 0.01 ? 4 : 2;
  return `$${value.toFixed(digits)}`;
}

/** The other party — the number the workspace was talking to. */
export function counterparty(call: CallDetail): string {
  return call.direction === 'inbound' ? call.fromNumber : call.toNumber;
}

/** Best available name for the person on the call, else their number. */
export function contactName(call: CallDetail): string | null {
  const contact = call.contact;
  return contact?.fullName?.trim() || contact?.name?.trim() || null;
}

export function memberLabel(call: CallDetail): string | null {
  const user = call.user;
  if (!user) return null;
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return name || null;
}

/** The first recording that is actually playable. */
export function playableRecording(call: CallDetail) {
  return (
    call.recordings.find((r) => r.status === 'completed' && r.url) ??
    call.recordings.find((r) => r.url) ??
    null
  );
}
