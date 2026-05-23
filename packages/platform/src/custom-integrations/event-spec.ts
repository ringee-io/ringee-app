/**
 * Single source of truth describing every Custom Integration event.
 *
 * Used for:
 *  - Inbound validation (required field presence checks)
 *  - Outbound payload shape documentation
 *  - The "Documentation" sub-tab in the frontend (rendered from this array)
 */

export type CustomIntegrationDirection = "inbound" | "outbound";

export interface EventFieldSpec {
  name: string;
  type: string;
  description: string;
}

export interface CustomIntegrationEventSpec {
  /** Wire name (dot.notation). */
  name: string;
  direction: CustomIntegrationDirection;
  description: string;
  whenItFires: string;
  requiredFields: EventFieldSpec[];
  optionalFields: EventFieldSpec[];
  examplePayload: Record<string, unknown>;
  notes: string[];
}

// Common envelope (every event shares these top-level keys)
const ENVELOPE_NOTE =
  "All events share an envelope: { event, eventId, occurredAt, data }. " +
  "Outbound events also include workspaceId and integrationId.";

// ─── Inbound events ────────────────────────────────────────────────────────

export const INBOUND_EVENT_NAMES = [
  "contact.upserted",
  "company.upserted",
  "contact.deleted",
  "company.deleted",
] as const;

export type InboundEventName = (typeof INBOUND_EVENT_NAMES)[number];

export const INBOUND_EVENT_SPECS: CustomIntegrationEventSpec[] = [
  {
    name: "contact.upserted",
    direction: "inbound",
    description:
      "Create or update a Contact in Ringee from the external system's current state.",
    whenItFires: "Sent by the external system whenever a contact is created or modified.",
    requiredFields: [
      { name: "data.externalId", type: "string", description: "Stable ID of the contact in the external system." },
      { name: "data.phoneNumber", type: "string", description: "Phone in any format; normalized to E.164 when possible." },
    ],
    optionalFields: [
      { name: "data.name", type: "string", description: "Display name." },
      { name: "data.firstName", type: "string", description: "Given name." },
      { name: "data.lastName", type: "string", description: "Family name." },
      { name: "data.fullName", type: "string", description: "Pre-composed full name." },
      { name: "data.email", type: "string", description: "Primary email." },
      { name: "data.companyExternalId", type: "string", description: "External company ID to link this contact to." },
      { name: "data.companyName", type: "string", description: "Fallback company name if no externalId is provided." },
      { name: "data.jobTitle", type: "string", description: "Position / title." },
      { name: "data.ownerExternalId", type: "string", description: "External owner id (sales rep)." },
      { name: "data.ownerEmail", type: "string", description: "Owner email — used to resolve a Ringee user when org-scoped." },
      { name: "data.source", type: "string", description: "Lead source label." },
      { name: "data.customFields", type: "object", description: "Arbitrary key/value pairs stored on the Contact." },
      { name: "data.crmMetadata", type: "object", description: "Provider-specific metadata stored on the Contact." },
    ],
    examplePayload: {
      event: "contact.upserted",
      eventId: "evt_01HX5Z7K8MZP1Q4V0G9YJ2RH3T",
      occurredAt: "2026-05-23T14:30:00.000Z",
      data: {
        externalId: "ext_contact_42",
        phoneNumber: "+14155550123",
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.com",
        companyExternalId: "ext_company_7",
        jobTitle: "Founder",
        customFields: { tier: "vip" },
      },
    },
    notes: [
      ENVELOPE_NOTE,
      "phoneNumber is required because Ringee needs to be able to dial the contact.",
      "Sending null / undefined / empty strings will NOT overwrite existing values.",
      "Dedup order: externalId first, then phoneNumber within the same workspace.",
    ],
  },
  {
    name: "company.upserted",
    direction: "inbound",
    description:
      "Create or update a Company in Ringee from the external system's current state.",
    whenItFires: "Sent by the external system whenever a company is created or modified.",
    requiredFields: [
      { name: "data.externalId", type: "string", description: "Stable ID of the company in the external system." },
      { name: "data.name", type: "string", description: "Display name." },
    ],
    optionalFields: [
      { name: "data.legalName", type: "string", description: "Registered legal name." },
      { name: "data.domain", type: "string", description: "Primary web domain — used as a secondary dedup signal." },
      { name: "data.industry", type: "string", description: "Industry label." },
      { name: "data.size", type: "string", description: "Headcount band, e.g. \"11-50\"." },
      { name: "data.phone", type: "string", description: "Main phone." },
      { name: "data.website", type: "string", description: "Homepage URL." },
      { name: "data.source", type: "string", description: "Source label." },
      { name: "data.customFields", type: "object", description: "Arbitrary key/value pairs." },
      { name: "data.crmMetadata", type: "object", description: "Provider-specific metadata." },
    ],
    examplePayload: {
      event: "company.upserted",
      eventId: "evt_01HX5Z8FYBKD7QY5W3JN9NF2EA",
      occurredAt: "2026-05-23T14:30:05.000Z",
      data: {
        externalId: "ext_company_7",
        name: "Babbage Engines Ltd.",
        domain: "babbage.example.com",
        industry: "Hardware",
        size: "11-50",
      },
    },
    notes: [
      ENVELOPE_NOTE,
      "Dedup order: externalId, then domain within the same workspace.",
      "Sending null / undefined / empty strings will NOT overwrite existing values.",
    ],
  },
  {
    name: "contact.deleted",
    direction: "inbound",
    description:
      "Mark a contact as archived in Ringee. Ringee never deletes the underlying Contact — call history, notes, callbacks and meetings are preserved.",
    whenItFires: "The contact was deleted, archived or deactivated in the external system.",
    requiredFields: [
      { name: "data.externalId", type: "string", description: "External contact ID previously sent in contact.upserted." },
    ],
    optionalFields: [],
    examplePayload: {
      event: "contact.deleted",
      eventId: "evt_01HX5Z9MQ7G3T2DR0NXJW1B8VC",
      occurredAt: "2026-05-23T14:35:00.000Z",
      data: { externalId: "ext_contact_42" },
    },
    notes: [
      "The Contact row is not removed; only the integration's link is archived.",
      "Re-sending contact.upserted with the same externalId will un-archive the link.",
    ],
  },
  {
    name: "company.deleted",
    direction: "inbound",
    description:
      "Mark a company as archived in Ringee. Historical relations are preserved.",
    whenItFires: "The company was deleted, archived or deactivated in the external system.",
    requiredFields: [
      { name: "data.externalId", type: "string", description: "External company ID previously sent in company.upserted." },
    ],
    optionalFields: [],
    examplePayload: {
      event: "company.deleted",
      eventId: "evt_01HX5ZA1H4T6N2DR9CB7YP6F0K",
      occurredAt: "2026-05-23T14:35:30.000Z",
      data: { externalId: "ext_company_7" },
    },
    notes: [
      "The Company row is not removed; only the integration's link is archived.",
    ],
  },
];

