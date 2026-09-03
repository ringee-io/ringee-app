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

function buildService(updateError: Error, isActiveNameConflict: boolean) {
  const updates: AnyRecord[] = [];
  const links: AnyRecord[] = [];

  const companyRepo = {
    update: async (id: string, data: AnyRecord) => {
      updates.push({ id, data });
      if (updates.length === 1) throw updateError;
      return { id, ...data };
    },
    isActiveNameConflict: () => isActiveNameConflict,
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

  return { service, updates, links };
}

describe("CrmCompanySyncService.upsertCompany", () => {
  it("preserves the local name and syncs other fields on a name collision", async () => {
    const harness = buildService(new Error("duplicate name"), true);

    const result = await harness.service.upsertCompany(
      connection,
      syncResult,
      ctx,
    );

    assert.deepEqual(result, { companyId: "company-1", created: false });
    assert.equal(harness.updates.length, 2);
    assert.equal(
      (harness.updates[0].data as AnyRecord).name,
      "Acme",
      "the first update should try to apply the CRM name",
    );
    assert.equal("name" in (harness.updates[1].data as AnyRecord), false);
    assert.equal((harness.updates[1].data as AnyRecord).domain, "acme.example");
    assert.equal(harness.links.length, 1);
    assert.equal(harness.links[0].companyId, "company-1");
  });

  it("rethrows unique violations that are not normalized-name conflicts", async () => {
    const error = new Error("unrelated unique violation");
    const harness = buildService(error, false);

    await assert.rejects(
      harness.service.upsertCompany(connection, syncResult, ctx),
      (caught) => caught === error,
    );

    assert.equal(harness.updates.length, 1);
    assert.equal(harness.links.length, 0);
  });
});
