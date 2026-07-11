import type {
  CrmCallLogInput,
  CrmCompanyMatch,
  CrmCompanySyncResult,
  CrmContactSyncResult,
  CrmMeetingInput,
  CrmOwnerRef,
  CrmRecordMatch,
} from "../../types";
import { normalizePhoneE164, phoneMatchesSuffix } from "../../phone";
import type {
  AttioCompanyRecord,
  AttioPersonRecord,
  AttioWorkspaceMember,
} from "./attio.types";

export function mapAttioPersonToMatch(
  record: AttioPersonRecord,
  targetPhoneE164: string,
): CrmRecordMatch {
  const nameVal = record.values.name?.[0];
  const assembledName = [nameVal?.first_name, nameVal?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  const displayName =
    nameVal?.full_name ?? nameVal?.value ?? (assembledName || "Unnamed person");

  const rawPhones =
    record.values.phone_numbers?.map(
      (p) => p.original_phone_number ?? p.phone_number ?? "",
    ) ?? [];
  const normalizedPhones = rawPhones
    .map((p) => normalizePhoneE164(p))
    .filter((p): p is string => Boolean(p));

  const exact = normalizedPhones.includes(targetPhoneE164);
  const matchedOn: "phone_exact" | "phone_suffix" = exact
    ? "phone_exact"
    : normalizedPhones.some((p) => phoneMatchesSuffix(p, targetPhoneE164))
      ? "phone_suffix"
      : "phone_exact";

  return {
    externalId: record.id.record_id,
    externalType: "person",
    displayName,
    phoneNumbers: normalizedPhones,
    emails: record.values.email_addresses?.map((e) => e.email_address) ?? [],
    matchedOn,
    raw: record,
  };
}

function formatCallDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  if (mins === 0) return `${secs}s`;
  if (secs === 0) return `${mins}m`;
  return `${mins}m ${secs}s`;
}

export function buildCallLogNote(input: CrmCallLogInput): {
  title: string;
  content: string;
} {
  const startedAt = input.startedAt.toISOString();
  const durationLabel =
    input.durationSeconds != null
      ? formatCallDuration(input.durationSeconds)
      : null;
  const lines: string[] = [
    `**${input.direction === "outbound" ? "Outbound" : "Inbound"} call** — ${startedAt}`,
  ];
  lines.push("");
  // Render the call metadata as a markdown LIST (one item per line) — Attio's
  // block editor imports list items reliably, while consecutive `**Label:**`
  // paragraphs get folded together. From/To arrive already sanitized to E.164
  // by the call-log service (raw Call rows carry SIP URIs on WebRTC legs,
  // which Attio rendered as an empty value) and are null when no real number
  // exists, so the guard drops the whole line instead of an empty label.
  if (input.from) lines.push(`- **From:** ${input.from}`);
  if (input.to) lines.push(`- **To:** ${input.to}`);
  if (durationLabel !== null) lines.push(`- **Duration:** ${durationLabel}`);
  if (input.outcomeLabel) lines.push(`- **Outcome:** ${input.outcomeLabel}`);
  if (input.agentName) lines.push(`- **Agent:** ${input.agentName}`);
  if (input.notes && input.notes.trim()) {
    lines.push("");
    lines.push("**Notes**");
    lines.push(input.notes.trim());
  }
  if (input.summary && input.summary.trim()) {
    lines.push("");
    lines.push("**Summary**");
    lines.push(input.summary.trim());
  }
  if (input.insights && Object.keys(input.insights).length > 0) {
    lines.push("");
    lines.push("**Insights**");
    for (const [key, val] of Object.entries(input.insights)) {
      const label = key
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      lines.push(`- **${label}:** ${String(val)}`);
    }
  }
  if (input.meetingUrl) {
    lines.push("");
    lines.push(`[Join meeting](${input.meetingUrl})`);
  }
  if (input.recordingUrl) {
    lines.push("");
    lines.push(`[Listen to recording](${input.recordingUrl})`);
  }
  if (input.transcriptUrl) {
    lines.push(`[View transcript](${input.transcriptUrl})`);
  }
  if (input.transcript && input.transcript.trim()) {
    lines.push("");
    // Attio markdown supports headings/lists/bold/italic/strike/highlight/links
    // but NOT raw HTML — a `<details>` block makes Attio reject the whole note
    // with a 400 validation error (which is non-retryable, so the note is lost).
    // Use a level-3 heading (supported) instead of a collapsible HTML section.
    lines.push("### Transcript");
    lines.push("");
    lines.push(input.transcript.trim());
  }
  lines.push("");
  lines.push(`_Synced from Ringee · ${input.idempotencyKey}_`);

  const title = input.outcomeLabel
    ? `Ringee call — ${input.outcomeLabel}`
    : `Ringee ${input.direction} call`;

  return { title, content: lines.join("\n") };
}

export function attioIdempotencyTag(key: string): string {
  return `[ringee:${key}]`;
}

