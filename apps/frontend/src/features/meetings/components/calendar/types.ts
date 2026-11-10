import type { MeetingAttendanceStatus } from '@/features/ai-voice-agents/automations/components/meeting-attendance';

export type MeetingStatus =
  | 'scheduled'
  | 'completed'
  | 'cancelled'
  | 'rescheduled';

/**
 * Whether the external calendar event exists. The booking itself is confirmed
 * in Ringee regardless — `pending` and `failed` describe only the copy.
 */
export type ExternalSyncStatus =
  | 'not_required'
  | 'pending'
  | 'synced'
  | 'failed';

export type CalendarView = 'day' | 'week' | 'month';

/** A meeting as `GET /meetings` returns it. */
export interface CalendarMeeting {
  id: string;
  title: string | null;
  scheduledAt: string;
  duration: number;
  location: string | null;
  notes: string | null;
  status: MeetingStatus;
  /** Where the invite and the confirmation email went, when it was asked. */
  leadEmail?: string | null;
  contact: {
    id: string;
    name: string | null;
    firstName?: string | null;
    lastName?: string | null;
    phoneNumber: string;
    company: string | null;
    email: string | null;
    timezone?: string | null;
    locationCity?: string | null;
  };
  call?: {
    id: string;
    durationSeconds: number | null;
    createdAt: string;
  } | null;
  /** The Ringee calendar it was booked on; none for the oldest bookings. */
  calendar: { id: string; name: string; isDefault: boolean } | null;
  /** The same calendar's id, also on a write's answer, which has no relation. */
  calendarId?: string | null;
  externalSyncStatus?: ExternalSyncStatus;
  attendanceStatus?: MeetingAttendanceStatus;
  attendanceNote?: string | null;
  createdAt: string;
}

export interface MeetingsResponse {
  data: CalendarMeeting[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

/** A Ringee calendar, as `GET /calendar/calendars` returns it. */
export interface RingeeCalendar {
  id: string;
  name: string;
  timezone: string;
  isDefault: boolean;
  archivedAt: string | null;
  integration: {
    id: string;
    provider: 'google' | 'microsoft';
    email: string | null;
  } | null;
}

/** The time a new meeting is being booked for, shown on the calendar too. */
export interface NewMeetingDraft {
  date: Date;
  /** "HH:mm", local; null until one is picked. */
  time: string | null;
  duration: number;
  calendarId: string | null;
  /** What the calendar's dashed preview says: the name as it is typed. */
  label: string | null;
}

/** Who the AI agent calls to confirm, and when (the reminders setup). */
export interface ReminderPlan {
  agentName: string | null;
  offsetMinutes: number;
  calendarIds: Set<string>;
}
