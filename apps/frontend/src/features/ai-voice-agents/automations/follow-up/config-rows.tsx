'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { AlertCircle, CheckCircle2, Lock } from 'lucide-react';
import { useAnalytics } from '@ringee/frontend-shared/hooks/use.analytics';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Label } from '@ringee/frontend-shared/components/ui/label';
import { Textarea } from '@ringee/frontend-shared/components/ui/textarea';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { formatForDisplay } from '@ringee/dialer-core/phone';
import { useSettingsDialogStore } from '@/features/settings/store/settings-dialog.store';
import type {
  CallingWindow,
  FollowUpDraft,
  FollowUpReview,
  FollowUpRowKey,
  FollowUpRowStatus
} from '../types';
import { rememberFollowUpReturn, FOLLOW_UP_PATH } from './entry';
import {
  formatMinute,
  formatWindow,
  formatZone,
  timeZoneOptions
} from './format';

type Save = (changes: Partial<FollowUpDraft>) => Promise<{ ok: boolean }>;

/**
 * "1 · Your configuration": eight rows filled from what Ringee already has.
 * Each row edits in place (Edit → Save/Cancel, Escape closes); a missing one
 * says why it is needed and offers its one concrete action. Saving sends only
 * that row — the server merges it over the saved draft.
 */
