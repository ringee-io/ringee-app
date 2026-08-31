/**
 * The call as the detail screen reads it.
 *
 * Mirrors `CallDetail` in `@ringee/database` (the `CALL_DETAIL_INCLUDE`
 * payload) with dates as the ISO strings JSON actually delivers. Every relation
 * is optional-or-null on purpose: a call that never connected has no recording,
 * a manual call has no agent, and a personal call has no campaign — the screen
 * renders what exists rather than assuming a complete row.
 */

export type CallStatus =
  | 'pending'
  | 'ringing'
  | 'answered'
  | 'recording'
  | 'completed'
  | 'failed';

export type CallOutcome =
  | 'meeting_booked'
  | 'sale'
  | 'interested'
  | 'follow_up'
  | 'callback_scheduled'
  | 'not_interested'
  | 'no_answer'
  | 'voicemail'
  | 'wrong_number'
  | 'gatekeeper';

export type AiVoiceAgentCallStatus =
  | 'created'
  | 'initiating'
  | 'ringing'
  | 'in_progress'
  | 'completed'
  | 'no_answer'
  | 'busy'
  | 'voicemail'
  | 'failed';

export type AiVoiceAgentOutcome =
  | 'appointment_booked'
  | 'confirmed'
  | 'cannot_attend'
  | 'callback_requested'
  | 'not_interested'
  | 'no_conversation'
  | 'unknown';

export type AiVoiceAgentType =
  | 'appointment_booking'
  | 'reminders_notifications';

/**
 * Where the call came from. `null` is a legacy row rather than an unknown
 * origin — those predate the column and were all placed from the web dialer.
 */
export type CallSource =
  | 'web'
  | 'chrome_extension'
  | 'mobile'
  | 'campaign'
  | 'session'
  | 'sip_device'
  | 'ai_voice_agent'
  | null;

export interface CallDetailContact {
  id: string;
  name: string | null;
  fullName: string | null;
  phoneNumber: string;
  email: string | null;
  company: string | null;
  jobTitle: string | null;
}

export interface CallDetailUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string | null;
}

export interface CallDetailRecording {
  id: string;
  url: string | null;
  format: string | null;
  status: string | null;
  durationSec: number | null;
  createdAt: string;
}

export interface CallDetailMeeting {
  id: string;
  title: string | null;
  scheduledAt: string;
  duration: number;
  location: string | null;
  status: string;
}

export interface CallDetailCallback {
  id: string;
  scheduledAt: string;
  note: string | null;
  status: string;
}

export interface CallDetailAttempt {
  id: string;
  attemptNumber: number;
  status: string;
  dispositionCode: string | null;
  dispositionNote: string | null;
  campaign: { id: string; name: string; status: string } | null;
  disposition: {
    id: string;
    code: string;
    label: string;
    color: string | null;
  } | null;
}

export interface CallDetailAgent {
  id: string;
  name: string;
  type: AiVoiceAgentType;
  status: string;
  voiceLabel: string | null;
  voiceLanguage: string | null;
  companyName: string | null;
}

/** The agent-call half of an AI call: everything the conversation produced. */
export interface CallDetailAgentCall {
  id: string;
  status: AiVoiceAgentCallStatus;
  outcome: AiVoiceAgentOutcome | null;
  summary: string | null;
  sentiment: string | null;
  extractedData: Record<string, unknown> | null;
  variables: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  aiCostUsd: number | null;
  aiChargedCredits: number | null;
  lastError: string | null;
  createdAt: string;
  agent: CallDetailAgent | null;
  meeting: CallDetailMeeting | null;
}

export interface CallDetail {
  id: string;
  fromNumber: string;
  toNumber: string;
  direction: string | null;
  status: CallStatus;
  source: CallSource;
  durationSeconds: number | null;
  createdAt: string;
  startedAt: string | null;
  answeredAt: string | null;
  endedAt: string | null;
  totalCost: number | null;
  costMeta: Record<string, unknown> | null;
  outcome: CallOutcome | null;
  outcomeNote: string | null;
  hangupCause: string | null;
  errorMessage: string | null;

  providerCallId: string | null;
  callControlId: string | null;
  callSessionId: string | null;

  contact: CallDetailContact | null;
  user: CallDetailUser | null;
  callerId: { id: string; phoneNumber: string; isoCountry: string } | null;
  sipDevice: { id: string; label: string; publicRef: string } | null;
  recordings: CallDetailRecording[];
  meetings: CallDetailMeeting[];
  callbacks: CallDetailCallback[];
  callAttempts: CallDetailAttempt[];
  aiVoiceAgentCall: CallDetailAgentCall | null;
}

/** The slice of an AI call the history table needs to name the agent. */
export interface CallListAgentRef {
  id: string;
  outcome: AiVoiceAgentOutcome | null;
  agent: { id: string; name: string; type: AiVoiceAgentType } | null;
}
