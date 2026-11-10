'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  addDays,
  addMonths,
  addWeeks,
  startOfDay,
  startOfMonth
} from 'date-fns';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  RotateCw,
  Search
} from 'lucide-react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Kbd } from '@ringee/frontend-shared/components/ui/kbd';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { useVoiceAgentsRail } from '@/features/ai-voice-agents/automations/store';
import { useDialerStore } from '@/features/calls/store/dialer.store';
import { useSettingsDialogStore } from '@/features/settings/store/settings-dialog.store';
import { CalendarFilter } from './calendar-filter';
import { DrawerEdge, Segmented, useDrawerExit } from './calendar-parts';
import {
  aiCallAt,
  atTime,
  calendarIdOf,
  contactName,
  findCalendar,
  hhmm,
  inView,
  isUpcoming,
  meetingStart,
  viewRange,
  weekDays,
  useCalendarFormat
} from './calendar-utils';
import { CancelMeetingDialog } from './cancel-meeting-dialog';
import { EditMeetingDialog } from './edit-meeting-dialog';
import { MeetingDetailDrawer } from './meeting-detail-drawer';
import { CalendarsCard, UpcomingCard } from './meetings-side';
import { MonthGrid } from './month-grid';
import { NewMeetingDrawer } from './new-meeting-drawer';
import { TimeGrid } from './time-grid';
import { useMeetingsData, useReminderPlan } from './use-meetings-data';
import type { CalendarMeeting, CalendarView, NewMeetingDraft } from './types';

/** The clock the grid reads: set on the client, then every 30 seconds. */
function useClock(): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
    target.isContentEditable
  );
}

/**
 * Meetings: a calendar to see the workspace's meetings and manage them —
 * move, edit, cancel, book — with every change carried to the calendar each
 * one is copied to (Google Calendar or Outlook) and to the AI agent that
 * confirms it.
 */
export function MeetingsCalendar() {
  const now = useClock();
  if (!now) {
    return (
      <div className='grid gap-3.5'>
        <Skeleton className='h-16 w-full rounded-xl' />
        <Skeleton className='h-[572px] w-full rounded-xl' />
      </div>
    );
  }
  return <MeetingsCalendarReady now={now} />;
}

