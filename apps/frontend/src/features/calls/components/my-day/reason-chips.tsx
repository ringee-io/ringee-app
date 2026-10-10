'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@ringee/frontend-shared/lib/utils';
import type { MyDayReason } from '../../types/my-day';
import { useMyDayFormat } from './use-my-day-format';

type Tone = 'due' | 'missed' | 'followUp' | 'neutral';

const TONES: Record<Tone, string> = {
  due: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  missed: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  followUp: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  neutral: 'bg-muted text-muted-foreground'
};

/** Why the person is in the queue, one chip per reason. */
export function ReasonChips({
  reasons,
  now
}: {
  reasons: MyDayReason[];
  now: Date;
}) {
  const t = useTranslations('calls.myDay.reasons');
  const tActions = useTranslations('ai.pendingActions.actionTypes');
  const fmt = useMyDayFormat();

  return (
    <>
      {reasons.map((reason) => {
        let tone: Tone;
        let label: string;
        switch (reason.kind) {
          case 'callback': {
            const at = new Date(reason.at);
            tone = at.getTime() <= now.getTime() ? 'due' : 'neutral';
            label = t('callbackAt', { time: fmt.time(at, now) });
            break;
          }
          case 'missed_call': {
            const when = fmt.ago(new Date(reason.at), now);
            tone = 'missed';
            label = reason.voicemail
              ? t('voicemail', { when })
              : t('missedCall', { when });
            break;
          }
          case 'follow_up': {
            const action = tActions.has(reason.actionType)
              ? tActions(reason.actionType)
              : reason.title;
            tone = 'followUp';
            label = reason.dueAt
              ? t('followUpDue', {
                  action,
                  time: fmt.time(new Date(reason.dueAt), now)
                })
              : action;
            break;
          }
        }
        const key =
          reason.kind === 'callback'
            ? reason.callbackId
            : reason.kind === 'missed_call'
              ? reason.threadId
              : reason.actionId;
        return (
          <span
            key={key}
            className={cn(
              'inline-flex h-[22px] max-w-full items-center truncate rounded-full px-2.5 text-xs font-semibold',
              TONES[tone]
            )}
          >
            {label}
          </span>
        );
      })}
    </>
  );
}

/** The note left on a callback, when there is one. */
export function callbackNote(reasons: MyDayReason[]): string | null {
  for (const reason of reasons) {
    if (reason.kind === 'callback' && reason.note?.trim()) {
      return reason.note.trim();
    }
  }
  return null;
}
