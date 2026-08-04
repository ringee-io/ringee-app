import { Command } from "commander";
import type {
  AiPipelineType,
  PendingActionStatus,
  PipelineContextType,
} from "@ringee-io/agent";
import { getClient, run } from "../client.js";
import { c, fail, heading, json, kv, line, wantsJson, warn } from "../ui.js";

const PIPELINES: AiPipelineType[] = [
  "follow_up_recommendations",
  "script_optimization",
  "objection_intelligence",
];

export function registerPipelines(program: Command): void {
  const pipelines = program
    .command("pipelines")
    .description("Read AI pipeline analyses (organization admins)");

  pipelines
    .command("list")
    .description("List the AI pipelines and their state in this workspace")
    .action(() =>
      run(async () => {
        const res = await getClient().listAiPipelines();
        if (wantsJson()) return json(res);
        if (res.pipelines.length === 0) {
          warn("No pipelines available.");
          return;
        }
        heading(`${res.pipelines.length} pipeline(s)`);
        res.pipelines.forEach((p) => {
          line("");
          line(
            `${c.bold(p.name)}  ${c.gray(p.type)}${p.implemented ? "" : c.yellow("  (coming soon)")}`,
          );
          kv("enabled in", `${p.enabledContexts} context(s)`);
          kv("pending actions", p.totalPendingActions);
          kv("new eligible", p.totalNewEligible);
          kv("about", p.valueProposition);
        });
      }),
    );

  pipelines
    .command("results <pipeline>")
    .description(
      `Read one pipeline's analysis for one context (${PIPELINES.join(", ")})`,
    )
    .option(
      "--campaign <campaignId>",
      "analyse the context of this campaign (implies contextType=campaign)",
    )
    .option(
      "--org",
      "the organization's calls OUTSIDE any campaign (default in an org)",
    )
    .option("--personal", "your personal calls (freelancer workspaces)")
    .option(
      "--status <status>",
      "filter the actions: pending (default), completed, dismissed, snoozed",
    )
    .action((pipeline: string, opts) =>
      run(async () => {
        const contextType: PipelineContextType = opts.campaign
          ? "campaign"
          : opts.personal
            ? "personal"
            : "organization_outside_campaign";

        if (opts.campaign && (opts.org || opts.personal)) {
          fail("Pick one context: --campaign, --org or --personal.");
          process.exitCode = 1;
          return;
        }

        const res = await getClient().getAiPipelineResults({
          pipeline: pipeline as AiPipelineType,
          contextType,
          campaignId: opts.campaign,
          status: opts.status as PendingActionStatus | undefined,
        });
        if (wantsJson()) return json(res);

        heading(res.pipeline.name);
        kv("context", res.context.label ?? res.context.contextType);
        kv("enabled", res.context.enabled);
        kv("last run", res.context.lastRunAt);
        kv("confidence", res.context.lastConfidence);
        kv("new eligible", res.context.newEligibleSinceLastRun);
        kv("pending actions", res.context.pendingActionCount);

        heading(`Actions (${res.status})`);
        json(res.actions);

        if (res.objections) {
          heading("Objections");
          json(res.objections);
        }
      }),
    );
}