// ─── Outbound events ───────────────────────────────────────────────────────

/** Maps wire name (dot.notation) ↔ Prisma enum value (snake_case). */
export const OUTBOUND_EVENT_NAME_TO_ENUM = {
  "call.completed": "call_completed",
  "call.outcome.updated": "call_outcome_updated",
  "note.created": "note_created",
  "callback.created": "callback_created",
  "meeting.created": "meeting_created",
  "recording.ready": "recording_ready",
  "call.missed": "call_missed",
  "call.failed": "call_failed",
  "dnc.created": "dnc_created",
} as const;

export type OutboundEventName = keyof typeof OUTBOUND_EVENT_NAME_TO_ENUM;
export type OutboundEventEnum = (typeof OUTBOUND_EVENT_NAME_TO_ENUM)[OutboundEventName];

export const OUTBOUND_EVENT_ENUM_TO_NAME: Record<OutboundEventEnum, OutboundEventName> =
  Object.fromEntries(
    Object.entries(OUTBOUND_EVENT_NAME_TO_ENUM).map(([k, v]) => [v, k]),
  ) as Record<OutboundEventEnum, OutboundEventName>;

const ENTITY_CONTACT = {
  name: "data.contact",
  type: "object",
  description:
    "Ringee contact reference: { id, externalId?, phoneNumber, fullName?, email? }",
};
const ENTITY_COMPANY = {
  name: "data.company",
  type: "object",
  description: "Ringee company reference: { id, externalId?, name }",
};
const ENTITY_USER = {
  name: "data.user",
  type: "object",
  description: "Ringee user reference: { id, email?, fullName? }",
};

