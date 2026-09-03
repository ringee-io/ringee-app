/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma } from "@prisma/client";
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

  it("scopes active updates to the current personal workspace", async () => {
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

    await repository.updateActive({ userId: "user-1" }, "company-1", {
      name: "  ACME   Labs ",
    });

    assert.deepEqual(writes, [
      {
        where: {
          id: "company-1",
          userId: "user-1",
          organizationId: null,
          deletedAt: null,
        },
        data: { name: "  ACME   Labs ", normalizedName: "acme labs" },
      },
    ]);
  });
});

describe("CompanyRepository.isActiveNameConflict", () => {
  const repository = new CompanyRepository({} as never);

  it("recognizes personal and organization normalized-name conflicts", () => {
    const personalConflict = new Prisma.PrismaClientKnownRequestError(
      "duplicate",
      {
        code: "P2002",
        clientVersion: "test",
        meta: { target: ["userId", "normalizedName"] },
      },
    );
    const organizationConflict = new Prisma.PrismaClientKnownRequestError(
      "duplicate",
      {
        code: "P2002",
        clientVersion: "test",
        meta: { target: ["organizationId", "normalizedName"] },
      },
    );

    assert.equal(repository.isActiveNameConflict(personalConflict), true);
    assert.equal(repository.isActiveNameConflict(organizationConflict), true);
  });

  it("does not hide unrelated unique violations", () => {
    const unrelatedConflict = new Prisma.PrismaClientKnownRequestError(
      "duplicate",
      {
        code: "P2002",
        clientVersion: "test",
        meta: { target: ["domain"] },
      },
    );

    assert.equal(repository.isActiveNameConflict(unrelatedConflict), false);
    assert.equal(
      repository.isActiveNameConflict(new Error("duplicate")),
      false,
    );
  });
});
