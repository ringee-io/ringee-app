/**
 * Helpers that turn Ringee domain entities into outbound event `data` payloads.
 * Keeps the hook sites in call.service / meeting.service / etc small.
 */

import {
  AiVoiceAgentCall,
  AiVoiceAgentOutcome,
  Call,
  CallbackTask,
  CallEventDetail,
  CallStatus,
  Company,
  Contact,
  ContactNote,
  CustomIntegrationEventType,
  DNCEntry,
  Meeting,
  Recording,
  TranscriptionSource,
  TranscriptionStatus,
  User,
  UserEmail,
} from "@ringee/database";
import { OwnershipContext } from "@ringee/platform";

export function callOwnershipFromCall(call: Call): OwnershipContext | null {
  if (!call.userId) return null;
  return { userId: call.userId, organizationId: call.organizationId ?? null };
}

export function pickCallTerminalEvent(call: Call): CustomIntegrationEventType {
  if (call.status === CallStatus.failed) return "call_failed";
  // No answered timestamp + inbound direction => the call rang and was missed.
  if (
    !call.answeredAt &&
    (call.direction === "inbound" || call.direction === "incoming")
  ) {
    return "call_missed";
  }
  return "call_completed";
}

export function contactRef(
  contact:
    | Pick<Contact, "id" | "phoneNumber" | "fullName" | "email">
    | null
    | undefined,
) {
  if (!contact) return undefined;
  return {
    id: contact.id,
    phoneNumber: contact.phoneNumber,
    fullName: contact.fullName ?? undefined,
    email: contact.email ?? undefined,
  };
}

export function companyRef(
  company: Pick<Company, "id" | "name"> | null | undefined,
) {
  if (!company) return undefined;
  return { id: company.id, name: company.name };
}