export function ConfigRows({
  review,
  save,
  openRow,
  onOpenRowChange,
  entrySource
}: {
  review: FollowUpReview;
  save: Save;
  openRow: FollowUpRowKey | null;
  onOpenRowChange: (row: FollowUpRowKey | null) => void;
  entrySource: string | null;
}) {
  const t = useTranslations('aiVoiceAgents.followUp');
  const locale = useLocale();
  const { capture } = useAnalytics();
  const openSettings = useSettingsDialogStore((state) => state.openSettings);
  const { rows, canConfigure } = review;

  const commit = async (
    row: FollowUpRowKey,
    changes: Partial<FollowUpDraft>
  ) => {
    const result = await save(changes);
    if (result.ok) {
      onOpenRowChange(null);
      capture('followup_review_row_saved', { row, entry_source: entrySource });
    }
    return result.ok;
  };

  const leaveForNumbers = () => {
    rememberFollowUpReturn({
      path: `${FOLLOW_UP_PATH}${window.location.search}`,
      label: null
    });
    capture('readiness_recovery_started', {
      blocker: rows.number.requirement ?? 'get_number',
      action: 'buy_or_verify_number',
      surface: 'follow_up_review'
    });
  };

  const callingWindow = rows.callingHours.window;
  const hours = formatWindow(callingWindow, locale);
  const availability = rows.calendar.availability.window
    ? formatWindow(rows.calendar.availability.window, locale)
    : null;

  return (
    <div className='divide-y'>
      {/* Business identity */}
      <Row
        label={t('rows.identity.label')}
        status={rows.identity.status}
        title={
          rows.identity.companyName ??
          rows.identity.personName ??
          t('rows.identity.unnamed')
        }
        hint={
          rows.identity.kind === 'person' && !rows.identity.companyName
            ? t('rows.identity.personHint', {
                name: rows.identity.personName ?? ''
              })
            : t('rows.identity.companyHint', {
                name:
                  rows.identity.companyName ?? rows.identity.personName ?? ''
              }) +
              (rows.identity.companyWebsite
                ? ` · ${hostOf(rows.identity.companyWebsite)}`
                : '')
        }
        editable={canConfigure}
        open={openRow === 'identity'}
        onOpenChange={(open) => onOpenRowChange(open ? 'identity' : null)}
        editor={
          <IdentityEditor
            review={review}
            onCancel={() => onOpenRowChange(null)}
            onSave={(identity) => commit('identity', { identity })}
          />
        }
      />

      {/* What the agent may share */}
      <Row
        label={t('rows.shareable.label')}
        status={rows.shareable.status}
        title={
          rows.shareable.companyDescription
            ? truncate(rows.shareable.companyDescription, 90)
            : t('rows.shareable.empty')
        }
        hint={
          rows.shareable.companyDescription
            ? t('rows.shareable.setHint')
            : t('rows.shareable.emptyHint')
        }
        editable={canConfigure}
        open={openRow === 'shareable'}
        onOpenChange={(open) => onOpenRowChange(open ? 'shareable' : null)}
        editor={
          <TextEditor
            initial={rows.shareable.companyDescription ?? ''}
            placeholder={t('rows.shareable.placeholder')}
            onCancel={() => onOpenRowChange(null)}
            onSave={(text) =>
              commit('shareable', {
                shareable: { companyDescription: text.trim() || null }
              })
            }
          />
        }
      />

      {/* The number the AI calls from */}
      <Row
        rowId='number'
        label={t('rows.number.label')}
        status={rows.number.status}
        title={
          rows.number.selected
            ? formatForDisplay(rows.number.selected.phoneNumber)
            : rows.number.requirement === 'number_pending'
              ? t('rows.number.pendingTitle')
              : rows.number.requirement === 'choose_number'
                ? t('rows.number.chooseTitle')
                : t('rows.number.none')
        }
        hint={
          rows.number.selected
            ? rows.number.selected.kind === 'purchased'
              ? t('rows.number.purchasedHint', {
                  country: rows.number.selected.isoCountry
                })
              : t('rows.number.verifiedHint')
            : rows.number.requirement === 'number_pending'
              ? t('rows.number.pendingHint', {
                  numbers: rows.number.pending
                    .map((item) => formatForDisplay(item.phoneNumber))
                    .join(', ')
                })
              : rows.number.requirement === 'choose_number'
                ? t('rows.number.chooseHint')
                : rows.number.sharedNumberAvailable
                  ? t('rows.number.sharedHint')
                  : t('rows.number.noneHint')
        }
        action={
          canConfigure && rows.number.requirement === 'get_number' ? (
            <Button asChild size='sm' variant='outline'>
              <Link
                href='/dashboard/buy-number?tab=buy'
                onClick={leaveForNumbers}
              >
                {t('rows.number.get')}
              </Link>
            </Button>
          ) : null
        }
        actionLabel={
          rows.number.requirement === 'choose_number'
            ? t('rows.number.choose')
            : undefined
        }
        editable={canConfigure && rows.number.candidates.length > 0}
        open={openRow === 'number'}
        onOpenChange={(open) => onOpenRowChange(open ? 'number' : null)}
        editor={
          <ChoiceEditor
            options={rows.number.candidates.map((number) => ({
              id: number.id,
              label: formatForDisplay(number.phoneNumber),
              hint:
                number.kind === 'purchased'
                  ? t('rows.number.purchasedHint', {
                      country: number.isoCountry
                    })
                  : t('rows.number.verifiedHint')
            }))}
            initial={rows.number.selected?.id ?? null}
            onCancel={() => onOpenRowChange(null)}
            onSave={(numberId) => commit('number', { numberId })}
            footer={
              <Link
                href='/dashboard/buy-number?tab=buy'
                onClick={leaveForNumbers}
                className='text-primary text-xs underline-offset-2 hover:underline'
              >
                {t('rows.number.another')}
              </Link>
            }
          />
        }
      />

      {/* Returned calls */}
      <Row
        label={t('rows.callbacks.label')}
        status={rows.callbacks.status}
        title={
          rows.callbacks.kind === 'owner'
            ? t('rows.callbacks.owner')
            : rows.callbacks.kind === 'route'
              ? t('rows.callbacks.route', {
                  label: rows.callbacks.label ?? t('rows.callbacks.someone')
                })
              : rows.callbacks.kind === 'unrouted'
                ? t('rows.callbacks.unrouted')
                : t('rows.callbacks.unknown')
        }
        hint={t(`rows.callbacks.${rows.callbacks.kind}Hint`)}
        editable={false}
      />

      {/* Calendar and its free hours */}
      <Row
        rowId='calendar'
        label={t('rows.calendar.label')}
        status={rows.calendar.status}
        title={
          rows.calendar.selected
            ? [
                rows.calendar.selected.name,
                rows.calendar.selected.provider
                  ? t(
                      `rows.calendar.provider.${rows.calendar.selected.provider}`
                    )
                  : null,
                rows.calendar.selected.accountEmail
              ]
                .filter(Boolean)
                .join(' · ')
            : rows.calendar.willCreate
              ? t('rows.calendar.willCreate')
              : t('rows.calendar.notConnected')
        }
        hint={
          rows.calendar.requirement === 'set_availability'
            ? t('rows.calendar.availabilityHint')
            : availability
              ? t('rows.calendar.free', availability)
              : t('rows.calendar.defaultHours')
        }
        action={
          canConfigure && !rows.calendar.selected?.provider ? (
            <Button
              size='sm'
              variant='outline'
              onClick={() => openSettings('calendars')}
            >
              {t('rows.calendar.connect')}
            </Button>
          ) : null
        }
        actionLabel={
          rows.calendar.requirement === 'set_availability'
            ? t('rows.calendar.setAvailability')
            : undefined
        }
        editable={canConfigure}
        open={openRow === 'calendar'}
        onOpenChange={(open) => onOpenRowChange(open ? 'calendar' : null)}
        editor={
          <CalendarEditor
            review={review}
            onCancel={() => onOpenRowChange(null)}
            onSave={(changes) => commit('calendar', changes)}
          />
        }
      />

      {/* Calling hours */}
      <Row
        label={t('rows.callingHours.label')}
        status={rows.callingHours.status}
        title={t('window', hours)}
        hint={t(`rows.callingHours.${rows.callingHours.source}`)}
        editable={canConfigure}
        open={openRow === 'calling_hours'}
        onOpenChange={(open) => onOpenRowChange(open ? 'calling_hours' : null)}
        editor={
          <WindowEditor
            initial={callingWindow}
            onCancel={() => onOpenRowChange(null)}
            onSave={(callingHours) => commit('calling_hours', { callingHours })}
          />
        }
      />

      {/* Time zone */}
      <Row
        label={t('rows.timeZone.label')}
        status={rows.timeZone.status}
        title={formatZone(rows.timeZone.value, locale)}
        hint={t(`rows.timeZone.${rows.timeZone.source}`)}
        editable={canConfigure}
        open={openRow === 'time_zone'}
        onOpenChange={(open) => onOpenRowChange(open ? 'time_zone' : null)}
        editor={
          <ZoneEditor
            initial={rows.timeZone.value}
            onCancel={() => onOpenRowChange(null)}
            onSave={(timeZone) => commit('time_zone', { timeZone })}
          />
        }
      />

      {/* Responsible */}
      <Row
        label={t('rows.responsible.label')}
        status={rows.responsible.status}
        title={
          rows.responsible.kind === 'owner'
            ? t('rows.responsible.owner', {
                name: rows.responsible.ownerName ?? ''
              })
            : t('rows.responsible.caller')
        }
        hint={
          rows.responsible.kind === 'owner'
            ? t('rows.responsible.ownerHint')
            : t('rows.responsible.callerHint', {
                count: rows.responsible.adminCount
              })
        }
        editable={false}
      />
    </div>
  );
}

