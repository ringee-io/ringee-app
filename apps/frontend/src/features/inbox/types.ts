export type InboxThreadStatus =
  | 'open'
  | 'pending'
  | 'resolved'
  | 'archived'
  | 'spam';

export type InboxEventDirection =
  | 'inbound'
  | 'outbound'
  | 'internal'
  | 'system';

export type InboxEventKind =
  | 'call_started'
  | 'call_answered'
  | 'missed_call'
  | 'call_completed'
  | 'voicemail_received'
  | 'voicemail_drop_sent'
  | 'sms_received'
  | 'sms_sent'
  | 'mms_received'
  | 'mms_sent'
  | 'message_failed'
  | 'note_added'
  | 'callback_scheduled'
  | 'callback_completed'
  | 'meeting_booked'
  | 'crm_activity'
  | 'status_changed';

export type InboxEventStatus =
  | 'pending'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'completed'
  | 'missed'
  | 'received'
  | null;

export interface InboxContact {
  id: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  phoneNumber?: string | null;
}

export interface InboxThread {
  id: string;
  contactId: string | null;
  contact?: InboxContact | null;
  participantNumber: string;
  participantNumberE164: string | null;
  ringeeNumber: string | null;
  status: InboxThreadStatus;
  unreadCount: number;
  lastEventAt: string;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  lastPreview: string | null;
  lastEventKind: InboxEventKind | null;
  assignedToId: string | null;
}

export interface InboxEvent {
  id: string;
  threadId: string;
  direction: InboxEventDirection;
  kind: InboxEventKind;
  status: InboxEventStatus;
  callId: string | null;
  messageId: string | null;
  recordingId: string | null;
  voicemailDropAssetId: string | null;
  callbackTaskId: string | null;
  meetingId: string | null;
  title: string | null;
  body: string | null;
  fromNumber: string | null;
  toNumber: string | null;
  audioUrl: string | null;
  mediaUrls: string[];
  durationSec: number | null;
  transcript: string | null;
  occurredAt: string;
  metadata: any;
  createdByUserId: string | null;
  call?: any;
  message?: any;
  recording?: any;
  voicemailDropAsset?: any;
  meeting?: any;
}

export const THREAD_FILTER_OPTIONS: {
  id: string;
  label: string;
  status?: InboxThreadStatus[];
  kind?: InboxEventKind[];
  unreadOnly?: boolean;
}[] = [
  { id: 'all', label: 'All', status: ['open', 'pending'] },
  { id: 'unread', label: 'Unread', unreadOnly: true },
  {
    id: 'missed',
    label: 'Missed Calls',
    kind: ['missed_call']
  },
  {
    id: 'voicemails',
    label: 'Voicemails',
    kind: ['voicemail_received']
  },
  {
    id: 'sms',
    label: 'SMS',
    kind: ['sms_received', 'sms_sent', 'mms_received', 'mms_sent']
  },
  { id: 'resolved', label: 'Resolved', status: ['resolved'] },
  { id: 'archived', label: 'Archived', status: ['archived'] }
];
