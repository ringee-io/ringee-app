'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { isSameDay } from 'date-fns';
import { Check, TriangleAlert } from 'lucide-react';
import { cn } from '@ringee/frontend-shared/lib/utils';
import {
  HOUR_PX,
  SNAP_MINUTES,
  atTime,
  contactName,
  dateKey,
  gridHours,
  isUpcoming,
  isWeekend,
  layoutLanes,
  meetingStart,
  parseDateKey,
  useCalendarFormat
} from './calendar-utils';
import type { CalendarMeeting, NewMeetingDraft } from './types';

const STEP_PX = (HOUR_PX * SNAP_MINUTES) / 60;

interface TimeGridProps {
  view: 'day' | 'week';
  days: Date[];
  now: Date;
  /** The meetings of the calendars in view. */
  meetings: CalendarMeeting[];
  /** False dims a meeting: it does not match the search. */
  matches: (m: CalendarMeeting) => boolean;
  selectedId: string | null;
  /** The new meeting being booked, drawn dashed where it would go. */
  ghost: NewMeetingDraft | null;
  /** Upcoming meetings can be dragged to a new time. */
  canDrag: boolean;
  /** "Google Calendar": where a failed copy should have gone. */
  providerOf: (m: CalendarMeeting) => string | null;
  onSelect: (m: CalendarMeeting) => void;
  onPickTime: (date: Date, minutes: number) => void;
  onMove: (m: CalendarMeeting, date: Date, minutes: number) => void;
}

interface DragState {
  id: string;
  key: string;
  top: number;
}

