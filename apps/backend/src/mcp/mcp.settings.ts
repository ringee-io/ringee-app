// @ts-ignore
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { OwnershipContext } from "@ringee/platform";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { McpFunc } from "./mcp.func";
import { McpToolsRepository } from "./mcp.tools.repository";

dayjs.extend(utc);

const SERVER_NAME = "Ringee";
const SERVER_VERSION = "2.0.0";

const baseInstructions = `
You are connected to Ringee — a VoIP platform for international calling, contact
management, callbacks and meetings. Use the available tools to read and act on
the authenticated user's data.

Guidelines:
1. Resolve contacts with search_contacts before calling start_call,
   create_callback or schedule_meeting (you need a contactId).
2. Phone numbers must be in E.164 format (e.g. +14155552671).
3. Dates and times must be ISO-8601 with timezone offset (e.g.
   2026-05-23T14:30:00-04:00). All datetimes are interpreted as absolute.
4. start_call sends a push to the user's active devices — it does not place
   the call server-side. If no device is active, ask the user to open Ringee.
5. log_call_outcome requires the callId of an existing call. Use the values
   returned by other tools, never invent ids.
6. create_call_session returns a joinUrl — share that URL exactly as given. The
   raw token is embedded once and cannot be re-fetched; use get_call_session
   to check status afterwards.
7. update_call_session can replace the contact queue only before the first
   call. Pass campaignId=null to detach a session from its campaign.
8. delete_call_session is a revoke: history is preserved, but the magic link
   stops working immediately.
9. create_contact / update_contact require a phoneNumber in E.164. Before
   updating or deleting, always resolve the target with search_contacts or
   get_contact — never act on a contactId the user did not approve.
10. delete_contact is DESTRUCTIVE and double-guarded: pass confirm=true AND
    confirmPhoneNumber equal to the contact's stored phoneNumber. Always
    read the phoneNumber back to the human user and obtain an explicit
    "yes, delete" before calling. Never auto-confirm.
11. search_leads / reveal_lead / import_leads_as_contacts use the user's
    connected enrichment provider (Apollo or Prospeo). search_leads returns
    a jobId; pass it to reveal_lead or import_leads_as_contacts. Reveal and
    import consume credits — confirm with the user before mass actions.
12. Keep responses concise and action-oriented.

UTC Current Date: __CURRENT_DATE__
`.trim();

function buildInstructions(ctx: OwnershipContext): string {
  const date = dayjs().utc().toISOString();
  return (
    baseInstructions.replace("__CURRENT_DATE__", date) +
    `\n\nSession:\n- userId: ${ctx.userId}` +
    (ctx.organizationId
      ? `\n- organizationId: ${ctx.organizationId}`
      : "\n- mode: freelancer (no organization)")
  );
}

const noopJsonSchemaValidator = {
  getValidator: () => (input: unknown) => ({
    valid: true,
    data: input,
    errorMessage: undefined,
  }),
} as never;

export class McpSettings {
  static build(
    ctx: OwnershipContext,
    func: McpFunc,
    tools: McpToolsRepository,
  ): McpServer {
    const server = new McpServer(
      { name: SERVER_NAME, version: SERVER_VERSION },
      {
        instructions: buildInstructions(ctx),
        // Bypass the SDK's default Ajv-backed validator. The default loads
        // ajv-formats which crashes in our ESM/CJS interop. We don't use
        // elicitation, so an accept-all validator is safe here.
        jsonSchemaValidator: noopJsonSchemaValidator,
      },
    );

    for (const entry of tools.getEntries()) {
      const { toolName, description, zod, annotations } = entry.data;

      const handler = async (input: Record<string, unknown>) => {
        const result = await (
          func as unknown as Record<string, Function>
        )[entry.func as string].call(func, ctx, input);
        return { content: result };
      };

      if (zod) {
        server.registerTool(
          toolName,
          {
            description: description ?? `Ringee tool: ${toolName}`,
            inputSchema: zod,
            ...(annotations ? { annotations } : {}),
          },
          handler as never,
        );
      } else if (annotations) {
        server.tool(
          toolName,
          description ?? `Ringee tool: ${toolName}`,
          annotations as never,
          handler as never,
        );
      } else {
        server.tool(
          toolName,
          description ?? `Ringee tool: ${toolName}`,
          handler as never,
        );
      }
    }

    return server;
  }
}
