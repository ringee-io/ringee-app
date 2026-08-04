import { Command } from "commander";
import type {
  CampaignLead,
  CampaignLeadStatus,
  CampaignStatus,
  CampaignSummary,
} from "@ringee-io/agent";
import { getClient, run } from "../client.js";
import {
  c,
  fail,
  heading,
  info,
  json,
  kv,
  line,
  ok,
  sensitivityTag,
  wantsJson,
  warn,
} from "../ui.js";

const STATUSES: CampaignStatus[] = ["draft", "active", "paused", "completed"];

const LEAD_STATUSES: CampaignLeadStatus[] = [
  "pending",
  "queued",
  "locked",
  "dialing",
  "in_call",
  "wrap_up",
  "dispositioned",
  "scheduled",
  "completed",
  "exhausted",
  "dnc",
  "called",
  "dead",
];

function statusColor(status: string): string {
  switch (status) {
    case "active":
      return c.green(status);
    case "paused":
      return c.yellow(status);
    case "completed":
      return c.gray(status);
    default:
      return c.blue(status);
  }
}

function printCampaign(campaign: CampaignSummary): void {
  line(`${c.bold(campaign.name)}  ${c.gray(campaign.id)}`);
  kv("status", statusColor(campaign.status));
  kv("leads", campaign.leadsCount);
  kv("description", campaign.description);
  kv("created", campaign.createdAt);
}

function printLead(lead: CampaignLead): void {
  const who = lead.contact?.name || lead.contact?.phoneNumber || "(no contact)";
  line(`${c.bold(who)}  ${c.gray(lead.leadId)}`);
  kv("status", lead.status);
  kv("phone", lead.contact?.phoneNumber);
  kv("company", lead.contact?.company);
  kv("attempts", lead.attempts);
  kv("last call", lead.lastCallAt);
  kv("next call", lead.nextCallAt);
  kv("dead at", lead.deadAt);
}

