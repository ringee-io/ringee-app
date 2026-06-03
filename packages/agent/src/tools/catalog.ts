import type { Sensitivity } from "../types/index.js";

/**
 * MCP tool annotations (trust hints) surfaced to clients like ChatGPT and
 * Claude. Mirrors the MCP spec `ToolAnnotations`. OpenAI's Apps SDK requires
 * `readOnlyHint`, `openWorldHint` and `destructiveHint` to be explicit.
 */
export interface ToolAnnotations {
  /** True when the tool only reads and never modifies state. */
  readOnlyHint: boolean;
  /** True when the tool may perform irreversible/destructive updates. */
  destructiveHint: boolean;
  /** True when repeating the call with the same args has no extra effect. */
  idempotentHint: boolean;
  /** True when the tool reaches an external ("open world") system. */
  openWorldHint: boolean;
}

/**
 * Canonical catalog of everything the agent layer can do. Each entry maps a
 * human-friendly *action* to the real MCP tool it calls on the Ringee backend.
 *
 * This is the single source of truth shared by the CLI, the Claude Skills, the
 * slash commands and the ChatGPT App so confirmation rules, naming and the
 * component to render stay consistent everywhere.
 */
export interface ToolDescriptor {
  /** Canonical, dotted action id used across interfaces. */
  action: string;
  /** Real MCP tool name on the Ringee backend (the source of truth). */
  tool: string;
  /** Short human title. */
  title: string;
  /** One-line summary. */
  summary: string;
  sensitivity: Sensitivity;
  /** True when the action spends enrichment-provider credits. */
  consumesCredits?: boolean;
  /** True when the human must confirm before the agent may run it. */
  requiresConfirmation?: boolean;
  /** Example invocation of the `ringee` CLI. */
  cli: string;
  /** ChatGPT App component used to render the result, when applicable. */
  component?: string;
  /** MCP trust hints exposed to ChatGPT/Claude on the registered tool. */
  annotations: ToolAnnotations;
}

