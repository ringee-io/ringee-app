/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { CrmContactSyncService } from "./crm-contact-sync.service";

type AnyRecord = Record<string, unknown>;

const connection = {
  id: "conn-1",
  provider: "attio",
  externalAccountId: "acct-1",
} as never;

const ctx = { userId: "user-1", organizationId: "org-1" };

function syncResult(over: AnyRecord = {}) {
  return {
    contact: { externalId: "attio-person-1", externalType: "person" },
    phones: [],
    emails: [],
    firstName: null,
    lastName: null,
    displayName: null,
    jobTitle: null,
    owner: null,
    company: null,
    customFields: {},
    raw: null,
    ...over,
  } as never;
}

/** Minimal stand-ins for the repositories the service writes through. */
function buildService() {
  const created: AnyRecord[] = [];
  const updated: AnyRecord[] = [];
  const links: AnyRecord[] = [];
  const phones: AnyRecord[] = [];

  const contactRepo = {
    create: async (_ctx: unknown, data: AnyRecord) => {
      created.push(data);
      return { id: `contact-${created.length}`, ...data };
    },
    update: async (id: string, data: AnyRecord) => {
      updated.push({ id, ...data });
      return { id, ...data };
    },
    findByPhone: async () => null,
    findByEmail: async () => null,
    findBasicById: async (id: string) => ({
      id,
      phoneNumber: "unknown",
      name: null,
      email: null,
    }),
  };

  const linkRepo = {
    findByExternalId: async () => null,
    upsertLink: async (input: AnyRecord) => {
      links.push(input);
      return input;
    },
  };

  const phoneRepo = {
    upsert: async (input: AnyRecord) => {
      phones.push(input);
      return input;
    },
  };
  const emailRepo = {
    upsert: async () => ({}),
    findByEmail: async () => [],
  };

  const service = new CrmContactSyncService(
    {} as never,
    {} as never,
    linkRepo as never,
    contactRepo as never,
    phoneRepo as never,
    emailRepo as never,
  );

  return { service, created, updated, links, phones };
}

describe("CrmContactSyncService.upsertContact", () => {
  let harness: ReturnType<typeof buildService>;

  beforeEach(() => {
    harness = buildService();
  });

  it("never writes a placeholder into phoneNumber for a phone-less person", async () => {
    const result = await harness.service.upsertContact(
      connection,
      syncResult({ displayName: "Markus Colombo", emails: ["m@adlatus.ch"] }),
      ctx,
    );

    assert.equal(result.contactId, null);
    assert.equal(result.created, false);
    assert.equal(result.skipped, "no_phone");
    assert.equal(harness.created.length, 0, "no contact row should be written");
  });

  it("drops numbers that are not E.164-able instead of storing them", async () => {
    const result = await harness.service.upsertContact(
      connection,
      syncResult({ phones: ["n/a", "ext. 42"], displayName: "No Number" }),
      ctx,
    );

    assert.equal(result.skipped, "no_phone");
    assert.equal(harness.created.length, 0);
  });

  it("creates a normalized, dialable contact when the CRM has a number", async () => {
    const result = await harness.service.upsertContact(
      connection,
      syncResult({
        phones: ["+49 6691 806580", "+49 6691 806580"],
        displayName: "Schulleiter",
        emails: ["poststelle@melanchthon.de"],
      }),
      ctx,
    );

    assert.equal(result.created, true);
    assert.equal(result.skipped, undefined);
    assert.equal(harness.created.length, 1);
    assert.equal(harness.created[0].phoneNumber, "+496691806580");
    // The repeated number must not produce a second ContactPhone row.
    assert.equal(harness.phones.length, 1);
    // The contact is linked back to the Attio record.
    assert.equal(harness.links[0].externalId, "attio-person-1");
    assert.equal(harness.links[0].contactId, "contact-1");
  });
});
