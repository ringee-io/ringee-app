import { Command } from "commander";
import {
  PRIMARY_FLOW,
  RingeeConfigError,
  TOOL_CATALOG,
  buildSystemPrompt,
  renderFlow,
  resolveConfig,
} from "@ringee-io/agent";
import { getClient, run } from "../client.js";
import { c, fail, heading, info, kv, line, ok, sensitivityTag } from "../ui.js";

export function registerConfig(program: Command): void {
  const config = program.command("config").description("Connection config and diagnostics");

  config
    .command("show")
    .description("Show the resolved Ringee connection (token masked)")
    .action(() => {
      try {
        const cfg = resolveConfig();
        heading("Ringee connection");
        kv("mcpUrl", cfg.mcpUrl);
        kv("userId", cfg.userId);
        kv("orgId", cfg.organizationId);
        kv("apiKey", cfg.apiKey ? "set (hidden)" : undefined);
      } catch (err) {
        if (err instanceof RingeeConfigError) {
          fail(err.message);
          process.exitCode = 1;
          return;
        }
        throw err;
      }
    });

  config
    .command("check")
    .description("Connect to the MCP and list the tools it exposes")
    .action(() =>
      run(async () => {
        const tools = await getClient().mcp.listTools();
        ok(`Connected — ${tools.length} tool(s) available.`);
        tools.forEach((t) => line(`  ${c.gray("•")} ${t.name}`));
      }),
    );

  // Knowledge helpers (no connection needed) ────────────────────────────

  program
    .command("tools")
    .description("List the agent capability catalog")
    .action(() => {
      heading("Ringee agent capabilities");
      TOOL_CATALOG.forEach((t) => {
        line("");
        line(`${c.bold(t.action)} ${sensitivityTag(t.sensitivity)} ${c.gray(`→ ${t.tool}`)}`);
        line(`  ${t.summary}`);
        line(`  ${c.dim(t.cli)}`);
      });
    });

  program
    .command("flow")
    .description("Show the outbound sales flow")
    .argument("[id]", "flow id", PRIMARY_FLOW.id)
    .action(() => {
      heading("Outbound flow");
      line(renderFlow(PRIMARY_FLOW));
      line("");
      info("Run a guided flow with the /ringee-flow slash command in Claude.");
    });

  program
    .command("prompt")
    .description("Print the shared agent system prompt")
    .action(() => {
      line(buildSystemPrompt());
    });
}
