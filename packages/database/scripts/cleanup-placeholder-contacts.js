/**
 * Retires the contact rows left behind by the CRM sync placeholder-phone bug.
 *
 * Before the fix, a CRM person with no phone number was imported with the
 * literal string "unknown" in Contact.phoneNumber. Those rows are uncallable,
 * never match an inbound call event, and — because dedup keyed on the phone —
 * the same CRM person was written over and over, producing large numbers of
 * duplicates that bury the real contacts in search.
 *
 * ── Safety model ────────────────────────────────────────────────────────────
 * The script NEVER merges contacts and NEVER deletes a child row. It only
 * soft-deletes placeholder contacts that carry no history of their own, so
 * there is nothing to lose by construction:
 *
 *   • A placeholder with any call, note, meeting, callback, campaign lead,
 *     message, inbox thread, call-session item, enrichment job, tag, custom
 *     field value or custom-integration link is LEFT UNTOUCHED and reported.
 *   • Everything else is pure sync output — re-derivable from the CRM at any
 *     time — and gets deletedAt stamped on it.
 *
 * Duplicates need no merge step under that rule: if every copy is junk they
 * are all retired together, and if one copy carries the history that copy is
 * the one that survives while its junk twins disappear.
 *
 * Soft delete, never hard delete: the relations that cascade on delete
 * (notes, meetings, tags, campaign leads…) are therefore never touched, and
 * the rows stay recoverable by clearing deletedAt.
 *
 * CrmContactLink.contactId is cleared for retired rows so the link keeps
 * mapping the CRM record but a later sync recreates the contact properly
 * instead of silently updating a soft-deleted ghost.
 *
 * Usage:
 *   node packages/database/scripts/cleanup-placeholder-contacts.js            # dry run
 *   node packages/database/scripts/cleanup-placeholder-contacts.js --apply    # write
 *   node packages/database/scripts/cleanup-placeholder-contacts.js --apply --org=<uuid>
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const APPLY = process.argv.includes("--apply");
const ORG_ARG = process.argv.find((a) => a.startsWith("--org="));
const ORG_ID = ORG_ARG ? ORG_ARG.slice("--org=".length) : null;

/** Values that were written into phoneNumber but are not dialable numbers. */
const PLACEHOLDERS = ["unknown", "Unknown", "UNKNOWN", "n/a", "N/A", ""];

/** Postgres parameter limits — chunk every `IN (...)` we build. */
const QUERY_CHUNK = 1000;
const WRITE_CHUNK = 50;

const scope = {
  deletedAt: null,
  phoneNumber: { in: PLACEHOLDERS },
  ...(ORG_ID ? { organizationId: ORG_ID } : {}),
};

/**
 * Anything a human could have created or that records what happened. A
 * placeholder contact holding even one of these is never touched.
 *
 * Deliberately excluded, because the CRM sync writes them itself and they
 * carry no independent history: ContactPhone, ContactEmail, ContactAffiliation,
 * ContactSocialLink, CrmContactLink.
 */
const HISTORY_RELATIONS = [
  "call",
  "contactNote",
  "meeting",
  "callbackTask",
  "campaignLead",
  "message",
  "inboxThread",
  "callSessionItem",
  "enrichmentJob",
  "contactTag",
  "contactCustomFieldValue",
  "customIntegrationContactLink",
];

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
}

/**
 * Contact ids that own at least one row in any history relation, plus a
 * per-relation tally for the report.
 */
async function findContactsWithHistory(ids) {
  const busy = new Set();
  const tally = {};

  for (const relation of HISTORY_RELATIONS) {
    let hits = 0;
    for (const slice of chunk(ids, QUERY_CHUNK)) {
      const rows = await prisma[relation].groupBy({
        by: ["contactId"],
        where: { contactId: { in: slice } },
        _count: { _all: true },
      });
      for (const row of rows) {
        if (!row.contactId) continue;
        busy.add(row.contactId);
        hits += row._count._all;
      }
    }
    if (hits > 0) tally[relation] = hits;
  }

  return { busy, tally };
}

function sample(contacts, n = 10) {
  return contacts
    .slice(0, n)
    .map(
      (c) =>
        `     ${c.id}  ${(c.name ?? "(no name)").padEnd(32).slice(0, 32)}  ${
          c.email ?? "—"
        }`,
    )
    .join("\n");
}

async function main() {
  console.log(
    `\n🔎 Placeholder contacts${ORG_ID ? ` in org ${ORG_ID}` : ""} — ` +
      `${APPLY ? "APPLY (writes)" : "DRY RUN (no writes)"}\n`,
  );

  const contacts = await prisma.contact.findMany({
    where: scope,
    select: {
      id: true,
      name: true,
      email: true,
      phoneNumber: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  if (contacts.length === 0) {
    console.log("✅ Nothing to clean.\n");
    return;
  }

  console.log(`Found ${contacts.length} placeholder contacts.`);

  const ids = contacts.map((c) => c.id);
  const { busy, tally } = await findContactsWithHistory(ids);

  const keep = contacts.filter((c) => busy.has(c.id));
  const retire = contacts.filter((c) => !busy.has(c.id));

  if (keep.length > 0) {
    console.log(
      `\n🛡  Keeping ${keep.length} placeholder contacts that carry history ` +
        `(${Object.entries(tally)
          .map(([k, v]) => `${k}=${v}`)
          .join(", ")}).\n` +
        `   These are left completely untouched — review them by hand:\n` +
        sample(keep),
    );
  }

  console.log(`\n🧹 ${retire.length} placeholder contacts carry no history.`);

  if (retire.length === 0) {
    console.log("   Nothing to retire.\n");
    return;
  }

  if (!APPLY) {
    console.log(`   Would soft-delete these:\n${sample(retire)}`);
    console.log("\nRe-run with --apply to write these changes.\n");
    return;
  }

  const retireIds = retire.map((c) => c.id);

  // Detach the CRM links first: leaving contactId pointing at a soft-deleted
  // row would make the next sync update the ghost instead of recreating the
  // contact once the CRM record finally has a phone number.
  let detached = 0;
  for (const slice of chunk(retireIds, QUERY_CHUNK)) {
    const res = await prisma.crmContactLink.updateMany({
      where: { contactId: { in: slice } },
      data: { contactId: null },
    });
    detached += res.count;
  }
  if (detached > 0) console.log(`   ↪︎ detached ${detached} CRM links.`);

  // Contact carries @@unique([userId, phoneNumber, deletedAt]). A single
  // updateMany timestamp would make every placeholder row of a given user
  // collide on that key, so each row gets its own deletedAt.
  const base = Date.now();
  let deleted = 0;
  let failed = 0;

  for (const [batchIndex, batch] of chunk(retire, WRITE_CHUNK).entries()) {
    await Promise.all(
      batch.map((c, j) =>
        prisma.contact
          .update({
            where: { id: c.id },
            data: { deletedAt: new Date(base + batchIndex * WRITE_CHUNK + j) },
          })
          .then(() => {
            deleted++;
          })
          .catch((err) => {
            failed++;
            console.warn(`   ⚠️  ${c.id}: ${err.message}`);
          }),
      ),
    );
  }

  console.log(
    `\n✅ Soft-deleted ${deleted} placeholder contacts` +
      `${failed > 0 ? `, ${failed} failed` : ""}.\n`,
  );
}

main()
  .catch((err) => {
    console.error("❌ Cleanup failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
