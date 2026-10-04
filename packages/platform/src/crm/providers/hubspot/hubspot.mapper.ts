import type {
  CrmCallLogInput,
  CrmCompanyInput,
  CrmCompanyMatch,
  CrmCompanySyncResult,
  CrmContactSyncResult,
  CrmMeetingInput,
  CrmOwnerRef,
  CrmPersonInput,
  CrmRecordMatch,
} from "../../types";
import { normalizePhoneE164, phoneMatchesSuffix } from "../../phone";
import { HUBSPOT_BODY_LIMIT, HUBSPOT_CALL_DISPOSITION } from "./hubspot.api";
import {
  escapeHtml,
  fitWithin,
  htmlLink,
  markdownToHtml,
  safeHttpUrl,
  textToHtml,
} from "./hubspot.html";
import type {
  HubSpotObject,
  HubSpotOwner,
  HubSpotProperties,
  HubSpotSearchRequest,
} from "./hubspot.types";

/**
 * Contact properties that can name the Ringee campaign a person belongs to.
 * HubSpot internal names are snake_case; `readCrmCampaignField` matches keys
 * separator-insensitively, so they reach it under their own names.
 */
export const HUBSPOT_CAMPAIGN_PROPERTIES = [
  "campaign",
  "campaign_id",
  "ringee_campaign",
  "ringee_campaign_id",
];

/**
 * Every contact property the adapter reads. A property the portal does not
 * define is simply absent from HubSpot's response, so the calculated phone
 * fields and the campaign fields are safe to request everywhere.
 */
export const HUBSPOT_CONTACT_PROPERTIES = [
  "firstname",
  "lastname",
  "email",
  "hs_additional_emails",
  "phone",
  "mobilephone",
  "hs_calculated_phone_number",
  "hs_calculated_mobile_number",
  "jobtitle",
  "company",
  "hubspot_owner_id",
  "associatedcompanyid",
  ...HUBSPOT_CAMPAIGN_PROPERTIES,
];

export const HUBSPOT_COMPANY_PROPERTIES = [
  "name",
  "domain",
  "industry",
  "numberofemployees",
  "phone",
  "website",
];