export function registerCampaigns(program: Command): void {
  const campaigns = program
    .command("campaigns")
    .description(
      "Manage outbound campaigns — leads, status and analytics (organization workspaces)",
    );

  campaigns
    .command("list")
    .description("List campaigns with status and lead count")
    .option("-s, --search <text>", "filter by name/description")
    .option("--status <status>", `filter by status (${STATUSES.join(", ")})`)
    .option("-p, --page <n>", "page number", (v) => parseInt(v, 10))
    .option("-l, --limit <n>", "page size (max 50)", (v) => parseInt(v, 10))
    .action((opts) =>
      run(async () => {
        const res = await getClient().listCampaigns({
          search: opts.search,
          status: opts.status as CampaignStatus | undefined,
          page: opts.page,
          limit: opts.limit,
        });
        if (wantsJson()) return json(res);
        if (res.campaigns.length === 0) {
          warn("No campaigns matched.");
          return;
        }
        heading(
          `${res.total} campaign(s) — page ${res.page}/${res.totalPages}`,
        );
        res.campaigns.forEach((campaign) => {
          line("");
          printCampaign(campaign);
        });
      }),
    );

  campaigns
    .command("get <campaignId>")
    .description("Show one campaign's full configuration")
    .action((campaignId: string) =>
      run(async () => {
        const res = await getClient().getCampaign({ campaignId });
        if (wantsJson()) return json(res);
        heading(res.name);
        kv("id", res.id);
        kv("status", statusColor(res.status));
        kv("leads", res.leadsCount);
        kv("description", res.description);
        kv("dialer", res.dialerMode);
        kv("max attempts", res.maxAttempts);
        kv("retry delay", res.retryDelayMin && `${res.retryDelayMin} min`);
        kv("wrap-up", res.wrapUpTimeSec && `${res.wrapUpTimeSec}s`);
        kv("timezone", res.workingHours.timezone);
        kv(
          "hours",
          res.workingHours.start && res.workingHours.end
            ? `${res.workingHours.start}–${res.workingHours.end}`
            : null,
        );
        // 0=Sunday … 6=Saturday, as stored.
        kv("days", res.workingHours.days?.join(", "));
      }),
    );

  campaigns
    .command("status <campaignId> <status>")
    .description(
      `Change a campaign's status (${STATUSES.join(", ")}). Org admins only`,
    )
    .action((campaignId: string, status: string) =>
      run(async () => {
        const res = await getClient().updateCampaignStatus({
          campaignId,
          status: status as CampaignStatus,
        });
        if (wantsJson()) return json(res);
        ok(`${res.name} is now ${statusColor(res.status)}.`);
      }),
    );

  campaigns
    .command("leads <campaignId>")
    .description("List the leads queued in a campaign")
    .option(
      "--status <status>",
      `filter by lead status (${LEAD_STATUSES.join(", ")})`,
    )
    .option("-p, --page <n>", "page number", (v) => parseInt(v, 10))
    .option("-l, --limit <n>", "page size (max 50)", (v) => parseInt(v, 10))
    .action((campaignId: string, opts) =>
      run(async () => {
        const res = await getClient().listCampaignLeads({
          campaignId,
          status: opts.status as CampaignLeadStatus | undefined,
          page: opts.page,
          limit: opts.limit,
        });
        if (wantsJson()) return json(res);
        if (res.leads.length === 0) {
          warn("No leads matched.");
          return;
        }
        heading(`${res.total} lead(s) — page ${res.page}/${res.totalPages}`);
        res.leads.forEach((lead) => {
          line("");
          printLead(lead);
        });
      }),
    );

  campaigns
    .command("add-lead <campaignId>")
    .description(
      "Add one lead to a campaign (reuses an existing contact with the same phone)",
    )
    .requiredOption("--phone <e164>", "phone number in E.164 (+14155552671)")
    .requiredOption("--name <name>", "lead name")
    .option("--email <email>")
    .option("--company <company>")
    .option("--title <jobTitle>")
    .option("--state <state>")
    .option("--website <website>")
    .action((campaignId: string, opts) =>
      run(async () => {
        const res = await getClient().addCampaignLeads({
          campaignId,
          leads: [
            {
              name: opts.name,
              phone: opts.phone,
              email: opts.email,
              company: opts.company,
              jobTitle: opts.title,
              state: opts.state,
              website: opts.website,
            },
          ],
        });
        if (wantsJson()) return json(res);
        printImportSummary(res);
      }),
    );

  campaigns
    .command("import-leads <campaignId> <file>")
    .description(
      "Bulk-add leads from a JSON file: an array of {name, phone, email?, company?, jobTitle?, state?, website?}",
    )
    .action((campaignId: string, file: string) =>
      run(async () => {
        const { readFile } = await import("node:fs/promises");
        const raw = await readFile(file, "utf8");
        let leads: unknown;
        try {
          leads = JSON.parse(raw);
        } catch {
          fail(`${file} is not valid JSON.`);
          process.exitCode = 1;
          return;
        }
        if (!Array.isArray(leads) || leads.length === 0) {
          fail("Expected a non-empty JSON array of leads.");
          process.exitCode = 1;
          return;
        }
        // The client's zod schema validates each entry and reports which one
        // is wrong, so we hand the parsed array straight over.
        const res = await getClient().addCampaignLeads({
          campaignId,
          leads: leads as never,
        });
        if (wantsJson()) return json(res);
        printImportSummary(res);
      }),
    );

  campaigns
    .command("delete-lead <campaignId> <leadId>")
    .description(
      `${sensitivityTag("destructive")} Remove a lead from a campaign (contact is preserved)`,
    )
    .option("-y, --yes", "acknowledge this is destructive")
    .action((campaignId: string, leadId: string, opts) =>
      run(async () => {
        if (!opts.yes) {
          fail("Refusing to delete without --yes. This is destructive.");
          info(
            "The lead's call attempts and campaign callbacks go with it; the contact stays.",
          );
          info(`First check it: ringee campaigns leads ${campaignId}`);
          process.exitCode = 1;
          return;
        }
        const res = await getClient().deleteCampaignLead({
          campaignId,
          leadId,
          confirm: true,
        });
        if (wantsJson()) return json(res);
        if (!res.ok || !res.deleted) {
          fail(res.error || "Delete was rejected.");
          return;
        }
        ok("Lead removed from the campaign.");
      }),
    );

  campaigns
    .command("analytics <campaignId>")
    .description("Campaign performance: attempts, connects, conversions, rates")
    .option("--from <iso>", "window start (ISO-8601 with offset)")
    .option("--to <iso>", "window end (ISO-8601 with offset)")
    .option("--no-agents", "skip the per-agent breakdown")
    .option("--hourly", "include the hourly call-volume histogram")
    .action((campaignId: string, opts) =>
      run(async () => {
        const res = await getClient().getCampaignAnalytics({
          campaignId,
          startDate: opts.from,
          endDate: opts.to,
          includeAgents: opts.agents,
          includeHourly: opts.hourly ?? undefined,
        });
        if (wantsJson()) return json(res);

        heading(`${res.campaign.name} — ${res.campaign.status}`);
        const s = res.summary;
        kv("attempts", s.totalAttempts);
        kv("connected", s.connected);
        kv("conversions", s.conversions);
        kv("contact rate", `${s.contactRate}%`);
        kv("conv. rate", `${s.conversionRate}%`);
        kv(
          "avg handle",
          s.avgHandleTimeSec != null
            ? `${Math.round(s.avgHandleTimeSec)}s`
            : null,
        );
        kv("leads dialed", s.uniqueLeadsDialed);

        const byStatus = Object.entries(s.leadsByStatus ?? {});
        if (byStatus.length > 0) {
          heading("Leads by status");
          byStatus.forEach(([status, count]) => kv(status, count));
        }

        if (res.dispositions.length > 0) {
          heading("Dispositions");
          res.dispositions.forEach((d) =>
            kv(d.dispositionCode, `${d.count} (${d.percentage}%)`),
          );
        }

        if (res.agents && res.agents.length > 0) {
          heading("Agents");
          res.agents.forEach((a) => {
            line("");
            line(c.bold(a.agentUserId));
            kv("attempts", a.attempts);
            kv("connected", a.connected);
            kv("conversions", a.conversions);
            kv("contact rate", `${a.contactRate}%`);
            kv("talk time", `${Math.round(a.totalTalkSec)}s`);
          });
        }

        if (res.hourly && res.hourly.length > 0) {
          heading("Hourly volume");
          res.hourly.forEach((h) =>
            kv(
              `${String(h.hour).padStart(2, "0")}:00`,
              `${h.attempts} attempts / ${h.connected} connected`,
            ),
          );
        }
      }),
    );
}

function printImportSummary(res: {
  ok: boolean;
  leadsAdded: number;
  contactsCreated: number;
  duplicatesSkipped: number;
  invalidRows: number;
  errors: unknown[];
}): void {
  if (!res.ok && res.leadsAdded === 0) {
    fail("No leads were added.");
  } else {
    ok(`${res.leadsAdded} lead(s) added.`);
  }
  kv("contacts created", res.contactsCreated);
  kv("duplicates skipped", res.duplicatesSkipped);
  kv("invalid rows", res.invalidRows);
  if (res.errors?.length) json(res.errors);
}
