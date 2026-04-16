import type { CrmCallLogInput, CrmRecordMatch } from "../../types";
import { normalizePhoneE164, phoneMatchesSuffix } from "../../phone";
import type { AttioPersonRecord } from "./attio.types";

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
  if (input.recordingUrl) {
    lines.push("");
    lines.push(`[Listen to recording](${input.recordingUrl})`);
  }
  if (input.transcriptUrl) {
    lines.push(`[View transcript](${input.transcriptUrl})`);
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
