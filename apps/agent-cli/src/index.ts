import { Command } from "commander";
import { AGENT_VERSION } from "@ringee-io/agent";
import { registerContacts } from "./commands/contacts.js";
import { registerLeads } from "./commands/leads.js";
import { registerSessions } from "./commands/sessions.js";
import { registerActivity } from "./commands/activity.js";
import { registerConfig } from "./commands/config.js";
import { c } from "./ui.js";

const program = new Command();

program
  .name("ringee")
  .description(
    "Operate Ringee — contacts, leads, call sessions, callbacks and meetings — " +
      "on top of the Ringee backend/MCP.",
  )
  .version(AGENT_VERSION, "-v, --version")
  .option("--json", "output raw JSON instead of formatted text")
  .addHelpText(
    "after",
    `\nExamples:\n` +
      `  ${c.dim("ringee contacts search acme")}\n` +
      `  ${c.dim("ringee leads search --title \"VP Sales\" --country US")}\n` +
      `  ${c.dim("ringee sessions create --contact <id> --title \"Tue outbound\" --yes")}\n` +
      `  ${c.dim("ringee config check")}\n\n` +
      `Configure with RINGEE_MCP_URL (or RINGEE_BACKEND_URL + RINGEE_USER_ID).`,
  );

registerContacts(program);
registerLeads(program);
registerSessions(program);
registerActivity(program);
registerConfig(program);

program.parseAsync(process.argv).catch((err) => {
  process.stderr.write(`${String(err?.message ?? err)}\n`);
  process.exit(1);
});
