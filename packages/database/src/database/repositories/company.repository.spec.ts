/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CompanyRepository } from "./company.repository";

interface CapturedQuery {
  sql: string;
  values: unknown[];
}

describe("CompanyRepository.upsertActiveByName", () => {
  it("uses the organization-scoped active-row conflict target", async () => {
    const queries: CapturedQuery[] = [];
    const company = { id: "company-1" };
    const prisma = {
      $queryRaw: async (query: CapturedQuery) => {
        queries.push(query);
        return [company];
      },
    };
    const repository = new CompanyRepository(prisma as never);

    const result = await repository.upsertActiveByName(
      {
        userId: "00000000-0000-0000-0000-000000000001",
        organizationId: "00000000-0000-0000-0000-000000000002",
      },
      {
        name: "  Acme   Corp  ",
        website: "   ",
        linkedinUrl: "https://linkedin.com/company/acme",
        source: "csv_import",
      },
    );

    assert.equal(result, company);
    assert.equal(queries.length, 1);
    assert.match(
      queries[0].sql,
      /ON CONFLICT \("organizationId", "normalizedName"\)/,
    );
    assert.match(
      queries[0].sql,
      /"website" = COALESCE\(EXCLUDED\."website", "Company"\."website"\)/,
    );
    assert.deepEqual(queries[0].values.slice(1), [
      "Acme   Corp",
      "acme corp",
      null,
      "https://linkedin.com/company/acme",
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000002",
      "csv_import",
    ]);
  });

  it("uses the personal active-row conflict target", async () => {
    const queries: CapturedQuery[] = [];
    const prisma = {
      $queryRaw: async (query: CapturedQuery) => {
        queries.push(query);
        return [{ id: "company-1" }];
      },
    };
    const repository = new CompanyRepository(prisma as never);

    await repository.upsertActiveByName(
      { userId: "00000000-0000-0000-0000-000000000001" },
      {
        name: "Acme",
        website: "https://acme.example",
        linkedinUrl: "https://linkedin.com/company/acme",
      },
    );

    assert.match(queries[0].sql, /ON CONFLICT \("userId", "normalizedName"\)/);
    assert.match(queries[0].sql, /"organizationId" IS NULL/);
  });
});

describe("CompanyRepository normalized names", () => {
  it("stores normalizedName when creating a company", async () => {
    const writes: unknown[] = [];
    const prisma = {
      company: {
        create: async (input: unknown) => {
          writes.push(input);
          return { id: "company-1" };
        },
      },
    };
    const repository = new CompanyRepository(prisma as never);

    await repository.create(
      { userId: "00000000-0000-0000-0000-000000000001" },
      { name: "  Acme   Corp  " },
    );

    assert.equal(
      (writes[0] as { data: { normalizedName: string } }).data.normalizedName,
      "acme corp",
    );
  });

  it("keeps normalizedName aligned when updating the name", async () => {
    const writes: unknown[] = [];
    const prisma = {
      company: {
        update: async (input: unknown) => {
          writes.push(input);
          return { id: "company-1" };
        },
      },
    };
    const repository = new CompanyRepository(prisma as never);

    await repository.update("company-1", { name: "  ACME   Labs " });

    assert.deepEqual(writes, [
      {
        where: { id: "company-1" },
        data: { name: "  ACME   Labs ", normalizedName: "acme labs" },
      },
    ]);
  });
});
