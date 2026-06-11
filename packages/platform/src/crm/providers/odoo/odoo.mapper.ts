import type {
  CrmCompanyMatch,
  CrmCompanySyncResult,
  CrmContactSyncResult,
  CrmOwnerRef,
  CrmRecordMatch,
} from "../../types";
import { normalizePhoneE164, phoneMatchesSuffix } from "../../phone";
import type { OdooPartnerRecord, OdooUserRecord } from "./odoo.types";

function normalizeOdooString(
  value: string | false | null | undefined,
): string | null {
  if (value === null || value === undefined || value === false) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

function gatherPartnerPhones(record: OdooPartnerRecord): string[] {
  const raw = [
    normalizeOdooString(record.phone),
    normalizeOdooString(record.mobile),
  ].filter((v): v is string => Boolean(v));
  return raw
    .map((p) => normalizePhoneE164(p))
    .filter((p): p is string => Boolean(p));
}

export function mapOdooPartnerToMatch(
  record: OdooPartnerRecord,
  targetPhoneE164: string,
): CrmRecordMatch {
  const phones = gatherPartnerPhones(record);
  const displayName =
    normalizeOdooString(record.display_name) ??
    normalizeOdooString(record.name) ??
    "Unnamed contact";

  const exact = phones.includes(targetPhoneE164);
  const matchedOn: "phone_exact" | "phone_suffix" = exact
    ? "phone_exact"
    : phones.some((p) => phoneMatchesSuffix(p, targetPhoneE164))
      ? "phone_suffix"
      : "phone_exact";

  const email = normalizeOdooString(record.email);

  return {
    externalId: String(record.id),
    externalType: record.is_company ? "company" : "person",
    displayName,
    phoneNumbers: phones,
    emails: email ? [email] : [],
    matchedOn,
    raw: record,
  };
}

export function mapOdooPartnerToSyncResult(
  record: OdooPartnerRecord,
): CrmContactSyncResult {
  const displayName =
    normalizeOdooString(record.display_name) ??
    normalizeOdooString(record.name);
  const [firstName, lastName] = splitName(displayName);

  const phones = gatherPartnerPhones(record);
  const email = normalizeOdooString(record.email);
  const owner = mapOwnerFromTuple(record.user_id);
  const companyRef =
    record.parent_id && Array.isArray(record.parent_id)
      ? {
          externalId: String(record.parent_id[0]),
          externalType: "company" as const,
        }
      : null;

  return {
    contact: { externalId: String(record.id), externalType: "person" },
    phones,
    emails: email ? [email] : [],
    firstName,
    lastName,
    displayName,
    jobTitle: normalizeOdooString(record.function),
    owner,
    company: companyRef,
    customFields: {},
    raw: record,
  };
}

export function mapOdooCompanyToMatch(
  record: OdooPartnerRecord,
  targetDomain: string,
): CrmCompanyMatch {
  const name =
    normalizeOdooString(record.display_name) ??
    normalizeOdooString(record.name) ??
    "Unnamed company";
  const website = normalizeOdooString(record.website);
  const domain = extractDomain(website);
  const matchedOn =
    domain && domain.toLowerCase() === targetDomain.toLowerCase()
      ? "domain_exact"
      : "name_exact";

  return {
    externalId: String(record.id),
    externalType: "company",
    name,
    domain,
    matchedOn,
    raw: record,
  };
}

export function mapOdooCompanyToSyncResult(
  record: OdooPartnerRecord,
): CrmCompanySyncResult {
  const name =
    normalizeOdooString(record.display_name) ??
    normalizeOdooString(record.name) ??
    "Unnamed company";
  const phoneRaw =
    normalizeOdooString(record.phone) ?? normalizeOdooString(record.mobile);
  const phone = phoneRaw ? (normalizePhoneE164(phoneRaw) ?? phoneRaw) : null;
  const website = normalizeOdooString(record.website);
  const domain = extractDomain(website);
  const industry =
    record.industry_id && Array.isArray(record.industry_id)
      ? record.industry_id[1]
      : null;

  return {
    company: { externalId: String(record.id), externalType: "company" },
    name,
    domain,
    industry,
    size: null,
    phone,
    website,
    customFields: {},
    raw: record,
  };
}

export function mapOdooUserToOwnerRef(user: OdooUserRecord): CrmOwnerRef {
  return {
    externalId: String(user.id),
    email: normalizeOdooString(user.email) ?? user.login ?? null,
    name: user.name ?? null,
  };
}

function mapOwnerFromTuple(
  tuple: [number, string] | false | null | undefined,
): CrmOwnerRef | null {
  if (!tuple || !Array.isArray(tuple)) return null;
  return {
    externalId: String(tuple[0]),
    email: null,
    name: tuple[1] ?? null,
  };
}

function splitName(full: string | null): [string | null, string | null] {
  if (!full) return [null, null];
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return [parts[0], null];
  return [parts[0], parts.slice(1).join(" ")];
}

function extractDomain(website: string | null): string | null {
  if (!website) return null;
  try {
    const url = website.includes("://")
      ? new URL(website)
      : new URL(`https://${website}`);
    return url.hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

export function odooIdempotencyTag(key: string): string {
  return `[ringee:${key}]`;
}
