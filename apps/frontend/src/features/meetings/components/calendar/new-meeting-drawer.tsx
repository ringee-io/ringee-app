'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { addDays, isSameDay, startOfDay } from 'date-fns';
import {
  Check,
  ChevronDown,
  Circle,
  CircleCheck,
  Cpu,
  Loader2,
  Search,
  TriangleAlert,
  X
} from 'lucide-react';
import { ApiError } from '@ringee/frontend-shared/lib/api';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@ringee/frontend-shared/components/ui/dropdown-menu';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Label } from '@ringee/frontend-shared/components/ui/label';
import { Textarea } from '@ringee/frontend-shared/components/ui/textarea';
import { cn } from '@ringee/frontend-shared/lib/utils';
import {
  DateStepper,
  FieldError,
  Segmented,
  SideDrawer,
  SlotGrid
} from './calendar-parts';
import {
  DURATIONS,
  atTime,
  browserTimeZone,
  findCalendar,
  firstName,
  initials,
  useCalendarFormat
} from './calendar-utils';
import { useOpenSlots } from './use-meetings-data';
import type {
  CalendarMeeting,
  NewMeetingDraft,
  ReminderPlan,
  RingeeCalendar
} from './types';

import { offerMeetingInvitation } from '@/features/ai-voice-agents/automations/follow-up/follow-up-invitation';
/** A saved contact, as `GET /contacts` lists it. */
interface ContactOption {
  id: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  phoneNumber: string;
  email: string | null;
  company: string | null;
  timezone: string | null;
  locationCity: string | null;
}

type Field =
  | 'contact'
  | 'inviteEmail'
  | 'first'
  | 'last'
  | 'phone'
  | 'email'
  | 'time'
  | 'title';

const digits = (value: string) => value.replace(/\D/g, '');
/** With its country code: "+", then 8 to 15 digits (E.164). */
const phoneOk = (value: string) =>
  /^\s*\+/.test(value) &&
  digits(value).length >= 8 &&
  digits(value).length <= 15;
const toE164 = (value: string) => `+${digits(value)}`;
const mailOk = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

const optionName = (c: ContactOption) =>
  c.name?.trim() ||
  [c.firstName, c.lastName].filter(Boolean).join(' ').trim() ||
  c.phoneNumber;

/** Minutes a zone is ahead of UTC at an instant. */
function zoneOffset(timeZone: string, at: Date): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).formatToParts(at);
    const read = (type: string) =>
      Number(parts.find((part) => part.type === type)?.value ?? 0);
    const asUtc = Date.UTC(
      read('year'),
      read('month') - 1,
      read('day'),
      read('hour'),
      read('minute')
    );
    return Math.round((asUtc - at.getTime()) / 60_000);
  } catch {
    return null;
  }
}

/**
 * New meeting, on the right: who (a saved contact or a new one), when (the
 * calendar's open times, or a time picked on the calendar behind) and what.
 * It shows, as it is filled in, what the AI agent needs to follow up.
 */