export function userRef(
  user: Pick<User, "id" | "firstName" | "lastName"> | null | undefined,
  email?: string | null,
) {
  if (!user) return undefined;
  const fullName = [user.firstName, user.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  return {
    id: user.id,
    email: email ?? undefined,
    fullName: fullName || undefined,
  };
}

/**
 * A user's addressable email: the primary one, falling back to the first on
 * file for rows synced before a primary was flagged.
 */
export function primaryEmailOf(
  user:
    | { emails?: Pick<UserEmail, "email" | "isPrimary">[] }
    | null
    | undefined,
): string | undefined {
  const emails = user?.emails;
  if (!emails?.length) return undefined;
  return emails.find((e) => e.isPrimary)?.email ?? emails[0]?.email;
}

/** AI voice-agent reference carried by every event the agent's call produces. */
export function voiceAgentRef(
  agent: { id: string; name: string } | null | undefined,
) {
  if (!agent) return undefined;
  return { id: agent.id, name: agent.name };
}

export function buildCallEventData(call: Call): Record<string, unknown> {
  return {
    callId: call.id,
    fromNumber: call.fromNumber,
    toNumber: call.toNumber,
    status: call.status,
    direction: call.direction,
    startedAt: call.startedAt?.toISOString(),
    answeredAt: call.answeredAt?.toISOString(),
    endedAt: call.endedAt?.toISOString(),
    durationSeconds: call.durationSeconds ?? undefined,
  };
}

/**
 * Everything Ringee holds about a call, sent as `data.call` on every event tied
 * to one: the telephony facts, the outcome and every note written against the
 * call, the transcript, the recording, the AI voice agent's analysis, and the
 * meetings, callbacks and campaign attempts it produced.
 *
 * It starts from `buildCallEventData`, so the keys `call.outcome.updated`
 * already sent under `data.call` keep their names and formats and only gain
 * siblings. Left out on purpose: cost (provider cost is not a customer figure),
 * provider ids, and `Recording.url`, which points at the encrypted archive —
 * the recording URL here is the shareable copy `recording.ready` also sends.
 */
export function buildCallDetailData(
  call: CallEventDetail,
): Record<string, unknown> {
  const agentCall = call.aiVoiceAgentCall;
  return {
    ...buildCallEventData(call),
    source: call.source ?? undefined,
    createdAt: call.createdAt.toISOString(),
    outcome: call.outcome ?? undefined,
    outcomeNote: call.outcomeNote ?? undefined,
    contact: contactRef(call.contact),
    user: userRef(call.user),
    recording: callRecordingData(call),
    transcription: callTranscriptionData(call.callTranscriptions),
    voiceAgentCall: agentCall
      ? {
          id: agentCall.id,
          agent: voiceAgentRef(agentCall.agent),
          status: agentCall.status,
          outcome: normalizeVoiceAgentOutcome(agentCall.outcome) ?? undefined,
          summary: agentCall.summary ?? undefined,
          sentiment: agentCall.sentiment ?? undefined,
          extractedData: agentCall.extractedData ?? undefined,
          variables: agentCall.variables ?? undefined,
          metadata: agentCall.metadata ?? undefined,
        }
      : undefined,
    meetings: call.meetings.map((meeting) => ({
      id: meeting.id,
      title: meeting.title ?? undefined,
      scheduledAt: meeting.scheduledAt.toISOString(),
      duration: meeting.duration,
      location: meeting.location ?? undefined,
      status: meeting.status,
      notes: meeting.notes ?? undefined,
    })),
    callbacks: call.callbacks.map((callback) => ({
      id: callback.id,
      scheduledAt: callback.scheduledAt.toISOString(),
      status: callback.status,
      note: callback.note ?? undefined,
    })),
    campaignAttempts: call.callAttempts.map((attempt) => ({
      id: attempt.id,
      attemptNumber: attempt.attemptNumber,
      status: attempt.status,
      campaign: attempt.campaign
        ? { id: attempt.campaign.id, name: attempt.campaign.name }
        : undefined,
      disposition: attempt.disposition
        ? { code: attempt.disposition.code, label: attempt.disposition.label }
        : attempt.dispositionCode
          ? { code: attempt.dispositionCode }
          : undefined,
      dispositionNote: attempt.dispositionNote ?? undefined,
    })),
  };
}

/** The shareable recording, with the archive row's facts when one exists. */
function callRecordingData(
  call: Pick<CallEventDetail, "recordings" | "publicRecordings">,
): Record<string, unknown> | undefined {
  const shared = call.publicRecordings[0];
  const archived = call.recordings[call.recordings.length - 1];
  if (!shared && !archived) return undefined;
  return {
    recordingId: archived?.id,
    url: shared?.url,
    status: archived?.status ?? undefined,
    format: archived?.format ?? undefined,
    durationSec: archived?.durationSec ?? undefined,
  };
}

/**
 * The call's transcript, chosen the way the transcript screen chooses it: a
 * finished post-call (recording) transcript over a finished realtime one, and
 * otherwise whichever exists, so a consumer can still see it is in progress.
 */
function callTranscriptionData(
  transcriptions: CallEventDetail["callTranscriptions"],
): Record<string, unknown> | undefined {
  const recording = transcriptions.find(
    (t) => t.source === TranscriptionSource.recording,
  );
  const realtime = transcriptions.find(
    (t) => t.source === TranscriptionSource.realtime,
  );
  const primary =
    [recording, realtime].find(
      (t) => t?.status === TranscriptionStatus.completed,
    ) ??
    recording ??
    realtime;
  if (!primary) return undefined;
  return {
    source: primary.source,
    status: primary.status,
    language: primary.language ?? undefined,
    confidence: primary.confidence ?? undefined,
    completedAt: primary.completedAt?.toISOString(),
    text: primary.text ?? undefined,
    segments: primary.segments.map((segment) => ({
      text: segment.text,
      speaker: segment.speaker ?? undefined,
      track: segment.track ?? undefined,
      startMs: segment.startMs ?? undefined,
      endMs: segment.endMs ?? undefined,
    })),
  };
}

export function buildCallOutcomeData(call: Call): Record<string, unknown> {
  return {
    callId: call.id,
    call: buildCallEventData(call),
    outcome: call.outcome,
    outcomeNote: call.outcomeNote ?? undefined,
    updatedAt: (call.updatedAt ?? new Date()).toISOString(),
  };
}

/**
 * Caller-owned correlation id carried by an AI voice-agent call.
 *
 * The public trigger has historically accepted snake_case metadata, while the
 * webhook contract is camelCase. Read both so every event produced by the call
 * can expose one stable `data.externalId` without making consumers inspect an
 * arbitrary metadata object.
 */
export function voiceAgentExternalId(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return undefined;
  }
  const record = metadata as Record<string, unknown>;
  for (const value of [record.external_id, record.externalId]) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

/** Public call-outcome vocabulary used by Custom Integration consumers. */
export function normalizeVoiceAgentOutcome(
  outcome: AiVoiceAgentOutcome | null,
): AiVoiceAgentOutcome | null {
  switch (outcome) {
    case AiVoiceAgentOutcome.appointment_booked:
      return AiVoiceAgentOutcome.meeting_booked;
    case AiVoiceAgentOutcome.callback_requested:
      return AiVoiceAgentOutcome.callback_scheduled;
    default:
      return outcome;
  }
}

/**
 * AI voice-agent analyses own a wider internal vocabulary than `CallOutcome`.
 * Tool-backed results are translated to the stable public call dispositions:
 * an actual booking is `meeting_booked`, and an actual scheduled callback is
 * `callback_scheduled`.
 */
export function buildVoiceAgentCallOutcomeData(
  agentCall: Pick<
    AiVoiceAgentCall,
    "id" | "agentId" | "callId" | "outcome" | "metadata" | "updatedAt"
  >,
  /** Telephony row behind the agent call, when it is still resolvable. */
  call?: Call | null,
): Record<string, unknown> {
  const externalId = voiceAgentExternalId(agentCall.metadata);
  return {
    callId: agentCall.callId,
    call: call ? buildCallEventData(call) : undefined,
    agentCallId: agentCall.id,
    agentId: agentCall.agentId,
    outcome: normalizeVoiceAgentOutcome(agentCall.outcome),
    externalId,
    metadata: agentCall.metadata ?? undefined,
    updatedAt: agentCall.updatedAt.toISOString(),
  };
}

export function buildNoteEventData(
  note: ContactNote,
  contact: Pick<Contact, "id" | "phoneNumber" | "fullName" | "email">,
): Record<string, unknown> {
  return {
    noteId: note.id,
    contact: contactRef(contact),
    content: note.content,
    createdAt: note.createdAt.toISOString(),
    createdBy: note.userId,
  };
}

export function buildCallbackEventData(
  callback: CallbackTask,
  contact: Pick<Contact, "id" | "phoneNumber" | "fullName" | "email"> | null,
): Record<string, unknown> {
  return {
    callbackId: callback.id,
    callId: callback.callId ?? undefined,
    contact: contactRef(contact),
    scheduledAt: callback.scheduledAt.toISOString(),
    status: callback.status,
    createdAt: callback.createdAt.toISOString(),
    note: callback.note ?? undefined,
  };
}

export function buildMeetingEventData(
  meeting: Meeting,
  contact: Pick<Contact, "id" | "phoneNumber" | "fullName" | "email"> | null,
): Record<string, unknown> {
  return {
    meetingId: meeting.id,
    callId: meeting.callId ?? undefined,
    contact: contactRef(contact),
    scheduledAt: meeting.scheduledAt?.toISOString(),
    status: meeting.status,
    createdAt: meeting.createdAt.toISOString(),
    title: meeting.title ?? undefined,
    duration: meeting.duration ?? undefined,
    location: meeting.location ?? undefined,
    notes: meeting.notes ?? undefined,
    externalEventId: meeting.externalEventId ?? undefined,
  };
}

export function buildRecordingEventData(
  recording: Recording,
  url: string,
): Record<string, unknown> {
  return {
    recordingId: recording.id,
    callId: recording.callId,
    url,
    format: recording.format ?? undefined,
    durationSec: recording.durationSec ?? undefined,
    createdAt: recording.createdAt.toISOString(),
  };
}

export function buildDncEventData(entry: DNCEntry): Record<string, unknown> {
  return {
    phoneNumber: entry.phoneNumber,
    reason: entry.reason ?? undefined,
    source: entry.source ?? undefined,
    createdAt: entry.createdAt.toISOString(),
  };
}