function Row({
  rowId,
  label,
  status,
  title,
  hint,
  action,
  actionLabel,
  editable,
  open = false,
  onOpenChange,
  editor
}: {
  rowId?: string;
  label: string;
  status: FollowUpRowStatus;
  title: string;
  hint: string;
  action?: ReactNode;
  /** The edit button's label when the row is missing something. */
  actionLabel?: string;
  editable: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  editor?: ReactNode;
}) {
  const t = useTranslations('aiVoiceAgents.followUp');
  const ref = useRef<HTMLDivElement>(null);
  const missing = status === 'missing';

  // A requirement's action opens its row: bring it into view.
  useEffect(() => {
    if (open)
      ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [open]);

  return (
    <div
      ref={ref}
      id={rowId ? `follow-up-row-${rowId}` : undefined}
      className={cn(
        'px-4 py-3.5 sm:px-5',
        missing && 'bg-amber-500/[0.06] dark:bg-amber-400/[0.05]'
      )}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation();
          onOpenChange?.(false);
        }
      }}
    >
      <div className='grid gap-x-4 gap-y-1 sm:grid-cols-[11rem_minmax(0,1fr)_auto] sm:items-start'>
        <div className='text-muted-foreground flex items-center gap-2 text-sm'>
          <StatusIcon status={status} />
          <span>{label}</span>
        </div>
        <div className='min-w-0'>
          <p
            className={cn(
              'text-sm font-semibold break-words',
              missing && 'text-amber-700 dark:text-amber-300'
            )}
          >
            {title}
          </p>
          <p
            className={cn(
              'mt-0.5 text-[13px] leading-snug',
              missing
                ? 'text-amber-700/90 dark:text-amber-300/90'
                : 'text-muted-foreground'
            )}
          >
            {hint}
          </p>
        </div>
        <div className='flex shrink-0 items-start gap-2 sm:justify-end'>
          {action}
          {status === 'locked' ? (
            <span className='text-muted-foreground text-xs'>
              {t('actions.fixed')}
            </span>
          ) : editable && !open ? (
            <Button
              size='sm'
              variant={missing && actionLabel ? 'outline' : 'ghost'}
              onClick={() => onOpenChange?.(true)}
              aria-expanded={open}
            >
              {missing && actionLabel ? actionLabel : t('actions.edit')}
            </Button>
          ) : null}
        </div>
      </div>
      {open && editor ? (
        <div className='mt-3 sm:pl-[11rem]'>{editor}</div>
      ) : null}
    </div>
  );
}

