/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CrmCompanySyncService } from "./crm-company-sync.service";

type AnyRecord = Record<string, unknown>;

const connection = {
  id: "connection-1",
  provider: "attio",
} as never;

const ctx = { userId: "user-1", organizationId: "org-1" };

const syncResult = {
  company: { externalId: "external-company-1", externalType: "company" },
  name: "Acme",
  domain: "acme.example",
  industry: "Software",
  size: "11-50",
  phone: "+18005550100",
  website: "https://acme.example",
  customFields: {},
  raw: null,
} as never;

function buildService(forcedUpdateError?: Error) {
  const links: AnyRecord[] = [];
  const nameConflict = new Error("duplicate name");
  const company = {
    id: "company-1",
    userId: "user-1",
    organizationId: "org-1",
    deletedAt: null,
    name: "Local Acme",
    domain: "old.example",
    industry: "Consulting",
    size: "1-10",
    phone: "+18005550999",
    website: "https://old.example",
  };
  const normalizedNameOwners = new Map([
    ["local acme", company.id],
    ["acme", "company-2"],
  ]);

  const companyRepo = {
    updateActive: async (
      updateCtx: typeof ctx,
      id: string,
      data: AnyRecord,
    ) => {
      if (forcedUpdateError) throw forcedUpdateError;

      const isOwned = updateCtx.organizationId
        ? company.organizationId === updateCtx.organizationId
        : company.userId === updateCtx.userId &&
          company.organizationId === null;
      if (company.id !== id || company.deletedAt !== null || !isOwned) {
        throw new Error("company not found in workspace");
      }

      if (typeof data.name === "string") {
        const normalizedName = data.name
          .trim()
          .replace(/\s+/g, " ")
          .toLowerCase();
        const owner = normalizedNameOwners.get(normalizedName);
        if (owner && owner !== company.id) throw nameConflict;
        normalizedNameOwners.set(normalizedName, company.id);
      }

      for (const [field, value] of Object.entries(data)) {
        if (value !== undefined) Object.assign(company, { [field]: value });
      }
      return company;
    },
    isActiveNameConflict: (error: unknown) => error === nameConflict,
  };
  const linkRepo = {
    findByExternalId: async () => ({ companyId: "company-1" }),
    upsertLink: async (input: AnyRecord) => {
      links.push(input);
      return input;
    },
  };

  const service = new CrmCompanySyncService(
    {} as never,
    {} as never,
    companyRepo as never,
    linkRepo as never,
    {} as never,
  );

  return { service, company, links };
}

describe("CrmCompanySyncService.upsertCompany", () => {
  it("preserves the local name and syncs other fields on a name collision", async () => {
    const harness = buildService();

    const result = await harness.service.upsertCompany(
      connection,
      syncResult,
      ctx,
    );

    assert.deepEqual(result, { companyId: "company-1", created: false });
    assert.deepEqual(harness.company, {
      id: "company-1",
      userId: "user-1",
      organizationId: "org-1",
      deletedAt: null,
      name: "Local Acme",
      domain: "acme.example",
      industry: "Software",
      size: "11-50",
      phone: "+18005550100",
      website: "https://acme.example",
    });
    assert.equal(harness.links.length, 1);
    assert.equal(harness.links[0].companyId, "company-1");
  });

  it("rethrows unique violations that are not normalized-name conflicts", async () => {
    const error = new Error("unrelated unique violation");
    const harness = buildService(error);

    await assert.rejects(
      harness.service.upsertCompany(connection, syncResult, ctx),
      (caught) => caught === error,
    );

    assert.equal(harness.links.length, 0);
  });
});
