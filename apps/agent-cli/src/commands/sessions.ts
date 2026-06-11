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
} from "../ui.js";

const collect = (v: string, acc: string[] = []) => {
  acc.push(v);
  return acc;
};

export function registerSessions(program: Command): void {
  const sessions = program
    .command("sessions")
    .description("Call sessions — magic-link dialing queues");

  sessions
    .command("create")
    .description(
      `${sensitivityTag("sensitive")} Create a session and magic link`,
    )
    .option(
      "--contact <contactId>",
      "contact in the queue (repeatable)",
      collect,
    )
    .option("--phone <e164>", "raw phone in the queue (repeatable)", collect)
    .option("--title <title>", "session title")
    .option("--campaign <campaignId>", "attribute to a campaign")
    .option(
      "--expires <minutes>",
      "link validity in minutes (default 60)",
      (v) => parseInt(v, 10),
    )
    .option("--max-calls <n>", "auto-complete after N calls", (v) =>
      parseInt(v, 10),
    )
    .option("-y, --yes", "confirm minting a shareable magic link")
    .action((opts) =>
      run(async () => {
        const queue = [
          ...((opts.contact as string[] | undefined) ?? []).map(
            (contactId) => ({ contactId }),
          ),
          ...((opts.phone as string[] | undefined) ?? []).map(
            (phoneNumber) => ({ phoneNumber }),
          ),
        ];
        if (queue.length === 0) {
          fail("Provide at least one --contact <id> or --phone <e164>.");
          process.exitCode = 1;
          return;
        }
        if (!opts.yes) {
          fail(
            "Creating a session mints a shareable magic link. Re-run with --yes to confirm.",
          );
          info(`Queue size: ${queue.length}`);
          process.exitCode = 1;
          return;
        }
        const res = await getClient().createCallSession({
          contacts: queue,
          title: opts.title,
          campaignId: opts.campaign,
          expiresInMinutes: opts.expires,
          maxCalls: opts.maxCalls,
        });
        if (wantsJson()) return json(res);
        ok(`Call session created (${res.contactsCount} in queue).`);
        kv("id", res.callSessionId);
        kv("status", res.status);
        kv("expires", res.expiresAt);
        line("");
        line(
          `${c.bold("Magic link")} ${c.gray("(share exactly — cannot be re-fetched)")}`,
        );
        line(`  ${c.cyan(res.joinUrl)}`);
      }),
    );

  sessions
    .command("get <callSessionId>")
    .description("Show session status and progress")
    .action((callSessionId: string) =>
      run(async () => {
        const res = await getClient().getCallSession({ callSessionId });
        if (wantsJson()) return json(res);
        heading(res.title || `Session ${res.callSessionId}`);
        kv("id", res.callSessionId);
        kv("status", res.status);
        kv("contacts", res.contactsCount);
        kv("completed", res.callsCompleted);
        kv("expires", res.expiresAt);
        kv("link live", res.joinUrlAvailable);
        kv("campaign", res.campaignId);
      }),
    );

  sessions
    .command("update <callSessionId>")
    .description(
      `${sensitivityTag("sensitive")} Update title, campaign or expiry`,
    )
    .option("--title <title>")
    .option("--campaign <campaignId>", "set campaign (use 'null' to detach)")
    .option("--expires <minutes>", "extend validity", (v) => parseInt(v, 10))
    .action((callSessionId: string, opts) =>
      run(async () => {
        const campaignId =
          opts.campaign === undefined
            ? undefined
            : opts.campaign === "null"
              ? null
              : opts.campaign;
        const res = await getClient().updateCallSession({
          callSessionId,
          title: opts.title,
          campaignId,
          expiresInMinutes: opts.expires,
        });
        if (wantsJson()) return json(res);
        ok(`Session updated (status: ${res.status}).`);
      }),
    );

  sessions
    .command("revoke <callSessionId>")
    .description(
      `${sensitivityTag("destructive")} Revoke the magic link (history preserved)`,
    )
    .option("-y, --yes", "confirm the link will stop working immediately")
    .action((callSessionId: string, opts) =>
      run(async () => {
        if (!opts.yes) {
          fail(
            "Revoking disables the magic link immediately. Re-run with --yes to confirm.",
          );
          process.exitCode = 1;
          return;
        }
        const res = await getClient().deleteCallSession({ callSessionId });
        if (wantsJson()) return json(res);
        ok(`Session revoked (status: ${res.status}).`);
      }),
    );
}
