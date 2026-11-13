'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useAutomationApi } from '@/features/ai-voice-agents/automations/api';
import { useVoiceAgentsRail } from '@/features/ai-voice-agents/automations/store';
import { browserTimeZone, dateKey } from './calendar-utils';
import type {
  CalendarMeeting,
  MeetingsResponse,
  ReminderPlan,
  RingeeCalendar
} from './types';

/** A month grid holds six weeks: most fit in one page, all of them load. */
const RANGE_PAGE_SIZE = 500;
const UPCOMING_LIMIT = 50;

/**
 * The meetings a view shows (`from`–`to`), the upcoming ones for the side
 * column, and the workspace's calendars. What is on screen stays while the
 * next range loads, so moving between weeks never blanks the grid.
 */
export function useMeetingsData(range: { from: Date; to: Date }) {
  const api = useApi();
  const [meetings, setMeetings] = useState<CalendarMeeting[]>([]);
  const [upcoming, setUpcoming] = useState<CalendarMeeting[]>([]);
  const [upcomingTotal, setUpcomingTotal] = useState(0);
  const [calendars, setCalendars] = useState<RingeeCalendar[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const request = useRef(0);
  const fromIso = range.from.toISOString();
  const toIso = range.to.toISOString();

  const loadRange = useCallback(async () => {
    const id = ++request.current;
    setLoading(true);
    try {
      const page = (n: number) =>
        api.get<MeetingsResponse>(
          `/meetings?${new URLSearchParams({
            from: fromIso,
            to: toIso,
            limit: String(RANGE_PAGE_SIZE),
            page: String(n)
          })}`
        );
      // Every page or none: a grid missing some meetings would read as free.
      const first = await page(1);
      if (id !== request.current) return;
      const rest = await Promise.all(
        Array.from({ length: Math.max(0, first.meta.totalPages - 1) }, (_, i) =>
          page(i + 2)
        )
      );
      if (id !== request.current) return;
      const byId = new Map<string, CalendarMeeting>();
      for (const res of [first, ...rest])
        for (const m of res.data) byId.set(m.id, m);
      setMeetings([...byId.values()]);
      setFailed(false);
    } catch {
      if (id === request.current) setFailed(true);
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, [api, fromIso, toIso]);

  const loadUpcoming = useCallback(async () => {
    try {
      const res = await api.get<MeetingsResponse>(
        `/meetings?upcoming=true&limit=${UPCOMING_LIMIT}`
      );
      setUpcoming(res.data);
      setUpcomingTotal(res.meta.total);
    } catch {
      // The side column keeps what it had; the grid reports failures.
    }
  }, [api]);

  const loadCalendars = useCallback(async () => {
    try {
      setCalendars(await api.get<RingeeCalendar[]>('/calendar/calendars'));
    } catch {
      // Without the list, meetings still show; only names and sync are lost.
    }
  }, [api]);

  useEffect(() => {
    void loadRange();
  }, [loadRange]);

  useEffect(() => {
    void loadUpcoming();
    void loadCalendars();
  }, [loadUpcoming, loadCalendars]);

  const refresh = useCallback(async () => {
    await Promise.all([loadRange(), loadUpcoming()]);
  }, [loadRange, loadUpcoming]);

  return {
    meetings,
    upcoming,
    upcomingTotal,
    calendars,
    loading,
    failed,
    refresh,
    /** Swap one meeting in place, the moment the server answers. */
    replace: useCallback((meeting: CalendarMeeting) => {
      const swap = (list: CalendarMeeting[]) =>
        list.map((m) => (m.id === meeting.id ? { ...m, ...meeting } : m));
      setMeetings(swap);
      setUpcoming(swap);
    }, [])
  };
}

/**
 * The reminders setup of the AI Voice Agents, when it is on: which calendars
 * it watches, how long before a meeting it calls and the agent's name. Read
 * only inside the automations pilot; elsewhere meetings read as before.
 */
export function useReminderPlan(): {
  plan: ReminderPlan | null;
  /** The pilot is on for this workspace. */
  pilot: boolean;
  remindersOn: boolean;
} {
  const automations = useAutomationApi();
  const pilot = useVoiceAgentsRail((state) => state.summary?.enabled === true);
  const remindersOn = useVoiceAgentsRail(
    (state) => state.summary?.capabilities.reminders === 'active'
  );
  const [plan, setPlan] = useState<ReminderPlan | null>(null);

  useEffect(() => {
    if (!pilot || !remindersOn) {
      setPlan(null);
      return;
    }
    let active = true;
    automations
      .panel()
      .then((panel) => {
        if (!active) return;
        const card = panel.cards.find(
          (c) => c.capability === 'reminders' && c.state === 'active'
        );
        const offset = card?.reminders?.offsetMinutes;
        setPlan(
          card?.reminders && offset != null
            ? {
                agentName: card.agent?.name ?? null,
                offsetMinutes: offset,
                calendarIds: new Set(
                  card.reminders.calendars.map((calendar) => calendar.id)
                )
              }
            : null
        );
      })
      .catch(() => {
        if (active) setPlan(null);
      });
    return () => {
      active = false;
    };
  }, [automations, pilot, remindersOn]);

  return { plan, pilot, remindersOn };
}

interface AvailabilitySlot {
  time: string;
  available: boolean;
}

/**
 * A calendar's open start times on a day (`GET /calendar/availability`),
 * read in the browser's zone like the grid. Ringee's availability is the
 * authority; nothing is offered when it cannot be read.
 */
export function useOpenSlots({
  calendarId,
  date,
  duration,
  enabled = true
}: {
  calendarId: string | null;
  date: Date;
  duration: number;
  enabled?: boolean;
}) {
  const api = useApi();
  const [slots, setSlots] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const request = useRef(0);
  const day = dateKey(date);

  const load = useCallback(async () => {
    if (!enabled) return;
    const id = ++request.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        date: day,
        timeZone: browserTimeZone(),
        duration: String(duration)
      });
      if (calendarId) params.set('calendarId', calendarId);
      const res = await api.get<AvailabilitySlot[]>(
        `/calendar/availability?${params}`
      );
      if (id !== request.current) return;
      setSlots(res.filter((slot) => slot.available).map((slot) => slot.time));
      setFailed(false);
    } catch {
      if (id !== request.current) return;
      setSlots([]);
      setFailed(true);
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, [api, calendarId, day, duration, enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  return { slots, loading, failed, reload: load };
}
