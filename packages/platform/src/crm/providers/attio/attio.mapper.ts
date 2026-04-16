import type {
  CrmCallLogInput,
  CrmCompanyMatch,
  CrmCompanySyncResult,
  CrmContactSyncResult,
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

export function buildCallLogNote(input: CrmCallLogInput): {
  title: string;
  content: string;
} {
  const startedAt = input.startedAt.toISOString();
  const durationMin = input.durationSeconds
    ? Math.max(1, Math.round(input.durationSeconds / 60))
    : null;
  const lines: string[] = [
    `**${input.direction === "outbound" ? "Outbound" : "Inbound"} call** — ${startedAt}`,
  ];
  lines.push("");
  lines.push(`**From:** ${input.from}`);
  lines.push(`**To:** ${input.to}`);
  if (durationMin !== null) lines.push(`**Duration:** ${durationMin} min`);
  if (input.outcomeLabel) lines.push(`**Outcome:** ${input.outcomeLabel}`);
  if (input.agentName) lines.push(`**Agent:** ${input.agentName}`);
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
      const label = key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      lines.push(`- **${label}:** ${String(val)}`);
    }
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
    lines.push("<details><summary>Transcript</summary>");
    lines.push("");
    lines.push(input.transcript.trim());
    lines.push("");
    lines.push("</details>");
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

export function mapAttioPersonToSyncResult(record: AttioPersonRecord): CrmContactSyncResult {
  const nameVal = record.values.name?.[0];
  const firstName = nameVal?.first_name ?? null;
  const lastName = nameVal?.last_name ?? null;
  const assembledName = [firstName, lastName].filter(Boolean).join(" ").trim();
  const displayName = nameVal?.full_name ?? nameVal?.value ?? (assembledName || null);

  const rawPhones =
    record.values.phone_numbers?.map(
      (p) => p.original_phone_number ?? p.phone_number ?? "",
    ) ?? [];
  const phones = rawPhones
    .map((p) => normalizePhoneE164(p))
    .filter((p): p is string => Boolean(p));

  const emails = record.values.email_addresses?.map((e) => e.email_address) ?? [];

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
  const domains = record.values.domains?.map((d) => d.domain).filter(Boolean) as string[];
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

export function mapAttioCompanyToSyncResult(record: AttioCompanyRecord): CrmCompanySyncResult {
  const name = record.values.name?.[0]?.value ?? "Unnamed company";
  const domains = record.values.domains?.map((d) => d.domain).filter(Boolean) as string[];
  const rawPhones =
    record.values.phone_numbers?.map(
      (p) => p.original_phone_number ?? p.phone_number ?? "",
    ) ?? [];
  const phone = rawPhones[0] ? (normalizePhoneE164(rawPhones[0]) ?? rawPhones[0]) : null;

  return {
    company: { externalId: record.id.record_id, externalType: "company" },
    name,
    domain: domains[0] ?? null,
    industry: record.values.categories?.[0]?.option ?? null,
    size: record.values.team_size?.[0]?.value ?? null,
    phone,
    website: domains[0] ? `https://${domains[0]}` : null,
    customFields: {},
    raw: record,
  };
}

export function mapAttioMemberToOwnerRef(member: AttioWorkspaceMember): CrmOwnerRef {
  const name = [member.first_name, member.last_name].filter(Boolean).join(" ").trim() || null;
  return {
    externalId: member.id.workspace_member_id,
    email: member.email_address,
    name,
  };
}
