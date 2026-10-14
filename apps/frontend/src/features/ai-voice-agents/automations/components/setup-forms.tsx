'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { AlertTriangle, Loader2, Mail, PhoneIncoming } from 'lucide-react';
import {
  Alert,
  AlertDescription
} from '@ringee/frontend-shared/components/ui/alert';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Checkbox } from '@ringee/frontend-shared/components/ui/checkbox';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Label } from '@ringee/frontend-shared/components/ui/label';
import {
  RadioGroup,
  RadioGroupItem
} from '@ringee/frontend-shared/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@ringee/frontend-shared/components/ui/select';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { useVoiceAgentApi } from '../../api';
import { CallerNumberSelect } from '../../components/caller-number-select';
import {
  Field,
  controlClass,
  selectTriggerClass
} from '../../components/fields/field';
import { describeApiError } from '../../lib/api-error';
import type { RingeeCalendarOption, VoiceAgentCallerNumber } from '../../types';
import { useAutomationApi } from '../api';
import {
  OFFSET_PRESETS,
  formatOffset,
  joinOffset,
  splitOffset
} from '../lib/format';
import { useVoiceAgentsRail, type RailDraft } from '../store';
import type {
  AutomationCapability,
  AutomationCard,
  InboundRouteOption
} from '../types';

/** Languages Ringee has curated voices in; anything else gets English. */
const VOICE_LANGUAGES = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const NEW_AGENT = '__new';

function useVoiceLanguage(): string | undefined {
  const base = useLocale().split('-')[0]!.toLowerCase();
  return VOICE_LANGUAGES.includes(base) ? base : undefined;
}

/**
 * A mini-form's state, kept in the rail's store so it survives "Customize"
 * and back. Initial values only apply when there is no draft yet.
 */
function useDraft<T extends RailDraft>(
  capability: AutomationCapability,
  initial: () => T
): [T, (patch: Partial<T>) => void, () => void] {
  const stored = useVoiceAgentsRail((state) => state.drafts[capability]) as
    | T
    | undefined;
  const setDraft = useVoiceAgentsRail((state) => state.setDraft);
  const workspaceKey = useVoiceAgentsRail((state) => state.workspaceKey);
  const [fallback] = useState(initial);
  const draft = stored ?? fallback;
  return [
    draft,
    (patch) => setDraft(capability, { ...draft, ...patch }, workspaceKey),
    () => setDraft(capability, null, workspaceKey)
  ];
}

/**
 * Reuse an agent the workspace already has, or name a new one. Several
 * candidates are never chosen for the person: they pick once, and the server
 * remembers it for the card.
 */
function AgentChoice({
  card,
  choice,
  name,
  onChoice,
  onName
}: {
  card: AutomationCard;
  choice: string;
  name: string;
  onChoice: (choice: string) => void;
  onName: (name: string) => void;
}) {
  const t = useTranslations('aiVoiceAgents.automations.setup');
  const nameField = (
    <Field label={t('name')} htmlFor={`${card.capability}-name`} required>
      <Input
        id={`${card.capability}-name`}
        value={name}
        maxLength={60}
        onChange={(event) => onName(event.target.value)}
        className={controlClass}
      />
    </Field>
  );
  if (card.agent || card.candidates.length === 0) return nameField;

  return (
    <div className='space-y-3'>
      <fieldset className='space-y-2'>
        <legend className='text-sm font-medium'>{t('agentChoice')}</legend>
        <RadioGroup value={choice} onValueChange={onChoice}>
          {card.candidates.map((candidate) => (
            <Label
              key={candidate.id}
              className='hover:bg-muted/50 flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3'
            >
              <RadioGroupItem value={candidate.id} />
              <span className='flex-1 text-sm'>
                {t('useExisting', { name: candidate.name })}
              </span>
            </Label>
          ))}
          <Label className='hover:bg-muted/50 flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3'>
            <RadioGroupItem value={NEW_AGENT} />
            <span className='flex-1 text-sm'>{t('createNew')}</span>
          </Label>
        </RadioGroup>
      </fieldset>
      {choice === NEW_AGENT ? nameField : null}
    </div>
  );
}

