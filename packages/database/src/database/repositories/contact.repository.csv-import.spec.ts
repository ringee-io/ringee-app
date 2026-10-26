import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";
import { Prisma, PrismaClient } from "@prisma/client";
import { ContactRepository } from "./contact.repository";

// Explicit opt-in; never use the application's database for an import test.
// Every fixture lives in a temporary table dropped with its transaction.
const url = process.env.RINGEE_CONTACT_IMPORT_TEST_DATABASE_URL;

describe("CSV contact custom fields in PostgreSQL", { skip: !url }, () => {
  const prisma = new PrismaClient({ datasourceUrl: url });
  const userId = randomUUID();
  const organizationId = randomUUID();
  const otherOrganizationId = randomUUID();
  const phoneNumber = "+14155552671";

  after(() => prisma.$disconnect());

  async function withContacts(
    run: (
      repo: ContactRepository,
      tx: Prisma.TransactionClient,
    ) => Promise<void>,
  ) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        CREATE TEMP TABLE "Contact" (
          "id" uuid PRIMARY KEY,
          "userId" uuid NOT NULL,
          "organizationId" uuid,
          "phoneNumber" text NOT NULL,
          "customFields" jsonb,
          "deletedAt" timestamp,
          "updatedAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ON COMMIT DROP
      `;
      const repo = new ContactRepository({
        $executeRaw: tx.$executeRaw.bind(tx),
        $transaction: (operations: Prisma.PrismaPromise<unknown>[]) =>
          Promise.all(operations),
      } as never);
      await run(repo, tx);
    });
  }

  it("merges a reimport into stored context, retaining fields absent from the file", async () => {
    await withContacts(async (repo, tx) => {
      const id = randomUUID();
      await tx.$executeRaw`
        INSERT INTO "Contact" ("id", "userId", "organizationId", "phoneNumber", "customFields")
        VALUES (${id}::uuid, ${userId}::uuid, ${organizationId}::uuid, ${phoneNumber},
          '{"Budget":"Old budget","CRM context":{"tier":"enterprise"},"Score":0}'::jsonb)
      `;

      await repo.updateImportedSalesProperties({ userId, organizationId }, [
        {
          phoneNumber,
          customFields: { Budget: "$50,000", Need: "Reporting\nAutomation" },
        },
      ]);
      // A later file with blank/absent custom columns must not erase them.
      await repo.updateImportedSalesProperties({ userId, organizationId }, [
        { phoneNumber, customFields: {} },
      ]);

      const [contact] = await tx.$queryRaw<
        Array<{ customFields: Prisma.JsonValue }>
      >`SELECT "customFields" FROM "Contact" WHERE "id" = ${id}::uuid`;
      assert.deepEqual(contact.customFields, {
        Budget: "$50,000",
        "CRM context": { tier: "enterprise" },
        Score: 0,
        Need: "Reporting\nAutomation",
      });
    });
  });

  it("keeps organization, personal and deleted contacts isolated for the same number", async () => {
    await withContacts(async (repo, tx) => {
      for (const [scope, org, deleted] of [
        ["personal", null, null],
        ["organization", organizationId, null],
        ["other", otherOrganizationId, null],
        ["deleted", organizationId, new Date("2026-10-01")],
      ] as const) {
        await tx.$executeRaw`
          INSERT INTO "Contact" ("id", "userId", "organizationId", "phoneNumber", "customFields", "deletedAt")
          VALUES (${randomUUID()}::uuid, ${userId}::uuid, ${org}::uuid, ${phoneNumber},
            ${JSON.stringify({ Scope: scope })}::jsonb, ${deleted})
        `;
      }

      await repo.updateImportedSalesProperties({ userId, organizationId }, [
        { phoneNumber, customFields: { Need: "Organization needs" } },
      ]);
      await repo.updateImportedSalesProperties(
        { userId, organizationId: null },
        [{ phoneNumber, customFields: { Need: "Personal needs" } }],
      );

      const rows = await tx.$queryRaw<
        Array<{ customFields: Record<string, string> }>
      >`SELECT "customFields" FROM "Contact"`;
      const fields = Object.fromEntries(
        rows.map((row) => [row.customFields.Scope, row.customFields]),
      );
      assert.deepEqual(fields, {
        personal: { Scope: "personal", Need: "Personal needs" },
        organization: { Scope: "organization", Need: "Organization needs" },
        other: { Scope: "other" },
        deleted: { Scope: "deleted" },
      });
    });
  });
});
