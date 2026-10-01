import { Command } from "commander";
import { AGENT_VERSION } from "@ringee-io/agent";
import { registerContacts } from "./commands/contacts.js";
import { registerLeads } from "./commands/leads.js";
import { registerSessions } from "./commands/sessions.js";
import { registerActivity } from "./commands/activity.js";
import { registerCampaigns } from "./commands/campaigns.js";
import { registerAnalytics } from "./commands/analytics.js";
import { registerDnc } from "./commands/dnc.js";
import { registerPipelines } from "./commands/pipelines.js";
import { registerVoiceAgents } from "./commands/voice-agents.js";
import { registerConfig } from "./commands/config.js";
import { registerAuth } from "./commands/auth.js";
import { c } from "./ui.js";

const program = new Command();

program
  .name("ringee")
  .description(
    "Operate Ringee — contacts, leads, campaigns, call sessions, callbacks, " +
      "meetings, DNC and analytics — on top of the Ringee backend/MCP.",
  )
  .version(AGENT_VERSION, "-v, --version")
  .option("--json", "output raw JSON instead of formatted text")
  .addHelpText(
    "after",
    `\nExamples:\n` +
      `  ${c.dim("ringee login")}\n` +
      `  ${c.dim("ringee contacts search acme")}\n` +
      `  ${c.dim('ringee leads search --title "VP Sales" --country US')}\n` +
      `  ${c.dim('ringee sessions create --contact <id> --title "Tue outbound" --yes')}\n` +
      `  ${c.dim("ringee campaigns list --status active")}\n` +
      `  ${c.dim("ringee campaigns analytics <campaignId>")}\n` +
      `  ${c.dim("ringee voice-agents list")}\n` +
      `  ${c.dim("ringee voice-agents call <agentId> --to +13055550123 --yes")}\n` +
      `  ${c.dim("ringee analytics calls --range 30d --campaign none")}\n` +
      `  ${c.dim("ringee analytics day 2026-06-02 --offset -04:00")}\n` +
      `  ${c.dim("ringee callbacks list --status scheduled")}\n` +
      `  ${c.dim('ringee dnc add +14155552671 --reason "asked not to be called"')}\n` +
      `  ${c.dim("ringee pipelines results objection_intelligence --org")}\n` +
      `  ${c.dim("ringee config check")}\n\n` +
      `Log in with \`ringee login\`. For CI or agents set RINGEE_API_KEY instead\n` +
      `(RINGEE_MCP_URL and RINGEE_BACKEND_URL + RINGEE_USER_ID still work).`,
  );

registerAuth(program);
registerContacts(program);
registerLeads(program);
registerSessions(program);
registerActivity(program);
registerCampaigns(program);
registerAnalytics(program);
registerDnc(program);
registerPipelines(program);
registerVoiceAgents(program);
registerConfig(program);

program.parseAsync(process.argv).catch((err) => {
  process.stderr.write(`${String(err?.message ?? err)}\n`);
  process.exit(1);
});
