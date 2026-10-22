import type { Contact } from "@ringee/database";
import type { CrmPersonDetails } from "@ringee/platform";

/**
 * A Ringee contact as `ContactRepository.findById` loads it: the row plus its
 * company affiliations, primary first.
 */
export type CrmPersonSource = Pick<
  Contact,
  | "name"
  | "firstName"
  | "lastName"
  | "email"
  | "company"
  | "jobTitle"
  | "websiteUrl"
  | "linkedinUrl"
  | "locationCity"
  | "locationRegion"
  | "locationPostalCode"
  | "locationCountry"
> & {
  affiliations?: Array<{ company?: { name?: string | null } | null }>;
};

/**
 * Everything Ringee knows about a contact that a CRM has a standard place
 * for, for creating them there. `phoneE164` is the number the call or meeting
 * is about, which is not always the contact's primary one. Without a Ringee
 * contact (an unknown caller) only the number is known.
 */
export function crmPersonDetails(
  contact: CrmPersonSource | null | undefined,
  phoneE164: string,
): CrmPersonDetails {
  if (!contact) return { phoneE164 };
  return {
    phoneE164,
    displayName: contact.name ?? null,
    firstName: contact.firstName ?? null,
    lastName: contact.lastName ?? null,
    email: contact.email ?? null,
    company:
      contact.company?.trim() ||
      contact.affiliations?.[0]?.company?.name?.trim() ||
      null,
    jobTitle: contact.jobTitle ?? null,
    website: contact.websiteUrl ?? null,
    linkedinUrl: contact.linkedinUrl ?? null,
    city: contact.locationCity ?? null,
    region: contact.locationRegion ?? null,
    postalCode: contact.locationPostalCode ?? null,
    country: contact.locationCountry ?? null,
  };
}