function prop(properties: HubSpotProperties, name: string): string | null {
  const value = properties[name];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

// ── Contacts ─────────────────────────────────────────────────────────────

/**
 * The contact's numbers, phone before mobile, each in E.164.
 *
 * HubSpot's calculated values are built from the typed number and the
 * record's country, so they win: the typed value is often local
 * ("(415) 555-2671") and could only be normalized against a default region.
 * The typed value is used only when HubSpot has no calculated one — reading
 * both would add a second, wrongly-normalized copy of the same number.
 */
export function mapHubSpotContactPhones(
  properties: HubSpotProperties,
): string[] {
  const candidates = [
    prop(properties, "hs_calculated_phone_number") ?? prop(properties, "phone"),
    prop(properties, "hs_calculated_mobile_number") ??
      prop(properties, "mobilephone"),
  ];
  const phones: string[] = [];
  for (const raw of candidates) {
    const e164 = raw ? normalizePhoneE164(raw) : null;
    if (e164 && !phones.includes(e164)) phones.push(e164);
  }
  return phones;
}

/** Primary e-mail first, then HubSpot's `;`-separated additional ones. */
export function mapHubSpotContactEmails(
  properties: HubSpotProperties,
): string[] {
  const candidates = [
    prop(properties, "email"),
    ...(prop(properties, "hs_additional_emails")?.split(";") ?? []),
  ];
  const emails: string[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const email = candidate?.trim();
    if (!email || seen.has(email.toLowerCase())) continue;
    seen.add(email.toLowerCase());
    emails.push(email);
  }
  return emails;
}

function contactDisplayName(properties: HubSpotProperties): string | null {
  const name = [prop(properties, "firstname"), prop(properties, "lastname")]
    .filter(Boolean)
    .join(" ")
    .trim();
  return name || null;
}

/** Whether one of the numbers is the target, exactly or by suffix. */
export function hubspotPhonesMatch(
  phones: string[],
  targetPhoneE164: string,
): boolean {
  return phones.some(
    (phone) =>
      phone === targetPhoneE164 || phoneMatchesSuffix(phone, targetPhoneE164),
  );
}

export function mapHubSpotContactToMatch(
  record: HubSpotObject,
  targetPhoneE164: string,
): CrmRecordMatch {
  const phones = mapHubSpotContactPhones(record.properties);
  const matchedOn: CrmRecordMatch["matchedOn"] =
    !phones.includes(targetPhoneE164) &&
    phones.some((phone) => phoneMatchesSuffix(phone, targetPhoneE164))
      ? "phone_suffix"
      : "phone_exact";

  return {
    externalId: record.id,
    externalType: "person",
    displayName:
      contactDisplayName(record.properties) ??
      prop(record.properties, "email") ??
      "Unnamed contact",
    phoneNumbers: phones,
    emails: mapHubSpotContactEmails(record.properties),
    matchedOn,
    raw: record,
  };
}

export function mapHubSpotContactToSyncResult(
  record: HubSpotObject,
): CrmContactSyncResult {
  const properties = record.properties;
  const ownerId = prop(properties, "hubspot_owner_id");
  const companyId = prop(properties, "associatedcompanyid");

  return {
    contact: { externalId: record.id, externalType: "person" },
    phones: mapHubSpotContactPhones(properties),
    emails: mapHubSpotContactEmails(properties),
    firstName: prop(properties, "firstname"),
    lastName: prop(properties, "lastname"),
    displayName: contactDisplayName(properties),
    jobTitle: prop(properties, "jobtitle"),
    owner: ownerId ? { externalId: ownerId, email: null, name: null } : null,
    company: companyId
      ? { externalId: companyId, externalType: "company" }
      : null,
    customFields: mapHubSpotCustomFields(properties),
    raw: record,
  };
}

function mapHubSpotCustomFields(
  properties: HubSpotProperties,
): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const name of HUBSPOT_CAMPAIGN_PROPERTIES) {
    const value = prop(properties, name);
    if (value) fields[name] = value;
  }
  return fields;
}

/**
 * HubSpot keeps first and last name apart and has no full-name property.
 * Ringee contacts usually carry a single `name`, so it is split on the first
 * space — the rule the Attio adapter uses too. A "name" without a single
 * letter is not a name (Ringee falls back to the phone number when it has
 * none) and is left out rather than written into `firstname`.
 */
export function splitHubSpotName(input: {
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}): { firstname: string | null; lastname: string | null } {
  const first = meaningfulName(input.firstName);
  const last = meaningfulName(input.lastName);
  if (first || last) return { firstname: first, lastname: last };

  const display = meaningfulName(input.displayName);
  if (!display) return { firstname: null, lastname: null };
  const [head, ...rest] = display.split(/\s+/);
  return { firstname: head, lastname: rest.join(" ") || null };
}

function meaningfulName(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && /\p{L}/u.test(trimmed) ? trimmed : null;
}

export function buildHubSpotContactProperties(
  input: CrmPersonInput,
): Record<string, string> {
  const properties: Record<string, string> = { phone: input.phoneE164 };
  const { firstname, lastname } = splitHubSpotName(input);
  if (firstname) properties.firstname = firstname;
  if (lastname) properties.lastname = lastname;
  const email = input.email?.trim();
  if (email) properties.email = email;
  const company = input.company?.trim();
  if (company) properties.company = company;
  return properties;
}

/**
 * The part of `desired` worth writing onto an existing record: properties it
 * does not have yet. A CRM's records are curated by people — Ringee fills
 * gaps and never overwrites a value someone typed (the Odoo adapter follows
 * the same rule).
 */
