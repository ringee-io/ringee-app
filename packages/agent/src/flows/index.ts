/**
 * Operational flows — the real outbound-sales journeys the agent supports.
 *
 * Flows are *declarative*: ordered steps, each mapping to a catalog action.
 * They are shared by the CLI (`ringee flow`), the Claude Skills and the
 * ChatGPT App so the "what's the next best step" guidance stays identical
 * everywhere. They contain no business logic.
 */
export interface FlowStep {
  id: string;
  title: string;
  /** Catalog action id (see ../tools/catalog). Empty for non-tool steps. */
  action?: string;
  description: string;
  /** What must already be known before this step can run. */
  requires?: string[];
  /** What this step produces for later steps. */
  produces?: string[];
}

export interface Flow {
  id: string;
  title: string;
  description: string;
  steps: FlowStep[];
}

/** The primary outbound flow, end to end. */
export const PRIMARY_FLOW: Flow = {
  id: "outbound",
  title: "Outbound sales flow",
  description:
    "Prospect → Reveal/Import Lead → Create/Update Contact → Create Call Session → Call → Outcome → Callback/Meeting → CRM Sync (future).",
  steps: [
    {
      id: "prospect",
      title: "Prospect",
      action: "leads.search",
      description:
        "Find candidate leads via Apollo/Prospeo. Returns a jobId + candidate externalIds. These are NOT contacts yet.",
      produces: ["jobId", "externalId[]"],
    },
    {
      id: "reveal-import",
      title: "Reveal / Import lead",
      action: "leads.reveal",
      description:
        "Reveal a chosen candidate (unlocks email/phone, spends credits) or import several as contacts. Confirm credit spend first.",
      requires: ["jobId", "externalId"],
      produces: ["contactId"],
    },
    {
      id: "contact",
      title: "Create / Update contact",
      action: "contacts.create",
      description:
        "Ensure the prospect exists as a Ringee contact with a valid E.164 phone. Update fields if it already exists.",
      produces: ["contactId"],
    },
    {
      id: "session",
      title: "Create call session",
      action: "sessions.create",
      description:
        "Queue the contact(s) into a magic-link dialing session. Sensitive: it mints shareable access — confirm first and share the joinUrl exactly.",
      requires: ["contactId"],
      produces: ["callSessionId", "joinUrl", "callId (after dialing)"],
    },
    {
      id: "call",
      title: "Call",
      description:
        "The user (or a collaborator) dials through the session in the Ringee dialer. The agent does not place calls server-side.",
      requires: ["callSessionId"],
      produces: ["callId"],
    },
    {
      id: "outcome",
      title: "Log outcome",
      action: "outcomes.log",
      description:
        "Record how the call went (meeting_booked, interested, voicemail, …) against the callId.",
      requires: ["callId"],
    },
    {
      id: "followup",
      title: "Callback / Meeting",
      action: "callbacks.create",
      description:
        "Schedule the next touch: a callback reminder or a calendar meeting with the contact.",
      requires: ["contactId"],
    },
    {
      id: "crm-sync",
      title: "CRM sync (future)",
      description:
        "Planned: push the contact + outcomes to the connected CRM (e.g. Attio). Not yet available through the agent.",
    },
  ],
};

export const FLOWS: Flow[] = [PRIMARY_FLOW];

export function getFlow(id: string): Flow | undefined {
  return FLOWS.find((f) => f.id === id);
}

/** Render a flow as a readable numbered list (for skills/help). */
export function renderFlow(flow: Flow = PRIMARY_FLOW): string {
  const header = `${flow.title}\n${flow.description}\n`;
  const steps = flow.steps
    .map((s, i) => {
      const tool = s.action ? ` [${s.action}]` : "";
      return `${i + 1}. ${s.title}${tool} — ${s.description}`;
    })
    .join("\n");
  return `${header}\n${steps}`;
}
