import { Command } from "commander";
import { getClient, run } from "../client.js";
import {
  c,
  fail,
  heading,
  json,
  kv,
  line,
  sensitivityTag,
  wantsJson,
  warn,
} from "../ui.js";

/** `--var first_name=Carlos` may be repeated; values may contain "=". */
function collectVariable(
  value: string,
  previous: Record<string, string>,
): Record<string, string> {
  const separator = value.indexOf("=");
  if (separator <= 0) {
    fail(`--var expects name=value, got "${value}"`);
  }
  return {
    ...previous,
    [value.slice(0, separator)]: value.slice(separator + 1),
  };
}

export function registerVoiceAgents(program: Command): void {
  const agents = program
    .command("voice-agents")
    .description("Run Ringee's AI voice agents");

  agents
    .command("list")
    .description("List the workspace's AI voice agents")
    .action(() =>
      run(async () => {
        const res = await getClient().listAiVoiceAgents({});
        if (wantsJson()) return json(res);
        if (res.agents.length === 0) {
          warn("No AI voice agents in this workspace yet.");
          return;
        }

        heading(`${res.total} AI voice agent(s)`);
        res.agents.forEach((agent) => {
          line("");
          line(`${c.bold(agent.name)}  ${c.gray(agent.id)}`);
          kv("type", agent.type);
          kv("status", agent.status);
          kv("voice", agent.voice ?? "—");
          kv("calls from", agent.callsFrom ?? "— (pass --from)");
          kv("calls", agent.callCount);
          const variables = res.variablesByType[agent.type] ?? [];
          kv(
            "variables",
            variables
              .map((v) => (v.required ? `${v.key}*` : v.key))
              .join(", ") || "—",
          );
        });
        line("");
        line(c.dim("* required"));
        if (res.callerNumbers.length > 0) {
          // An agent with no number of its own needs one named on the call, so
          // the ids to pass to `--from` belong next to the list, not a page away.
          line("");
          heading("Numbers you can call from");
          res.callerNumbers.forEach((number) => {
            line(`${number.phoneNumber}  ${c.gray(number.id)}`);
          });
        }
      }),
    );

  agents
    .command("call <agentId>")
    .description(
      `${sensitivityTag("sensitive")} Have an agent call someone (real, billed call)`,
    )
    .requiredOption("--to <phone>", "destination in E.164, e.g. +13055550123")
    .option("--from <numberId>", "id of the Ringee number to call from")
    .option(
      "--var <name=value>",
      "a dynamic variable for the agent (repeatable)",
      collectVariable,
      {} as Record<string, string>,
    )
    .option("--external-id <id>", "your own id, echoed back on the result")
    .option("-y, --yes", "confirm placing the real, billed call")
    .action((agentId: string, opts) =>
      run(async () => {
        if (!opts.yes) {
          fail(
            "This starts a real, billed phone call. Re-run with --yes to confirm.",
          );
          process.exitCode = 1;
          return;
        }
        const res = await getClient().startAiVoiceAgentCall({
          agentId,
          to: opts.to,
          fromNumberId: opts.from,
          variables: opts.var,
          ...(opts.externalId
            ? { metadata: { external_id: opts.externalId } }
            : {}),
        });
        if (wantsJson()) return json(res);

        heading("Call started");
        kv("call id", res.callId);
        kv("status", res.status);
        line("");
        line(
          c.dim(
            `The conversation runs on its own. Read the result with:  ringee voice-agents call-result ${res.callId}`,
          ),
        );
      }),
    );

  agents
    .command("call-result <callId>")
    .description("Read the outcome of an agent call once it has ended")
    .action((callId: string) =>
      run(async () => {
        const res = await getClient().getAiVoiceAgentCall({ callId });
        if (wantsJson()) return json(res);

        heading("Call result");
        kv("status", res.status);
        kv("outcome", res.outcome ?? c.dim("not analysed yet"));
        kv("sentiment", res.sentiment ?? "—");
        if (res.summary) {
          line("");
          line(res.summary);
        }
        const extracted = Object.entries(res.extracted_data ?? {});
        if (extracted.length > 0) {
          line("");
          heading("Extracted data");
          extracted.forEach(([key, value]) => kv(key, String(value ?? "—")));
        }
      }),
    );
}
