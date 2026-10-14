import type { Contact } from "@ringee/database";

/**
 * What an agent calls a lead, from the contact's own fields: the first name
 * when there is one, else the first word of the stored name. Empty when the
 * contact has no name at all — the caller decides what that means.
 */
export function personName(
  contact: Pick<Contact, "firstName" | "lastName" | "name" | "fullName">,
): { first: string; last: string } {
  const first = contact.firstName?.trim();
  if (first) return { first, last: contact.lastName?.trim() ?? "" };
  const whole = (contact.name ?? contact.fullName ?? "").trim();
  if (!whole) return { first: "", last: "" };
  const [head, ...rest] = whole.split(/\s+/);
  return { first: head ?? "", last: rest.join(" ") };
}