/** Day and week: a time grid, 48 px per hour, meetings as tall as they last. */
export function TimeGrid({
  view,
  days,
  now,
  meetings,
  matches,
  selectedId,
  ghost,
  canDrag,
  providerOf,
  onSelect,
  onPickTime,
  onMove
}: TimeGridProps) {
  const t = useTranslations('meetings.page.grid');
  const fmt = useCalendarFormat();

  const inDays = meetings.filter((m) =>
    days.some((day) => isSameDay(meetingStart(m), day))
  );
  const ghostAt =
    ghost?.time && days.some((day) => isSameDay(day, ghost.date))
      ? atTime(ghost.date, ghost.time)
      : null;
  const { start: h0, end: h1 } = gridHours(inDays, ghostAt ? [ghostAt] : []);
  const gridHeight = (h1 - h0) * HOUR_PX;
  const narrow = (day: Date) => view === 'week' && isWeekend(day);
  const columns = [
    '52px',
    ...days.map((day) => (narrow(day) ? '52px' : 'minmax(0, 1fr)'))
  ].join(' ');

  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const nowTop = ((minutesNow - h0 * 60) / 60) * HOUR_PX;
  const showNow =
    days.some((day) => isSameDay(day, now)) &&
    nowTop >= 0 &&
    nowTop <= gridHeight;

  // ── Drag to move ─────────────────────────────────────────────
  const columnRefs = useRef(new Map<string, HTMLDivElement>());
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const pressed = useRef<{
    m: CalendarMeeting;
    offsetY: number;
    x: number;
    y: number;
    height: number;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const layout = useRef({ h0, gridHeight, onMove });
  layout.current = { h0, gridHeight, onMove };

  const setDragState = (next: DragState | null) => {
    dragRef.current = next;
    setDrag(next);
  };

  const handleMove = useCallback((event: PointerEvent) => {
    const press = pressed.current;
    if (!press) return;
    if (
      !press.moved &&
      Math.abs(event.clientX - press.x) + Math.abs(event.clientY - press.y) < 5
    )
      return;
    press.moved = true;
    let target: { key: string; el: HTMLDivElement } | null = null;
    for (const [key, el] of columnRefs.current) {
      const rect = el.getBoundingClientRect();
      if (event.clientX >= rect.left && event.clientX < rect.right)
        target = { key, el };
    }
    if (!target) return;
    const rect = target.el.getBoundingClientRect();
    const raw = event.clientY - rect.top - press.offsetY;
    const top = Math.max(
      0,
      Math.min(
        Math.round(raw / STEP_PX) * STEP_PX,
        layout.current.gridHeight - press.height
      )
    );
    setDragState({ id: press.m.id, key: target.key, top });
  }, []);

  const handleUp = useCallback(() => {
    window.removeEventListener('pointermove', handleMove);
    const press = pressed.current;
    const dropped = dragRef.current;
    pressed.current = null;
    setDragState(null);
    if (!press?.moved || !dropped) return;
    suppressClick.current = true;
    window.setTimeout(() => {
      suppressClick.current = false;
    }, 0);
    const minutes =
      layout.current.h0 * 60 + Math.round(dropped.top / STEP_PX) * SNAP_MINUTES;
    layout.current.onMove(press.m, parseDateKey(dropped.key), minutes);
  }, [handleMove]);

  useEffect(
    () => () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    },
    [handleMove, handleUp]
  );

  const startDrag = (
    event: React.PointerEvent<HTMLButtonElement>,
    m: CalendarMeeting,
    height: number
  ) => {
    if (
      !canDrag ||
      event.button !== 0 ||
      event.pointerType !== 'mouse' ||
      !isUpcoming(m, now)
    )
      return;
    const rect = event.currentTarget.getBoundingClientRect();
    pressed.current = {
      m,
      offsetY: event.clientY - rect.top,
      x: event.clientX,
      y: event.clientY,
      height,
      moved: false
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp, { once: true });
  };

  // ── Rendering ────────────────────────────────────────────────
  const block = (
    m: CalendarMeeting,
    lane: number,
    lanes: number,
    top?: number
  ) => {
    const start = meetingStart(m);
    const startTop =
      top ??
      ((start.getHours() * 60 + start.getMinutes() - h0 * 60) / 60) * HOUR_PX;
    const height = Math.max((m.duration / 60) * HOUR_PX - 2, 20);
    const day = days.find((d) => isSameDay(d, start)) ?? start;
    const short = height < 34 || narrow(day);
    const upcoming = isUpcoming(m, now);
    const cancelled = m.status === 'cancelled';
    const name = contactName(m);
    const title = m.title ?? '';
    const company = m.contact.company ?? '';
    const time = fmt.time(start);
    const dragging = drag?.id === m.id;
    const failedCopy = upcoming && m.externalSyncStatus === 'failed';
    const confirmed = upcoming && m.attendanceStatus === 'confirmed';
    const provider = providerOf(m);

    return (
      <button
        key={m.id}
        type='button'
        data-meeting={m.id}
        onPointerDown={(event) => startDrag(event, m, height)}
        onClick={() => {
          if (!suppressClick.current) onSelect(m);
        }}
        aria-label={[
          name,
          title,
          `${fmt.shortDay(start)}, ${time}`,
          cancelled ? t('cancelledLabel') : null
        ]
          .filter(Boolean)
          .join(', ')}
        className={cn(
          'focus-visible:ring-ring/50 absolute z-[2] grid min-w-0 content-start gap-px overflow-hidden rounded-md border-0 border-l-[3px] py-[3px] pr-1.5 pl-2 text-left text-xs leading-tight outline-none select-none focus-visible:ring-[3px]',
          cancelled
            ? 'border-input text-muted-foreground border border-l-[3px] border-dashed border-l-neutral-500 bg-transparent'
            : upcoming
              ? 'text-foreground border-l-emerald-500 bg-emerald-500/[0.16] hover:bg-emerald-500/25'
              : 'bg-muted text-muted-foreground border-l-neutral-500',
          upcoming && canDrag && 'cursor-grab',
          m.id === selectedId && 'ring-foreground z-[4] ring-2',
          dragging &&
            'z-[5] cursor-grabbing opacity-85 shadow-[0_8px_24px_rgba(0,0,0,0.5)] ring-2 ring-emerald-500',
          !matches(m) && 'opacity-30'
        )}
        style={{
          top: startTop,
          height,
          left: `calc(${(lane / lanes) * 100}% + 3px)`,
          width: `calc(${100 / lanes}% - 7px)`
        }}
      >
        {/* A short meeting keeps its whole name: in the week, the time sits
            beside it only when it fits, and otherwise wraps out of sight —
            the grid already says when it is. */}
        <span
          className={cn(
            'flex min-w-0 items-center gap-x-[5px] overflow-hidden whitespace-nowrap',
            short && view === 'week' && 'h-[15px] flex-wrap'
          )}
        >
          <b
            className={cn(
              'min-w-0 truncate font-semibold',
              cancelled && 'line-through'
            )}
          >
            {name}
          </b>
          {failedCopy ? (
            <TriangleAlert
              className='size-3 shrink-0 text-amber-500'
              aria-label={t('notInProvider', { provider: provider ?? '' })}
            />
          ) : confirmed ? (
            <Check
              className='size-3 shrink-0 text-emerald-500'
              aria-label={t('confirmed')}
            />
          ) : null}
          {short ? (
            <span
              className={cn(
                'text-muted-foreground tabular-nums',
                view === 'day' ? 'min-w-0 truncate' : 'shrink-0'
              )}
            >
              {view === 'day'
                ? [time, title, company].filter(Boolean).join(' · ')
                : fmt.timeShort(start)}
            </span>
          ) : null}
        </span>
        {!short ? (
          <span className='text-muted-foreground min-w-0 truncate'>
            {[time, title, view === 'day' && height < 46 ? company : null]
              .filter(Boolean)
              .join(' · ')}
          </span>
        ) : null}
        {view === 'day' && height >= 46 ? (
          <span className='text-muted-foreground min-w-0 truncate'>
            {[company, t('minutes', { count: m.duration })]
              .filter(Boolean)
              .join(' · ')}
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <div className='min-w-0'>
      <div
        className='grid border-b'
        style={{ gridTemplateColumns: columns }}
        role='row'
      >
        <div />
        {days.map((day) => {
          const today = isSameDay(day, now);
          const isNarrow = narrow(day);
          return (
            <div
              key={dateKey(day)}
              role='columnheader'
              className={cn(
                'text-muted-foreground flex h-11 items-center justify-center gap-1.5 border-l text-xs tracking-[0.04em] uppercase',
                today && 'text-foreground',
                isNarrow && 'flex-col gap-0 leading-[1.1]'
              )}
            >
              <span>{fmt.weekday(day)}</span>
              <b
                className={cn(
                  'text-foreground grid min-w-[26px] place-items-center rounded-full font-semibold tracking-normal',
                  isNarrow ? 'h-[18px] text-xs' : 'h-[26px] text-sm',
                  today && !isNarrow && 'bg-emerald-600 px-1 text-white',
                  today && isNarrow && 'text-emerald-500'
                )}
              >
                {day.getDate()}
              </b>
            </div>
          );
        })}
      </div>

      <div
        className='relative grid'
        style={{ gridTemplateColumns: columns, height: gridHeight }}
      >
        <div className='relative' aria-hidden>
          {Array.from({ length: h1 - h0 }, (_, i) => h0 + i).map((hour) => (
            <span
              key={hour}
              className='text-muted-foreground absolute right-2 text-xs leading-none whitespace-nowrap'
              style={{ top: hour === h0 ? 4 : (hour - h0) * HOUR_PX - 6 }}
            >
              {fmt.hour(hour)}
            </span>
          ))}
          {showNow ? (
            <span
              className='absolute right-1 rounded px-1 py-0.5 text-xs leading-none font-semibold whitespace-nowrap text-[#461901] tabular-nums'
              style={{ top: nowTop - 9, background: '#f59e0b' }}
            >
              {fmt.timeShort(now)}
            </span>
          ) : null}
        </div>

        {days.map((day) => {
          const key = dateKey(day);
          const isNarrow = narrow(day);
          const dayMeetings = inDays.filter(
            (m) => isSameDay(meetingStart(m), day) && m.id !== drag?.id
          );
          const lanes = layoutLanes(dayMeetings);
          const dragged =
            drag?.key === key ? meetings.find((m) => m.id === drag.id) : null;
          const ghostHere =
            ghost?.time && isSameDay(ghost.date, day) ? ghost : null;
          const ghostStart = ghostHere?.time
            ? atTime(ghostHere.date, ghostHere.time)
            : null;

          return (
            <div
              key={key}
              ref={(el) => {
                if (el && !isNarrow) columnRefs.current.set(key, el);
                else columnRefs.current.delete(key);
              }}
              className={cn(
                'relative min-w-0 border-l',
                isNarrow ? 'bg-muted/35 cursor-default' : 'cursor-cell'
              )}
              style={{
                backgroundImage: `repeating-linear-gradient(to bottom, var(--border) 0, var(--border) 1px, transparent 1px, transparent ${HOUR_PX}px)`
              }}
              onClick={(event) => {
                if (event.target !== event.currentTarget || isNarrow) return;
                const rect = event.currentTarget.getBoundingClientRect();
                const y = event.clientY - rect.top;
                onPickTime(day, h0 * 60 + Math.floor((y / HOUR_PX) * 2) * 30);
              }}
            >
              {dayMeetings.map((m) => {
                const place = lanes.get(m.id) ?? { lane: 0, lanes: 1 };
                return block(m, place.lane, place.lanes);
              })}
              {dragged ? block(dragged, 0, 1, drag!.top) : null}
              {ghostHere && ghostStart ? (
                <GhostBlock
                  top={
                    ((ghostStart.getHours() * 60 +
                      ghostStart.getMinutes() -
                      h0 * 60) /
                      60) *
                    HOUR_PX
                  }
                  height={Math.max((ghostHere.duration / 60) * HOUR_PX - 2, 20)}
                  label={ghostHere.label || t('newMeeting')}
                  time={fmt.time(ghostStart)}
                  timeShort={fmt.timeShort(ghostStart)}
                />
              ) : null}
              {showNow && isSameDay(day, now) ? (
                <div
                  className='pointer-events-none absolute right-0 -left-px z-[3] h-0.5'
                  style={{ top: nowTop, background: '#f59e0b' }}
                  aria-hidden
                >
                  <span
                    className='absolute -top-1 -left-1 size-2.5 rounded-full'
                    style={{ background: '#f59e0b' }}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GhostBlock({
  top,
  height,
  label,
  time,
  timeShort
}: {
  top: number;
  height: number;
  label: string;
  time: string;
  timeShort: string;
}) {
  const t = useTranslations('meetings.page.grid');
  const short = height < 34;
  return (
    <div
      aria-hidden
      className='text-foreground pointer-events-none absolute right-1 left-[3px] z-[3] grid content-start gap-px overflow-hidden rounded-md border border-l-[3px] border-dashed border-emerald-500 bg-emerald-500/10 py-[3px] pr-1.5 pl-2 text-xs leading-tight'
      style={{ top, height }}
    >
      <span className='flex min-w-0 items-center gap-[5px] overflow-hidden whitespace-nowrap'>
        <b className='min-w-0 truncate font-semibold'>{label}</b>
        {short ? (
          <span className='text-muted-foreground tabular-nums'>
            {timeShort}
          </span>
        ) : null}
      </span>
      {!short ? (
        <span className='text-muted-foreground truncate'>
          {time} · {t('new')}
        </span>
      ) : null}
    </div>
  );
}