export function hubspotPropertyGaps(
  existing: HubSpotProperties,
  desired: Record<string, string>,
): Record<string, string> {
  const gaps: Record<string, string> = {};
  for (const [name, value] of Object.entries(desired)) {
    if (prop(existing, name) === null) gaps[name] = value;
  }
  return gaps;
}

/** Contact gaps; a contact that already has any number keeps its numbers. */
export function hubspotContactGaps(
  existing: HubSpotProperties,
  desired: Record<string, string>,
): Record<string, string> {
  const gaps = hubspotPropertyGaps(existing, desired);
  if (mapHubSpotContactPhones(existing).length > 0) delete gaps.phone;
  return gaps;
}

/**
 * Filter groups (OR'ed) that find a contact by phone however HubSpot stored
 * it. HubSpot indexes phones for search as dialled locally — area code and
 * local number, no country code — so an E.164 lookup alone misses every
 * number typed in local format. The leading-wildcard token matches the same
 * national number when a portal stored it with its country code, and the
 * typed properties are matched exactly for portals that keep E.164 verbatim.
 * Five groups is HubSpot's maximum. Results are over-inclusive by design;
 * the provider keeps only the ones whose numbers really match.
 */
export function hubspotPhoneFilterGroups(
  phoneE164: string,
  nationalNumber: string | null,
): HubSpotSearchRequest["filterGroups"] {
  const groups: HubSpotSearchRequest["filterGroups"] = [];
  if (nationalNumber) {
    groups.push(
      eq("hs_searchable_calculated_phone_number", nationalNumber),
      token("hs_searchable_calculated_phone_number", `*${nationalNumber}`),
      token("hs_searchable_calculated_mobile_number", `*${nationalNumber}`),
    );
  }
  groups.push(eq("phone", phoneE164), eq("mobilephone", phoneE164));
  return groups;
}

export function hubspotEmailFilterGroups(
  email: string,
): HubSpotSearchRequest["filterGroups"] {
  return [eq("email", email), token("hs_additional_emails", email)];
}

function eq(
  propertyName: string,
  value: string,
): HubSpotSearchRequest["filterGroups"][number] {
  return { filters: [{ propertyName, operator: "EQ", value }] };
}

function token(
  propertyName: string,
  value: string,
): HubSpotSearchRequest["filterGroups"][number] {
  return { filters: [{ propertyName, operator: "CONTAINS_TOKEN", value }] };
}

// ── Companies ────────────────────────────────────────────────────────────

