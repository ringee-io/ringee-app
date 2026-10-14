'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CalendarCheck,
  CalendarPlus,
  ChevronDown,
  Loader2,
  Mic,
  PhoneIncoming,
  Settings2
} from 'lucide-react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Switch } from '@ringee/frontend-shared/components/ui/switch';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { describeApiError } from '../../lib/api-error';
import { useAutomationApi } from '../api';
import { formatOffset } from '../lib/format';
import { useVoiceAgentsRail } from '../store';
import type {
  AutomationCapability,
  AutomationCard,
  AutomationNextStepCode,
  AutomationState
} from '../types';
import { DeleteTriggerButton } from './delete-trigger-button';
import { ScheduleCallDialog } from './schedule-call-dialog';
import {
  ReceptionistSetup,
  RemindersSetup,
  SchedulingSetup
} from './setup-forms';
import { UpcomingCalls } from './upcoming-calls';

const ICONS: Record<AutomationCapability, typeof CalendarCheck> = {
  reminders: CalendarCheck,
  receptionist: PhoneIncoming,
  scheduling: CalendarPlus
};

/** Next steps fixed inside the rail's own form; the rest open elsewhere. */
const FIXED_IN_FORM: AutomationNextStepCode[] = [
  'set_up',
  'choose_number',
  'choose_calendar',
  'answer_a_number'
];

const STATE_STYLE: Record<AutomationState, string> = {
  unconfigured: 'bg-muted text-muted-foreground',
  activating: 'bg-muted text-muted-foreground',
  active: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300',
  paused: 'bg-muted text-foreground',
  needs_attention: 'bg-amber-500/15 text-amber-900 dark:text-amber-300'
};

/**
 * One capability of the rail: what it does, whether it is really working,
 * the one thing to do next when it is not, and its own useful action.
 */
