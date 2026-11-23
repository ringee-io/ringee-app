/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CampaignLeadWriteService } from "./campaign-lead-write.service";
import { CampaignService } from "./campaign.service";
import { ForbiddenException } from "@nestjs/common";

const ORG_CTX = { userId: "user-1", organizationId: "org-1" };
const CAMPAIGN_ID = "3f8a1c54-9d2b-4e7a-b1c6-5a0d9e8f7c21";

interface BuildOptions {
  campaign?: { id: string; organizationId: string; status: string } | null;
  contactInWorkspace?: boolean;
  /** Rows `createMany` actually inserted — 0 when the lead already existed. */
  inserted?: number;
  isMember?: boolean;
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

  const campaignRepo = {
    findById: async (id: string) => {
      calls.push(`campaign.findById:${id}`);
      return campaign;
    },
  } as never;

  const campaignLeadRepo = {
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
  } as never;

  const contactRepo = {
    findByIdForOwner: async (_ctx: unknown, id: string) => {
      calls.push(`contact.findByIdForOwner:${id}`);
      return options.contactInWorkspace === false
        ? null
        : { id, phoneNumber: "+14155550123" };
    },
  } as never;

  // The real boundary, injected as it is in production: these tests go through
  // CampaignService, so they cover the delegation as well as the rules.
  const leadWrites = new CampaignLeadWriteService(
    campaignRepo,
    campaignLeadRepo,
    contactRepo,
  );

  const service = new CampaignService(
    campaignRepo,
    campaignLeadRepo,
    {
      isMember: async (campaignId: string, userId: string) =>
        options.isMember === true &&
        campaignId === CAMPAIGN_ID &&
        userId === ORG_CTX.userId,
    } as never,
    contactRepo,
    {} as never,
    {} as never,
    leadWrites,
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

describe("CampaignService.assertDialableCampaign", () => {
  it("admits the assigned member and refuses another member of the same organization", async () => {
    const { service } = build({
      campaign: { id: CAMPAIGN_ID, organizationId: "org-1", status: "active" },
      isMember: true,
    });
    assert.equal(
      (
        await service.assertDialableCampaign(ORG_CTX, CAMPAIGN_ID, {
          isOrgAdmin: false,
        })
      ).status,
      "active",
    );
    await assert.rejects(
      service.assertDialableCampaign(
        { ...ORG_CTX, userId: "other-user" },
        CAMPAIGN_ID,
        { isOrgAdmin: false },
      ),
      ForbiddenException,
    );
  });
  it("authorizes workspace and membership before rejecting a paused campaign", async () => {
    for (const organizationId of ["org-2", "org-1"]) {
      const { service } = build({
        campaign: { id: CAMPAIGN_ID, organizationId, status: "paused" },
        isMember: false,
      });
      await assert.rejects(
        service.assertDialableCampaign(ORG_CTX, CAMPAIGN_ID, {
          isOrgAdmin: organizationId === "org-2",
        }),
        ForbiddenException,
      );
    }
  });
  it("refuses inactive campaigns before creating an agent that would wait forever", async () => {
    for (const status of ["draft", "paused", "completed", "archived"]) {
      const { service } = build({
        campaign: { id: CAMPAIGN_ID, organizationId: "org-1", status },
      });
      await assert.rejects(
        service.assertDialableCampaign(ORG_CTX, CAMPAIGN_ID, {
          isOrgAdmin: true,
        }),
        /Activate this campaign/,
      );
    }
    const { service } = build({
      campaign: { id: CAMPAIGN_ID, organizationId: "org-1", status: "active" },
    });
    assert.equal(
      (
        await service.assertDialableCampaign(ORG_CTX, CAMPAIGN_ID, {
          isOrgAdmin: true,
        })
      ).status,
      "active",
    );
  });
});
