import { Command } from "commander";
import type { LeadCandidate } from "@ringee-io/agent";
import { getClient, run } from "../client.js";
import { c, fail, heading, info, json, kv, line, ok, sensitivityTag, wantsJson, warn } from "../ui.js";

const list = (v: string, acc: string[] = []) => {
  acc.push(...v.split(",").map((s) => s.trim()).filter(Boolean));
  return acc;
};

function printCandidate(ld: LeadCandidate, i: number): void {
  const p = ld.person;
  line(
    `${c.gray(String(i + 1).padStart(2))}. ${c.bold(p.fullName || "—")}` +
      (p.jobTitle ? c.dim(`  ${p.jobTitle}`) : ""),
  );
  const company = ld.company?.name ? `${ld.company.name}` : "";
  const loc = p.location ? ` · ${p.location}` : "";
  if (company || loc) line(`    ${c.gray(`${company}${loc}`)}`);
  const flags = [
    p.emailsAvailable ? c.green("email") : c.gray("no email"),
    p.phonesAvailable ? c.green("phone") : c.gray("no phone"),
  ].join(" · ");
  line(`    ${flags}   ${c.gray(`id: ${ld.externalId}`)}`);
}

export function registerLeads(program: Command): void {
  const leads = program
    .command("leads")
    .description("Prospect leads (Apollo/Prospeo) and convert them to contacts");

  leads
    .command("search")
    .description("Search for leads — returns a jobId. Candidates are NOT contacts yet.")
    .option("--provider <name>", "apollo | prospeo")
    .option("--keywords <text>")
    .option("--title <t>", "job title (repeatable / comma-separated)", list)
    .option("--seniority <s>", "seniority (repeatable)", list)
    .option("--department <d>", "department (repeatable)", list)
    .option("--industry <i>", "industry (repeatable)", list)
    .option("--country <c>", "person country (repeatable)", list)
    .option("--city <c>", "person city (repeatable)", list)
    .option("--company <name>", "company name (repeatable)", list)
    .option("--domain <d>", "company domain (repeatable)", list)
    .option("--has-email", "only leads with an email")
    .option("--has-phone", "only leads with a phone")
    .option("--page <n>", "page", (v) => parseInt(v, 10))
    .option("--per-page <n>", "results per page (max 25)", (v) => parseInt(v, 10))
    .action((opts) =>
      run(async () => {
        const res = await getClient().searchLeads({
          provider: opts.provider,
          keywords: opts.keywords,
          jobTitles: opts.title,
          seniorities: opts.seniority,
          departments: opts.department,
          industries: opts.industry,
          personCountries: opts.country,
          personCities: opts.city,
          companyNames: opts.company,
          companyDomains: opts.domain,
          hasEmail: opts.hasEmail,
          hasPhone: opts.hasPhone,
          page: opts.page,
          perPage: opts.perPage,
        });
        if (wantsJson()) return json(res);
        heading(`${res.total} lead(s) via ${res.provider}${res.cached ? c.gray(" (cached)") : ""}`);
        info(`jobId: ${res.jobId}  —  use it to reveal or import`);
        if (res.results.length === 0) {
          warn("No candidates on this page.");
          return;
        }
        line("");
        res.results.forEach(printCandidate);
        line("");
        line(c.dim("Reveal:  ringee leads reveal <jobId> <externalId> --yes"));
        line(c.dim("Import:  ringee leads import <jobId> <externalId...>"));
      }),
    );

  leads
    .command("reveal <jobId> <externalId>")
    .description(`${sensitivityTag("sensitive")} Unlock email/phone for one candidate (spends credits)`)
    .option("--phone", "also reveal a mobile phone (extra credits)")
    .option("-y, --yes", "confirm the credit spend")
    .action((jobId: string, externalId: string, opts) =>
      run(async () => {
        if (!opts.yes) {
          fail("Revealing a lead spends provider credits. Re-run with --yes to confirm.");
          process.exitCode = 1;
          return;
        }
        const res = await getClient().revealLead({
          jobId,
          externalId,
          revealPhone: Boolean(opts.phone),
        });
        if (wantsJson()) return json(res);
        ok(`Revealed ${res.person.fullName || "lead"} → contact ${res.contactId}`);
        kv("emails", res.person.emails.join(", "));
        kv("phones", res.person.phones.join(", "));
        kv("email new", res.emailRevealed);
        kv("phone new", res.phoneRevealed);
      }),
    );

  leads
    .command("import <jobId> <externalIds...>")
    .description("Bulk-import selected candidates as contacts (phone dedup)")
    .action((jobId: string, externalIds: string[]) =>
      run(async () => {
        const res = await getClient().importLeadsAsContacts({ jobId, externalIds });
        if (wantsJson()) return json(res);
        if (!res.ok) {
          fail(res.error || "Import failed.");
          return;
        }
        ok(`Imported ${res.imported} contact(s).`);
        if (res.duplicates) kv("duplicates", res.duplicates);
        if (res.contactIds.length) line(c.dim(`  ${res.contactIds.join(", ")}`));
      }),
    );
}
