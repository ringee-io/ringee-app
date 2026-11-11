/**
 * What the "Trigger AI Voice Agents" rail reads from the API. The server
 * computes every state, readiness and next step; the rail only renders them.
 */

export type AutomationCapability = 'reminders' | 'receptionist' | 'scheduling';

export type AutomationState =
  | 'unconfigured'
  | 'activating'
  | 'active'
  | 'paused'
  | 'needs_attention';

export type AutomationNextStepCode =
  | 'set_up'
  | 'fix_agent'
  | 'turn_on_agent'
  | 'add_number'
  | 'choose_number'
  | 'add_credit'
  | 'choose_calendar'
  | 'answer_a_number'
  | 'inbound_unavailable';

export interface AutomationNextStep {
  code: AutomationNextStepCode;
  message: string;
}

export interface AutomationAgent {
  id: string;
  name: string;
  status: 'draft' | 'active' | 'disabled' | 'error';
  voiceLabel: string | null;
  voiceLanguage: string | null;
  callerNumberId: string | null;
  calendarId: string | null;
  lastError: string | null;
}

export interface AutomationCalendarRef {
  id: string;
  name: string;
  timezone: string;
}

export interface InboundNumberRef {
  kind: 'ringee' | 'external';
  id: string;
}

export interface AutomationCard {
  capability: AutomationCapability;
  state: AutomationState;
  agent: AutomationAgent | null;
  nextStep: AutomationNextStep | null;
  candidates: Array<{
    id: string;
    name: string;
    status: AutomationAgent['status'];
  }>;
  company: string | null;
  reminders?: {
    calendars: AutomationCalendarRef[];
    offsetMinutes: number | null;
    upcomingCalls: number;
    callerNumber: string | null;
    ccAdmins: number;
  };
  receptionist?: {
    numbers: Array<{
      number: InboundNumberRef;
      phoneNumber: string;
      answering: boolean;
      restoreLabel: string | null;
    }>;
  };
  scheduling?: {
    humanFollowUpEnabled?: boolean;
    calendar: AutomationCalendarRef | null;
    callerNumber: string | null;
  };
}

export type AutomationActivityKind =
  | 'attendance_confirmed'
  | 'attendance_declined'
  | 'no_answer'
  | 'call_completed'
  | 'call_failed'
  | 'needs_email'
  | 'needs_member'
  | 'email_failed'
  | 'meeting_booked';

export interface AutomationActivity {
  id: string;
  kind: AutomationActivityKind;
  at: string;
  label: string | null;
  meetingId: string | null;
  callId: string | null;
  deliveryId: string | null;
}

export interface AutomationPanel {
  enabled: boolean;
  operational: number;
  cards: AutomationCard[];
  activity: AutomationActivity[];
  /** UX only — every setup route is enforced server-side. */
  canConfigure: boolean;
}

export interface AutomationSummary {
  enabled: boolean;
  operational: number;
  attention: number;
  capabilities: Partial<Record<AutomationCapability, AutomationState>>;
}

export interface UpcomingReminderCall {
  id: string;
  fireAt: string;
  trigger: string;
  meeting: {
    id: string;
    title: string | null;
    scheduledAt: string;
    contactName: string | null;
    contactPhone: string | null;
  };
}

export interface ReminderCallNowResult {
  executionId: string;
  status: string;
  agentCallId: string | null;
  reason: string | null;
}

/** A number the receptionist could answer, as `/inbound-routes/numbers` lists it. */
export interface InboundRouteOption {
  number: InboundNumberRef;
  phoneNumber: string;
  destinationType: string;
  destinationId: string | null;
  destinationLabel: string | null;
  configured: boolean;
  availableDestinationTypes: string[];
  restoreDestination?: {
    destinationType: string;
    destinationId: string;
    label: string | null;
  } | null;
}

// ── Shared follow-up review (Stage 4C) ───────────────────────────────
// Mirrors `FollowUpReview` in `@ringee/services` (GET …/follow-up).

export type FollowUpEntrySource =
  | 'first_list'
  | 'interested_outcome'
  | 'meeting_booked'
  | 'ai_voice_agents_navigation';

export type FollowUpState =
  | 'not_admitted'
  | 'needs_configuration'
  | 'add_credit'
  | 'ready_to_activate'
  | 'pending'
  | 'active'
  | 'paused';

export type FollowUpRequirementCode =
  | 'get_number'
  | 'choose_number'
  | 'number_pending'
  | 'set_availability'
  | 'add_credit'
  | 'fix_agent';

export type FollowUpRowKey =
  | 'identity'
  | 'shareable'
  | 'number'
  | 'callbacks'
  | 'calendar'
  | 'calling_hours'
  | 'time_zone'
  | 'responsible';

export type FollowUpRowStatus = 'ok' | 'missing' | 'locked' | 'info';

export interface CallingWindow {
  /** 0–6, Sunday first. */
  days: number[];
  startMinute: number;
  endMinute: number;
}

export interface FollowUpNumberOption {
  id: string;
  phoneNumber: string;
  isoCountry: string;
  kind: 'purchased' | 'verified_caller_id';
}

