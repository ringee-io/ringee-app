import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CreateCallSessionSchema,
  CreateCallbackSchema,
  CreateContactSchema,
  DeleteCallSessionSchema,
  DeleteContactSchema,
  GetCallSessionSchema,
  GetContactSchema,
  ImportLeadsSchema,
  ListWorkspacesSchema,
  LogCallOutcomeSchema,
  RevealLeadSchema,
  ScheduleMeetingSchema,
  SearchContactsSchema,
  SearchLeadsSchema,
  SwitchWorkspaceSchema,
  TOOL_BY_NAME,
  UpdateCallSessionSchema,
  UpdateContactSchema,
} from "@ringee-io/agent";
import type { z } from "zod";
import type { RingeeClient } from "@ringee-io/agent";
import { getRingeeClient } from "./ringee-mcp.js";
import {
  RESOURCE_MIME_TYPE,
  buildWidgetHtml,
  widgetTemplateUri,
  type WidgetAssets,
} from "./widget-template.js";

/**
 * The ChatGPT App MCP server.
 *
 * It does NOT reimplement Ringee — it proxies each tool call straight to the
 * Ringee backend/MCP (the source of truth) and decorates the result with the
 * `openai/outputTemplate` so ChatGPT renders the right visual component.
 */

interface ProxyTool {
  name: string;
  schema: z.ZodObject<z.ZodRawShape>;
}

/**
 * Tools that must NOT be callable straight from a widget button: they either
 * spend enrichment credits or are a hard double-confirmed delete. These keep
 * going through the model so their confirmation flow runs. Everything else is
 * safe to invoke directly from an explicit button click.
 */
const MODEL_GATED_TOOLS = new Set<string>([
  "delete_contact",
  "reveal_lead",
  "import_leads_as_contacts",
]);

// Same names as the backend MCP tools; schemas are the shared agent contracts.
const PROXY_TOOLS: ProxyTool[] = [
  { name: "list_workspaces", schema: ListWorkspacesSchema },
  { name: "switch_workspace", schema: SwitchWorkspaceSchema },
  { name: "search_contacts", schema: SearchContactsSchema },
  { name: "get_contact", schema: GetContactSchema },
  { name: "create_contact", schema: CreateContactSchema },
  { name: "update_contact", schema: UpdateContactSchema },
  { name: "delete_contact", schema: DeleteContactSchema },
  { name: "log_call_outcome", schema: LogCallOutcomeSchema },
  { name: "create_callback", schema: CreateCallbackSchema },
  { name: "schedule_meeting", schema: ScheduleMeetingSchema },
  { name: "create_call_session", schema: CreateCallSessionSchema },
  { name: "update_call_session", schema: UpdateCallSessionSchema },
  { name: "get_call_session", schema: GetCallSessionSchema },
  { name: "delete_call_session", schema: DeleteCallSessionSchema },
  { name: "search_leads", schema: SearchLeadsSchema },
  { name: "reveal_lead", schema: RevealLeadSchema },
  { name: "import_leads_as_contacts", schema: ImportLeadsSchema },
];

/** Distinct component templates referenced by the catalog. */
function uniqueComponents(): string[] {
  const set = new Set<string>();
  for (const t of PROXY_TOOLS) {
    const component = TOOL_BY_NAME[t.name]?.component;
    if (component) set.add(component);
  }
  return [...set];
}

/** Load the compiled widget bundle (one bundle serves every component). */
function loadWidgetAssets(): WidgetAssets {
  const dir =
    process.env.RINGEE_WIDGETS_DIR ||
    resolve(dirname(fileURLToPath(import.meta.url)), "../../dist/widgets");
  const read = (file: string): string => {
    try {
      return readFileSync(resolve(dir, file), "utf8");
    } catch {
      return "";
    }
  };
  const assets = { js: read("widget.js"), css: read("widget.css") };
  if (!assets.js) {
    // eslint-disable-next-line no-console
    console.warn(
      `[ringee] widget bundle not found in ${dir}. Run \`pnpm --filter @ringee-io/chatgpt-app build:widgets\`. Components will render a placeholder.`,
    );
  }
  return assets;
}