function StatusIcon({ status }: { status: FollowUpRowStatus }) {
  if (status === 'missing') {
    return (
      <AlertCircle aria-hidden className='size-4 shrink-0 text-amber-500' />
    );
  }
  if (status === 'locked') {
    return (
      <Lock aria-hidden className='text-muted-foreground size-4 shrink-0' />
    );
  }
  return (
    <CheckCircle2 aria-hidden className='size-4 shrink-0 text-emerald-500' />
  );
}

function EditorActions({
  onCancel,
  saving,
  disabled
}: {
  onCancel: () => void;
  saving: boolean;
  disabled?: boolean;
}) {
  const t = useTranslations('aiVoiceAgents.followUp');
  return (
    <div className='mt-3 flex gap-2'>
      <Button type='submit' size='sm' disabled={saving || disabled}>
        {t('actions.save')}
      </Button>
      <Button type='button' size='sm' variant='ghost' onClick={onCancel}>
        {t('actions.cancel')}
      </Button>
    </div>
  );
}

function useSubmit<T>(onSave: (value: T) => Promise<boolean>) {
  const [saving, setSaving] = useState(false);
  const submit = async (value: T) => {
    setSaving(true);
    try {
      await onSave(value);
    } finally {
      setSaving(false);
    }
  };
  return { saving, submit };
}

function IdentityEditor({
  review,
  onCancel,
  onSave
}: {
  review: FollowUpReview;
  onCancel: () => void;
  onSave: (identity: {
    companyName: string | null;
    companyWebsite: string | null;
  }) => Promise<boolean>;
}) {
  const t = useTranslations('aiVoiceAgents.followUp');
  const [name, setName] = useState(review.rows.identity.companyName ?? '');
  const [website, setWebsite] = useState(
    review.rows.identity.companyWebsite ?? ''
  );
  const { saving, submit } = useSubmit(onSave);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit({
          companyName: name.trim() || null,
          companyWebsite: website.trim() || null
        });
      }}
      className='grid gap-3 sm:grid-cols-2'
    >
      <div className='space-y-1.5'>
        <Label htmlFor='follow-up-company'>
          {t('rows.identity.companyName')}
        </Label>
        <Input
          id='follow-up-company'
          autoFocus
          maxLength={120}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={
            review.rows.identity.kind === 'person'
              ? t('rows.identity.companyOptional')
              : undefined
          }
        />
      </div>
      <div className='space-y-1.5'>
        <Label htmlFor='follow-up-website'>{t('rows.identity.website')}</Label>
        <Input
          id='follow-up-website'
          maxLength={200}
          inputMode='url'
          value={website}
          onChange={(event) => setWebsite(event.target.value)}
        />
      </div>
      <div className='sm:col-span-2'>
        <EditorActions onCancel={onCancel} saving={saving} />
      </div>
    </form>
  );
}

