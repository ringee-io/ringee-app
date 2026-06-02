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
  LogCallOutcomeSchema,
  RevealLeadSchema,
  ScheduleMeetingSchema,
  SearchContactsSchema,
  SearchLeadsSchema,
  TOOL_BY_NAME,
  UpdateCallSessionSchema,
  UpdateContactSchema,
} from "@ringee-io/agent";
import type { z } from "zod";
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

// Same names as the backend MCP tools; schemas are the shared agent contracts.
const PROXY_TOOLS: ProxyTool[] = [
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

export function createRingeeAppServer(): McpServer {
  const server = new McpServer(
    { name: "Ringee", version: "0.1.0" },
    {
      instructions:
        "Operate Ringee — outbound calling, contacts, leads, call sessions, " +
        "callbacks and meetings. Confirm sensitive actions (reveal/session = " +
        "credits/magic links) and destructive ones (delete/revoke) before calling.",
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
          "openai/widgetDescription": TOOL_BY_NAME[
            PROXY_TOOLS.find((t) => TOOL_BY_NAME[t.name]?.component === component)
              ?.name ?? ""
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

    server.registerTool(
      name,
      {
        description: meta?.summary ?? `Ringee tool: ${name}`,
        inputSchema: schema.shape,
        _meta: toolMeta,
      },
      async (args: Record<string, unknown>) => {
        const ringee = getRingeeClient();
        const result = await ringee.mcp.callTool(name, args);
        return {
          content: [{ type: "text" as const, text: result.rawText }],
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
