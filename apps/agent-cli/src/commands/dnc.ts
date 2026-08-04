import { Command } from "commander";
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

export function registerDnc(program: Command): void {
  const dnc = program
    .command("dnc")
    .description("Manage the do-not-call suppression list");

  dnc
    .command("list")
    .description("List suppressed numbers, newest first")
    .option("-s, --search <fragment>", "filter by phone-number fragment")
    .option("-p, --page <n>", "page number", (v) => parseInt(v, 10))
    .option("-l, --limit <n>", "page size (max 50)", (v) => parseInt(v, 10))
    .action((opts) =>
      run(async () => {
        const res = await getClient().listDnc({
          search: opts.search,
          page: opts.page,
          limit: opts.limit,
        });
        if (wantsJson()) return json(res);
        if (res.entries.length === 0) {
          warn("No numbers on the DNC list.");
          return;
        }
        heading(`${res.total} number(s) — page ${res.page}/${res.totalPages}`);
        res.entries.forEach((entry) => {
          line("");
          line(`${c.bold(entry.phoneNumber)}  ${c.gray(entry.id)}`);
          kv("reason", entry.reason);
          kv("source", entry.source);
          kv("added", entry.addedAt);
        });
      }),
    );

  dnc
    .command("add <phoneNumbers...>")
    .description(
      "Suppress one or more numbers (E.164). Blocks all future dials",
    )
    .option("--reason <reason>", "why they were suppressed")
    .action((phoneNumbers: string[], opts) =>
      run(async () => {
        const res = await getClient().addToDnc({
          phoneNumbers,
          reason: opts.reason,
        });
        if (wantsJson()) return json(res);
        if (res.alreadyListed) {
          warn(`${phoneNumbers[0]} was already on the DNC list.`);
          return;
        }
        ok(`${res.added} number(s) suppressed.`);
        if (res.duplicates > 0) {
          kv("already listed", res.duplicates);
        }
      }),
    );

  dnc
    .command("remove <phoneNumber>")
    .description(
      `${sensitivityTag("destructive")} Release a number so it can be dialed again`,
    )
    .option("-y, --yes", "acknowledge this undoes a compliance suppression")
    .action((phoneNumber: string, opts) =>
      run(async () => {
        if (!opts.yes) {
          fail("Refusing to remove without --yes.");
          info(
            "Releasing a number makes it callable again — only do this when the user asked for it.",
          );
          info(`First check it: ringee dnc list --search ${phoneNumber}`);
          process.exitCode = 1;
          return;
        }
        const res = await getClient().removeFromDnc({
          phoneNumber,
          confirm: true,
        });
        if (wantsJson()) return json(res);
        if (!res.ok) {
          fail(res.error || "Nothing was removed.");
          return;
        }
        ok(`${res.phoneNumber} released — it can be dialed again.`);
      }),
    );
}