function TextEditor({
  initial,
  placeholder,
  onCancel,
  onSave
}: {
  initial: string;
  placeholder: string;
  onCancel: () => void;
  onSave: (text: string) => Promise<boolean>;
}) {
  const [text, setText] = useState(initial);
  const { saving, submit } = useSubmit(onSave);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit(text);
      }}
    >
      <Textarea
        autoFocus
        rows={4}
        maxLength={2000}
        value={text}
        placeholder={placeholder}
        onChange={(event) => setText(event.target.value)}
      />
      <EditorActions onCancel={onCancel} saving={saving} />
    </form>
  );
}

function ChoiceEditor({
  options,
  initial,
  onCancel,
  onSave,
  footer
}: {
  options: Array<{ id: string; label: string; hint: string }>;
  initial: string | null;
  onCancel: () => void;
  onSave: (id: string) => Promise<boolean>;
  footer?: ReactNode;
}) {
  const [picked, setPicked] = useState<string | null>(initial);
  const { saving, submit } = useSubmit(onSave);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (picked) void submit(picked);
      }}
    >
      <div role='radiogroup' className='space-y-2'>
        {options.map((option, index) => (
          <label
            key={option.id}
            className={cn(
              'hover:bg-muted/40 flex cursor-pointer items-start gap-3 rounded-lg border p-3',
              picked === option.id && 'border-primary bg-primary/5'
            )}
          >
            <input
              type='radio'
              name='follow-up-choice'
              className='mt-1'
              checked={picked === option.id}
              autoFocus={index === 0}
              onChange={() => setPicked(option.id)}
            />
            <span>
              <span className='block text-sm font-semibold'>
                {option.label}
              </span>
              <span className='text-muted-foreground block text-xs'>
                {option.hint}
              </span>
            </span>
          </label>
        ))}
      </div>
      {footer ? <div className='mt-2'>{footer}</div> : null}
      <EditorActions onCancel={onCancel} saving={saving} disabled={!picked} />
    </form>
  );
}

const DAYS = [1, 2, 3, 4, 5, 6, 0];

function WindowFields({
  value,
  onChange,
  idPrefix,
  lastEndMinute = 24 * 60
}: {
  value: CallingWindow;
  onChange: (value: CallingWindow) => void;
  idPrefix: string;
  /** Calling hours may end at midnight; bookable hours end by 23:59. */
  lastEndMinute?: number;
}) {
  const t = useTranslations('aiVoiceAgents.followUp');
  const locale = useLocale();
  const steps = Array.from({ length: 49 }, (_, index) => index * 30);
  const dayName = (day: number) =>
    new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      timeZone: 'UTC'
    }).format(new Date(Date.UTC(2026, 10, 8 + day)));
  return (
    <div className='space-y-3'>
      <div
        role='group'
        aria-label={t('editor.days')}
        className='flex flex-wrap gap-1.5'
      >
        {DAYS.map((day) => {
          const on = value.days.includes(day);
          return (
            <button
              key={day}
              type='button'
              aria-pressed={on}
              onClick={() =>
                onChange({
                  ...value,
                  days: on
                    ? value.days.filter((current) => current !== day)
                    : [...value.days, day].sort((a, b) => a - b)
                })
              }
              className={cn(
                'rounded-md border px-2.5 py-1 text-xs font-medium capitalize',
                on
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'text-muted-foreground'
              )}
            >
              {dayName(day)}
            </button>
          );
        })}
      </div>
      <div className='flex flex-wrap items-center gap-2 text-sm'>
        <label htmlFor={`${idPrefix}-start`} className='text-muted-foreground'>
          {t('editor.from')}
        </label>
        <select
          id={`${idPrefix}-start`}
          className='bg-background rounded-md border px-2 py-1.5 text-sm'
          value={value.startMinute}
          onChange={(event) =>
            onChange({ ...value, startMinute: Number(event.target.value) })
          }
        >
          {steps.slice(0, -1).map((minute) => (
            <option key={minute} value={minute}>
              {formatMinute(minute, locale)}
            </option>
          ))}
        </select>
        <label htmlFor={`${idPrefix}-end`} className='text-muted-foreground'>
          {t('editor.to')}
        </label>
        <select
          id={`${idPrefix}-end`}
          className='bg-background rounded-md border px-2 py-1.5 text-sm'
          value={value.endMinute}
          onChange={(event) =>
            onChange({ ...value, endMinute: Number(event.target.value) })
          }
        >
          {steps
            .slice(1)
            .filter((minute) => minute <= lastEndMinute)
            .map((minute) => (
              <option key={minute} value={minute}>
                {minute === 1440
                  ? t('editor.midnight')
                  : formatMinute(minute, locale)}
              </option>
            ))}
        </select>
      </div>
    </div>
  );
}

