/**
 * Recovery for an over-broad run of cleanup-placeholder-contacts.js.
 *
 * The first version of that script retired EVERY phone-less CRM contact, on
 * the assumption that such rows are re-derivable sync output. That was wrong:
 * most of them are unique people carrying a name, an email and an Attio link —
 * only the repeated copies were junk. This script puts the unique ones back.
 *
 * What it does, scoped to one soft-delete run (see WINDOW below):
 *   1. Groups the soft-deleted rows by their Attio externalId — the exact
 *      identity of the CRM record. Email is deliberately NOT used as the key:
 *      institutional addresses (poststelle@…, info@…, sekretariat@…) are shared
 *      by genuinely different people, and merging on them loses real contacts.
 *   2. Restores one row per externalId (deletedAt = null), preferring the copy
 *      the sync touched most recently.
 *   3. Leaves the redundant copies soft-deleted — those are the real duplicates.
 *   4. Re-points each CrmContactLink at its restored contact, undoing the
 *      detach step.
 *
 * Usage:
 *   node packages/database/scripts/restore-placeholder-contacts.js --org=<uuid>            # dry run
 *   node packages/database/scripts/restore-placeholder-contacts.js --org=<uuid> --apply
 *   ... --from=<ISO> --to=<ISO>   # override the soft-delete window
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const APPLY = process.argv.includes("--apply");
const arg = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const ORG_ID = arg("org");
const FROM = arg("from");
const TO = arg("to");

if (!ORG_ID) {
  console.error("❌ --org=<uuid> is required.");
  process.exit(1);
}

/**
 * Only rows retired by the bad run are eligible. Without a window this would
 * also resurrect contacts a user deleted on purpose.
 */
const WINDOW = {
  gte: new Date(FROM ?? "2026-08-13T14:44:30.000Z"),
  lte: new Date(TO ?? "2026-08-13T14:44:50.000Z"),
};

const WRITE_CHUNK = 50;

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
}

function externalIdOf(contact) {
  const meta = contact.crmMetadata;
  if (!meta || typeof meta !== "object") return null;
  return typeof meta.externalId === "string" ? meta.externalId : null;
}

/**
 * The copy worth keeping: the one the sync updated most recently, falling back
 * to the oldest row so the original id survives when nothing distinguishes them.
 */
function pickKeeper(rows) {
  return rows.reduce((best, row) => {
    if (row.updatedAt > best.updatedAt) return row;
    if (row.updatedAt < best.updatedAt) return best;
    return row.createdAt < best.createdAt ? row : best;
  });
}

async function main() {
  console.log(
    `\n♻️  Restoring placeholder contacts in org ${ORG_ID} — ` +
      `${APPLY ? "APPLY (writes)" : "DRY RUN (no writes)"}\n` +
      `   window: ${WINDOW.gte.toISOString()} → ${WINDOW.lte.toISOString()}\n`,
  );

  const rows = await prisma.contact.findMany({
    where: {
      organizationId: ORG_ID,
      phoneNumber: "unknown",
      deletedAt: WINDOW,
    },
    select: {
      id: true,
      name: true,
      email: true,
      crmMetadata: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  console.log(`Found ${rows.length} soft-deleted rows in that window.`);
  if (rows.length === 0) {
    console.log("Nothing to restore.\n");
    return;
  }

  // ── Group by CRM identity ──
  const groups = new Map();
  let unkeyed = 0;
  for (const row of rows) {
    const key = externalIdOf(row);
    if (!key) {
      unkeyed++;
      continue;
    }
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const keepers = [...groups.values()].map(pickKeeper);
  const redundant = rows.length - keepers.length - unkeyed;

  console.log(
    `  ${groups.size} distinct Attio records → restoring ${keepers.length} contacts.\n` +
      `  ${redundant} redundant copies stay soft-deleted.` +
      (unkeyed > 0
        ? `\n  ⚠️  ${unkeyed} rows carry no externalId — also restored, see below.`
        : ""),
  );

  // Rows with no CRM identity cannot be deduped safely, so they are all
  // restored rather than silently dropped.
  const unkeyedRows = rows.filter((r) => !externalIdOf(r));
  const toRestore = [...keepers, ...unkeyedRows];

  if (!APPLY) {
    console.log(
      `\n📋 Would restore ${toRestore.length} contacts. Sample:\n` +
        toRestore
          .slice(0, 10)
          .map(
            (c) =>
              `     ${c.id}  ${(c.name ?? "(no name)").padEnd(30).slice(0, 30)}  ${c.email ?? "—"}`,
          )
          .join("\n"),
    );
    console.log("\nRe-run with --apply to write these changes.\n");
    return;
  }

  // ── Restore ──
  let restored = 0;
  let failed = 0;
  for (const batch of chunk(toRestore, WRITE_CHUNK)) {
    const res = await prisma.contact
      .updateMany({
        where: { id: { in: batch.map((c) => c.id) } },
        data: { deletedAt: null },
      })
      .catch((err) => {
        failed += batch.length;
        console.warn(`   ⚠️  batch failed: ${err.message}`);
        return { count: 0 };
      });
    restored += res.count;
  }
  console.log(
    `\n✅ Restored ${restored} contacts${failed ? `, ${failed} failed` : ""}.`,
  );

  // ── Re-attach the CRM links we detached ──
  let relinked = 0;
  for (const contact of toRestore) {
    const externalId = externalIdOf(contact);
    if (!externalId) continue;
    const res = await prisma.crmContactLink
      .updateMany({
        where: { externalId, externalType: "person", contactId: null },
        data: { contactId: contact.id },
      })
      .catch(() => ({ count: 0 }));
    relinked += res.count;
  }
  console.log(`✅ Re-attached ${relinked} CRM links.\n`);
}

main()
  .catch((err) => {
    console.error("❌ Restore failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