export const OUTBOUND_EVENT_SPECS: CustomIntegrationEventSpec[] = [
  {
    name: "call.completed",
    direction: "outbound",
    description: "A call has technically ended.",
    whenItFires:
      "Fired the moment the telephony stack reports the call ended, regardless of whether the user has recorded an outcome yet.",
    requiredFields: [
      { name: "data.callId", type: "string", description: "Ringee call UUID." },
      { name: "data.fromNumber", type: "string", description: "Originating E.164 number." },
      { name: "data.toNumber", type: "string", description: "Destination E.164 number." },
      { name: "data.status", type: "string", description: "Final call status reported by the carrier." },
      { name: "data.direction", type: "string", description: "\"inbound\" or \"outbound\"." },
      { name: "data.endedAt", type: "string (ISO-8601)", description: "When the call ended." },
    ],
    optionalFields: [
      ENTITY_CONTACT,
      ENTITY_COMPANY,
      ENTITY_USER,
      { name: "data.durationSeconds", type: "number", description: "Total billed duration." },
      { name: "data.startedAt", type: "string (ISO-8601)", description: "When the call was initiated." },
      { name: "data.answeredAt", type: "string (ISO-8601)", description: "When the call was answered." },
      { name: "data.recordingStatus", type: "string", description: "pending | ready | unavailable" },
    ],
    examplePayload: {
      event: "call.completed",
      eventId: "evt_01HX5ZBN7Y0Q3S4M2K1WJ8V5DC",
      occurredAt: "2026-05-23T14:42:18.000Z",
      workspaceId: "org_2k7yX...",
      integrationId: "ci_…",
      data: {
        callId: "f3b1…",
        fromNumber: "+14155550100",
        toNumber: "+14155550123",
        status: "completed",
        direction: "outbound",
        durationSeconds: 142,
        startedAt: "2026-05-23T14:39:56.000Z",
        endedAt: "2026-05-23T14:42:18.000Z",
        contact: { id: "…", externalId: "ext_contact_42", phoneNumber: "+14155550123" },
      },
    },
    notes: [
      ENVELOPE_NOTE,
      "This event does NOT include the outcome. Outcomes are sent separately via call.outcome.updated.",
    ],
  },
  {
    name: "call.outcome.updated",
    direction: "outbound",
    description: "The user recorded or changed the outcome of a call.",
    whenItFires:
      "Fired whenever a Ringee user sets or changes a call outcome — may happen well after call.completed.",
    requiredFields: [
      { name: "data.callId", type: "string", description: "Ringee call UUID." },
      { name: "data.outcome", type: "string", description: "CallOutcome value." },
      { name: "data.updatedAt", type: "string (ISO-8601)", description: "When the outcome was updated." },
    ],
    optionalFields: [
      { name: "data.outcomeNote", type: "string", description: "Free-text note attached to the outcome." },
      ENTITY_CONTACT,
      ENTITY_COMPANY,
      ENTITY_USER,
    ],
    examplePayload: {
      event: "call.outcome.updated",
      eventId: "evt_…",
      occurredAt: "2026-05-23T14:50:00.000Z",
      workspaceId: "org_…",
      integrationId: "ci_…",
      data: {
        callId: "f3b1…",
        outcome: "meeting_booked",
        outcomeNote: "Demo scheduled for next Tuesday",
        updatedAt: "2026-05-23T14:50:00.000Z",
      },
    },
    notes: [
      "If the user never records an outcome, this event is not sent.",
      "When the outcome is meeting_booked, a separate meeting.created event is also fired.",
    ],
  },
  {
    name: "note.created",
    direction: "outbound",
    description: "A note was added to a contact.",
    whenItFires: "Fired when a Ringee user creates a new note on a contact.",
    requiredFields: [
      { name: "data.noteId", type: "string", description: "Ringee note UUID." },
      ENTITY_CONTACT,
      { name: "data.content", type: "string", description: "Note body." },
      { name: "data.createdAt", type: "string (ISO-8601)", description: "Creation timestamp." },
    ],
    optionalFields: [{ name: "data.createdBy", type: "object", description: "User reference." }],
    examplePayload: {
      event: "note.created",
      eventId: "evt_…",
      occurredAt: "2026-05-23T15:00:00.000Z",
      workspaceId: "org_…",
      integrationId: "ci_…",
      data: {
        noteId: "n_…",
        contact: { id: "…", externalId: "ext_contact_42", phoneNumber: "+14155550123" },
        content: "Prefers email follow-up.",
        createdAt: "2026-05-23T15:00:00.000Z",
      },
    },
    notes: [ENVELOPE_NOTE],
  },
  {
    name: "callback.created",
    direction: "outbound",
    description: "A callback was scheduled.",
    whenItFires: "Fired when a Ringee user (or automation) schedules a callback.",
    requiredFields: [
      { name: "data.callbackId", type: "string", description: "Ringee callback UUID." },
      ENTITY_CONTACT,
      { name: "data.scheduledAt", type: "string (ISO-8601)", description: "When the callback should happen." },
      { name: "data.status", type: "string", description: "Callback status." },
      { name: "data.createdAt", type: "string (ISO-8601)", description: "Creation timestamp." },
    ],
    optionalFields: [
      { name: "data.call", type: "object", description: "Originating call reference." },
      { name: "data.note", type: "string", description: "Free-text note." },
      ENTITY_USER,
    ],
    examplePayload: {
      event: "callback.created",
      eventId: "evt_…",
      occurredAt: "2026-05-23T15:05:00.000Z",
      workspaceId: "org_…",
      integrationId: "ci_…",
      data: {
        callbackId: "cb_…",
        contact: { id: "…", externalId: "ext_contact_42", phoneNumber: "+14155550123" },
        scheduledAt: "2026-05-24T10:00:00.000Z",
        status: "pending",
        createdAt: "2026-05-23T15:05:00.000Z",
      },
    },
    notes: [ENVELOPE_NOTE],
  },
  {
    name: "meeting.created",
    direction: "outbound",
    description: "A meeting was scheduled from Ringee.",
    whenItFires:
      "Fired when a Ringee user schedules a meeting. Independent of outcome: if the outcome is meeting_booked, both call.outcome.updated and meeting.created fire.",
    requiredFields: [
      { name: "data.meetingId", type: "string", description: "Ringee meeting UUID." },
      ENTITY_CONTACT,
      { name: "data.scheduledAt", type: "string (ISO-8601)", description: "When the meeting starts." },
      { name: "data.status", type: "string", description: "Meeting status." },
      { name: "data.createdAt", type: "string (ISO-8601)", description: "Creation timestamp." },
    ],
    optionalFields: [
      { name: "data.call", type: "object", description: "Originating call reference." },
      { name: "data.title", type: "string", description: "Meeting title." },
      { name: "data.duration", type: "number", description: "Duration in minutes." },
      { name: "data.location", type: "string", description: "Physical location or link." },
      { name: "data.notes", type: "string", description: "Notes." },
      { name: "data.externalEventId", type: "string", description: "Calendar provider event id, when synced." },
      ENTITY_USER,
    ],
    examplePayload: {
      event: "meeting.created",
      eventId: "evt_…",
      occurredAt: "2026-05-23T15:10:00.000Z",
      workspaceId: "org_…",
      integrationId: "ci_…",
      data: {
        meetingId: "m_…",
        contact: { id: "…", externalId: "ext_contact_42", phoneNumber: "+14155550123" },
        scheduledAt: "2026-05-30T16:00:00.000Z",
        status: "scheduled",
        title: "Demo with Babbage Engines",
        duration: 30,
        createdAt: "2026-05-23T15:10:00.000Z",
      },
    },
    notes: [ENVELOPE_NOTE],
  },
  {
    name: "recording.ready",
    direction: "outbound",
    description: "A call recording is available.",
    whenItFires:
      "Fired when the recording has been processed and is downloadable. May arrive seconds or minutes after call.completed.",
    requiredFields: [
      { name: "data.recordingId", type: "string", description: "Ringee recording UUID." },
      { name: "data.callId", type: "string", description: "Ringee call UUID." },
      { name: "data.url", type: "string", description: "Signed URL to the recording." },
      { name: "data.createdAt", type: "string (ISO-8601)", description: "When the recording was finalized." },
    ],
    optionalFields: [
      { name: "data.format", type: "string", description: "Audio container, e.g. mp3, wav." },
      { name: "data.durationSec", type: "number", description: "Duration in seconds." },
      { name: "data.transcript", type: "string", description: "Plain-text transcript if available." },
    ],
    examplePayload: {
      event: "recording.ready",
      eventId: "evt_…",
      occurredAt: "2026-05-23T14:43:00.000Z",
      workspaceId: "org_…",
      integrationId: "ci_…",
      data: {
        recordingId: "r_…",
        callId: "f3b1…",
        url: "https://recordings.ringee.app/...",
        format: "mp3",
        durationSec: 142,
        createdAt: "2026-05-23T14:43:00.000Z",
      },
    },
    notes: [
      "Do not assume recording.ready arrives immediately after call.completed.",
    ],
  },
  {
    name: "call.missed",
    direction: "outbound",
    description: "An inbound call was not answered.",
    whenItFires: "Fired when a call attempt arrives but no agent picks up.",
    requiredFields: [
      { name: "data.callId", type: "string", description: "Ringee call UUID." },
      { name: "data.fromNumber", type: "string", description: "Originating E.164 number." },
      { name: "data.toNumber", type: "string", description: "Destination E.164 number." },
      { name: "data.occurredAt", type: "string (ISO-8601)", description: "When the call was missed." },
    ],
    optionalFields: [
      ENTITY_CONTACT,
      ENTITY_COMPANY,
      ENTITY_USER,
      { name: "data.reason", type: "string", description: "Carrier-provided reason." },
    ],
    examplePayload: {
      event: "call.missed",
      eventId: "evt_…",
      occurredAt: "2026-05-23T15:20:00.000Z",
      workspaceId: "org_…",
      integrationId: "ci_…",
      data: {
        callId: "c_…",
        fromNumber: "+14155550123",
        toNumber: "+14155550100",
        occurredAt: "2026-05-23T15:20:00.000Z",
      },
    },
    notes: ["Optional event — opt in via the outbound event selector."],
  },
  {
    name: "call.failed",
    direction: "outbound",
    description: "A call failed technically.",
    whenItFires:
      "Fired when the telephony stack reports a hard failure (busy, invalid number, network error).",
    requiredFields: [
      { name: "data.callId", type: "string", description: "Ringee call UUID." },
      { name: "data.fromNumber", type: "string", description: "Originating E.164 number." },
      { name: "data.toNumber", type: "string", description: "Destination E.164 number." },
      { name: "data.occurredAt", type: "string (ISO-8601)", description: "When the failure was recorded." },
    ],
    optionalFields: [
      ENTITY_CONTACT,
      ENTITY_COMPANY,
      ENTITY_USER,
      { name: "data.errorCode", type: "string", description: "Carrier error code." },
      { name: "data.errorMessage", type: "string", description: "Human-readable error description." },
    ],
    examplePayload: {
      event: "call.failed",
      eventId: "evt_…",
      occurredAt: "2026-05-23T15:25:00.000Z",
      workspaceId: "org_…",
      integrationId: "ci_…",
      data: {
        callId: "c_…",
        fromNumber: "+14155550100",
        toNumber: "+14155550123",
        occurredAt: "2026-05-23T15:25:00.000Z",
        errorCode: "USER_BUSY",
      },
    },
    notes: ["Optional event — opt in via the outbound event selector."],
  },
  {
    name: "dnc.created",
    direction: "outbound",
    description: "A phone number or contact was added to the Do Not Call list.",
    whenItFires: "Fired the moment a DNC entry is created in Ringee.",
    requiredFields: [
      { name: "data.phoneNumber", type: "string", description: "The number being protected." },
      { name: "data.createdAt", type: "string (ISO-8601)", description: "When the DNC entry was created." },
    ],
    optionalFields: [
      ENTITY_CONTACT,
      { name: "data.reason", type: "string", description: "Free-text reason." },
      { name: "data.source", type: "string", description: "Channel that triggered the addition." },
      ENTITY_USER,
    ],
    examplePayload: {
      event: "dnc.created",
      eventId: "evt_…",
      occurredAt: "2026-05-23T15:30:00.000Z",
      workspaceId: "org_…",
      integrationId: "ci_…",
      data: { phoneNumber: "+14155550123", createdAt: "2026-05-23T15:30:00.000Z" },
    },
    notes: ["Optional event — opt in via the outbound event selector."],
  },
];

export const ALL_EVENT_SPECS: CustomIntegrationEventSpec[] = [
  ...INBOUND_EVENT_SPECS,
  ...OUTBOUND_EVENT_SPECS,
];
