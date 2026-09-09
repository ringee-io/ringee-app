/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CampaignService } from "./campaign.service";

const ORG_CTX = { userId: "user-1", organizationId: "org-1" };
const CAMPAIGN_ID = "3f8a1c54-9d2b-4e7a-b1c6-5a0d9e8f7c21";

interface BuildOptions {
  campaign?: { id: string; organizationId: string; status: string } | null;
  contactInWorkspace?: boolean;
  /** Rows `createMany` actually inserted — 0 when the lead already existed. */
  inserted?: number;
}

function build(options: BuildOptions = {}) {
  const campaign =
    options.campaign === undefined
      ? { id: CAMPAIGN_ID, organizationId: "org-1", status: "draft" }
      : options.campaign;

  // Every repository call the service makes, in order. The stubs expose only
  // the methods `addContactToCampaign` is allowed to use, so an attempt to
  // touch an existing lead any other way fails the test by throwing.
  const calls: string[] = [];
  const createManyPayloads: Array<Array<{ contactId: string }>> = [];

  const service = new CampaignService(
    {
      findById: async (id: string) => {
        calls.push(`campaign.findById:${id}`);
        return campaign;
      },
    } as never,
    {
      createMany: async (
        campaignId: string,
        leads: Array<{ contactId: string }>,
      ) => {
        calls.push(`lead.createMany:${campaignId}`);
        createManyPayloads.push(leads);
        return options.inserted ?? 1;
      },
      queueAllPending: async (campaignId: string) => {
        calls.push(`lead.queueAllPending:${campaignId}`);
        return 1;
      },
    } as never,
    {} as never,
    {
      findByIdForOwner: async (_ctx: unknown, id: string) => {
        calls.push(`contact.findByIdForOwner:${id}`);
        return options.contactInWorkspace === false
          ? null
          : { id, phoneNumber: "+14155550123" };
      },
    } as never,
    {} as never,
    {} as never,
  );

  return { service, calls, createManyPayloads };
}

describe("CampaignService.addContactToCampaign", () => {
  it("adds the contact as a lead", async () => {
    const { service, calls, createManyPayloads } = build();

    const result = await service.addContactToCampaign(
      ORG_CTX,
      CAMPAIGN_ID,
      "contact-1",
    );

    assert.deepEqual(result, { added: true });
    assert.deepEqual(createManyPayloads, [[{ contactId: "contact-1" }]]);
    assert.deepEqual(calls, [
      `campaign.findById:${CAMPAIGN_ID}`,
      "contact.findByIdForOwner:contact-1",
      `lead.createMany:${CAMPAIGN_ID}`,
      `campaign.findById:${CAMPAIGN_ID}`,
    ]);
  });

  it("queues the new lead when the campaign is already running", async () => {
    const { service, calls } = build({
      campaign: { id: CAMPAIGN_ID, organizationId: "org-1", status: "active" },
    });

    await service.addContactToCampaign(ORG_CTX, CAMPAIGN_ID, "contact-1");

    assert.equal(calls.at(-1), `lead.queueAllPending:${CAMPAIGN_ID}`);
  });

  it("reports a contact that is already a lead without touching it", async () => {
    // What the repository does on a duplicate: `@@unique([campaignId,
    // contactId])` + skipDuplicates inserts nothing and counts nothing.
    const { service, calls, createManyPayloads } = build({ inserted: 0 });

    const result = await service.addContactToCampaign(
      ORG_CTX,
      CAMPAIGN_ID,
      "contact-1",
    );

    assert.deepEqual(result, { added: false });

    // The one write attempted is the insert itself — no update, no delete, no
    // status reset. That is what keeps a re-sync from resetting a lead's
    // attempts and dispositions.
    assert.deepEqual(
      calls.filter((call) => call.startsWith("lead.")),
      [`lead.createMany:${CAMPAIGN_ID}`],
    );
    assert.deepEqual(createManyPayloads, [[{ contactId: "contact-1" }]]);
  });

  it("refuses a campaign that does not exist", async () => {
    const { service, calls } = build({ campaign: null });

    await assert.rejects(
      () => service.addContactToCampaign(ORG_CTX, CAMPAIGN_ID, "contact-1"),
      /Campaign not found/,
    );
    assert.deepEqual(calls, [`campaign.findById:${CAMPAIGN_ID}`]);
  });

  it("refuses a campaign in another organization", async () => {
    const { service, calls } = build({
      campaign: { id: CAMPAIGN_ID, organizationId: "org-2", status: "active" },
    });

    await assert.rejects(
      () => service.addContactToCampaign(ORG_CTX, CAMPAIGN_ID, "contact-1"),
      /Access denied/,
    );
    // The foreign campaign is rejected before the contact is even loaded.
    assert.deepEqual(calls, [`campaign.findById:${CAMPAIGN_ID}`]);
  });

  it("refuses a contact from outside the workspace", async () => {
    const { service, calls } = build({ contactInWorkspace: false });

    await assert.rejects(
      () => service.addContactToCampaign(ORG_CTX, CAMPAIGN_ID, "contact-1"),
      /Contact not found/,
    );
    assert.equal(
      calls.some((call) => call.startsWith("lead.")),
      false,
    );
  });

  it("refuses a personal workspace, which has no campaigns", async () => {
    const { service, calls } = build();

    await assert.rejects(
      () =>
        service.addContactToCampaign(
          { userId: "user-1", organizationId: null },
          CAMPAIGN_ID,
          "contact-1",
        ),
      /Campaigns require an organization/,
    );
    assert.deepEqual(calls, []);
  });
});
