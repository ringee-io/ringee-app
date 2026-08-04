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
  // ── Workspaces (personal ⇆ organization scope) ────────────────────
  {
    action: "workspaces.list",
    tool: "list_workspaces",
    title: "Workspaces",
    summary:
      "List the Personal + organization workspaces and which one is active.",
    sensitivity: "read",
    cli: "ringee workspaces list",
    component: "WorkspaceCard",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    action: "workspaces.switch",
    tool: "switch_workspace",
    title: "Switch workspace",
    summary:
      "Switch the active workspace (personal or an organization). No re-login.",
    sensitivity: "write",
    cli: "ringee workspaces switch <personal|orgId>",
    component: "WorkspaceCard",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },

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
    action: "contacts.byOutcome",
    tool: "find_contacts_by_outcome",
    title: "Contacts by outcome",
    summary:
      "Find who converted/engaged by call outcome (sale, interested, …) to learn the ICP.",
    sensitivity: "read",
    cli: "ringee contacts by-outcome sale interested --match last",
    component: "OutcomeContactsCard",
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
    cli: 'ringee contacts create --phone +14155552671 --name "Jane Doe"',
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
    action: "calls.list",
    tool: "list_calls",
    title: "List calls",
    summary:
      "List calls with full detail — outcome, transcription and recording URL. Filter by contact, outcome, status or date.",
    sensitivity: "read",
    cli: "ringee calls list --contact <contactId> --outcome sale",
    component: "CallListCard",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    action: "outcomes.log",
    tool: "log_call_outcome",
    title: "Log call outcome",
    summary: "Record the disposition of a past call.",
    sensitivity: "write",
    cli: 'ringee outcomes log <callId> meeting_booked --note "Demo Friday"',
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
    cli: 'ringee meetings schedule <contactId> 2026-06-03T10:00:00-04:00 --title "Intro"',
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
    cli: 'ringee sessions create --contact <contactId> --title "Tuesday outbound"',
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
    cli: 'ringee sessions update <callSessionId> --title "Renamed"',
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
    cli: 'ringee leads search --title "VP Sales" --country US',
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

  // ── Campaigns (organization workspaces only) ──────────────────────
  {
    action: "campaigns.list",
    tool: "list_campaigns",
    title: "List campaigns",
    summary:
      "List the organization's campaigns with status and lead count. Members see only theirs.",
    sensitivity: "read",
    cli: "ringee campaigns list --status active",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    action: "campaigns.get",
    tool: "get_campaign",
    title: "Get campaign",
    summary:
      "One campaign's configuration: status, dialer mode, working hours, retry limits.",
    sensitivity: "read",
    cli: "ringee campaigns get <campaignId>",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    action: "campaigns.status",
    tool: "update_campaign_status",
    title: "Change campaign status",
    summary:
      "Activate, pause or complete a campaign. Org admins only; transitions are validated.",
    sensitivity: "write",
    cli: "ringee campaigns status <campaignId> active",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    action: "campaigns.leads.list",
    tool: "list_campaign_leads",
    title: "List campaign leads",
    summary:
      "Leads queued in a campaign with dialing state — status, attempts, next call.",
    sensitivity: "read",
    cli: "ringee campaigns leads <campaignId> --status pending",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    action: "campaigns.leads.add",
    tool: "add_campaign_leads",
    title: "Add campaign leads",
    summary:
      "Add leads to a campaign (contacts reused by phone; duplicates skipped). Org admins only.",
    sensitivity: "write",
    cli: 'ringee campaigns add-lead <campaignId> --phone +14155552671 --name "Jane Doe"',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    action: "campaigns.leads.delete",
    tool: "delete_campaign_lead",
    title: "Delete campaign lead",
    summary:
      "Remove a lead from a campaign (its attempts/callbacks go too; the contact stays).",
    sensitivity: "destructive",
    requiresConfirmation: true,
    cli: "ringee campaigns delete-lead <campaignId> <leadId> --yes",
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    action: "campaigns.analytics",
    tool: "get_campaign_analytics",
    title: "Campaign analytics",
    summary:
      "Attempts, connects, conversions, rates, leads by status, dispositions, agents.",
    sensitivity: "read",
    cli: "ringee campaigns analytics <campaignId> --agents",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },

  // ── Analytics + day activity ──────────────────────────────────────
  {
    action: "analytics.calls",
    tool: "get_call_analytics",
    title: "Call analytics",
    summary:
      'The dashboard overview numbers. campaignId="none" isolates calls outside campaigns.',
    sensitivity: "read",
    cli: "ringee analytics calls --range 30d --campaign none",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    action: "analytics.day",
    tool: "get_day_activity",
    title: "Day activity",
    summary:
      "Calls, callbacks and meetings for one calendar day, in the user's UTC offset.",
    sensitivity: "read",
    cli: "ringee analytics day 2026-06-02 --offset -04:00",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    action: "callbacks.list",
    tool: "list_callbacks",
    title: "List callbacks",
    summary:
      "Scheduled callbacks soonest first, with contact and originating campaign.",
    sensitivity: "read",
    cli: "ringee callbacks list --status scheduled",
    component: "CallbackCard",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },

  // ── DNC (do-not-call suppression) ─────────────────────────────────
  {
    action: "dnc.list",
    tool: "list_dnc",
    title: "List DNC",
    summary: "Numbers suppressed for this workspace, with reason and source.",
    sensitivity: "read",
    cli: "ringee dnc list --search 415",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    action: "dnc.add",
    tool: "add_to_dnc",
    title: "Add to DNC",
    summary:
      "Suppress one or more numbers — every future dial to them is blocked.",
    sensitivity: "write",
    cli: 'ringee dnc add +14155552671 --reason "asked not to be called"',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    action: "dnc.remove",
    tool: "remove_from_dnc",
    title: "Remove from DNC",
    summary:
      "Release a number so it can be dialed again. Undoes a compliance suppression.",
    sensitivity: "destructive",
    requiresConfirmation: true,
    cli: "ringee dnc remove +14155552671 --yes",
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },

  // ── AI pipelines ──────────────────────────────────────────────────
  {
    action: "pipelines.list",
    tool: "list_ai_pipelines",
    title: "List AI pipelines",
    summary:
      "Available AI analyses with enabled contexts, pending actions and new eligible calls.",
    sensitivity: "read",
    cli: "ringee pipelines list",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    action: "pipelines.results",
    tool: "get_ai_pipeline_results",
    title: "AI pipeline results",
    summary:
      "One pipeline's analysis for one context: state, confidence, recommended actions.",
    sensitivity: "read",
    cli: "ringee pipelines results objection_intelligence --campaign <campaignId>",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
];

export const TOOL_BY_ACTION: Record<string, ToolDescriptor> =
  Object.fromEntries(TOOL_CATALOG.map((t) => [t.action, t]));

export const TOOL_BY_NAME: Record<string, ToolDescriptor> = Object.fromEntries(
  TOOL_CATALOG.map((t) => [t.tool, t]),
);

export function getTool(actionOrTool: string): ToolDescriptor | undefined {
  return TOOL_BY_ACTION[actionOrTool] ?? TOOL_BY_NAME[actionOrTool];
}

export function toolsBySensitivity(level: Sensitivity): ToolDescriptor[] {
  return TOOL_CATALOG.filter((t) => t.sensitivity === level);
}