/**
 * Build the ChatGPT App MCP server.
 *
 * `ringeeClient` scopes every tool call to one account. In multi-tenant mode
 * the caller passes the client resolved from the verified token; when omitted
 * (dev / single-tenant) we fall back to the env-configured singleton.
 */
export function createRingeeAppServer(ringeeClient?: RingeeClient): McpServer {
  const server = new McpServer(
    { name: "Ringee", version: "0.1.0" },
    {
      instructions:
        "Operate Ringee — outbound calling, contacts, leads, call sessions, " +
        "callbacks and meetings.\n\n" +
        "Every tool result is rendered to the user as a rich, interactive card. " +
        "Do NOT restate or summarize the fields already shown in that card " +
        "(name, phone, email, ids, lists, etc.). After a tool runs, reply with " +
        "at most one short sentence — a confirmation or the recommended next " +
        "step — or simply nothing if the card already says it all.\n\n" +
        'To list every contact, call search_contacts with query "*" (paginated). ' +
        "The contacts card paginates itself, so you don't need to re-call the " +
        "tool when the user just wants the next page.\n\n" +
        "Confirm sensitive actions (reveal/session = credits/magic links) and " +
        "destructive ones (delete/revoke) before calling.",
    },
  );

  const assets = loadWidgetAssets();

  // Register one UI resource per visual component (bundle inlined).
  for (const component of uniqueComponents()) {
    const uri = widgetTemplateUri(component);
    server.registerResource(
      component,
      uri,
      {
        title: component,
        mimeType: RESOURCE_MIME_TYPE,
        _meta: {
          "openai/widgetPrefersBorder": true,
          "openai/widgetDescription":
            TOOL_BY_NAME[
              PROXY_TOOLS.find(
                (t) => TOOL_BY_NAME[t.name]?.component === component,
              )?.name ?? ""
            ]?.summary,
        },
      },
      async () => ({
        contents: [
          {
            uri,
            mimeType: RESOURCE_MIME_TYPE,
            text: buildWidgetHtml(component, assets),
          },
        ],
      }),
    );
  }

  // Register each tool as a thin proxy to the backend MCP.
  for (const { name, schema } of PROXY_TOOLS) {
    const meta = TOOL_BY_NAME[name];
    const component = meta?.component;
    const outputTemplate = component ? widgetTemplateUri(component) : undefined;

    const toolMeta: Record<string, unknown> = {
      "openai/toolInvocation/invoking": `${meta?.title ?? name}…`,
      "openai/toolInvocation/invoked": `${meta?.title ?? name} done`,
    };
    if (outputTemplate) toolMeta["openai/outputTemplate"] = outputTemplate;
    // Let card buttons call tools deterministically from the widget (a real
    // click is the user's intent, so it never round-trips through the model and
    // can't misfire or duplicate). Credit-spending and destructive-delete tools
    // stay model-gated so their confirmation flows still run.
    if (!MODEL_GATED_TOOLS.has(name)) {
      toolMeta["openai/widgetAccessible"] = true;
    }

    server.registerTool(
      name,
      {
        title: meta?.title,
        description: meta?.summary ?? `Ringee tool: ${name}`,
        inputSchema: schema.shape,
        ...(meta?.annotations ? { annotations: meta.annotations } : {}),
        _meta: toolMeta,
      },
      async (args: Record<string, unknown>) => {
        const ringee = ringeeClient ?? getRingeeClient();
        const result = await ringee.mcp.callTool(name, args);

        // The widget shows the full result. Keep the model-facing text minimal so
        // ChatGPT doesn't echo the card's contents as a second message. On error,
        // surface the real text so the model can explain what failed.
        const narration = result.isError
          ? result.rawText
          : outputTemplate
            ? `${meta?.title ?? name} is shown to the user in an interactive card above. Don't restate its contents — reply briefly or suggest the next step.`
            : result.rawText;

        return {
          content: [{ type: "text" as const, text: narration }],
          structuredContent:
            result.data && typeof result.data === "object"
              ? (result.data as Record<string, unknown>)
              : { value: result.data },
          isError: result.isError,
          ...(outputTemplate
            ? { _meta: { "openai/outputTemplate": outputTemplate } }
            : {}),
        };
      },
    );
  }

  return server;
}
