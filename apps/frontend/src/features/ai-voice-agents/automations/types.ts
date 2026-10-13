/**
 * What the "Ringee IA Voice Agents" rail reads from the API. The server
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
