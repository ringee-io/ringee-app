import { ContactListEntryToCall } from "@ringee/database";
import { normalizePhoneE164 } from "@ringee/platform";
import { parsePhoneNumberFromString } from "libphonenumber-js/max";
import { MyDayContact } from "./my-day-queue";

/** The next contact of a list, as "Call next" offers it. */
export interface MyDayListEntry {
  /** The list entry: what a skip names. */
  entryId: string;
  /** Skipped before: back now that everyone after it has been called. */
  skipped: boolean;
  contact: MyDayContact;
}

export interface MyDayListCandidates {
  /** Entries still to call, in the order the list offers them. */
  entries: ContactListEntryToCall[];
  /** The workspace's latest outbound call to each number since the oldest entry joined. */
  outbound: { toNumber: string; at: Date }[];
  /** Numbers on the workspace's Do Not Call list. */
  doNotCall: Set<string>;
  /** Contacts with a callback still open: their next call is already agreed. */
  openCallbacks: Set<string>;
}

export interface MyDayListPick {
  next: MyDayListEntry | null;
  /**
   * Entries whose contact has been called since joining the list — from any
   * surface, by anyone in the workspace — and when. The list records them so
   * the next lookup starts past them.
   */
  called: { id: string; at: Date }[];
}

function displayName(contact: ContactListEntryToCall["contact"]) {
  const composed = [contact.firstName, contact.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  return contact.name?.trim() || composed || null;
}

/**
 * The first entry that can be called now (LIST-005): one whose contact nobody
 * has called since it joined the list, whose number is callable and not on
 * the Do Not Call list, and who has no callback booked. An entry set aside for
 * the last two reasons stays to call — the number may come off the list, the
 * callback may be cancelled — and is looked at again next time.
 */
export function pickListNext(candidates: MyDayListCandidates): MyDayListPick {
  const lastCall = new Map<string, number>();
  for (const call of candidates.outbound) {
    const phone = normalizePhoneE164(call.toNumber);
    if (!phone) continue;
    lastCall.set(phone, Math.max(lastCall.get(phone) ?? 0, call.at.getTime()));
  }

  let next: MyDayListEntry | null = null;
  const called: { id: string; at: Date }[] = [];
  for (const entry of candidates.entries) {
    const phone = normalizePhoneE164(entry.contact.phoneNumber);
    if (!phone) continue;
    const calledAt = lastCall.get(phone);
    if (calledAt !== undefined && calledAt >= entry.createdAt.getTime()) {
      called.push({ id: entry.id, at: new Date(calledAt) });
      continue;
    }
    if (next) continue;
    if (candidates.doNotCall.has(phone)) continue;
    if (candidates.openCallbacks.has(entry.contact.id)) continue;
    next = {
      entryId: entry.id,
      skipped: entry.skippedAt !== null,
      contact: {
        id: entry.contact.id,
        name: displayName(entry.contact),
        company: entry.contact.company,
        phoneNumber: phone,
        timezone: entry.contact.timezone,
        country: parsePhoneNumberFromString(phone)?.country ?? null,
      },
    };
  }
  return { next, called };
}

/** Every callable number among the entries, for the outbound and DNC lookups. */
export function listEntryPhones(entries: ContactListEntryToCall[]): string[] {
  const phones = new Set<string>();
  for (const entry of entries) {
    const phone = normalizePhoneE164(entry.contact.phoneNumber);
    if (phone) phones.add(phone);
  }
  return [...phones];
}
