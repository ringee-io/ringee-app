/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { CrmContactSyncService } from "./crm-contact-sync.service";

type AnyRecord = Record<string, unknown>;

const connection = {
  id: "conn-1",
  provider: "attio",
  externalAccountId: "acct-1",
} as never;

const ctx = { userId: "user-1", organizationId: "org-1" };

const CAMPAIGN_ID = "3f1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

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
function buildService(
  campaignStubs: {
    /** Throw to stand in for a campaign outside the caller's workspace. */
    assert?: (campaignId: string) => void;
    /** false = the contact was already a lead of that campaign. */
    added?: boolean;
  } = {},
) {
  const created: AnyRecord[] = [];
  const updated: AnyRecord[] = [];
  const links: AnyRecord[] = [];
  const phones: AnyRecord[] = [];
  const campaignLeads: AnyRecord[] = [];

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

  const campaignService = {
    assertCampaignForLeadWrite: async (_ctx: unknown, campaignId: string) => {
      campaignStubs.assert?.(campaignId);
      return { id: campaignId };
    },
    addContactToCampaign: async (
      _ctx: unknown,
      campaignId: string,
      contactId: string,
    ) => {
      campaignLeads.push({ campaignId, contactId });
      return { added: campaignStubs.added ?? true };
    },
  };

  const service = new CrmContactSyncService(
    {} as never,
    {} as never,
    linkRepo as never,
    contactRepo as never,
    phoneRepo as never,
    emailRepo as never,
    campaignService as never,
  );

  return { service, created, updated, links, phones, campaignLeads };
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

describe("CrmContactSyncService campaign field", () => {
  /** A synced person whose CRM record names a campaign. */
  function personInCampaign(value: unknown, field = "campaign") {
    return syncResult({
      phones: ["+496691806580"],
      displayName: "Schulleiter",
      customFields: { [field]: value },
    });
  }

  it("adds the contact to the campaign the CRM record names", async () => {
    const harness = buildService();

    const result = await harness.service.upsertContact(
      connection,
      personInCampaign(CAMPAIGN_ID),
      ctx,
    );

    assert.deepEqual(harness.campaignLeads, [
      { campaignId: CAMPAIGN_ID, contactId: "contact-1" },
    ]);
    assert.deepEqual(result.campaign, {
      field: "campaign",
      value: CAMPAIGN_ID,
      status: "added",
      campaignId: CAMPAIGN_ID,
    });
  });

  it("reports a re-synced lead as already a member, leaving it untouched", async () => {
    const harness = buildService({ added: false });

    const result = await harness.service.upsertContact(
      connection,
      personInCampaign(CAMPAIGN_ID, "Campaign"),
      ctx,
    );

    assert.equal(result.campaign?.status, "already_member");
  });

  // The contact is the point of the sync: a campaign value nobody can resolve
  // must never cost the workspace the person it was written on.
  it("still syncs the contact when the value is not a campaign id", async () => {
    const harness = buildService();

    const result = await harness.service.upsertContact(
      connection,
      personInCampaign("Summer Outreach"),
      ctx,
    );

    assert.equal(result.contactId, "contact-1");
    assert.equal(result.created, true);
    assert.equal(result.campaign?.status, "not_an_id");
    assert.equal(harness.campaignLeads.length, 0);
  });

  it("still syncs the contact when the campaign is not in the workspace", async () => {
    const harness = buildService({
      assert: () => {
        throw new NotFoundException("Campaign not found");
      },
    });

    const result = await harness.service.upsertContact(
      connection,
      personInCampaign(CAMPAIGN_ID),
      ctx,
    );

    assert.equal(result.contactId, "contact-1");
    assert.equal(result.campaign?.status, "not_found");
    assert.equal(harness.campaignLeads.length, 0);
  });

  // The workspace gate rejects a campaign that exists but belongs to someone
  // else with a Forbidden, not a NotFound; both are data, not sync failures.
  it("still syncs the contact when the campaign belongs to another workspace", async () => {
    const harness = buildService({
      assert: () => {
        throw new ForbiddenException("Access denied");
      },
    });

    const result = await harness.service.upsertContact(
      connection,
      personInCampaign(CAMPAIGN_ID),
      ctx,
    );

    assert.equal(result.contactId, "contact-1");
    assert.equal(result.campaign?.status, "not_found");
    assert.equal(result.campaign?.campaignId, CAMPAIGN_ID);
    assert.equal(harness.campaignLeads.length, 0);
  });

  it("does not reach for a campaign in a personal workspace", async () => {
    const harness = buildService({
      assert: () => assert.fail("campaigns are organization-only"),
    });

    const result = await harness.service.upsertContact(
      connection,
      personInCampaign(CAMPAIGN_ID),
      { userId: "user-1", organizationId: null },
    );

    assert.equal(result.contactId, "contact-1");
    assert.equal(result.campaign?.status, "personal_workspace");
  });

  it("leaves a record without a campaign field alone", async () => {
    const harness = buildService({
      assert: () => assert.fail("nothing to resolve"),
    });

    const result = await harness.service.upsertContact(
      connection,
      syncResult({ phones: ["+496691806580"], displayName: "Schulleiter" }),
      ctx,
    );

    assert.equal(result.campaign, undefined);
    assert.equal(harness.campaignLeads.length, 0);
  });

  // A database failure is not "no such campaign" — it belongs to the caller.
  it("propagates an unexpected lookup failure", async () => {
    const harness = buildService({
      assert: () => {
        throw new Error("connection terminated unexpectedly");
      },
    });

    await assert.rejects(
      () =>
        harness.service.upsertContact(
          connection,
          personInCampaign(CAMPAIGN_ID),
          ctx,
        ),
      /connection terminated unexpectedly/,
    );
  });
});
