import type {
  CampaignLeadStatus,
  DispositionCategory
} from '../types/campaign.types';

/** Lead status badge colours, readable in light and dark mode. */
export const LEAD_STATUS_CLASSES: Record<CampaignLeadStatus, string> = {
  pending: 'border-border bg-muted text-muted-foreground',
  queued: 'border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  locked:
    'border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  dialing:
    'border-orange-500/25 bg-orange-500/10 text-orange-700 dark:text-orange-300',
  in_call:
    'border-orange-500/25 bg-orange-500/10 text-orange-700 dark:text-orange-300',
  wrap_up:
    'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  dispositioned:
    'border-cyan-500/25 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
  scheduled:
    'border-indigo-500/25 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
  completed:
    'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  exhausted:
    'border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  dnc: 'border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300'
};

/**
 * Where a lead stands, in the five buckets a manager reads progress by. Every
 * `CampaignLeadStatus` (CMP-009, a closed set) lands in exactly one.
 */
export type LeadProgressGroup =
  | 'toCall'
  | 'inProgress'
  | 'followUp'
  | 'done'
  | 'closedOut';

export const LEAD_PROGRESS_GROUP: Record<
  CampaignLeadStatus,
  LeadProgressGroup
> = {
  pending: 'toCall',
  queued: 'toCall',
  locked: 'inProgress',
  dialing: 'inProgress',
  in_call: 'inProgress',
  wrap_up: 'inProgress',
  dispositioned: 'followUp',
  scheduled: 'followUp',
  completed: 'done',
  exhausted: 'closedOut',
  dnc: 'closedOut'
};

export const LEAD_PROGRESS_ORDER: LeadProgressGroup[] = [
  'done',
  'followUp',
  'inProgress',
  'closedOut',
  'toCall'
];

export const LEAD_PROGRESS_BAR: Record<LeadProgressGroup, string> = {
  done: 'bg-emerald-500',
  followUp: 'bg-indigo-500',
  inProgress: 'bg-orange-500',
  closedOut: 'bg-rose-500',
  toCall: 'bg-muted-foreground/25'
};

/** How a disposition reads, by its category: good, bad, no contact, neutral. */
export const DISPOSITION_TONE: Record<
  DispositionCategory,
  'good' | 'bad' | 'warn' | 'neutral'
> = {
  positive: 'good',
  negative: 'bad',
  no_contact: 'warn',
  neutral: 'neutral'
};