export const TOOL_CATALOG: ToolDescriptor[] = [
  // ── Contacts ──────────────────────────────────────────────────────
  {
    action: "contacts.search",
    tool: "search_contacts",
    title: "Search contacts",
    summary:
      'Find existing contacts by name, phone, email or company. Use "*" to list all.',
    sensitivity: "read",
    cli: "ringee contacts search <query>",
    component: "ContactListCard",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    action: "contacts.get",
    tool: "get_contact",
    title: "Get contact",
    summary: "Full record for one contact, including recent activity.",
    sensitivity: "read",
    cli: "ringee contacts get <contactId>",
    component: "ContactCard",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    action: "contacts.create",
    tool: "create_contact",
    title: "Create contact",
    summary: "Add a new contact (phone must be unique, E.164).",
    sensitivity: "write",
    cli: "ringee contacts create --phone +14155552671 --name \"Jane Doe\"",
    component: "ContactCard",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    action: "contacts.update",
    tool: "update_contact",
    title: "Update contact",
    summary: "Patch fields on an existing contact you own.",
    sensitivity: "write",
    cli: "ringee contacts update <contactId> --email jane@acme.com",
    component: "ContactCard",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    action: "contacts.delete",
    tool: "delete_contact",
    title: "Delete contact",
    summary: "Soft-delete a contact. Double-confirmation required.",
    sensitivity: "destructive",
    requiresConfirmation: true,
    cli: "ringee contacts delete <contactId> --confirm-phone +14155552671 --yes",
    component: "ContactCard",
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },

  // ── Call activity ─────────────────────────────────────────────────
  {
    action: "outcomes.log",
    tool: "log_call_outcome",
    title: "Log call outcome",
    summary: "Record the disposition of a past call.",
    sensitivity: "write",
    cli: "ringee outcomes log <callId> meeting_booked --note \"Demo Friday\"",
    component: "CallOutcomeCard",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    action: "callbacks.create",
    tool: "create_callback",
    title: "Create callback",
    summary: "Schedule a reminder to call a contact back.",
    sensitivity: "write",
    cli: "ringee callbacks create <contactId> 2026-06-02T15:00:00-04:00",
    component: "CallbackCard",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    action: "meetings.schedule",
    tool: "schedule_meeting",
    title: "Schedule meeting",
    summary: "Book a meeting; syncs to a connected calendar when available.",
    sensitivity: "write",
    cli: "ringee meetings schedule <contactId> 2026-06-03T10:00:00-04:00 --title \"Intro\"",
    component: "MeetingCard",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      // May sync to an external calendar (Google/Microsoft) and email invites.
      openWorldHint: true,
    },
  },

  // ── Call sessions (magic-link dialing) ────────────────────────────
  {
    action: "sessions.create",
    tool: "create_call_session",
    title: "Create call session",
    summary: "Mint a magic-link dialing queue. Generates shareable access.",
    sensitivity: "sensitive",
    requiresConfirmation: true,
    cli: "ringee sessions create --contact <contactId> --title \"Tuesday outbound\"",
    component: "CallSessionCard",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    action: "sessions.get",
    tool: "get_call_session",
    title: "Get call session",
    summary: "Status, counts and expiry. Never exposes the raw token.",
    sensitivity: "read",
    cli: "ringee sessions get <callSessionId>",
    component: "CallSessionCard",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    action: "sessions.update",
    tool: "update_call_session",
    title: "Update call session",
    summary: "Change title/campaign/expiry, or replace the queue pre-call.",
    sensitivity: "sensitive",
    requiresConfirmation: true,
    cli: "ringee sessions update <callSessionId> --title \"Renamed\"",
    component: "CallSessionCard",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    action: "sessions.revoke",
    tool: "delete_call_session",
    title: "Revoke call session",
    summary: "Revoke the magic link immediately. History is preserved.",
    sensitivity: "destructive",
    requiresConfirmation: true,
    cli: "ringee sessions revoke <callSessionId> --yes",
    component: "CallSessionCard",
    annotations: {
      readOnlyHint: false,
      // Irreversible: invalidates the magic-link token immediately.
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },

  // ── Lead prospecting (Apollo / Prospeo) ───────────────────────────
  {
    action: "leads.search",
    tool: "search_leads",
    title: "Search leads",
    summary: "Prospect candidates via Apollo/Prospeo. Returns a jobId.",
    sensitivity: "read",
    cli: "ringee leads search --title \"VP Sales\" --country US",
    component: "LeadSearchResults",
    annotations: {
      // No contacts created and no credits spent — only a cached search job.
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      // Queries a third-party enrichment provider (Apollo/Prospeo).
      openWorldHint: true,
    },
  },
  {
    action: "leads.reveal",
    tool: "reveal_lead",
    title: "Reveal lead",
    summary: "Unlock email/phone for one candidate. Spends credits.",
    sensitivity: "sensitive",
    consumesCredits: true,
    requiresConfirmation: true,
    cli: "ringee leads reveal <jobId> <externalId> --phone --yes",
    component: "LeadSearchResults",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      // Spends credits each time — not safe to repeat blindly.
      idempotentHint: false,
      // Unlocks data via a third-party enrichment provider (Apollo/Prospeo).
      openWorldHint: true,
    },
  },
  {
    action: "leads.import",
    tool: "import_leads_as_contacts",
    title: "Import leads",
    summary: "Bulk-import candidates as contacts (phone dedup).",
    sensitivity: "write",
    requiresConfirmation: true,
    cli: "ringee leads import <jobId> <externalId...>",
    component: "LeadSearchResults",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      // Imports from the cached search snapshot; phone-number dedup makes
      // re-imports a no-op and there is no live provider call here.
      idempotentHint: true,
      openWorldHint: false,
    },
  },
];

export const TOOL_BY_ACTION: Record<string, ToolDescriptor> = Object.fromEntries(
  TOOL_CATALOG.map((t) => [t.action, t]),
);

export const TOOL_BY_NAME: Record<string, ToolDescriptor> = Object.fromEntries(
  TOOL_CATALOG.map((t) => [t.tool, t]),
);

export function getTool(actionOrTool: string): ToolDescriptor | undefined {
  return TOOL_BY_ACTION[actionOrTool] ?? TOOL_BY_NAME[actionOrTool];
}

export function toolsBySensitivity(level: Sensitivity): ToolDescriptor[] {
  return TOOL_CATALOG.filter((t) => t.sensitivity === level);
}