function MeetingsCalendarReady({ now }: { now: Date }) {
  const t = useTranslations('meetings.page');
  const tProvider = useTranslations('meetings.page.providers');
  const fmt = useCalendarFormat();
  const openSettings = useSettingsDialogStore((s) => s.openSettings);

  const [view, setView] = useState<CalendarView>('week');
  const [anchor, setAnchor] = useState(() => startOfDay(now));
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<CalendarMeeting | null>(null);
  const [draft, setDraft] = useState<NewMeetingDraft | null>(null);
  const [editing, setEditing] = useState<{
    id: string;
    initial: { date: Date; time: string } | null;
  } | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);

  const range = useMemo(() => viewRange(view, anchor), [view, anchor]);
  const data = useMeetingsData(range);
  const { plan, pilot, remindersOn } = useReminderPlan();

  // Calendars moved into the settings dialog. Links minted before that — an
  // agent's "manage availability", a bookmark — still arrive here as
  // `?calendar=<id>`, so they are forwarded to the pane that owns them now.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get('calendar');
    // The OAuth callback uses the same parameter for its status; only a real
    // id names a calendar.
    if (!requested || requested === 'connected' || requested === 'error')
      return;
    openSettings('calendars', requested);
    const url = new URL(window.location.href);
    url.searchParams.delete('calendar');
    window.history.replaceState({}, '', url.toString());
  }, [openSettings]);

  const defaultCalendarId =
    data.calendars.find((calendar) => calendar.isDefault)?.id ?? null;
  const calendarOf = useCallback(
    (m: CalendarMeeting) => calendarIdOf(m, defaultCalendarId),
    [defaultCalendarId]
  );
  const visible = useCallback(
    (m: CalendarMeeting) => {
      const id = calendarOf(m);
      return !id || !hidden.has(id);
    },
    [calendarOf, hidden]
  );
  const providerOf = useCallback(
    (m: CalendarMeeting) => {
      const calendar = findCalendar(data.calendars, calendarOf(m));
      return calendar?.integration
        ? tProvider(calendar.integration.provider)
        : null;
    },
    [calendarOf, data.calendars, tProvider]
  );
  const q = query.trim().toLowerCase();
  const matches = useCallback(
    (m: CalendarMeeting) =>
      !q ||
      `${contactName(m)} ${m.contact.company ?? ''}`.toLowerCase().includes(q),
    [q]
  );

  const shown = data.meetings.filter(visible);
  const upcoming = data.upcoming
    .filter((m) => isUpcoming(m, now) && visible(m))
    .sort((a, b) => meetingStart(a).getTime() - meetingStart(b).getTime());
  const failedCopies = data.upcoming.filter(
    (m) => isUpcoming(m, now) && m.externalSyncStatus === 'failed'
  );

  // The selected meeting as the server last said, wherever it was listed.
  // A meeting fresh from a write may come without its relations; it shows
  // once the lists have it.
  const current =
    (selected &&
      (data.meetings.find((m) => m.id === selected.id) ??
        data.upcoming.find((m) => m.id === selected.id) ??
        (selected.contact ? selected : null))) ||
    null;

  // ── The right edge holds one surface at a time ───────────────
  const quickDial = useDialerStore((state) => state.quickDial);
  const setQuickDial = useDialerStore((state) => state.setQuickDial);
  const railOpen = useVoiceAgentsRail((state) => state.open);
  const setRailOpen = useVoiceAgentsRail((state) => state.setOpen);
  const drawerOpen = !!current || !!draft;
  // One panel for both drawers: it slides in when the edge opens and out
  // when it closes, and stays put when "new" turns into the booked meeting.
  const panel = useDrawerExit<
    | { kind: 'detail'; meeting: CalendarMeeting }
    | { kind: 'new'; draft: NewMeetingDraft }
  >(
    draft
      ? { kind: 'new', draft }
      : current
        ? { kind: 'detail', meeting: current }
        : null
  );
  useEffect(() => {
    if (!drawerOpen) return;
    if (useDialerStore.getState().quickDial) setQuickDial(false);
    if (useVoiceAgentsRail.getState().open) setRailOpen(false);
  }, [drawerOpen, setQuickDial, setRailOpen]);
  const edge = useRef({ quickDial, railOpen });
  useEffect(() => {
    const opened =
      (quickDial && !edge.current.quickDial) ||
      (railOpen && !edge.current.railOpen);
    edge.current = { quickDial, railOpen };
    if (opened) {
      setSelected(null);
      setDraft(null);
    }
  }, [quickDial, railOpen]);

  // ── Navigation ───────────────────────────────────────────────
  const step = useCallback(
    (direction: -1 | 1) =>
      setAnchor((date) =>
        view === 'month'
          ? startOfMonth(addMonths(date, direction))
          : view === 'week'
            ? addWeeks(date, direction)
            : addDays(date, direction)
      ),
    [view]
  );
  const goToday = useCallback(() => setAnchor(startOfDay(new Date())), []);

  // The calendar follows the new meeting's date, so its preview stays in view.
  useEffect(() => {
    if (draft && !inView(view, anchor, draft.date))
      setAnchor(startOfDay(draft.date));
  }, [anchor, draft, view]);

  const select = useCallback(
    (m: CalendarMeeting) => {
      if (draft) {
        toast(t('toasts.finishNewFirst'));
        return;
      }
      const id = calendarOf(m);
      if (id && hidden.has(id)) {
        const next = new Set(hidden);
        next.delete(id);
        setHidden(next);
      }
      setSelected(m);
    },
    [calendarOf, draft, hidden, t]
  );

  const openNew = useCallback(
    (at?: { date: Date; time: string }) => {
      const visibleCalendars = data.calendars.filter((c) => !hidden.has(c.id));
      setSelected(null);
      setDraft({
        date: startOfDay(at?.date ?? addDays(new Date(), 1)),
        time: at?.time ?? null,
        duration: 30,
        calendarId:
          visibleCalendars.length === 1
            ? visibleCalendars[0]!.id
            : defaultCalendarId,
        label: null
      });
    },
    [data.calendars, defaultCalendarId, hidden]
  );

  const updateDraft = useCallback(
    (patch: Partial<NewMeetingDraft>) =>
      setDraft((current) => (current ? { ...current, ...patch } : current)),
    []
  );

  const pickTime = useCallback(
    (date: Date, minutes: number) => {
      const time = hhmm(minutes);
      if (atTime(date, time) < new Date()) {
        toast(t('toasts.pastTime'));
        return;
      }
      if (draft) updateDraft({ date: startOfDay(date), time });
      else openNew({ date, time });
    },
    [draft, openNew, t, updateDraft]
  );

  const dropMeeting = useCallback(
    (m: CalendarMeeting, date: Date, minutes: number) => {
      const time = hhmm(minutes);
      const when = atTime(date, time);
      if (when < new Date()) {
        toast(t('toasts.cannotMovePast'));
        return;
      }
      if (when.getTime() === meetingStart(m).getTime()) return;
      setSelected(m);
      setEditing({ id: m.id, initial: { date, time } });
    },
    [t]
  );

  // ── Keyboard ─────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // A dialog over the page — this one's or the call's — owns the keys.
      const dialogOpen =
        !!editing ||
        !!cancellingId ||
        filterOpen ||
        !!document.querySelector('[data-slot="dialog-content"]');
      if (event.key === 'Escape') {
        // A layer that took the key (a menu) or a field being typed in keeps
        // the drawer: Escape there is not "discard".
        if (dialogOpen || event.defaultPrevented || isTyping(event.target))
          return;
        if (draft) setDraft(null);
        else if (selected) setSelected(null);
        return;
      }
      if (dialogOpen || event.defaultPrevented || event.repeat) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTyping(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === 'n') {
        event.preventDefault();
        if (!draft) openNew();
      } else if (key === 't') goToday();
      else if (key === 'd') setView('day');
      else if (key === 'w') setView('week');
      else if (key === 'm') setView('month');
      else if (event.key === 'ArrowLeft') step(-1);
      else if (event.key === 'ArrowRight') step(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    cancellingId,
    draft,
    editing,
    filterOpen,
    goToday,
    openNew,
    selected,
    step
  ]);

  // ── Header and range ─────────────────────────────────────────
  const providers = [
    ...new Set(
      data.calendars.flatMap((calendar) =>
        calendar.integration ? [calendar.integration.provider] : []
      )
    )
  ];
  const syncLine =
    providers.length === 2
      ? t('syncedBoth')
      : providers.length === 1
        ? t('syncedOne', { provider: tProvider(providers[0]!) })
        : t('notSynced');

  const rangeLabel =
    view === 'day'
      ? fmt.longDay(anchor)
      : view === 'month'
        ? fmt.monthYear(anchor)
        : (() => {
            const days = weekDays(anchor);
            const ends = fmt.weekEnds(days[0]!, days[6]!);
            return t('weekRange', ends);
          })();

  const editingMeeting =
    editing &&
    (data.meetings.find((m) => m.id === editing.id) ??
      data.upcoming.find((m) => m.id === editing.id) ??
      (current?.id === editing.id ? current : null));
  const cancelling =
    cancellingId && current?.id === cancellingId ? current : null;

  return (
    <div className='grid min-w-0 gap-3.5 text-base'>
      <div className='flex flex-wrap items-end justify-between gap-3.5'>
        <div className='grid gap-1'>
          <h1 className='text-[30px] leading-tight font-bold tracking-[-0.025em]'>
            {t('title')}
          </h1>
          <p className='text-muted-foreground flex items-center gap-[7px] text-[13px]'>
            {providers.length > 0 ? (
              <span
                className='size-[7px] shrink-0 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.2)]'
                aria-hidden
              />
            ) : null}
            {syncLine}
          </p>
        </div>
        <Button
          type='button'
          onClick={() => openNew()}
          aria-keyshortcuts='N'
          className='bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500'
        >
          <Plus />
          {t('newMeeting')}
          <Kbd onColor className='hidden sm:inline-flex'>
            N
          </Kbd>
        </Button>
      </div>

      <div className='flex flex-wrap items-center justify-between gap-2.5'>
        <div className='flex min-w-0 items-center gap-[7px]'>
          <Button
            type='button'
            variant='outline'
            onClick={goToday}
            aria-keyshortcuts='T'
          >
            {t('today')}
            <Kbd className='hidden sm:inline-flex'>T</Kbd>
          </Button>
          <Button
            type='button'
            variant='ghost'
            size='icon'
            onClick={() => step(-1)}
            aria-label={t(`previous.${view}`)}
          >
            <ChevronLeft />
          </Button>
          <Button
            type='button'
            variant='ghost'
            size='icon'
            onClick={() => step(1)}
            aria-label={t(`next.${view}`)}
          >
            <ChevronRight />
          </Button>
          <h2
            className='ml-[7px] truncate text-lg font-semibold'
            aria-live='polite'
          >
            {rangeLabel}
          </h2>
        </div>
        <div className='flex flex-wrap items-center gap-[7px]'>
          {data.calendars.length > 0 ? (
            <CalendarFilter
              calendars={data.calendars}
              hidden={hidden}
              onChange={(next) => {
                setHidden(next);
                if (current) {
                  const id = calendarOf(current);
                  if (id && next.has(id)) setSelected(null);
                }
              }}
              onManage={() => openSettings('calendars')}
              open={filterOpen}
              onOpenChange={setFilterOpen}
            />
          ) : null}
          <label className='border-input dark:bg-input/30 focus-within:ring-ring/50 flex h-8 w-[220px] items-center gap-[7px] rounded-md border bg-transparent px-2.5 focus-within:ring-[3px]'>
            <Search className='text-muted-foreground size-3.5 shrink-0' />
            <input
              type='search'
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('searchPlaceholder')}
              aria-label={t('searchLabel')}
              className='placeholder:text-muted-foreground h-[30px] min-w-0 flex-1 bg-transparent text-sm outline-none'
            />
          </label>
          <Segmented
            label={t('viewLabel')}
            value={view}
            onChange={setView}
            options={[
              { value: 'day', label: t('views.day') },
              { value: 'week', label: t('views.week') },
              { value: 'month', label: t('views.month') }
            ]}
          />
        </div>
      </div>

      <div className='grid items-start gap-3.5 xl:grid-cols-[minmax(0,1fr)_288px]'>
        <section
          aria-label={t('calendarLabel')}
          className='bg-card min-w-0 overflow-hidden rounded-xl border'
        >
          {data.failed ? (
            <div className='grid place-items-center gap-3 px-6 py-24 text-center'>
              <p className='font-semibold'>{t('failedTitle')}</p>
              <p className='text-muted-foreground max-w-xs text-sm'>
                {t('failedHint')}
              </p>
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={() => void data.refresh()}
              >
                <RotateCw />
                {t('retry')}
              </Button>
            </div>
          ) : data.loading && data.meetings.length === 0 ? (
            <Skeleton className='h-[572px] w-full rounded-none' />
          ) : view === 'month' ? (
            <MonthGrid
              anchor={anchor}
              now={now}
              meetings={shown}
              matches={matches}
              onSelect={select}
              onOpenDay={(date) => {
                setAnchor(startOfDay(date));
                setView('day');
              }}
            />
          ) : (
            <TimeGrid
              view={view}
              days={view === 'day' ? [anchor] : weekDays(anchor)}
              now={now}
              meetings={shown}
              matches={matches}
              selectedId={current?.id ?? null}
              ghost={draft}
              canDrag={!draft}
              providerOf={providerOf}
              onSelect={select}
              onPickTime={pickTime}
              onMove={dropMeeting}
            />
          )}
        </section>

        <aside className='grid min-w-0 gap-3.5' aria-label={t('sideLabel')}>
          <UpcomingCard
            meetings={upcoming}
            now={now}
            providerOf={providerOf}
            onSelect={select}
          />
          <CalendarsCard
            calendars={data.calendars}
            hidden={hidden}
            failedCopies={failedCopies}
            providerOf={providerOf}
            onReview={select}
            onManage={() => openSettings('calendars')}
          />
        </aside>
      </div>

      {panel.shown ? (
        <DrawerEdge leaving={panel.leaving}>
          {panel.shown.kind === 'detail' ? (
            <MeetingDetailDrawer
              key={panel.shown.meeting.id}
              meeting={panel.shown.meeting}
              calendar={findCalendar(
                data.calendars,
                calendarOf(panel.shown.meeting)
              )}
              provider={providerOf(panel.shown.meeting)}
              now={now}
              aiCallAt={aiCallAt(
                panel.shown.meeting,
                plan,
                calendarOf(panel.shown.meeting),
                now
              )}
              pilot={pilot}
              remindersOn={remindersOn}
              onClose={() => setSelected(null)}
              onEdit={() =>
                current && setEditing({ id: current.id, initial: null })
              }
              onCancel={() => current && setCancellingId(current.id)}
              onChanged={data.replace}
            />
          ) : (
            <NewMeetingDrawer
              draft={panel.shown.draft}
              onDraftChange={updateDraft}
              calendars={data.calendars}
              plan={plan}
              now={now}
              onClose={() => setDraft(null)}
              onBooked={(meeting, first) => {
                setDraft(null);
                setSelected(meeting);
                const start = meetingStart(meeting);
                setAnchor(startOfDay(start));
                void data.refresh();
                const provider = providerOf(meeting);
                const when = {
                  day: fmt.shortDay(start),
                  time: fmt.time(start)
                };
                // The invite went out only if the external event exists; the
                // booking stands in Ringee either way (CAL-002).
                const sync = meeting.externalSyncStatus;
                if (provider && sync === 'synced') {
                  toast.success(
                    t('toasts.bookedInvite', {
                      ...when,
                      name: first || contactName(meeting),
                      provider
                    })
                  );
                } else if (provider && sync === 'failed') {
                  toast.warning(t('toasts.booked', when), {
                    description: t('detail.sync.failedTitle')
                  });
                } else if (provider && sync === 'pending') {
                  toast.success(t('toasts.booked', when), {
                    description: t('detail.sync.pendingTitle')
                  });
                } else {
                  toast.success(t('toasts.booked', when));
                }
              }}
            />
          )}
        </DrawerEdge>
      ) : null}

      {editing && editingMeeting ? (
        <EditMeetingDialog
          key={`${editing.id}-${editing.initial?.time ?? ''}`}
          meeting={editingMeeting}
          calendar={findCalendar(data.calendars, calendarOf(editingMeeting))}
          calendarId={calendarOf(editingMeeting)}
          provider={providerOf(editingMeeting)}
          initial={editing.initial}
          now={now}
          aiOffsetMinutes={
            plan && plan.calendarIds.has(calendarOf(editingMeeting) ?? '')
              ? plan.offsetMinutes
              : null
          }
          onClose={() => setEditing(null)}
          onSaved={(updated, moved) => {
            data.replace(updated);
            setEditing(null);
            setSelected((previous) =>
              previous ? { ...previous, ...updated } : updated
            );
            void data.refresh();
            const start = meetingStart(updated);
            const provider = providerOf(updated);
            const message = moved
              ? provider
                ? t('toasts.movedSynced', {
                    day: fmt.shortDay(start),
                    time: fmt.time(start),
                    provider
                  })
                : t('toasts.moved', {
                    day: fmt.shortDay(start),
                    time: fmt.time(start)
                  })
              : provider
                ? t('toasts.savedSynced', { provider })
                : t('toasts.saved');
            toast.success(
              message,
              moved && !inView(view, anchor, start)
                ? {
                    action: {
                      label: t('toasts.goTo', { day: fmt.shortDay(start) }),
                      onClick: () => setAnchor(startOfDay(start))
                    }
                  }
                : undefined
            );
          }}
        />
      ) : null}

      {cancelling ? (
        <CancelMeetingDialog
          meeting={cancelling}
          provider={providerOf(cancelling)}
          aiCallAt={aiCallAt(cancelling, plan, calendarOf(cancelling), now)}
          onClose={() => setCancellingId(null)}
          onCancelled={(updated) => {
            data.replace(updated);
            setCancellingId(null);
            void data.refresh();
            const provider = providerOf(cancelling);
            if (provider && updated.externalSyncStatus === 'synced') {
              toast.success(t('toasts.cancelledSynced', { provider }));
            } else if (provider && updated.externalSyncStatus === 'failed') {
              toast.warning(t('toasts.cancelledNotRemoved', { provider }));
            } else {
              toast.success(t('toasts.cancelled'));
            }
          }}
        />
      ) : null}
    </div>
  );
}
