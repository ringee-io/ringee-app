import type {
  CallOutcome,
  ContactBrief,
  RecentContactCall,
} from "@ringee/database";

/** How many past calls the Call page lists above the next one. */
export const BRIEF_CALL_LIMIT = 4;

/** One past call with the contact, as the Call page lists it. */
export interface MyDayBriefCall {
  id: string;
  at: Date;
  direction: "inbound" | "outbound" | null;
  status: string;
  outcome: CallOutcome | null;
  durationSeconds: number | null;
  note: string | null;
}

/** Who a contact is before the call (`GET /my-day/contacts/:id`). */
export interface MyDayContactBrief {
  contactId: string;
  jobTitle: string | null;
  email: string | null;
  /** City and region as far as they are known: "Chicago, IL". */
  place: string | null;
  /** The person's LinkedIn profile, only ever an http(s) URL. */
  linkedinUrl: string | null;
  company: {
    name: string | null;
    /** The company's revenue band ("$10M-$50M"), as Apollo/Prospeo give it. */
    revenue: string | null;
    employees: string | null;
    industry: string | null;
    website: string | null;
    linkedinUrl: string | null;
  } | null;
  calls: { total: number; recent: MyDayBriefCall[] };
}

/**
 * A link the browser may open: http(s) only, a bare host given `https://`.
 * Contact links come from imports, CRMs and people typing; a `javascript:` or
 * any other scheme is dropped rather than rendered into an `href`.
 */
export function webUrl(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(raw)
    ? raw
    : `https://${raw.replace(/^\/+/, "")}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function text(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function buildContactBrief(
  contact: ContactBrief,
  history: { total: number; calls: RecentContactCall[] },
): MyDayContactBrief {
  const company = contact.affiliations[0]?.company ?? null;
  const companyName = text(company?.name) ?? text(contact.company);
  const employees =
    text(company?.employeeCountRange) ??
    text(contact.companySize) ??
    (company?.employeeCount != null ? String(company.employeeCount) : null);
  const companyBrief = {
    name: companyName,
    revenue: text(company?.revenueRange) ?? text(contact.revenue),
    employees,
    industry: text(company?.industry),
    // Lead imports store the company's site on the person when the provider
    // gives no personal one, so it stands in when no company is linked.
    website:
      webUrl(company?.website) ??
      webUrl(company?.domain) ??
      webUrl(contact.websiteUrl),
    linkedinUrl: webUrl(company?.linkedinUrl),
  };
  const hasCompany = Object.values(companyBrief).some(
    (value) => value !== null,
  );

  return {
    contactId: contact.id,
    jobTitle: text(contact.jobTitle),
    email: text(contact.email),
    place:
      [text(contact.locationCity), text(contact.locationRegion)]
        .filter(Boolean)
        .join(", ") ||
      text(contact.locationCountry) ||
      null,
    linkedinUrl: webUrl(contact.linkedinUrl),
    company: hasCompany ? companyBrief : null,
    calls: {
      total: history.total,
      recent: history.calls.map((call) => ({
        id: call.id,
        at: call.createdAt,
        direction:
          call.direction === "inbound" || call.direction === "outbound"
            ? call.direction
            : null,
        status: call.status,
        outcome: call.outcome,
        durationSeconds: call.durationSeconds,
        note: text(call.outcomeNote),
      })),
    },
  };
}