export interface FollowUpMeetingCoverage {
  covered: boolean;
  fireAt: string | null;
  reason:
    | null
    | 'not_admitted'
    | 'not_adopted'
    | 'reminders_off'
    | 'reminders_paused'
    | 'calendar_not_covered'
    | 'not_included'
    | 'too_close'
    | 'already_answered'
    | 'cancelled';
}

export interface FollowUpSourceMeeting {
  id: string;
  scheduledAt: string;
  durationMinutes: number;
  version: number;
  calendarId: string | null;
  contactName: string | null;
  eligible: boolean;
  reason:
    | null
    | 'not_found'
    | 'cancelled'
    | 'too_soon'
    | 'already_answered'
    | 'other_calendar'
    | 'reminders_off'
    | 'outside_window';
  plannedFireAt: string | null;
  coverage: FollowUpMeetingCoverage;
}

export interface FollowUpDraft {
  identity?: { companyName: string | null; companyWebsite: string | null };
  shareable?: { companyDescription: string | null };
  numberId?: string | null;
  calendarId?: string | null;
  availability?: CallingWindow | null;
  callingHours: CallingWindow;
  timeZone: string;
  capabilities: { scheduling: boolean; reminders: boolean };
  reminderOffsetMinutes: number;
  existingMeetings: 'none' | 'all_upcoming';
  includeMeetingId?: string | null;
}

export interface FollowUpReview {
  version: string;
  workspaceType: 'personal' | 'organization';
  admitted: boolean;
  canConfigure: boolean;
  adminNames: string[];
  state: FollowUpState;
  activation: {
    status: 'none' | 'configured' | 'adopted';
    revision: number | null;
    savedAt: string | null;
    adoptedAt: string | null;
    adoptedByName: string | null;
    entrySource: FollowUpEntrySource | null;
    optOuts: Partial<
      Record<'scheduling' | 'reminders', { reason: string; at: string }>
    >;
  };
  draft: FollowUpDraft;
  rows: {
    identity: {
      status: FollowUpRowStatus;
      kind: 'company' | 'person';
      companyName: string | null;
      companyWebsite: string | null;
      personName: string | null;
    };
    shareable: { status: FollowUpRowStatus; companyDescription: string | null };
    number: {
      status: FollowUpRowStatus;
      requirement: FollowUpRequirementCode | null;
      selected: FollowUpNumberOption | null;
      candidates: FollowUpNumberOption[];
      pending: Array<{
        phoneNumber: string;
        kind: 'purchase' | 'verification';
      }>;
      sharedNumberAvailable: boolean;
    };
    callbacks: {
      status: FollowUpRowStatus;
      kind: 'owner' | 'route' | 'unrouted' | 'unknown';
      label: string | null;
    };
    calendar: {
      status: FollowUpRowStatus;
      requirement: FollowUpRequirementCode | null;
      selected: {
        id: string;
        name: string;
        timezone: string;
        isDefault: boolean;
        provider: 'google' | 'microsoft' | null;
        accountEmail: string | null;
      } | null;
      candidates: Array<{ id: string; name: string; isDefault: boolean }>;
      willCreate: boolean;
      availability: {
        source: 'calendar' | 'draft' | 'missing';
        window: CallingWindow | null;
        windowCount: number;
      };
    };
    callingHours: {
      status: FollowUpRowStatus;
      source: 'policy' | 'draft' | 'proposed';
      window: CallingWindow;
    };
    timeZone: {
      status: FollowUpRowStatus;
      source: 'calendar' | 'draft' | 'browser' | 'default';
      value: string;
    };
    responsible: {
      status: FollowUpRowStatus;
      kind: 'owner' | 'caller';
      ownerName: string | null;
      adminCount: number;
    };
  };
  capabilities: {
    scheduling: {
      existing: AutomationState;
      agentName: string | null;
      humanFollowUpEnabled: boolean;
      optedOut: boolean;
    };
    reminders: {
      existing: AutomationState;
      agentName: string | null;
      existingOffsetMinutes: number | null;
      optedOut: boolean;
      offsetChoices: number[];
      upcomingExisting: { meetings: number; calls: number } | null;
    };
  };
  requirements: Array<{
    code: FollowUpRequirementCode;
    row: FollowUpRowKey | null;
  }>;
  progress: { done: number; total: number };
  balance: { visible: boolean; amount: number | null };
  manualCalling: {
    ready: boolean;
    line: 'own_number' | 'shared_number' | 'none';
    reason: 'no_line' | 'no_credit' | null;
  };
  sourceMeeting: FollowUpSourceMeeting | null;
  nextActions: Array<{
    fireAt: string;
    meetingId: string;
    meetingAt: string;
    contactName: string | null;
  }>;
}

export interface FollowUpResultSummary {
  results: Array<{
    id: string;
    kind: string;
    at: string;
    meetingId: string;
    meetingAt: string;
    previousMeetingAt: string | null;
    contactName: string | null;
    callId: string | null;
    consumption: {
      voiceUsd: number | null;
      aiUsd: number | null;
      settled: boolean;
    };
  }>;
  firstResultAt: string | null;
  firstSinceAdoption: boolean;
  adoptedAt: string | null;
}
