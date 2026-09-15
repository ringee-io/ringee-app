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
    "Prospect → Reveal/Import Lead → Create/Update Contact → Choose a human or AI operator → Call → Result → Callback/Meeting → CRM Sync (future).",
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
      id: "operator",
      title: "Choose a human or AI operator",
      description:
        "Use the mode the user requests. For a human call, create a magic-link session and let the teammate dial. For an AI call, resolve a configured voice agent and its required variables first.",
      requires: ["contactId"],
      produces: ["callingMode", "agentId (AI only)"],
    },
    {
      id: "call",
      title: "Place the human or AI call",
      description:
        "Human path: create_call_session, share the joinUrl exactly, and the user or collaborator dials. AI path: explain that this is a real billed call, get explicit confirmation, then start_ai_voice_agent_call; the configured voice agent places the call and holds the conversation.",
      requires: ["contactId", "callingMode"],
      produces: ["callId"],
    },
    {
      id: "result",
      title: "Capture the result",
      description:
        "For a human call, log the outcome against the callId. For an AI voice-agent call, read its status, outcome, summary and extracted data with get_ai_voice_agent_call.",
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
