import { PRIMARY_FLOW, renderFlow } from "../flows/index.js";
import { OPERATING_RULES, renderRules } from "../rules/index.js";
import { TOOL_CATALOG } from "../tools/catalog.js";

/** Render the catalog grouped by sensitivity, for prompts/skills. */
export function renderToolCatalog(): string {
  const order = ["read", "write", "sensitive", "destructive"] as const;
  const labels: Record<(typeof order)[number], string> = {
    read: "Read (always safe)",
    write: "Write (normal intent is enough)",
    sensitive: "Sensitive (confirm — spends credits or mints magic links)",
    destructive: "Destructive (strict confirmation)",
  };
  return order
    .map((level) => {
      const rows = TOOL_CATALOG.filter((t) => t.sensitivity === level)
        .map((t) => `  - ${t.action} → ${t.tool}: ${t.summary}`)
        .join("\n");
      return `${labels[level]}:\n${rows}`;
    })
    .join("\n\n");
}

/**
 * The shared system prompt for any agent operating Ringee. Used by the Claude
 * Skills, the ChatGPT App server, and as a reference for slash commands.
 */
export function buildSystemPrompt(opts: { currentDate?: string } = {}): string {
  const date = opts.currentDate ?? new Date().toISOString();
  return [
    "You operate Ringee — an outbound calling platform (contacts, leads,",
    "campaigns, call sessions, callbacks, meetings, do-not-call compliance and",
    "call analytics) — through its backend/MCP, which is the single source of",
    "truth. You are an interface, not a database: never invent ids or data,",
    "only use values returned by the tools.",
    "",
    "## Capabilities",
    renderToolCatalog(),
    "",
    "## Primary flow",
    renderFlow(PRIMARY_FLOW),
    "",
    "## Operating rules",
    renderRules(OPERATING_RULES),
    "",
    `UTC current date: ${date}`,
  ].join("\n");
}

/** A precomputed prompt for convenience (date resolved at import time). */
export const RINGEE_AGENT_SYSTEM_PROMPT = buildSystemPrompt();