export function mapAttioPersonToSyncResult(
  record: AttioPersonRecord,
): CrmContactSyncResult {
  const nameVal = record.values.name?.[0];
  const firstName = nameVal?.first_name ?? null;
  const lastName = nameVal?.last_name ?? null;
  const assembledName = [firstName, lastName].filter(Boolean).join(" ").trim();
  const displayName =
    nameVal?.full_name ?? nameVal?.value ?? (assembledName || null);

  const rawPhones =
    record.values.phone_numbers?.map(
      (p) => p.original_phone_number ?? p.phone_number ?? "",
    ) ?? [];
  const phones = rawPhones
    .map((p) => normalizePhoneE164(p))
    .filter((p): p is string => Boolean(p));

  const emails =
    record.values.email_addresses?.map((e) => e.email_address) ?? [];

  return {
    contact: { externalId: record.id.record_id, externalType: "person" },
    phones,
    emails,
    firstName,
    lastName,
    displayName,
    jobTitle: null,
    owner: null,
    company: null,
    customFields: {},
    raw: record,
  };
}

export function mapAttioCompanyToMatch(
  record: AttioCompanyRecord,
  targetDomain: string,
): CrmCompanyMatch {
  const name = record.values.name?.[0]?.value ?? "Unnamed company";
  const domains = record.values.domains
    ?.map((d) => d.domain)
    .filter(Boolean) as string[];
  const domain = domains[0] ?? null;
  const matchedOn = domains.some(
    (d) => d?.toLowerCase() === targetDomain.toLowerCase(),
  )
    ? "domain_exact"
    : "name_exact";

  return {
    externalId: record.id.record_id,
    externalType: "company",
    name,
    domain,
    matchedOn,
    raw: record,
  };
}

export function mapAttioCompanyToSyncResult(
  record: AttioCompanyRecord,
): CrmCompanySyncResult {
  const name = record.values.name?.[0]?.value ?? "Unnamed company";
  const domains = record.values.domains
    ?.map((d) => d.domain)
    .filter(Boolean) as string[];
  const rawPhones =
    record.values.phone_numbers?.map(
      (p) => p.original_phone_number ?? p.phone_number ?? "",
    ) ?? [];
  const phone = rawPhones[0]
    ? (normalizePhoneE164(rawPhones[0]) ?? rawPhones[0])
    : null;

  return {
    company: { externalId: record.id.record_id, externalType: "company" },
    name,
    domain: domains[0] ?? null,

    industry: record.values.categories?.[0]?.option?.title ?? null,
    size: record.values.team_size?.[0]?.value ?? null,
    phone,
    website: domains[0] ? `https://${domains[0]}` : null,
    customFields: {},
    raw: record,
  };
}

export function mapAttioMemberToOwnerRef(
  member: AttioWorkspaceMember,
): CrmOwnerRef {
  const name =
    [member.first_name, member.last_name].filter(Boolean).join(" ").trim() ||
    null;
  return {
    externalId: member.id.workspace_member_id,
    email: member.email_address,
    name,
  };
}

export function buildMeetingNote(input: CrmMeetingInput): {
  title: string;
  content: string;
} {
  const startStr = input.startAt.toISOString();
  const endStr = input.endAt.toISOString();
  const lines: string[] = [`**Meeting scheduled** — ${startStr}`];
  lines.push("");
  lines.push(`**Title:** ${input.title}`);
  lines.push(`**Start:** ${startStr}`);
  lines.push(`**End:** ${endStr}`);
  if (input.timezone) lines.push(`**Timezone:** ${input.timezone}`);
  if (input.ownerName) lines.push(`**Organizer:** ${input.ownerName}`);
  if (input.attendees.length > 0) {
    lines.push("");
    lines.push("**Attendees:**");
    for (const a of input.attendees) {
      const parts = [a.name, a.email].filter(Boolean);
      lines.push(`- ${parts.join(" — ") || "Unknown"}`);
    }
  }
  if (input.description && input.description.trim()) {
    lines.push("");
    lines.push("**Description**");
    lines.push(input.description.trim());
  }

  const links: string[] = [];
  if (input.meetingUrl) links.push(`[Join meeting](${input.meetingUrl})`);
  if (input.ringeeMeetingUrl)
    links.push(`[View in Ringee](${input.ringeeMeetingUrl})`);
  if (input.sourceCallUrl) links.push(`[Source call](${input.sourceCallUrl})`);
  if (input.recordingUrl) links.push(`[Recording](${input.recordingUrl})`);
  if (links.length > 0) {
    lines.push("");
    lines.push(links.join(" · "));
  }

  if (input.calendarProvider || input.calendarEventId) {
    lines.push("");
    const calParts: string[] = [];
    if (input.calendarProvider)
      calParts.push(`Provider: ${input.calendarProvider}`);
    if (input.calendarEventId)
      calParts.push(`Event ID: ${input.calendarEventId}`);
    lines.push(`_Calendar: ${calParts.join(" · ")}_`);
  }

  lines.push("");
  lines.push(`_Synced from Ringee · ${input.idempotencyKey}_`);

  const title = `Ringee meeting — ${input.title}`;

  return { title, content: lines.join("\n") };
}