export function CapabilityCard({
  card,
  remindersNumber,
  canConfigure,
  onChanged
}: {
  card: AutomationCard;
  /** The reminders' outbound number, which the receptionist may answer. */
  remindersNumber: string | null;
  canConfigure: boolean;
  onChanged: (card?: AutomationCard) => void;
}) {
  const t = useTranslations('aiVoiceAgents.automations');
  const tUnits = useTranslations('aiVoiceAgents.automations.units');
  const api = useAutomationApi();
  const router = useRouter();
  const focus = useVoiceAgentsRail((state) => state.focus);
  const setFocus = useVoiceAgentsRail((state) => state.setFocus);
  const setOpen = useVoiceAgentsRail((state) => state.setOpen);
  const setResume = useVoiceAgentsRail((state) => state.setResume);
  const setDraft = useVoiceAgentsRail((state) => state.setDraft);
  const workspaceKey = useVoiceAgentsRail((state) => state.workspaceKey);
  const [editing, setEditing] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState(false);

  const Icon = ICONS[card.capability];
  const expanded = focus === card.capability;
  const configured = Boolean(card.agent);
  const on = card.state === 'active' || card.state === 'needs_attention';
  const title = t(`capabilities.${card.capability}.title`);
  const showForm =
    canConfigure && (editing || (expanded && card.state === 'unconfigured'));

  // "Cancel" puts the panel back as it was before the form opened.
  const focusBeforeForm = useRef<AutomationCapability | null>(null);
  const openForm = () => {
    focusBeforeForm.current = focus;
    setFocus(card.capability);
    setEditing(true);
  };
  const cancelForm = () => {
    setEditing(false);
    // What was typed is dropped: the next open starts from the saved setup.
    setDraft(card.capability, null, workspaceKey);
    // An unconfigured card shows its form for as long as it is focused.
    setFocus(focusBeforeForm.current);
  };

  /**
   * "Customize" and "Test" open the agent's own editor, and the rail comes
   * back — panel, card and page — when the editor closes.
   */
  const openEditor = (tab: string) => {
    if (!card.agent) return;
    const here = `${window.location.pathname}${window.location.search}`;
    setFocus(card.capability);
    setResume(true);
    setOpen(false);
    router.push(
      `/dashboard/ai-voice-agents/${card.agent.id}?tab=${tab}&returnTo=${encodeURIComponent(here)}`
    );
  };

  const toggle = async (next: boolean) => {
    setToggling(true);
    setToggleError(null);
    try {
      const updated = await api.setEnabled(card.capability, next);
      toast.success(
        next ? t('toast.resumed', { title }) : t('toast.paused', { title })
      );
      onChanged(updated);
    } catch (failure) {
      setToggleError(describeApiError(failure, t('toast.toggleError')));
    } finally {
      setToggling(false);
    }
  };

  const units = {
    day: tUnits('day'),
    hour: tUnits('hour'),
    minute: tUnits('minute')
  };
  const sentence = (() => {
    if (!card.agent) return t(`capabilities.${card.capability}.purpose`);
    if (card.capability === 'reminders' && card.reminders) {
      return t('sentence.reminders', {
        name: card.agent.name,
        when: card.reminders.offsetMinutes
          ? formatOffset(card.reminders.offsetMinutes, units)
          : '—',
        calendars:
          card.reminders.calendars
            .map((calendar) => calendar.name)
            .join(', ') || '—'
      });
    }
    if (card.capability === 'receptionist' && card.receptionist) {
      return t('sentence.receptionist', {
        name: card.agent.name,
        count: card.receptionist.numbers.filter((number) => number.answering)
          .length
      });
    }
    if (card.capability === 'scheduling') {
      return t('sentence.scheduling', {
        name: card.agent.name,
        calendar: card.scheduling?.calendar?.name ?? '—'
      });
    }
    return card.agent.name;
  })();

  const nextStepAction = (() => {
    const code = card.nextStep?.code;
    if (!code || !canConfigure) return null;
    if (FIXED_IN_FORM.includes(code)) {
      return (
        <Button
          size='sm'
          variant='outline'
          className='h-11 rounded-lg md:h-8'
          onClick={openForm}
        >
          {t(`nextStepAction.${code}`)}
        </Button>
      );
    }
    if (code === 'add_number') {
      return (
        <Button
          asChild
          size='sm'
          variant='outline'
          className='h-11 rounded-lg md:h-8'
        >
          <Link href='/dashboard/buy-number'>
            {t('nextStepAction.add_number')}
          </Link>
        </Button>
      );
    }
    if (code === 'add_credit') {
      return (
        <Button
          asChild
          size='sm'
          variant='outline'
          className='h-11 rounded-lg md:h-8'
        >
          <Link href='/dashboard/billing'>
            {t('nextStepAction.add_credit')}
          </Link>
        </Button>
      );
    }
    if (code === 'fix_agent' || code === 'turn_on_agent') {
      return (
        <Button
          size='sm'
          variant='outline'
          className='h-11 rounded-lg md:h-8'
          onClick={() => openEditor('setup')}
        >
          {t(`nextStepAction.${code}`)}
        </Button>
      );
    }
    return null;
  })();

  return (
    <section
      aria-labelledby={`automation-${card.capability}-title`}
      className={cn(
        'bg-card rounded-xl border p-3 transition-colors',
        expanded && 'border-foreground/20'
      )}
    >
      <div className='flex items-start gap-3'>
        <span
          aria-hidden
          className='bg-muted flex size-9 shrink-0 items-center justify-center rounded-lg'
        >
          <Icon className='size-4' />
        </span>
        <div className='min-w-0 flex-1'>
          <div className='flex items-center gap-2'>
            <h3
              id={`automation-${card.capability}-title`}
              className='truncate text-sm font-semibold'
            >
              {title}
            </h3>
            <span
              className={cn(
                'inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium',
                STATE_STYLE[card.state]
              )}
            >
              {card.state === 'activating' ? (
                <Loader2 className='size-3 animate-spin' aria-hidden />
              ) : null}
              {t(`state.${card.state}`)}
            </span>
          </div>
          <p className='text-muted-foreground mt-0.5 text-xs leading-5'>
            {sentence}
          </p>
        </div>
        {configured && canConfigure ? (
          <span className='flex shrink-0 items-center'>
            {toggling ? (
              <Loader2 className='text-muted-foreground mr-2 size-4 animate-spin' />
            ) : null}
            <Switch
              checked={on}
              disabled={toggling || card.state === 'activating'}
              onCheckedChange={(next) => void toggle(next)}
              aria-label={
                on
                  ? t('toggle.pause', { title })
                  : t('toggle.resume', { title })
              }
            />
          </span>
        ) : null}
      </div>

      {card.nextStep && card.state === 'needs_attention' && !showForm ? (
        <div className='mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2'>
          <AlertTriangle
            aria-hidden
            className='size-4 shrink-0 text-amber-700 dark:text-amber-300'
          />
          <p className='min-w-0 flex-1 text-xs text-amber-950 dark:text-amber-100'>
            {t.has(`nextStep.${card.nextStep.code}`)
              ? t(`nextStep.${card.nextStep.code}`)
              : card.nextStep.message}
          </p>
          {nextStepAction}
        </div>
      ) : null}

      {toggleError ? (
        <p role='alert' className='text-destructive mt-2 text-xs'>
          {toggleError}
        </p>
      ) : null}

      {!configured && card.state === 'unconfigured' && !showForm ? (
        <div className='mt-3 flex items-center gap-2'>
          {canConfigure ? (
            <Button
              size='sm'
              className='h-11 rounded-lg md:h-8'
              onClick={openForm}
            >
              {t('activate')}
            </Button>
          ) : (
            <p className='text-muted-foreground text-xs'>{t('askAdmin')}</p>
          )}
        </div>
      ) : null}

      {configured && !showForm ? (
        <div className='mt-3 flex flex-wrap items-center gap-1.5'>
          {card.capability === 'scheduling' && card.state === 'active' ? (
            <Button
              size='sm'
              className='h-11 rounded-lg md:h-8'
              onClick={() => setScheduling(true)}
            >
              <CalendarPlus className='size-3.5' />
              {t('scheduling.call')}
            </Button>
          ) : null}
          {canConfigure ? (
            <>
              <Button
                size='sm'
                variant='outline'
                className='h-11 rounded-lg md:h-8'
                onClick={() =>
                  openEditor(
                    card.capability === 'receptionist'
                      ? 'conversation'
                      : 'setup'
                  )
                }
              >
                <Settings2 className='size-3.5' />
                {card.capability === 'receptionist'
                  ? t('customizeGreeting')
                  : t('customize')}
              </Button>
              <Button
                size='sm'
                variant='ghost'
                className='h-11 rounded-lg md:h-8'
                onClick={() => openEditor('test')}
              >
                <Mic className='size-3.5' />
                {t('test')}
              </Button>
            </>
          ) : null}
          <Button
            size='sm'
            variant='ghost'
            className='ml-auto h-11 rounded-lg md:h-8'
            aria-expanded={expanded}
            aria-controls={`automation-${card.capability}-details`}
            onClick={() => setFocus(expanded ? null : card.capability)}
          >
            {t('details')}
            <ChevronDown
              className={cn(
                'size-3.5 transition-transform motion-reduce:transition-none',
                expanded && 'rotate-180'
              )}
            />
          </Button>
        </div>
      ) : null}

      {showForm ? (
        card.capability === 'reminders' ? (
          <RemindersSetup
            card={card}
            onDone={(next) => {
              setEditing(false);
              toast.success(t('toast.saved', { title }));
              onChanged(next);
            }}
            onCancel={cancelForm}
          />
        ) : card.capability === 'receptionist' ? (
          <ReceptionistSetup
            card={card}
            remindersNumber={remindersNumber}
            onDone={(next) => {
              setEditing(false);
              toast.success(t('toast.saved', { title }));
              onChanged(next);
            }}
            onPartial={(next) => {
              // Stays open on the numbers that failed — also when it was shown
              // only because the card was unconfigured, which it no longer is.
              setEditing(true);
              onChanged(next);
            }}
            onCancel={cancelForm}
          />
        ) : (
          <SchedulingSetup
            card={card}
            onDone={(next) => {
              setEditing(false);
              toast.success(t('toast.saved', { title }));
              onChanged(next);
            }}
            onCancel={cancelForm}
          />
        )
      ) : null}

      {configured && expanded && !showForm ? (
        <div
          id={`automation-${card.capability}-details`}
          className='mt-3 space-y-3 border-t pt-3 text-xs'
        >
          {card.company ? (
            <p className='text-muted-foreground'>
              {t('speaksFor', { company: card.company })}
            </p>
          ) : canConfigure ? (
            <p className='text-amber-900 dark:text-amber-200'>
              {t('noCompany')}
            </p>
          ) : null}

          {card.capability === 'reminders' && card.reminders ? (
            <>
              <p className='text-muted-foreground'>
                {card.reminders.callerNumber
                  ? t('reminders.callsFrom', {
                      number: card.reminders.callerNumber
                    })
                  : null}
              </p>
              <p className='text-muted-foreground'>
                {t('reminders.recipients', { count: card.reminders.ccAdmins })}
              </p>
              <UpcomingCalls count={card.reminders.upcomingCalls} />
            </>
          ) : null}

          {card.capability === 'receptionist' && card.receptionist ? (
            <>
              <ul className='space-y-1.5'>
                {card.receptionist.numbers.map((number) => (
                  <li
                    key={`${number.number.kind}/${number.number.id}`}
                    className='flex flex-wrap items-baseline justify-between gap-x-3'
                  >
                    <span className='font-mono'>{number.phoneNumber}</span>
                    <span className='text-muted-foreground'>
                      {number.answering
                        ? t('receptionist.pauseGoesTo', {
                            destination:
                              number.restoreLabel ?? t('receptionist.default')
                          })
                        : t('receptionist.notAnswering')}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {card.capability === 'scheduling' && card.scheduling ? (
            <>
              <p className='text-muted-foreground'>
                {card.scheduling.callerNumber
                  ? t('reminders.callsFrom', {
                      number: card.scheduling.callerNumber
                    })
                  : null}
              </p>
              <p className='text-muted-foreground'>{t('scheduling.noCalls')}</p>
            </>
          ) : null}

          {canConfigure && card.agent ? (
            <div className='flex flex-wrap items-center gap-1.5'>
              <Button
                size='sm'
                variant='outline'
                className='h-11 rounded-lg md:h-8'
                onClick={openForm}
              >
                {card.capability === 'receptionist'
                  ? t('receptionist.manageNumbers')
                  : t('editSetup')}
              </Button>
              <DeleteTriggerButton
                card={card}
                agent={card.agent}
                className='ml-auto'
                onDeleted={(next) => {
                  // Not set up any more: closed, so its setup form does not
                  // open on its own, and with no draft of the old setup.
                  setFocus(null);
                  setDraft(card.capability, null, workspaceKey);
                  onChanged(next);
                }}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Mounted only while open: it loads the organization's members. */}
      {card.capability === 'scheduling' && scheduling ? (
        <ScheduleCallDialog
          open={scheduling}
          onOpenChange={setScheduling}
          scheduling={card.scheduling ?? null}
        />
      ) : null}
    </section>
  );
}