function FormShell({
  error,
  submitting,
  canSubmit,
  submitLabel,
  onCancel,
  onSubmit,
  children
}: {
  error: string | null;
  submitting: boolean;
  canSubmit: boolean;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: () => void;
  children: ReactNode;
}) {
  const t = useTranslations('aiVoiceAgents.automations.setup');
  return (
    <form
      className='space-y-4 border-t pt-4'
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit && !submitting) onSubmit();
      }}
    >
      {children}
      {error ? (
        <Alert variant='destructive' className='rounded-lg'>
          <AlertTriangle className='size-4' />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className='flex items-center justify-end gap-2'>
        <Button
          type='button'
          variant='ghost'
          className='h-11 rounded-lg md:h-9'
          onClick={onCancel}
        >
          {t('cancel')}
        </Button>
        <Button
          type='submit'
          className='h-11 rounded-lg md:h-9'
          disabled={!canSubmit || submitting}
        >
          {submitting ? <Loader2 className='size-4 animate-spin' /> : null}
          {submitting ? t('activating') : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function useCatalogs(load: { numbers?: boolean; calendars?: boolean }) {
  const voiceApi = useVoiceAgentApi();
  const [numbers, setNumbers] = useState<VoiceAgentCallerNumber[] | null>(null);
  const [calendars, setCalendars] = useState<RingeeCalendarOption[] | null>(
    null
  );
  useEffect(() => {
    let active = true;
    if (load.numbers) {
      void voiceApi
        .listCallerNumbers()
        .then((rows) => active && setNumbers(rows))
        .catch(() => active && setNumbers([]));
    }
    if (load.calendars) {
      void voiceApi
        .listRingeeCalendars()
        .then(
          (rows) => active && setCalendars(rows.filter((c) => !c.archivedAt))
        )
        .catch(() => active && setCalendars([]));
    }
    return () => {
      active = false;
    };
  }, [voiceApi, load.numbers, load.calendars]);
  return { numbers, calendars };
}

/** "Buy a number" when the workspace has none — the setup cannot finish without one. */
function NoNumber() {
  const t = useTranslations('aiVoiceAgents.automations.setup');
  return (
    <Alert className='rounded-lg'>
      <AlertTriangle className='size-4' />
      <AlertDescription className='flex flex-wrap items-center gap-2'>
        {t('noNumber')}
        <Button asChild variant='outline' size='sm' className='rounded-lg'>
          <Link href='/dashboard/buy-number'>{t('buyNumber')}</Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}

// ── Reminders & confirmations ───────────────────────────────────────

interface RemindersDraft extends RailDraft {
  choice: string;
  name: string;
  /** Null until the person touches it: the known default applies. */
  calendarIds: string[] | null;
  callerNumberId: string | null;
  preset: string;
  custom: { days: number; hours: number; minutes: number };
}

/**
 * The calendar a reminders setup starts from: the global one — what bookings
 * land on when nobody names a calendar — or the only one there is. Shown
 * checked, never applied silently.
 */
function knownCalendars(calendars: RingeeCalendarOption[] | null): string[] {
  if (!calendars?.length) return [];
  const global = calendars.find((calendar) => calendar.isDefault);
  return global
    ? [global.id]
    : calendars.length === 1
      ? [calendars[0]!.id]
      : [];
}

/** One number is not a choice; with several, the person picks. */
function onlyNumber(numbers: VoiceAgentCallerNumber[] | null): string {
  return numbers?.length === 1 ? numbers[0]!.id : '';
}

export function RemindersSetup({
  card,
  onDone,
  onCancel
}: {
  card: AutomationCard;
  onDone: (card: AutomationCard) => void;
  onCancel: () => void;
}) {
  const t = useTranslations('aiVoiceAgents.automations.setup');
  const tUnits = useTranslations('aiVoiceAgents.automations.units');
  const api = useAutomationApi();
  const language = useVoiceLanguage();
  const { numbers, calendars } = useCatalogs({
    numbers: true,
    calendars: true
  });
  const offset = card.reminders?.offsetMinutes ?? 24 * 60;
  const [draft, patch, clear] = useDraft<RemindersDraft>('reminders', () => ({
    choice: card.candidates.length === 1 ? card.candidates[0]!.id : '',
    name: card.agent?.name ?? t('defaultNames.reminders'),
    calendarIds: card.reminders?.calendars.map((c) => c.id) ?? null,
    callerNumberId: card.agent?.callerNumberId ?? null,
    preset: (OFFSET_PRESETS as readonly number[]).includes(offset)
      ? String(offset)
      : 'custom',
    custom: splitOffset(offset)
  }));
  const [scope, setScope] = useState<{
    meetings: number;
    calls: number;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const calendarIds = draft.calendarIds ?? knownCalendars(calendars);
  const callerNumberId = draft.callerNumberId ?? onlyNumber(numbers);

  const offsetMinutes =
    draft.preset === 'custom' ? joinOffset(draft.custom) : Number(draft.preset);
  const offsetValid = offsetMinutes >= 15 && offsetMinutes <= 14 * 24 * 60;

  const scopeKey = calendarIds.join(',');
  useEffect(() => {
    if (!scopeKey || !offsetValid) {
      setScope(null);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      void api
        .reminderScope(scopeKey.split(','), offsetMinutes)
        .then((next) => active && setScope(next))
        .catch(() => active && setScope(null));
    }, 300);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [api, scopeKey, offsetMinutes, offsetValid]);

  const choosingAgent = !card.agent && card.candidates.length > 0;
  const usingExisting = choosingAgent && draft.choice !== NEW_AGENT;
  const canSubmit =
    (!choosingAgent || Boolean(draft.choice)) &&
    (usingExisting || Boolean(draft.name.trim())) &&
    calendarIds.length > 0 &&
    Boolean(callerNumberId) &&
    offsetValid;

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const next = await api.setupReminders({
        ...(usingExisting ? { agentId: draft.choice } : {}),
        ...(!usingExisting ? { name: draft.name.trim(), language } : {}),
        callerNumberId,
        calendarIds,
        offsetMinutes
      });
      clear();
      onDone(next);
    } catch (failure) {
      setError(describeApiError(failure, t('error')));
    } finally {
      setSubmitting(false);
    }
  };

  const units = {
    day: tUnits('day'),
    hour: tUnits('hour'),
    minute: tUnits('minute')
  };

  return (
    <FormShell
      error={error}
      submitting={submitting}
      canSubmit={canSubmit}
      submitLabel={card.agent ? t('save') : t('activate')}
      onCancel={onCancel}
      onSubmit={() => void submit()}
    >
      <AgentChoice
        card={card}
        choice={draft.choice}
        name={draft.name}
        onChoice={(choice) => patch({ choice })}
        onName={(name) => patch({ name })}
      />

      <fieldset className='space-y-2'>
        <legend className='text-sm font-medium'>
          {t('calendars')}
          <span className='text-muted-foreground ml-0.5' aria-hidden>
            *
          </span>
        </legend>
        {!calendars ? (
          <Skeleton className='h-11 w-full rounded-lg' />
        ) : (
          calendars.map((calendar) => {
            const checked = calendarIds.includes(calendar.id);
            return (
              <Label
                key={calendar.id}
                className='hover:bg-muted/50 flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3'
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(next) =>
                    patch({
                      calendarIds: next
                        ? [...calendarIds, calendar.id]
                        : calendarIds.filter((id) => id !== calendar.id)
                    })
                  }
                />
                <span className='flex-1 text-sm'>{calendar.name}</span>
                <span className='text-muted-foreground text-xs'>
                  {calendar.timezone}
                </span>
              </Label>
            );
          })
        )}
      </fieldset>

      {numbers && numbers.length === 0 ? (
        <NoNumber />
      ) : (
        <Field
          label={t('callFrom')}
          htmlFor='reminders-number'
          required
          hint={numbers && numbers.length > 1 ? t('callFromHint') : undefined}
        >
          <CallerNumberSelect
            id='reminders-number'
            numbers={numbers ?? []}
            value={callerNumberId}
            onChange={(callerNumberId) => patch({ callerNumberId })}
            placeholder={t('chooseNumber')}
          />
        </Field>
      )}

      <fieldset className='space-y-2'>
        <legend className='text-sm font-medium'>{t('when')}</legend>
        <RadioGroup
          value={draft.preset}
          onValueChange={(preset) => patch({ preset })}
          className='grid grid-cols-3 gap-2'
        >
          {[...OFFSET_PRESETS.map(String), 'custom'].map((value) => (
            <Label
              key={value}
              className={cn(
                'has-[:focus-visible]:ring-ring flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border px-2 text-center text-sm has-[:focus-visible]:ring-2',
                draft.preset === value && 'border-primary bg-primary/5'
              )}
            >
              <RadioGroupItem value={value} className='sr-only' />
              {value === 'custom'
                ? t('custom')
                : t('before', { value: formatOffset(Number(value), units) })}
            </Label>
          ))}
        </RadioGroup>
        {draft.preset === 'custom' ? (
          <div className='grid grid-cols-3 gap-2'>
            {(['days', 'hours', 'minutes'] as const).map((unit) => (
              <Field
                key={unit}
                label={t(`units.${unit}`)}
                htmlFor={`reminders-${unit}`}
              >
                <Input
                  id={`reminders-${unit}`}
                  type='number'
                  min={0}
                  max={unit === 'days' ? 14 : unit === 'hours' ? 23 : 59}
                  inputMode='numeric'
                  value={draft.custom[unit]}
                  onChange={(event) =>
                    patch({
                      custom: {
                        ...draft.custom,
                        [unit]: Math.max(0, Number(event.target.value) || 0)
                      }
                    })
                  }
                  className={controlClass}
                />
              </Field>
            ))}
          </div>
        ) : null}
        {!offsetValid ? (
          <p role='alert' className='text-destructive text-xs'>
            {t('offsetRange')}
          </p>
        ) : null}
      </fieldset>

      <div className='bg-muted/40 space-y-1.5 rounded-lg px-3 py-2.5 text-xs'>
        <p>
          {scope
            ? t('scope', { calls: scope.calls, meetings: scope.meetings })
            : t('scopeUnknown')}
        </p>
        <p className='text-muted-foreground'>{t('noLateCalls')}</p>
        <p className='text-muted-foreground flex items-start gap-1.5'>
          <Mail className='mt-0.5 size-3.5 shrink-0' />
          {card.reminders?.ccAdmins
            ? t('recipientsWithCount', { count: card.reminders.ccAdmins })
            : t('recipients')}
        </p>
      </div>
    </FormShell>
  );
}

// ── AI receptionist ─────────────────────────────────────────────────

interface ReceptionistDraft extends RailDraft {
  choice: string;
  name: string;
  /** Null until the person touches it: the unambiguous default applies. */
  numbers: string[] | null;
  fallback: string;
}

const keyOf = (ref: { kind: string; id: string }) => `${ref.kind}/${ref.id}`;
const PREVIOUS = '__previous';

export function ReceptionistSetup({
  card,
  remindersNumber,
  onDone,
  onPartial,
  onCancel
}: {
  card: AutomationCard;
  /** The reminders' outbound number: leads call it back. */
  remindersNumber: string | null;
  onDone: (card: AutomationCard) => void;
  /** Some numbers failed: the rest was saved, and the form stays open. */
  onPartial?: (card: AutomationCard) => void;
  onCancel: () => void;
}) {
  const t = useTranslations('aiVoiceAgents.automations.setup');
  const api = useAutomationApi();
  const sharedApi = useApi();
  const language = useVoiceLanguage();
  const [options, setOptions] = useState<InboundRouteOption[] | null>(null);
  const [directory, setDirectory] = useState<
    Array<{ destinationType: string; destinationId: string; label: string }>
  >([]);
  const [draft, patch, clear] = useDraft<ReceptionistDraft>(
    'receptionist',
    () => ({
      choice: card.candidates.length === 1 ? card.candidates[0]!.id : '',
      name: card.agent?.name ?? t('defaultNames.receptionist'),
      numbers:
        card.receptionist?.numbers.map((number) => keyOf(number.number)) ??
        null,
      fallback: PREVIOUS
    })
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    void api
      .inboundNumbers()
      .then((rows) => {
        if (!active) return;
        setOptions(
          rows.filter((row) =>
            row.availableDestinationTypes.includes('ai_receptionist')
          )
        );
      })
      .catch(() => active && setOptions([]));
    void sharedApi
      .get<{
        destinations: Array<{
          destinationType: string;
          destinationId: string;
          label: string;
        }>;
      }>('/inbound-routes/directory?query=')
      .then(
        (result) =>
          active &&
          setDirectory(
            result.destinations.filter(
              (entry) =>
                entry.destinationType === 'user' ||
                entry.destinationType === 'ring_group'
            )
          )
      )
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [api, sharedApi]);

  // Preselected only when there is nothing to choose between.
  const numbers =
    draft.numbers ?? (options?.length === 1 ? [keyOf(options[0]!.number)] : []);

  const agentName = card.agent?.name ?? draft.name.trim();
  const fallbackLabel =
    draft.fallback === PREVIOUS
      ? null
      : (directory.find(
          (entry) =>
            `${entry.destinationType}:${entry.destinationId}` === draft.fallback
        )?.label ?? null);

  const choosingAgent = !card.agent && card.candidates.length > 0;
  const usingExisting = choosingAgent && draft.choice !== NEW_AGENT;
  const canSubmit =
    (!choosingAgent || Boolean(draft.choice)) &&
    (usingExisting || Boolean(draft.name.trim())) &&
    numbers.length > 0;

  const selected = (options ?? []).filter((option) =>
    numbers.includes(keyOf(option.number))
  );

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    setFailed([]);
    try {
      const [destinationType, destinationId] = draft.fallback.split(':');
      const result = await api.setupReceptionist({
        ...(usingExisting ? { agentId: draft.choice } : {}),
        ...(!usingExisting ? { name: draft.name.trim(), language } : {}),
        numbers: selected.map((option) => option.number),
        fallback:
          draft.fallback === PREVIOUS
            ? null
            : {
                destinationType: destinationType as 'user' | 'ring_group',
                destinationId: destinationId!
              }
      });
      if (result.failed.length) {
        setFailed(result.failed.map((failure) => keyOf(failure.number)));
        setError(
          t('someNumbersFailed', {
            reasons: result.failed.map((failure) => failure.error).join(' · ')
          })
        );
        // The card now has its agent: a retry saves it under the name it has,
        // not the default typed before an existing agent was chosen.
        if (result.card.agent) patch({ name: result.card.agent.name });
        onPartial?.(result.card);
        return;
      }
      clear();
      onDone(result.card);
    } catch (failure) {
      setError(describeApiError(failure, t('error')));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormShell
      error={error}
      submitting={submitting}
      canSubmit={canSubmit}
      submitLabel={card.agent ? t('save') : t('activate')}
      onCancel={onCancel}
      onSubmit={() => void submit()}
    >
      <AgentChoice
        card={card}
        choice={draft.choice}
        name={draft.name}
        onChoice={(choice) => patch({ choice })}
        onName={(name) => patch({ name })}
      />

      <fieldset className='space-y-2'>
        <legend className='text-sm font-medium'>
          {t('answerNumbers')}
          <span className='text-muted-foreground ml-0.5' aria-hidden>
            *
          </span>
        </legend>
        {!options ? (
          <Skeleton className='h-14 w-full rounded-lg' />
        ) : options.length === 0 ? (
          <NoNumber />
        ) : (
          options.map((option) => {
            const key = keyOf(option.number);
            const checked = numbers.includes(key);
            const callsBack =
              remindersNumber && option.phoneNumber === remindersNumber;
            const today =
              option.destinationType === 'ai_receptionist'
                ? t('todayReceptionist', {
                    name: option.destinationLabel ?? ''
                  })
                : t('today', {
                    destination: option.destinationLabel ?? t('defaultRoute')
                  });
            return (
              <Label
                key={key}
                className={cn(
                  'hover:bg-muted/50 flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5',
                  failed.includes(key) && 'border-destructive'
                )}
              >
                <Checkbox
                  className='mt-0.5'
                  checked={checked}
                  onCheckedChange={(next) =>
                    patch({
                      numbers: next
                        ? [...numbers, key]
                        : numbers.filter((value) => value !== key)
                    })
                  }
                />
                <span className='min-w-0 flex-1'>
                  <span className='block font-mono text-sm'>
                    {option.phoneNumber}
                  </span>
                  <span className='text-muted-foreground block text-xs'>
                    {today}
                  </span>
                  {callsBack ? (
                    <span className='mt-1 flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300'>
                      <PhoneIncoming className='size-3' />
                      {t('remindersCallBack')}
                    </span>
                  ) : null}
                </span>
              </Label>
            );
          })
        )}
      </fieldset>

      <Field
        label={t('fallback')}
        htmlFor='receptionist-fallback'
        hint={t('fallbackHint')}
      >
        <Select
          value={draft.fallback}
          onValueChange={(fallback) => patch({ fallback })}
        >
          <SelectTrigger
            id='receptionist-fallback'
            className={selectTriggerClass}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={PREVIOUS}>{t('fallbackPrevious')}</SelectItem>
            {directory.map((entry) => (
              <SelectItem
                key={`${entry.destinationType}:${entry.destinationId}`}
                value={`${entry.destinationType}:${entry.destinationId}`}
              >
                {entry.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {selected.length ? (
        <div className='bg-muted/40 space-y-1.5 rounded-lg px-3 py-2.5 text-xs'>
          <p className='font-medium'>{t('routeChange')}</p>
          {selected.map((option) => (
            <p key={keyOf(option.number)} className='text-muted-foreground'>
              {t('routeChangeLine', {
                number: option.phoneNumber,
                name: agentName || t('defaultNames.receptionist'),
                back:
                  fallbackLabel ??
                  (option.destinationType === 'ai_receptionist'
                    ? (option.restoreDestination?.label ?? t('defaultRoute'))
                    : (option.destinationLabel ?? t('defaultRoute')))
              })}
            </p>
          ))}
        </div>
      ) : null}
    </FormShell>
  );
}

// ── Appointment scheduling ──────────────────────────────────────────

interface SchedulingDraft extends RailDraft {
  choice: string;
  name: string;
  /** Null until the person touches it: the known default applies. */
  calendarId: string | null;
  callerNumberId: string | null;
}

export function SchedulingSetup({
  card,
  onDone,
  onCancel
}: {
  card: AutomationCard;
  onDone: (card: AutomationCard) => void;
  onCancel: () => void;
}) {
  const t = useTranslations('aiVoiceAgents.automations.setup');
  const api = useAutomationApi();
  const language = useVoiceLanguage();
  const { numbers, calendars } = useCatalogs({
    numbers: true,
    calendars: true
  });
  const [draft, patch, clear] = useDraft<SchedulingDraft>('scheduling', () => ({
    choice: card.candidates.length === 1 ? card.candidates[0]!.id : '',
    name: card.agent?.name ?? t('defaultNames.scheduling'),
    calendarId: card.agent?.calendarId ?? card.scheduling?.calendar?.id ?? null,
    callerNumberId: card.agent?.callerNumberId ?? null
  }));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const calendarId = draft.calendarId ?? knownCalendars(calendars)[0] ?? '';
  const callerNumberId = draft.callerNumberId ?? onlyNumber(numbers);

  const choosingAgent = !card.agent && card.candidates.length > 0;
  const usingExisting = choosingAgent && draft.choice !== NEW_AGENT;
  const canSubmit =
    (!choosingAgent || Boolean(draft.choice)) &&
    (usingExisting || Boolean(draft.name.trim())) &&
    Boolean(callerNumberId) &&
    Boolean(calendarId);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const next = await api.setupScheduling({
        ...(usingExisting ? { agentId: draft.choice } : {}),
        ...(!usingExisting ? { name: draft.name.trim(), language } : {}),
        callerNumberId,
        calendarId
      });
      clear();
      onDone(next);
    } catch (failure) {
      setError(describeApiError(failure, t('error')));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormShell
      error={error}
      submitting={submitting}
      canSubmit={canSubmit}
      submitLabel={card.agent ? t('save') : t('activate')}
      onCancel={onCancel}
      onSubmit={() => void submit()}
    >
      <AgentChoice
        card={card}
        choice={draft.choice}
        name={draft.name}
        onChoice={(choice) => patch({ choice })}
        onName={(name) => patch({ name })}
      />
      <Field label={t('calendar')} htmlFor='scheduling-calendar' required>
        {!calendars ? (
          <Skeleton className='h-10 w-full rounded-lg' />
        ) : (
          <Select
            value={calendarId}
            onValueChange={(next) => patch({ calendarId: next })}
          >
            <SelectTrigger
              id='scheduling-calendar'
              className={selectTriggerClass}
            >
              <SelectValue placeholder={t('chooseCalendar')} />
            </SelectTrigger>
            <SelectContent>
              {calendars.map((calendar) => (
                <SelectItem key={calendar.id} value={calendar.id}>
                  {calendar.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>
      {numbers && numbers.length === 0 ? (
        <NoNumber />
      ) : (
        <Field
          label={t('callFrom')}
          htmlFor='scheduling-number'
          required
          hint={numbers && numbers.length > 1 ? t('callFromHint') : undefined}
        >
          <CallerNumberSelect
            id='scheduling-number'
            numbers={numbers ?? []}
            value={callerNumberId}
            onChange={(callerNumberId) => patch({ callerNumberId })}
            placeholder={t('chooseNumber')}
          />
        </Field>
      )}
      <p className='bg-muted/40 text-muted-foreground rounded-lg px-3 py-2.5 text-xs'>
        {t('schedulingNoCalls')}
      </p>
    </FormShell>
  );
}
