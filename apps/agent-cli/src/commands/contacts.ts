import { Command } from "commander";
import type {
  CallOutcome,
  ContactSummary,
  OutcomeContactSummary,
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

function printContact(ct: ContactSummary): void {
  const title =
    ct.name ||
    [ct.firstName, ct.lastName].filter(Boolean).join(" ") ||
    ct.phoneNumber;
  line(`${c.bold(title)}  ${c.gray(ct.id)}`);
  kv("phone", ct.phoneNumber);
  kv("email", ct.email);
  kv("company", ct.company);
  kv("title", ct.jobTitle);
  if (ct.lastCallAt) kv("last call", ct.lastCallAt);
}

function printOutcomeContact(ct: OutcomeContactSummary): void {
  const title =
    ct.name ||
    [ct.firstName, ct.lastName].filter(Boolean).join(" ") ||
    ct.phoneNumber;
  line(`${c.bold(title)}  ${c.gray(ct.id)}`);
  kv("phone", ct.phoneNumber);
  kv("email", ct.email);
  kv("company", ct.company);
  kv("title", ct.jobTitle);
  kv("seniority", ct.seniority);
  kv("department", ct.department);
  kv("country", ct.locationCountryCode);
  kv("score", ct.score);
  kv("stage", ct.lifecycleStage);
  kv("last outcome", ct.lastOutcome);
  if (ct.lastCallAt) kv("last call", ct.lastCallAt);
}

export function registerContacts(program: Command): void {
  const contacts = program
    .command("contacts")
    .description("Search, view and manage contacts");

  contacts
    .command("search <query...>")
    .description("Search contacts by name, phone, email or company")
    .option("-p, --page <n>", "page number", (v) => parseInt(v, 10))
    .option("-l, --limit <n>", "page size (max 50)", (v) => parseInt(v, 10))
    .action((queryParts: string[], opts) =>
      run(async () => {
        const res = await getClient().searchContacts({
          query: queryParts.join(" "),
          page: opts.page,
          limit: opts.limit,
        });
        if (wantsJson()) return json(res);
        if (res.contacts.length === 0) {
          warn("No contacts matched.");
          return;
        }
        heading(`${res.total} contact(s) — page ${res.page}/${res.totalPages}`);
        res.contacts.forEach((ct) => {
          line("");
          printContact(ct);
        });
      }),
    );

  contacts
    .command("get <contactId>")
    .description("Fetch full details for a contact")
    .action((contactId: string) =>
      run(async () => {
        const res = await getClient().getContact({ contactId });
        json(res);
      }),
    );

  contacts
    .command("by-outcome <outcomes...>")
    .description(
      "Find contacts by call outcome (e.g. sale interested) to learn the ICP",
    )
    .option(
      "-m, --match <mode>",
      "'any' (default) or 'last' (most recent call only)",
      "any",
    )
    .option("--include-unreachable", "include doNotCall/unsubscribed contacts")
    .option("-p, --page <n>", "page number", (v) => parseInt(v, 10))
    .option("-l, --limit <n>", "page size (max 50)", (v) => parseInt(v, 10))
    .action((outcomes: string[], opts) =>
      run(async () => {
        const res = await getClient().findContactsByOutcome({
          // Raw argv strings; the client's zod schema validates them and throws
          // a friendly error on anything that is not a real CallOutcome.
          outcomes: outcomes as CallOutcome[],
          match: opts.match,
          includeUnreachable: opts.includeUnreachable ?? undefined,
          page: opts.page,
          limit: opts.limit,
        });
        if (wantsJson()) return json(res);
        if (res.contacts.length === 0) {
          warn("No contacts matched those outcomes.");
          return;
        }
        heading(
          `${res.total} contact(s) — ${res.match} match · page ${res.page}/${res.totalPages}`,
        );
        res.contacts.forEach((ct) => {
          line("");
          printOutcomeContact(ct);
        });
      }),
    );

  contacts
    .command("create")
    .description("Create a contact (phone required, E.164)")
    .requiredOption("--phone <e164>", "phone number in E.164 (+14155552671)")
    .option("--name <name>", "display name")
    .option("--first <firstName>", "first name")
    .option("--last <lastName>", "last name")
    .option("--email <email>", "email")
    .option("--title <jobTitle>", "job title")
    .option("--company <organization>", "company name")
    .option("--note <note>", "initial note")
    .action((opts) =>
      run(async () => {
        const res = await getClient().createContact({
          phoneNumber: opts.phone,
          name: opts.name,
          firstName: opts.first,
          lastName: opts.last,
          email: opts.email,
          jobTitle: opts.title,
          organization: opts.company,
          note: opts.note,
        });
        if (wantsJson()) return json(res);
        if (!res.ok || !res.contact) {
          fail(res.error || "Could not create contact.");
          return;
        }
        ok("Contact created.");
        line("");
        printContact(res.contact);
      }),
    );

  contacts
    .command("update <contactId>")
    .description("Update fields on a contact")
    .option("--phone <e164>", "new phone (E.164)")
    .option("--name <name>")
    .option("--first <firstName>")
    .option("--last <lastName>")
    .option("--email <email>")
    .option("--title <jobTitle>")
    .option("--company <organization>")
    .action((contactId: string, opts) =>
      run(async () => {
        const res = await getClient().updateContact({
          contactId,
          phoneNumber: opts.phone,
          name: opts.name,
          firstName: opts.first,
          lastName: opts.last,
          email: opts.email,
          jobTitle: opts.title,
          organization: opts.company,
        });
        if (wantsJson()) return json(res);
        if (!res.ok || !res.contact) {
          fail(res.error || "Could not update contact.");
          return;
        }
        ok("Contact updated.");
        line("");
        printContact(res.contact);
      }),
    );

  contacts
    .command("delete <contactId>")
    .description(
      `${sensitivityTag("destructive")} Soft-delete a contact (double-confirmation required)`,
    )
    .requiredOption(
      "--confirm-phone <e164>",
      "must EXACTLY match the contact's stored phone",
    )
    .option("-y, --yes", "acknowledge this is destructive")
    .action((contactId: string, opts) =>
      run(async () => {
        if (!opts.yes) {
          fail("Refusing to delete without --yes. This is destructive.");
          info("First verify the contact: ringee contacts get <id>");
          info(
            "Then: ringee contacts delete <id> --confirm-phone <storedPhone> --yes",
          );
          process.exitCode = 1;
          return;
        }
        const res = await getClient().deleteContact({
          contactId,
          confirm: true,
          confirmPhoneNumber: opts.confirmPhone,
        });
        if (wantsJson()) return json(res);
        if (!res.ok || !res.deleted) {
          fail(res.error || "Delete was rejected (phone mismatch?).");
          return;
        }
        ok(`Contact deleted (${res.phoneNumber}).`);
      }),
    );
}
