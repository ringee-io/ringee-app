/**
 * Removes the DUPLICATE contact rows left behind by the CRM sync
 * placeholder-phone bug.
 *
 * Before the fix, a CRM person with no phone number was imported with the
 * literal string "unknown" in Contact.phoneNumber. Because dedup keyed on the
 * phone, and every such row carried the same phone, nothing ever matched and
 * the same CRM person was written over and over.
 *
 * ── What this does and does NOT do ──────────────────────────────────────────
 * It removes only the redundant COPIES. One row per CRM record always
 * survives. A phone-less contact is still a real person with a name, an email
 * and a CRM link — it is simply not dialable yet — so retiring all of them
 * would destroy the directory. (An earlier version of this script did exactly
 * that; see restore-placeholder-contacts.js.)
 *
 * Identity is the CRM externalId, never the email. Shared mailboxes
 * (poststelle@…, info@…, sekretariat@…) belong to several different people,
 * so email is not an identity here.
 *
 * Safety rules:
 *   • A copy holding any call, note, meeting, callback, campaign lead,
 *     message, inbox thread, call-session item, enrichment job, tag, custom
 *     field value or custom-integration link is never retired — if a group
 *     has such a copy, that copy is the one kept.
 *   • Rows with no externalId cannot be deduped safely and are left alone.
 *   • Soft delete only, so the relations that cascade on hard delete (notes,
 *     meetings, tags, campaign leads…) are never touched and every change is
 *     reversible by clearing deletedAt.
 *   • Retired copies get their CrmContactLink detached so a later sync never
 *     updates a soft-deleted ghost.
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

function externalIdOf(contact) {
  const meta = contact.crmMetadata;
  if (!meta || typeof meta !== "object") return null;
  return typeof meta.externalId === "string" ? meta.externalId : null;
}

/**
 * Which copy of a CRM record to keep: history wins over everything, then the
 * most recently synced row, then the original.
 */
function pickKeeper(rows, busy) {
  return rows.reduce((best, row) => {
    const rowBusy = busy.has(row.id);
    const bestBusy = busy.has(best.id);
    if (rowBusy !== bestBusy) return rowBusy ? row : best;
    if (row.updatedAt > best.updatedAt) return row;
    if (row.updatedAt < best.updatedAt) return best;
    return row.createdAt < best.createdAt ? row : best;
  });
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
      crmMetadata: true,
      userId: true,
      organizationId: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  if (contacts.length === 0) {
    console.log("✅ Nothing to clean.\n");
    return;
  }

  console.log(`Found ${contacts.length} placeholder contacts.`);

  // ── Group by CRM identity. Rows without one are never touched. ──
  const groups = new Map();
  let unkeyed = 0;
  for (const c of contacts) {
    const key = externalIdOf(c);
    if (!key) {
      unkeyed++;
      continue;
    }
    const groupKey = `${c.organizationId ?? c.userId}|${key}`;
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(c);
  }

  const dupeGroups = [...groups.values()].filter((g) => g.length > 1);
  console.log(
    `  ${groups.size} distinct CRM records; ` +
      `${dupeGroups.length} of them have more than one copy.` +
      (unkeyed > 0
        ? `\n  ${unkeyed} rows have no externalId — left alone.`
        : ""),
  );

  if (dupeGroups.length === 0) {
    console.log("\n✅ No duplicates to remove.\n");
    return;
  }

  // History decides which copy survives, so it must be known before choosing.
  const dupeIds = dupeGroups.flat().map((c) => c.id);
  const { busy, tally } = await findContactsWithHistory(dupeIds);

  const retire = [];
  for (const group of dupeGroups) {
    const keeper = pickKeeper(group, busy);
    for (const row of group) {
      // Never retire a copy that carries history of its own, even a losing one.
      if (row.id !== keeper.id && !busy.has(row.id)) retire.push(row);
    }
  }

  const protectedCopies = dupeIds.length - dupeGroups.length - retire.length;
  console.log(
    `\n🛡  Keeping ${dupeGroups.length} winners` +
      (protectedCopies > 0
        ? ` plus ${protectedCopies} extra copies that carry history ` +
          `(${Object.entries(tally)
            .map(([k, v]) => `${k}=${v}`)
            .join(", ")}) — review those by hand.`
        : "."),
  );
  console.log(`\n🧹 ${retire.length} redundant copies can be retired.`);

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
