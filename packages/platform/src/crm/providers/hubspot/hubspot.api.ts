/**
 * HubSpot versions its APIs by release date (`/YYYY-MM/`, shipped every March
 * and September, each supported for 18 months). Every request this adapter
 * makes — CRM objects, owners, lists, files and the OAuth token endpoints —
 * is pinned to this one version.
 *
 * Bumping it is a code change reviewed against HubSpot's changelog, never an
 * environment setting: a version decides request and response shapes, and
 * from `2026-09` it also means the portal's admin-configured property
 * validation rules apply to API writes. The legacy OAuth `v1` endpoints stop
 * refreshing tokens on 2027-02-16.
 */
export const HUBSPOT_API_VERSION = "2026-09";

/** Object type ids HubSpot uses where a path or filter wants an id. */
export const HUBSPOT_CONTACT_OBJECT_TYPE_ID = "0-1";

export type HubSpotActivityObject = "calls" | "notes" | "tasks" | "meetings";

/**
 * `HUBSPOT_DEFINED` association type ids from an activity to the record it is
 * logged on (Associations v4 defaults). The call-to-company id is 182 — the
 * 220 that appears next to 194 in HubSpot's call examples is call-to-ticket.
 */
export const HUBSPOT_ACTIVITY_ASSOCIATION_TYPE: Record<
  HubSpotActivityObject,
  { person: number; company: number }
> = {
  calls: { person: 194, company: 182 },
  notes: { person: 202, company: 190 },
  tasks: { person: 204, company: 192 },
  meetings: { person: 200, company: 188 },
};

/**
 * HubSpot's built-in call outcomes (`hs_call_disposition`). Portals may add
 * their own, and an admin can delete these, so a create that names one must
 * survive the portal rejecting it.
 */
export const HUBSPOT_CALL_DISPOSITION = {
  busy: "9d9162e7-6cf3-4944-bf63-4dff82258764",
  connected: "f240bbac-87c9-4f6e-bf70-924b57d47db7",
  leftLiveMessage: "a4c4c377-d246-4b32-a13b-75a56a4cd0ff",
  leftVoicemail: "b2cf5968-551e-4856-9783-52b3da59a7d0",
  noAnswer: "73a0d17f-1163-4015-bdd5-ec830791da20",
  wrongNumber: "17b47fee-58de-441e-a44c-c6300d46f273",
} as const;

/**
 * `hs_call_body`, `hs_note_body` and the other rich-text activity bodies are
 * capped at 65,536 characters; a longer value is a non-retryable 400 that
 * loses the whole activity. Kept a little under the cap.
 */
export const HUBSPOT_BODY_LIMIT = 65_000;

/** File Manager folder the call recordings are uploaded into. */
export const HUBSPOT_RECORDINGS_FOLDER = "/ringee/recordings";

/** Scopes that gate optional capabilities, as HubSpot names them. */
export const HUBSPOT_LISTS_SCOPE = "crm.lists.read";
export const HUBSPOT_FILES_WRITE_SCOPES = ["files.write", "files"];