export function NewMeetingDrawer({
  draft,
  onDraftChange,
  calendars,
  plan,
  now,
  onClose,
  onBooked
}: {
  draft: NewMeetingDraft;
  onDraftChange: (patch: Partial<NewMeetingDraft>) => void;
  calendars: RingeeCalendar[];
  plan: ReminderPlan | null;
  now: Date;
  onClose: () => void;
  onBooked: (meeting: CalendarMeeting, contactFirstName: string) => void;
}) {
  const t = useTranslations('meetings.page.new');
  const tGrid = useTranslations('meetings.page.grid');
  const tProvider = useTranslations('meetings.page.providers');
  const fmt = useCalendarFormat();
  const api = useApi();

  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ContactOption[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [contact, setContact] = useState<ContactOption | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Set<Field>>(new Set());
  const [booking, setBooking] = useState(false);
  // The contact a failed booking already saved, with the details it was saved
  // from: a retry with the same details books on it instead of saving again.
  const created = useRef<{ id: string; details: string } | null>(null);
  const [dnc, setDnc] = useState<{ phone: string; listed: boolean | null }>({
    phone: '',
    listed: null
  });
  const bodyRef = useRef<HTMLDivElement>(null);
  const findRef = useRef<HTMLInputElement>(null);
  const firstRef = useRef<HTMLInputElement>(null);

  const calendar =
    findCalendar(calendars, draft.calendarId) ??
    calendars.find((c) => c.isDefault) ??
    null;
  const provider = calendar?.integration
    ? tProvider(calendar.integration.provider)
    : null;

  const { slots, loading, failed, reload } = useOpenSlots({
    calendarId: calendar?.id ?? draft.calendarId,
    date: draft.date,
    duration: draft.duration
  });

  // Who the meeting is with, whichever way they were given.
  const person =
    mode === 'existing'
      ? contact
        ? {
            first: contact.firstName?.trim() || firstName(optionName(contact)),
            full: optionName(contact),
            phone: contact.phoneNumber,
            email: inviteEmail
          }
        : null
      : {
          first: first.trim(),
          full: [first.trim(), last.trim()].filter(Boolean).join(' '),
          phone: phone.trim(),
          email: email.trim()
        };

  // The calendar's dashed preview carries the name as it is typed.
  const label = person?.full || null;
  useEffect(() => {
    if (draft.label !== label) onDraftChange({ label });
  }, [draft.label, label, onDraftChange]);

  // Saved contacts matching what is typed.
  useEffect(() => {
    if (mode !== 'existing' || contact) return;
    let active = true;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams({ limit: '8' });
        if (query.trim()) params.set('search', query.trim());
        const res = await api.get<{ data: ContactOption[] }>(
          `/contacts?${params}`
        );
        if (active) setResults(res.data);
      } catch {
        if (active) setResults([]);
      } finally {
        if (active) setSearching(false);
      }
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [api, contact, mode, query]);

  // The AI agent never calls a number on the DNC list: say so before booking.
  const phoneToCheck =
    person && phoneOk(person.phone) ? toE164(person.phone) : '';
  useEffect(() => {
    if (!phoneToCheck) return;
    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const res = await api.get<{ isOnDNC: boolean }>(
          `/dnc/check/${encodeURIComponent(phoneToCheck)}`
        );
        if (active) setDnc({ phone: phoneToCheck, listed: res.isOnDNC });
      } catch {
        if (active) setDnc({ phone: phoneToCheck, listed: null });
      }
    }, 300);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [api, phoneToCheck]);

  useEffect(() => {
    if (mode === 'new') firstRef.current?.focus();
    else if (!contact) findRef.current?.focus();
  }, [mode, contact]);

  const when = draft.time ? atTime(draft.date, draft.time) : null;
  const offered = draft.time ? slots.includes(draft.time) : false;

  // ── What the AI agent needs ─────────────────────────────────
  const listed = dnc.phone === phoneToCheck ? dnc.listed : null;
  const needs: { key: string; ok: boolean; bad?: boolean }[] = [
    { key: 'name', ok: !!person?.first },
    { key: 'phone', ok: !!person && phoneOk(person.phone) },
    { key: 'email', ok: !!person && mailOk(person.email) },
    {
      key: 'dnc',
      ok: !!phoneToCheck && listed === false,
      bad: !!phoneToCheck && listed === true
    }
  ];
  const missing = needs.filter((need) => !need.ok).length;
  const started = !!(
    person &&
    (person.first || person.full || person.phone || person.email)
  );
  const warn = missing > 0 && started;
  const aiCovers = !!plan && !!calendar && plan.calendarIds.has(calendar.id);
  const aiAt =
    aiCovers && when
      ? new Date(when.getTime() - plan!.offsetMinutes * 60_000)
      : null;

  // "That's 2:00 PM for Priya, in Miami."
  const theirTime = useMemo(() => {
    if (mode !== 'existing' || !contact?.timezone || !when) return null;
    const theirs = zoneOffset(contact.timezone, when);
    const mine = zoneOffset(browserTimeZone(), when);
    if (theirs == null || mine == null) return null;
    const place =
      contact.locationCity ||
      contact.timezone.split('/').pop()?.replace(/_/g, ' ') ||
      contact.timezone;
    const name = person?.first || optionName(contact);
    if (theirs === mine) return t('sameTime', { name, place });
    const local = new Date(when.getTime() + (theirs - mine) * 60_000);
    return t('theirTime', { time: fmt.time(local), name, place });
  }, [contact, fmt, mode, person?.first, t, when]);

  const clearError = (field: Field) =>
    setErrors((current) => {
      if (!current.has(field)) return current;
      const next = new Set(current);
      next.delete(field);
      return next;
    });

  const pick = (option: ContactOption) => {
    setContact(option);
    setInviteEmail(option.email ?? '');
    setShowResults(false);
    clearError('contact');
  };

  const book = async () => {
    const bad = new Set<Field>();
    if (mode === 'existing') {
      if (!contact) bad.add('contact');
      else if (!mailOk(inviteEmail)) bad.add('inviteEmail');
    } else {
      if (!first.trim()) bad.add('first');
      if (!last.trim()) bad.add('last');
      if (!phoneOk(phone)) bad.add('phone');
      if (!mailOk(email)) bad.add('email');
    }
    if (!draft.time || (!loading && !offered)) bad.add('time');
    if (!title.trim()) bad.add('title');
    setErrors(bad);
    if (bad.size > 0) {
      window.setTimeout(() => {
        bodyRef.current
          ?.querySelector('[data-invalid="true"]')
          ?.scrollIntoView({ block: 'nearest' });
      }, 0);
      return;
    }

    setBooking(true);
    try {
      let contactId = contact?.id ?? null;
      if (mode === 'new') {
        const details = {
          name: `${first.trim()} ${last.trim()}`,
          firstName: first.trim(),
          lastName: last.trim(),
          phoneNumber: toE164(phone),
          email: email.trim(),
          organization: company.trim() || undefined
        };
        const key = JSON.stringify(details);
        if (created.current?.details === key) {
          contactId = created.current.id;
        } else {
          created.current = null;
          try {
            const saved = await api.post<{ id: string }>('/contacts', details);
            created.current = { id: saved.id, details: key };
            contactId = saved.id;
          } catch (error) {
            toast.error(
              error instanceof ApiError &&
                error.status === 400 &&
                error.message === 'Contact already exists'
                ? t('contactExists')
                : t('contactFailed')
            );
            setBooking(false);
            return;
          }
        }
      }

      const meeting = await api.post<CalendarMeeting>('/meetings', {
        contactId,
        title: title.trim(),
        scheduledAt: atTime(draft.date, draft.time!).toISOString(),
        duration: draft.duration,
        notes: notes.trim() || undefined,
        attendeeEmail: (mode === 'existing' ? inviteEmail : email).trim(),
        calendarId: calendar?.id ?? undefined,
        requireAvailableSlot: true,
        bookingTimeZone: browserTimeZone()
      });
      offerMeetingInvitation({ meetingId: meeting?.id });
      onBooked(meeting, person?.first ?? '');
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        toast.error(t('taken'));
        void reload();
      } else {
        toast.error(t('failed'));
      }
      setBooking(false);
    }
  };

  const invalid = (field: Field) => errors.has(field);

  return (
    <SideDrawer labelledBy='mt-new-title'>
      <div className='grid gap-1 border-b py-4 pr-4 pl-6'>
        <div className='flex min-h-8 items-center gap-1'>
          <h2
            id='mt-new-title'
            className='min-w-0 flex-1 text-[18px] leading-snug font-semibold tracking-[-0.01em]'
          >
            {t('title')}
          </h2>
          <Button
            type='button'
            variant='ghost'
            size='icon'
            className='size-8'
            onClick={onClose}
            aria-label={t('close')}
          >
            <X />
          </Button>
        </div>
        <p className='text-muted-foreground pr-1.5 text-[13px] leading-snug'>
          {t('subtitle')}
        </p>
      </div>

      <div
        ref={bodyRef}
        className='grid min-h-0 flex-1 content-start gap-6 overflow-y-auto px-6 pt-5 pb-8'
      >
        {/* 1 Who */}
        <section className='grid gap-3' aria-labelledby='nw-s1'>
          <StepTitle id='nw-s1' n={1}>
            {t('who')}
          </StepTitle>
          <Segmented
            label={t('who')}
            value={mode}
            onChange={(value) => {
              setMode(value);
              setErrors(new Set());
              created.current = null;
            }}
            className='h-9 w-full'
            options={[
              { value: 'existing', label: t('existing') },
              { value: 'new', label: t('newContact') }
            ]}
          />

          {mode === 'existing' ? (
            contact ? (
              <>
                <div className='flex min-w-0 items-center gap-2.5 rounded-lg border px-3 py-2.5'>
                  <span className='bg-muted grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold'>
                    {initials(optionName(contact))}
                  </span>
                  <div className='grid min-w-0 flex-1 leading-[1.35]'>
                    <b className='truncate font-semibold'>
                      {optionName(contact)}
                    </b>
                    {contact.company ? (
                      <span className='text-muted-foreground truncate text-[12.8px]'>
                        {contact.company}
                      </span>
                    ) : null}
                    <span className='text-muted-foreground font-mono text-[12.8px] tabular-nums'>
                      {fmt.phone(contact.phoneNumber)}
                    </span>
                  </div>
                  <Button
                    type='button'
                    variant='ghost'
                    size='sm'
                    onClick={() => {
                      setContact(null);
                      setShowResults(true);
                    }}
                  >
                    {t('change')}
                  </Button>
                </div>
                <div
                  className='grid gap-[7px]'
                  data-invalid={invalid('inviteEmail')}
                >
                  <Label htmlFor='nw-invite'>{t('inviteEmail')}</Label>
                  <Input
                    id='nw-invite'
                    type='email'
                    value={inviteEmail}
                    placeholder={t('emailPlaceholder')}
                    aria-invalid={invalid('inviteEmail')}
                    onChange={(event) => {
                      setInviteEmail(event.target.value);
                      clearError('inviteEmail');
                    }}
                  />
                  {invalid('inviteEmail') ? (
                    <FieldError>{t('errors.inviteEmail')}</FieldError>
                  ) : (
                    <p className='text-muted-foreground text-[12.8px]'>
                      {t('inviteEmailHint')}
                    </p>
                  )}
                </div>
              </>
            ) : (
              <div className='grid gap-[7px]' data-invalid={invalid('contact')}>
                <Label htmlFor='nw-find'>{t('contact')}</Label>
                <div className='relative'>
                  <Search className='text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2' />
                  <Input
                    id='nw-find'
                    ref={findRef}
                    type='search'
                    value={query}
                    autoComplete='off'
                    placeholder={t('searchPlaceholder')}
                    aria-invalid={invalid('contact')}
                    className='pl-8'
                    onFocus={() => setShowResults(true)}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setShowResults(true);
                    }}
                  />
                </div>
                {invalid('contact') ? (
                  <FieldError>{t('errors.contact')}</FieldError>
                ) : null}
                {showResults ? (
                  <div className='bg-popover grid max-h-64 overflow-y-auto rounded-lg border p-1'>
                    {searching && !results ? (
                      <p className='text-muted-foreground flex items-center gap-2 px-2 py-1.5 text-[12.8px]'>
                        <Loader2 className='size-3.5 animate-spin' />
                        {t('searching')}
                      </p>
                    ) : results && results.length > 0 ? (
                      results.map((option) => (
                        <button
                          key={option.id}
                          type='button'
                          onClick={() => pick(option)}
                          className='hover:bg-accent focus-visible:bg-accent flex min-w-0 items-center gap-2.5 rounded-md px-2 py-1.5 text-left outline-none'
                        >
                          <span className='bg-muted grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold'>
                            {initials(optionName(option))}
                          </span>
                          <span className='grid min-w-0 leading-[1.35]'>
                            <b className='truncate font-semibold'>
                              {optionName(option)}
                            </b>
                            <span className='text-muted-foreground truncate text-xs'>
                              {[
                                option.company,
                                fmt.phone(option.phoneNumber),
                                option.email ? null : t('noEmail')
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </span>
                          </span>
                        </button>
                      ))
                    ) : (
                      <p className='text-muted-foreground px-2 py-1.5 text-[12.8px]'>
                        {t('noMatch')}
                      </p>
                    )}
                  </div>
                ) : null}
              </div>
            )
          ) : (
            <div className='grid gap-3'>
              <div className='grid grid-cols-2 gap-3'>
                <TextField
                  id='nw-first'
                  inputRef={firstRef}
                  label={t('firstName')}
                  placeholder='Carlos'
                  value={first}
                  onChange={(value) => {
                    setFirst(value);
                    clearError('first');
                  }}
                  error={invalid('first') ? t('errors.first') : null}
                  maxLength={50}
                />
                <TextField
                  id='nw-last'
                  label={t('lastName')}
                  placeholder='Mendoza'
                  value={last}
                  onChange={(value) => {
                    setLast(value);
                    clearError('last');
                  }}
                  error={invalid('last') ? t('errors.last') : null}
                  maxLength={50}
                />
              </div>
              <TextField
                id='nw-phone'
                type='tel'
                label={t('phone')}
                placeholder='+1 786 555 0129'
                value={phone}
                onChange={(value) => {
                  setPhone(value);
                  clearError('phone');
                }}
                hint={t('phoneHint')}
                error={
                  invalid('phone')
                    ? phone.trim()
                      ? t('errors.phoneCountry')
                      : t('errors.phone')
                    : null
                }
                maxLength={20}
              />
              <TextField
                id='nw-email'
                type='email'
                label={t('email')}
                placeholder={t('emailPlaceholder')}
                value={email}
                onChange={(value) => {
                  setEmail(value);
                  clearError('email');
                }}
                error={invalid('email') ? t('errors.email') : null}
                maxLength={100}
              />
              <TextField
                id='nw-company'
                label={t('company')}
                placeholder={t('optional')}
                value={company}
                onChange={setCompany}
                maxLength={100}
              />
              <p className='text-muted-foreground text-[12.8px]'>
                {t('savedToContacts')}
              </p>
            </div>
          )}

          <div
            aria-live='polite'
            className={cn(
              'grid gap-2 rounded-lg border px-3.5 py-3',
              missing === 0
                ? 'border-emerald-500/30 bg-emerald-500/[0.06]'
                : warn
                  ? 'border-amber-500/30 bg-amber-500/[0.06]'
                  : 'bg-muted/30'
            )}
          >
            <p className='flex items-center gap-2 text-[13px] font-semibold'>
              <Cpu className='size-3.5 shrink-0' />
              <span className='min-w-0 flex-1'>{t('needs.title')}</span>
              {missing === 0 ? (
                <em className='text-xs font-semibold text-emerald-600 not-italic dark:text-emerald-400'>
                  {t('needs.ready')}
                </em>
              ) : warn ? (
                <em className='text-xs font-semibold text-amber-600 not-italic dark:text-amber-400'>
                  {t('needs.missing', { count: missing })}
                </em>
              ) : null}
            </p>
            <ul className='grid gap-1.5'>
              {needs.map((need) => (
                <li
                  key={need.key}
                  className='text-muted-foreground flex items-start gap-2 text-[12.8px]'
                >
                  {need.ok ? (
                    <CircleCheck className='mt-px size-3.5 shrink-0 text-emerald-500' />
                  ) : need.bad ? (
                    <TriangleAlert className='mt-px size-3.5 shrink-0 text-amber-500' />
                  ) : (
                    <Circle className='mt-px size-3.5 shrink-0' />
                  )}
                  <span>
                    <b className='text-foreground font-medium'>
                      {t(
                        need.key === 'dnc' && need.bad
                          ? 'needs.dncListed'
                          : `needs.${need.key}`
                      )}
                    </b>{' '}
                    · {t(`needs.${need.key}Why`)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <div className='border-t' />

        {/* 2 When */}
        <section className='grid gap-3' aria-labelledby='nw-s2'>
          <StepTitle id='nw-s2' n={2}>
            {t('when')}
          </StepTitle>
          {calendars.length > 0 ? (
            <div className='grid gap-[7px]'>
              <span className='text-sm leading-none font-medium'>
                {t('calendar')}
              </span>
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <button
                    type='button'
                    className='border-input dark:bg-input/30 focus-visible:ring-ring/50 flex h-8 w-full items-center gap-[7px] rounded-md border bg-transparent px-2.5 text-left text-sm outline-none focus-visible:ring-[3px]'
                  >
                    <span className='min-w-0 flex-1 truncate'>
                      {calendar?.name}
                      {provider ? (
                        <small className='text-muted-foreground text-xs'>
                          {' '}
                          · {provider}
                        </small>
                      ) : null}
                    </span>
                    <ChevronDown className='text-muted-foreground size-3.5 shrink-0' />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align='start'
                  className='w-[var(--radix-dropdown-menu-trigger-width)]'
                >
                  {calendars.map((option) => (
                    <DropdownMenuItem
                      key={option.id}
                      onSelect={() =>
                        onDraftChange({ calendarId: option.id, time: null })
                      }
                      className='items-start'
                    >
                      <span className='grid min-w-0 flex-1'>
                        <b className='truncate font-medium'>{option.name}</b>
                        <span className='text-muted-foreground truncate text-xs'>
                          {option.integration
                            ? [
                                tProvider(option.integration.provider),
                                option.integration.email
                              ]
                                .filter(Boolean)
                                .join(' · ')
                            : t('onlyRingee')}
                        </span>
                      </span>
                      {option.id === calendar?.id ? (
                        <Check className='mt-0.5 !text-emerald-500' />
                      ) : null}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : null}

          <div className='grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3.5'>
            <div className='grid gap-[7px]'>
              <span className='text-sm leading-none font-medium'>
                {t('date')}
              </span>
              <DateStepper
                date={draft.date}
                label={fmt.shortDay(draft.date)}
                onStep={(days) =>
                  onDraftChange({
                    date: startOfDay(addDays(draft.date, days)),
                    time: null
                  })
                }
                disablePrev={isSameDay(draft.date, now)}
              />
            </div>
            <div className='grid gap-[7px]'>
              <span className='text-sm leading-none font-medium'>
                {t('duration')}
              </span>
              <Segmented
                kind='radiogroup'
                label={t('duration')}
                value={draft.duration}
                onChange={(duration) => onDraftChange({ duration })}
                options={DURATIONS.map((value) => ({
                  value,
                  label:
                    value === 60
                      ? tGrid('durationHour')
                      : tGrid('durationShort', { count: value })
                }))}
              />
            </div>
          </div>

          <div className='grid gap-[7px]' data-invalid={invalid('time')}>
            <span className='text-sm leading-none font-medium'>
              {t('startTime')}{' '}
              <small className='text-muted-foreground text-xs font-normal'>
                ·{' '}
                {calendar
                  ? t('openTimesOn', { calendar: calendar.name })
                  : t('openTimes')}
              </small>
            </span>
            <SlotGrid
              date={draft.date}
              slots={slots}
              value={draft.time}
              onChange={(time) => {
                onDraftChange({ time });
                clearError('time');
              }}
              loading={loading}
              failed={failed}
              onRetry={() => void reload()}
              columns={4}
              dayName={fmt.weekdayLong(draft.date)}
            />
            {invalid('time') ? (
              <FieldError>
                {draft.time
                  ? t('errors.timeNotOpen', {
                      calendar: calendar?.name ?? ''
                    })
                  : t('errors.time')}
              </FieldError>
            ) : draft.time && !loading && !failed && !offered ? (
              <p className='text-[12.8px] text-amber-600 dark:text-amber-400'>
                {t('notOpen', {
                  time: fmt.time(atTime(draft.date, draft.time)),
                  calendar: calendar?.name ?? ''
                })}
              </p>
            ) : null}
            {theirTime ? (
              <p className='text-muted-foreground text-[12.8px]'>{theirTime}</p>
            ) : null}
          </div>
        </section>

        <div className='border-t' />

        {/* 3 What */}
        <section className='grid gap-3' aria-labelledby='nw-s3'>
          <StepTitle id='nw-s3' n={3}>
            {t('what')}
          </StepTitle>
          <TextField
            id='nw-title'
            label={t('reason')}
            placeholder={t('reasonPlaceholder')}
            value={title}
            onChange={(value) => {
              setTitle(value);
              clearError('title');
            }}
            error={invalid('title') ? t('errors.title') : null}
            maxLength={200}
          />
          {calendar?.integration?.provider === 'google' ? (
            <p className='text-muted-foreground flex items-center gap-2 text-[12.8px]'>
              <CircleCheck className='size-3.5 shrink-0 text-emerald-500' />
              {t('meetLink')}
            </p>
          ) : null}
          <div className='grid gap-[7px]'>
            <Label htmlFor='nw-notes'>
              {t('notes')}{' '}
              <small className='text-muted-foreground text-xs font-normal'>
                · {t('optional').toLowerCase()}
              </small>
            </Label>
            <Textarea
              id='nw-notes'
              rows={2}
              value={notes}
              maxLength={2000}
              placeholder={t('notesPlaceholder')}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
        </section>
      </div>

      <div className='grid gap-3 border-t px-6 pt-4 pb-5'>
        {warn && aiCovers ? (
          <p className='text-muted-foreground flex items-start gap-[7px] text-[12.8px] leading-snug'>
            <TriangleAlert className='mt-px size-3.5 shrink-0 text-amber-500' />
            <span>
              {t.rich('footer.complete', {
                agent: plan?.agentName ?? t('footer.remindersAgent'),
                strong: (chunks) => (
                  <b className='text-foreground font-medium'>{chunks}</b>
                )
              })}
            </span>
          </p>
        ) : aiCovers ? (
          <p className='text-muted-foreground flex items-start gap-[7px] text-[12.8px] leading-snug'>
            <Cpu className='text-foreground mt-px size-3.5 shrink-0' />
            <span>
              {t.rich(aiAt && aiAt > now ? 'footer.aiAt' : 'footer.aiBefore', {
                agent: plan?.agentName ?? t('footer.remindersAgent'),
                name: person?.first || t('footer.theContact'),
                day: aiAt ? fmt.shortDay(aiAt) : '',
                time: aiAt ? fmt.time(aiAt) : '',
                hours: String(Math.round((plan?.offsetMinutes ?? 0) / 6) / 10),
                strong: (chunks) => (
                  <b className='text-foreground font-medium'>{chunks}</b>
                )
              })}
            </span>
          </p>
        ) : provider ? (
          <p className='text-muted-foreground text-[12.8px] leading-snug'>
            {t('footer.invite', {
              name: person?.first || t('footer.theContact'),
              provider
            })}
          </p>
        ) : null}
        <div className='flex items-center justify-end gap-[7px]'>
          <Button type='button' variant='ghost' onClick={onClose}>
            {t('discard')}
          </Button>
          <Button
            type='button'
            onClick={() => void book()}
            disabled={booking}
            className='bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500'
          >
            {booking ? <Loader2 className='animate-spin' /> : null}
            {t('book')}
          </Button>
        </div>
      </div>
    </SideDrawer>
  );
}

function StepTitle({
  id,
  n,
  children
}: {
  id: string;
  n: number;
  children: React.ReactNode;
}) {
  return (
    <p id={id} className='flex items-center gap-2.5 text-[15px] font-semibold'>
      <span className='bg-muted text-muted-foreground grid size-6 place-items-center rounded-full text-xs font-semibold'>
        {n}
      </span>
      {children}
    </p>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  placeholder,
  hint,
  error,
  type = 'text',
  maxLength,
  inputRef
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  error?: string | null;
  type?: string;
  maxLength?: number;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  return (
    <div className='grid content-start gap-[7px]' data-invalid={!!error}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        ref={inputRef}
        type={type}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        aria-invalid={!!error}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? (
        <FieldError>{error}</FieldError>
      ) : hint ? (
        <p className='text-muted-foreground text-[12.8px]'>{hint}</p>
      ) : null}
    </div>
  );
}
