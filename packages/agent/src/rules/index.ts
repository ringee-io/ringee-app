import type { Sensitivity } from "../types/index.js";

/**
 * Operating rules for any agent driving Ringee (Claude, Claude Code/OpenClaw,
 * the ChatGPT App, the CLI's interactive flows). These are *behavioral*
 * guardrails — the hard guarantees still live in the backend (e.g. the
 * double-confirmation on delete_contact). The agent must respect them so it
 * never surprises the user with a credit spend, a destructive write, or a
 * shared magic link they did not ask for.
 */
export interface OperatingRule {
  id: string;
  /** The rule, written as an instruction to the agent. */
  rule: string;
  /** Which sensitivity tiers it governs. */
  appliesTo: Sensitivity[];
}

export const OPERATING_RULES: OperatingRule[] = [
  {
    id: "no-unrequested-calls",
    rule: "Never start a call (or push a dial to the user's device) unless the user clearly asked for it in this turn.",
    appliesTo: ["sensitive", "write"],
  },
  {
    id: "delete-contact-double-confirm",
    rule: "Never delete a contact without strict double confirmation: read the contact's stored phone number back to the user, get an explicit 'yes, delete', then pass confirm=true AND confirmPhoneNumber matching that number. Never auto-confirm.",
    appliesTo: ["destructive"],
  },
  {
    id: "revoke-session-confirm",
    rule: "Never revoke a call session without clear confirmation. Explain that the magic link stops working immediately (history is preserved).",
    appliesTo: ["destructive"],
  },
  {
    id: "reveal-costs-credits",
    rule: "Never reveal a lead (or run mass reveal) without explicit confirmation, because it consumes enrichment-provider credits. Say so before doing it.",
    appliesTo: ["sensitive"],
  },
  {
    id: "explain-before-write",
    rule: "Before any sensitive or destructive action, state plainly what you are about to do and what it affects, then wait for the user's go-ahead.",
    appliesTo: ["sensitive", "destructive"],
  },
  {
    id: "sessions-are-operational",
    rule: "Treat call sessions as important operational actions, especially when they generate magic links or access for collaborators. Surface the joinUrl exactly as returned and never re-share an expired/revoked one.",
    appliesTo: ["sensitive"],
  },
  {
    id: "leads-are-not-contacts",
    rule: "Leads found by external search are candidates, not contacts. Do not treat them as Ringee contacts until they are revealed or imported.",
    appliesTo: ["read", "write", "sensitive"],
  },
  {
    id: "resolve-contact-first",
    rule: "If an action needs a contactId, resolve the contact first with search_contacts/get_contact. Never act on a contactId the user did not approve.",
    appliesTo: ["read", "write", "destructive"],
  },
  {
    id: "leads-need-valid-job",
    rule: "Lead reveal/import actions require a valid jobId and externalId from a prior search_leads result. Never invent ids.",
    appliesTo: ["sensitive", "write"],
  },
  {
    id: "ask-only-whats-missing",
    rule: "If required information is missing, ask only for what is strictly necessary to proceed — nothing more.",
    appliesTo: ["read", "write", "sensitive", "destructive"],
  },
  {
    id: "formats",
    rule: "Phone numbers must be E.164 (+14155552671). Dates/times must be ISO-8601 with a timezone offset (2026-05-23T14:30:00-04:00) and are treated as absolute.",
    appliesTo: ["write", "sensitive"],
  },
  {
    id: "campaigns-need-org",
    rule: "Campaign tools only work in an organization workspace, and every campaign write (add/remove leads, change status) is organization-admin only. Resolve the campaignId with list_campaigns first — never invent one.",
    appliesTo: ["read", "write", "destructive"],
  },
  {
    id: "delete-campaign-lead-confirm",
    rule: "Removing a lead from a campaign also deletes its call attempts and campaign callbacks (the contact and its call history survive). Read the lead's contact name and phone back to the user and get an explicit yes before passing confirm=true.",
    appliesTo: ["destructive"],
  },
  {
    id: "dnc-removal-is-destructive",
    rule: "Adding numbers to the DNC list is routine — do it as soon as someone asks not to be contacted. Removing a number is the opposite: it makes the number callable again, so only do it for the specific number the user explicitly named, with confirm=true.",
    appliesTo: ["write", "destructive"],
  },
  {
    id: "analytics-rates-are-percentages",
    rule: "Analytics rates (answerRate, conversionRate, meetingRate, positiveOutcomeRate, contactRate) are already percentages 0-100. Report them as-is; never multiply by 100 again.",
    appliesTo: ["read"],
  },
  {
    id: "no-campaign-sentinel",
    rule: 'Where a campaign filter is accepted, the literal "none" means calls made outside any campaign (manual dialer, extension, call sessions, SDK). Use it when the user asks about non-campaign calling, and say which slice the numbers cover.',
    appliesTo: ["read"],
  },
  {
    id: "day-activity-needs-offset",
    rule: "When reporting on a specific day, pass the user's utcOffset (e.g. -04:00) so the day boundaries are theirs. Without it the day is computed in UTC — say so if you had to fall back.",
    appliesTo: ["read"],
  },
];

/** Render the rules as a numbered markdown list for prompts/skills. */
export function renderRules(rules: OperatingRule[] = OPERATING_RULES): string {
  return rules.map((r, i) => `${i + 1}. ${r.rule}`).join("\n");
}
