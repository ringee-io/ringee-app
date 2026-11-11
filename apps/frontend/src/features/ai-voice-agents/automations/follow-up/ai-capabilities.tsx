'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import { useAnalytics } from '@ringee/frontend-shared/hooks/use.analytics';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Switch } from '@ringee/frontend-shared/components/ui/switch';
import { cn } from '@ringee/frontend-shared/lib/utils';
import type { FollowUpDraft, FollowUpReview } from '../types';
import { offsetHours } from './format';

type Save = (changes: Partial<FollowUpDraft>) => Promise<{ ok: boolean }>;

/**
 * "2 · What the AI will do": Book meetings, and Reminders & confirmations.
 * The switches are the proposal; nothing starts until the person activates.
 * Existing settings, pauses and opt-outs arrive already applied from the
 * server, and every change here is a saved draft, not an authorization.
 */
export function AiCapabilities({
  review,
  save
}: {
  review: FollowUpReview;
  save: Save;
}) {
  const t = useTranslations('aiVoiceAgents.followUp');
  const { capture } = useAnalytics();
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const { draft, capabilities, canConfigure, rows } = review;
  const offset = draft.reminderOffsetMinutes;
  const offsetLabel = t('capabilities.offset', { hours: offsetHours(offset) });

  const toggle = (capability: 'scheduling' | 'reminders', enabled: boolean) => {
    capture('followup_capability_toggled', { capability, enabled });
    void save({
      capabilities: { ...draft.capabilities, [capability]: enabled }
    });
  };

  const calendarName =
    rows.calendar.selected?.name ?? t('capabilities.scheduling.yourCalendar');

  return (
    <div className='space-y-3'>
      <Capability
        title={t('capabilities.scheduling.title')}
        on={draft.capabilities.scheduling}
        inUse={isInUse(capabilities.scheduling.existing)}
        disabled={!canConfigure}
        onToggle={(on) => toggle('scheduling', on)}
        description={t('capabilities.scheduling.description')}
        facts={[
          [
            t('capabilities.scheduling.bookIn'),
            t('capabilities.scheduling.calendarValue', {
              calendar: calendarName
            })
          ],
          [
            t('capabilities.scheduling.callsFrom'),
            t('capabilities.scheduling.numberValue')
          ],
          [
            t('capabilities.scheduling.eligible'),
            t('capabilities.scheduling.eligibleValue')
          ]
        ]}
      />

      <Capability
        title={t('capabilities.reminders.title')}
        on={draft.capabilities.reminders}
        inUse={isInUse(capabilities.reminders.existing)}
        disabled={!canConfigure}
        onToggle={(on) => toggle('reminders', on)}
        description={t('capabilities.reminders.description', {
          offset: offsetLabel
        })}
        facts={[
          [
            t('capabilities.reminders.confirms'),
            <span key='offset' className='flex flex-wrap items-center gap-2'>
              <select
                aria-label={t('capabilities.reminders.confirms')}
                disabled={!canConfigure || !draft.capabilities.reminders}
                className='bg-background rounded-md border px-2 py-1 text-sm font-semibold'
                value={offset}
                onChange={(event) =>
                  void save({
                    reminderOffsetMinutes: Number(event.target.value)
                  })
                }
              >
                {[
                  ...new Set([
                    ...capabilities.reminders.offsetChoices,
                    ...(capabilities.reminders.existingOffsetMinutes
                      ? [capabilities.reminders.existingOffsetMinutes]
                      : [])
                  ])
                ]
                  .sort((a, b) => a - b)
                  .map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {t('capabilities.offset', {
                        hours: offsetHours(minutes)
                      })}
                    </option>
                  ))}
              </select>
              <span className='text-muted-foreground'>
                {t('capabilities.reminders.ofEach')}
              </span>
            </span>
          ],
          [
            t('capabilities.reminders.ifNot'),
            t('capabilities.reminders.ifNotValue')
          ],
          [
            t('capabilities.reminders.existing.label'),
            <ExistingMeetings key='existing' review={review} save={save} />
          ]
        ]}
      />

      <div className='rounded-xl border'>
        <button
          type='button'
          aria-expanded={customizeOpen}
          onClick={() => setCustomizeOpen((open) => !open)}
          className='hover:bg-muted/30 flex w-full items-center gap-3 rounded-xl p-4 text-left'
        >
          <SlidersHorizontal
            aria-hidden
            className='text-muted-foreground size-4 shrink-0'
          />
          <span className='min-w-0 flex-1'>
            <span className='block text-sm font-semibold'>
              {t('capabilities.customize.title')}
            </span>
            <span className='text-muted-foreground block text-xs'>
              {t('capabilities.customize.hint')}
            </span>
          </span>
          <ChevronDown
            aria-hidden
            className={cn(
              'size-4 transition-transform',
              customizeOpen && 'rotate-180'
            )}
          />
        </button>
        {customizeOpen ? (
          <div className='space-y-2 border-t p-4 text-sm'>
            {[capabilities.scheduling, capabilities.reminders].some(
              (capability) => capability.agentName
            ) ? (
              <>
                <p className='text-muted-foreground text-xs'>
                  {t('capabilities.customize.existing')}
                </p>
                <Link
                  href='/dashboard/ai-voice-agents'
                  className='text-primary text-sm font-medium underline-offset-2 hover:underline'
                >
                  {t('capabilities.customize.openAgents')}
                </Link>
              </>
            ) : (
              <p className='text-muted-foreground text-xs'>
                {t('capabilities.customize.afterActivation')}
              </p>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ExistingMeetings({
  review,
  save
}: {
  review: FollowUpReview;
  save: Save;
}) {
  const t = useTranslations('aiVoiceAgents.followUp');
  const upcoming = review.capabilities.reminders.upcomingExisting;
  const disabled = !review.canConfigure || !review.draft.capabilities.reminders;
  const choice = review.draft.existingMeetings;
  return (
    <span role='radiogroup' className='flex flex-col gap-1.5'>
      {(['none', 'all_upcoming'] as const).map((value) => (
        <label key={value} className='flex items-start gap-2'>
          <input
            type='radio'
            name='follow-up-existing'
            className='mt-1'
            disabled={disabled}
            checked={choice === value}
            onChange={() => void save({ existingMeetings: value })}
          />
          <span>
            {value === 'none'
              ? t('capabilities.reminders.existing.none')
              : upcoming
                ? t('capabilities.reminders.existing.all', {
                    meetings: upcoming.meetings,
                    calls: upcoming.calls
                  })
                : t('capabilities.reminders.existing.allUnknown')}
          </span>
        </label>
      ))}
    </span>
  );
}

function Capability({
  title,
  on,
  inUse,
  disabled,
  onToggle,
  description,
  facts
}: {
  title: string;
  on: boolean;
  inUse: boolean;
  disabled: boolean;
  onToggle: (on: boolean) => void;
  description: string;
  facts: Array<[string, React.ReactNode]>;
}) {
  const t = useTranslations('aiVoiceAgents.followUp');
  const id = `capability-${title.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <section
      aria-labelledby={id}
      className={cn(
        'rounded-xl border p-4',
        on ? 'border-emerald-500/40 bg-emerald-500/[0.03]' : 'opacity-90'
      )}
    >
      <div className='flex items-start gap-3'>
        <Switch
          checked={on}
          disabled={disabled}
          onCheckedChange={onToggle}
          aria-labelledby={id}
        />
        <div className='min-w-0 flex-1'>
          <div className='flex flex-wrap items-center gap-2'>
            <h4 id={id} className='text-sm font-semibold'>
              {title}
            </h4>
            <span
              className={cn(
                'text-xs font-medium',
                on
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-muted-foreground'
              )}
            >
              {on ? t('capabilities.on') : t('capabilities.off')}
            </span>
            {inUse ? (
              <Badge variant='secondary' className='text-[11px]'>
                {t('capabilities.inUse')}
              </Badge>
            ) : null}
          </div>
          <p className='text-muted-foreground mt-1 text-[13px] leading-relaxed'>
            {description}
          </p>
          <dl className='mt-3 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[7rem_minmax(0,1fr)]'>
            {facts.map(([label, value]) => (
              <div key={label} className='contents'>
                <dt className='text-muted-foreground'>{label}</dt>
                <dd className='min-w-0'>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}

function isInUse(state: string): boolean {
  return state !== 'unconfigured';
}