function validWindow(value: CallingWindow): boolean {
  return value.days.length > 0 && value.endMinute - value.startMinute >= 30;
}

function WindowEditor({
  initial,
  onCancel,
  onSave
}: {
  initial: CallingWindow;
  onCancel: () => void;
  onSave: (value: CallingWindow) => Promise<boolean>;
}) {
  const t = useTranslations('aiVoiceAgents.followUp');
  const [value, setValue] = useState(initial);
  const { saving, submit } = useSubmit(onSave);
  const valid = validWindow(value);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) void submit(value);
      }}
    >
      <WindowFields
        value={value}
        onChange={setValue}
        idPrefix='calling-hours'
      />
      {!valid ? (
        <p className='mt-2 text-xs text-amber-600'>
          {t('editor.invalidWindow')}
        </p>
      ) : null}
      <EditorActions onCancel={onCancel} saving={saving} disabled={!valid} />
    </form>
  );
}

function CalendarEditor({
  review,
  onCancel,
  onSave
}: {
  review: FollowUpReview;
  onCancel: () => void;
  onSave: (changes: Partial<FollowUpDraft>) => Promise<boolean>;
}) {
  const t = useTranslations('aiVoiceAgents.followUp');
  const calendar = review.rows.calendar;
  const [calendarId, setCalendarId] = useState(calendar.selected?.id ?? null);
  const needsHours = calendar.availability.source !== 'calendar';
  const [hours, setHours] = useState<CallingWindow>(
    calendar.availability.window ?? {
      days: [1, 2, 3, 4, 5],
      startMinute: 9 * 60,
      endMinute: 17 * 60
    }
  );
  const { saving, submit } = useSubmit(onSave);
  const valid = !needsHours || validWindow(hours);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) return;
        void submit({
          ...(calendarId && calendarId !== calendar.selected?.id
            ? { calendarId }
            : {}),
          ...(needsHours ? { availability: hours } : {})
        });
      }}
      className='space-y-4'
    >
      {calendar.candidates.length > 1 ? (
        <div className='space-y-1.5'>
          <Label htmlFor='follow-up-calendar'>{t('rows.calendar.which')}</Label>
          <select
            id='follow-up-calendar'
            className='bg-background w-full rounded-md border px-2 py-1.5 text-sm'
            value={calendarId ?? ''}
            onChange={(event) => setCalendarId(event.target.value || null)}
          >
            {calendar.candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {needsHours ? (
        <div className='space-y-1.5'>
          <p className='text-sm font-medium'>{t('rows.calendar.freeHours')}</p>
          <WindowFields
            value={hours}
            onChange={setHours}
            idPrefix='availability'
            lastEndMinute={24 * 60 - 30}
          />
        </div>
      ) : (
        <p className='text-muted-foreground text-xs'>
          {t('rows.calendar.hoursInSettings')}
        </p>
      )}
      <EditorActions onCancel={onCancel} saving={saving} disabled={!valid} />
    </form>
  );
}

function ZoneEditor({
  initial,
  onCancel,
  onSave
}: {
  initial: string;
  onCancel: () => void;
  onSave: (zone: string) => Promise<boolean>;
}) {
  const t = useTranslations('aiVoiceAgents.followUp');
  const locale = useLocale();
  const [zone, setZone] = useState(initial);
  const { saving, submit } = useSubmit(onSave);
  const options = timeZoneOptions(initial);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit(zone);
      }}
    >
      <Label htmlFor='follow-up-zone' className='sr-only'>
        {t('rows.timeZone.label')}
      </Label>
      <select
        id='follow-up-zone'
        autoFocus
        className='bg-background w-full rounded-md border px-2 py-1.5 text-sm'
        value={zone}
        onChange={(event) => setZone(event.target.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {formatZone(option, locale)} · {option}
          </option>
        ))}
      </select>
      <EditorActions onCancel={onCancel} saving={saving} />
    </form>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
