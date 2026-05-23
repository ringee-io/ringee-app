/**
 * Helpers that turn Ringee domain entities into outbound event `data` payloads.
 * Keeps the hook sites in call.service / meeting.service / etc small.
 */

import {
  Call,
  CallbackTask,
  CallStatus,
  Company,
  Contact,
  ContactNote,
  CustomIntegrationEventType,
  DNCEntry,
  Meeting,
  Recording,
  User,
} from "@ringee/database";
import { OwnershipContext } from "@ringee/platform";

export function callOwnershipFromCall(call: Call): OwnershipContext | null {
  if (!call.userId) return null;
  return { userId: call.userId, organizationId: call.organizationId ?? null };
}

export function pickCallTerminalEvent(call: Call): CustomIntegrationEventType {
  if (call.status === CallStatus.failed) return "call_failed";
  // No answered timestamp + inbound direction => the call rang and was missed.
  if (!call.answeredAt && (call.direction === "inbound" || call.direction === "incoming")) {
    return "call_missed";
  }
  return "call_completed";
}

export function contactRef(contact: Pick<Contact, "id" | "phoneNumber" | "fullName" | "email"> | null | undefined) {
  if (!contact) return undefined;
  return {
    id: contact.id,
    phoneNumber: contact.phoneNumber,
    fullName: contact.fullName ?? undefined,
    email: contact.email ?? undefined,
  };
}

export function companyRef(company: Pick<Company, "id" | "name"> | null | undefined) {
  if (!company) return undefined;
  return { id: company.id, name: company.name };
}

export function userRef(user: Pick<User, "id" | "firstName" | "lastName"> | null | undefined, email?: string | null) {
  if (!user) return undefined;
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return {
    id: user.id,
    email: email ?? undefined,
    fullName: fullName || undefined,
  };
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

export function buildCallOutcomeData(call: Call): Record<string, unknown> {
  return {
    callId: call.id,
    outcome: call.outcome,
    outcomeNote: call.outcomeNote ?? undefined,
    updatedAt: (call.updatedAt ?? new Date()).toISOString(),
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