export function normalizeHubSpotDomain(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim().toLowerCase();
  if (!trimmed) return null;
  try {
    const url = new URL(
      trimmed.includes("://") ? trimmed : `https://${trimmed}`,
    );
    return url.hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

/** `COMPUTER_SOFTWARE` → `Computer Software`. */
function humanizeEnumValue(value: string | null): string | null {
  if (!value) return null;
  return value
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

export function mapHubSpotCompanyToSyncResult(
  record: HubSpotObject,
): CrmCompanySyncResult {
  const properties = record.properties;
  const domain = normalizeHubSpotDomain(prop(properties, "domain"));
  const phone = prop(properties, "phone");

  return {
    company: { externalId: record.id, externalType: "company" },
    name: prop(properties, "name") ?? domain ?? "Unnamed company",
    domain,
    industry: humanizeEnumValue(prop(properties, "industry")),
    size: prop(properties, "numberofemployees"),
    phone: phone ? (normalizePhoneE164(phone) ?? phone) : null,
    website:
      prop(properties, "website") ?? (domain ? `https://${domain}` : null),
    customFields: {},
    raw: record,
  };
}

export function mapHubSpotCompanyToMatch(
  record: HubSpotObject,
  targetDomain: string,
): CrmCompanyMatch {
  const domain = normalizeHubSpotDomain(prop(record.properties, "domain"));
  return {
    externalId: record.id,
    externalType: "company",
    name: prop(record.properties, "name") ?? domain ?? "Unnamed company",
    domain,
    matchedOn:
      domain && domain === normalizeHubSpotDomain(targetDomain)
        ? "domain_exact"
        : "name_exact",
    raw: record,
  };
}

/**
 * Company properties for a create or a gap fill. `industry` and
 * `numberofemployees` are left out on purpose: HubSpot's industry is a fixed
 * enumeration and its size a number, and Ringee's free-text values for both
 * would be rejected — failing the whole write for a cosmetic field.
 */
export function buildHubSpotCompanyProperties(
  input: CrmCompanyInput,
): Record<string, string> {
  const properties: Record<string, string> = {};
  const name = input.name?.trim();
  if (name) properties.name = name;
  const domain = normalizeHubSpotDomain(input.domain);
  if (domain) properties.domain = domain;
  if (input.phoneE164) properties.phone = input.phoneE164;
  const website =
    safeHttpUrl(input.website) ?? (domain ? `https://${domain}` : null);
  if (website) properties.website = website;
  return properties;
}

// ── Owners ───────────────────────────────────────────────────────────────

export function mapHubSpotOwnerToOwnerRef(owner: HubSpotOwner): CrmOwnerRef {
  const name =
    [owner.firstName, owner.lastName].filter(Boolean).join(" ").trim() || null;
  return {
    externalId: owner.id,
    email: owner.email?.trim() || null,
    name,
  };
}

// ── Calls ────────────────────────────────────────────────────────────────

/** Ringee `CallOutcome` → HubSpot's built-in call outcome. */
const DISPOSITION_BY_OUTCOME: Record<string, string> = {
  meeting_booked: HUBSPOT_CALL_DISPOSITION.connected,
  sale: HUBSPOT_CALL_DISPOSITION.connected,
  interested: HUBSPOT_CALL_DISPOSITION.connected,
  follow_up: HUBSPOT_CALL_DISPOSITION.connected,
  callback_scheduled: HUBSPOT_CALL_DISPOSITION.connected,
  not_interested: HUBSPOT_CALL_DISPOSITION.connected,
  voicemail: HUBSPOT_CALL_DISPOSITION.leftVoicemail,
  wrong_number: HUBSPOT_CALL_DISPOSITION.wrongNumber,
  no_answer: HUBSPOT_CALL_DISPOSITION.noAnswer,
};

/**
 * HubSpot's call status. The duration cannot decide it — Ringee measures from
 * placement, so an unanswered call still has seconds of ringing — hence the
 * outcome first, then whether the call connected.
 */
export function hubspotCallStatus(
  input: CrmCallLogInput,
): "COMPLETED" | "NO_ANSWER" {
  if (input.outcome === "no_answer") return "NO_ANSWER";
  if (input.outcome) return "COMPLETED";
  return input.answered === false ? "NO_ANSWER" : "COMPLETED";
}

/**
 * The HubSpot call outcome, or null when Ringee's outcome has no honest
 * equivalent (a gatekeeper, a custom campaign code) — the label still lands
 * in the call's body.
 */
export function hubspotCallDisposition(input: CrmCallLogInput): string | null {
  if (input.outcome) return DISPOSITION_BY_OUTCOME[input.outcome] ?? null;
  if (input.answered === false) return HUBSPOT_CALL_DISPOSITION.noAnswer;
  if (input.answered === true) return HUBSPOT_CALL_DISPOSITION.connected;
  return null;
}

/**
 * HubSpot plays `hs_call_recording_url` inline, and accepts only HTTPS links
 * to `.mp3` or `.wav` files. Anything else would be a non-retryable 400 that
 * loses the call, so it goes in the body as a link instead.
 */
export function playableRecordingUrl(
  url: string | null | undefined,
): string | null {
  const safe = safeHttpUrl(url);
  if (!safe) return null;
  const parsed = new URL(safe);
  return parsed.protocol === "https:" && /\.(mp3|wav)$/i.test(parsed.pathname)
    ? safe
    : null;
}

export function hubspotCallTitle(input: CrmCallLogInput): string {
  return input.outcomeLabel
    ? `Ringee call — ${input.outcomeLabel}`
    : `Ringee ${input.direction} call`;
}

export function hubspotCallDirection(
  input: CrmCallLogInput,
): "INBOUND" | "OUTBOUND" {
  return input.direction === "inbound" ? "INBOUND" : "OUTBOUND";
}

export function buildHubSpotCallProperties(
  input: CrmCallLogInput,
): Record<string, string> {
  const recordingUrl = playableRecordingUrl(input.recordingUrl);
  const properties: Record<string, string> = {
    hs_timestamp: input.startedAt.toISOString(),
    hs_call_title: hubspotCallTitle(input),
    hs_call_direction: hubspotCallDirection(input),
    hs_call_status: hubspotCallStatus(input),
    hs_call_body: buildHubSpotCallBody(input, recordingUrl !== null),
  };
  if (input.durationSeconds != null && Number.isFinite(input.durationSeconds)) {
    // HubSpot stores the duration in milliseconds.
    properties.hs_call_duration = String(
      Math.max(0, Math.round(input.durationSeconds * 1000)),
    );
  }
  if (input.from) properties.hs_call_from_number = input.from;
  if (input.to) properties.hs_call_to_number = input.to;
  if (recordingUrl) properties.hs_call_recording_url = recordingUrl;
  const disposition = hubspotCallDisposition(input);
  if (disposition) properties.hs_call_disposition = disposition;
  return properties;
}

/**
 * The call's body. Direction, numbers, duration, status and recording are
 * native call properties, so the body carries what HubSpot has no field for:
 * Ringee's outcome label, the agent, notes, AI summary and insights, links
 * and the transcript. The transcript is what gets shortened if the whole
 * would pass HubSpot's limit.
 */
export function buildHubSpotCallBody(
  input: CrmCallLogInput,
  recordingPlaysInline: boolean,
): string {
  return fitWithin(
    input.transcript?.trim() ?? "",
    (transcript) => renderCallBody(input, recordingPlaysInline, transcript),
    HUBSPOT_BODY_LIMIT,
  );
}

function renderCallBody(
  input: CrmCallLogInput,
  recordingPlaysInline: boolean,
  transcript: string,
): string {
  const parts: string[] = [];

  const facts: string[] = [];
  if (input.outcomeLabel) facts.push(fact("Outcome", input.outcomeLabel));
  if (input.dispositionName) {
    facts.push(fact("Disposition", input.dispositionName));
  }
  if (input.agentName) facts.push(fact("Agent", input.agentName));
  if (facts.length > 0) parts.push(`<ul>${facts.join("")}</ul>`);

  const notes = input.notes?.trim();
  if (notes) parts.push(section("Notes", textToHtml(notes)));
  const summary = input.summary?.trim();
  if (summary) parts.push(section("Summary", textToHtml(summary)));

  const insights = Object.entries(input.insights ?? {});
  if (insights.length > 0) {
    const items = insights.map(([key, value]) =>
      fact(humanizeKey(key), insightText(value)),
    );
    parts.push(`<p><strong>Insights</strong></p><ul>${items.join("")}</ul>`);
  }

  const links: string[] = [];
  const meetingUrl = safeHttpUrl(input.meetingUrl);
  if (meetingUrl) links.push(htmlLink(meetingUrl, "Join meeting"));
  const recordingUrl = safeHttpUrl(input.recordingUrl);
  if (recordingUrl && !recordingPlaysInline) {
    links.push(htmlLink(recordingUrl, "Listen to recording"));
  }
  const transcriptUrl = safeHttpUrl(input.transcriptUrl);
  if (transcriptUrl) links.push(htmlLink(transcriptUrl, "View transcript"));
  if (links.length > 0) parts.push(`<p>${links.join(" · ")}</p>`);

  if (transcript) parts.push(section("Transcript", textToHtml(transcript)));
  parts.push(syncedFooter(input.idempotencyKey));
  return parts.join("");
}

// ── Meetings ─────────────────────────────────────────────────────────────

export function buildHubSpotMeetingProperties(
  input: CrmMeetingInput,
): Record<string, string> {
  const properties: Record<string, string> = {
    hs_timestamp: input.startAt.toISOString(),
    hs_meeting_title: input.title,
    hs_meeting_start_time: input.startAt.toISOString(),
    hs_meeting_end_time: input.endAt.toISOString(),
    hs_meeting_outcome: "SCHEDULED",
    hs_meeting_body: buildHubSpotMeetingBody(input),
  };
  const meetingUrl = safeHttpUrl(input.meetingUrl);
  if (meetingUrl) properties.hs_meeting_external_url = meetingUrl;
  return properties;
}

export function buildHubSpotMeetingBody(input: CrmMeetingInput): string {
  return fitWithin(
    input.description?.trim() ?? "",
    (description) => renderMeetingBody(input, description),
    HUBSPOT_BODY_LIMIT,
  );
}

function renderMeetingBody(
  input: CrmMeetingInput,
  description: string,
): string {
  const parts: string[] = [];
  if (description) parts.push(`<p>${textToHtml(description)}</p>`);

  const facts: string[] = [];
  if (input.timezone) facts.push(fact("Timezone", input.timezone));
  if (input.ownerName) facts.push(fact("Organizer", input.ownerName));
  const attendees = input.attendees
    .map((attendee) =>
      [attendee.name, attendee.email].filter(Boolean).join(" — "),
    )
    .filter(Boolean);
  if (attendees.length > 0) facts.push(fact("Attendees", attendees.join(", ")));
  if (facts.length > 0) parts.push(`<ul>${facts.join("")}</ul>`);

  const links: string[] = [];
  const candidates: Array<[string | null | undefined, string]> = [
    [input.meetingUrl, "Join meeting"],
    [input.ringeeMeetingUrl, "View in Ringee"],
    [input.sourceCallUrl, "Source call"],
    [input.recordingUrl, "Recording"],
  ];
  for (const [url, label] of candidates) {
    const safe = safeHttpUrl(url);
    if (safe) links.push(htmlLink(safe, label));
  }
  if (links.length > 0) parts.push(`<p>${links.join(" · ")}</p>`);

  const calendar = [
    input.calendarProvider ? `Provider: ${input.calendarProvider}` : null,
    input.calendarEventId ? `Event ID: ${input.calendarEventId}` : null,
  ].filter(Boolean);
  if (calendar.length > 0) {
    parts.push(`<p><em>Calendar: ${escapeHtml(calendar.join(" · "))}</em></p>`);
  }

  parts.push(syncedFooter(input.idempotencyKey));
  return parts.join("");
}

// ── Notes and tasks ──────────────────────────────────────────────────────

/**
 * A note from the services' markdown body. HubSpot notes have no title, so
 * the title leads the body in bold.
 */
export function buildHubSpotNoteBody(
  title: string | null | undefined,
  body: string,
): string {
  const heading = title?.trim()
    ? `<p><strong>${escapeHtml(title.trim())}</strong></p>`
    : "";
  return fitWithin(
    body,
    (text) => heading + markdownToHtml(text),
    HUBSPOT_BODY_LIMIT,
  );
}

export function buildHubSpotRichText(markdown: string): string {
  return fitWithin(markdown, markdownToHtml, HUBSPOT_BODY_LIMIT);
}

// ── Shared ───────────────────────────────────────────────────────────────

function fact(label: string, value: string): string {
  return `<li><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</li>`;
}

function section(title: string, html: string): string {
  return `<p><strong>${escapeHtml(title)}</strong><br>${html}</p>`;
}

function syncedFooter(idempotencyKey: string): string {
  return `<p><em>Synced from Ringee · ${escapeHtml(idempotencyKey)}</em></p>`;
}

function humanizeKey(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function insightText(value: unknown): string {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return "";
  }
}
