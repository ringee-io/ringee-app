/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CustomIntegrationInboundService } from "./custom-integration-inbound.service";

const INTEGRATION = {
  id: "integration-1",
  userId: "user-1",
  organizationId: "org-1",
} as never;

const STORED_CONTACT = {
  id: "contact-1",
  phoneNumber: "+14155550123",
} as never;

const CAMPAIGN_ID = "3f8a1c54-9d2b-4e7a-b1c6-5a0d9e8f7c21";

interface BuildOptions {
  /** Contact already known to this integration, resolved through the link. */
  existingContact?: boolean;
  /** Campaign resolution, which runs before anything is written. */
  campaignResolves?: boolean;
  /** What `addContactToCampaign` reports — a new lead by default. */
  leadAdded?: boolean;
  /** Workspace member behind `data.ownerEmail`, when one matches. */
  ownerMember?: { userId: string } | null;
}

function build(options: BuildOptions = {}) {
  const inboundStatuses: Array<{ status: string; error?: string }> = [];
  const campaignCalls: string[] = [];
  const contactWrites: Array<Record<string, unknown>> = [];

  const service = new CustomIntegrationInboundService(
    {
      insertReceived: async () => ({ id: "inbound-1" }),
      markStatus: async (_id: string, status: string, error?: string) => {
        inboundStatuses.push({ status, error });
      },
    } as never,
    {
      findByExternalId: async () =>
        options.existingContact
          ? { id: "link-1", contactId: "contact-1" }
          : null,
      upsert: async () => undefined,
    } as never,
    {
      findByExternalId: async () => null,
      upsert: async () => undefined,
    } as never,
    {
      findById: async () => STORED_CONTACT,
      findByPhone: async () => null,
      create: async (_ctx: unknown, data: Record<string, unknown>) => {
        contactWrites.push(data);
        return STORED_CONTACT;
      },
      update: async (_id: string, data: Record<string, unknown>) => {
        contactWrites.push(data);
        return STORED_CONTACT;
      },
    } as never,
    {} as never,
    {
      assertCampaignForLeadWrite: async (_ctx: unknown, id: string) => {
        campaignCalls.push(`assert:${id}`);
        if (options.campaignResolves === false) {
          throw new Error("Campaign not found");
        }
        return { id };
      },
      addContactToCampaign: async (
        _ctx: unknown,
        campaignId: string,
        contactId: string,
      ) => {
        campaignCalls.push(`add:${campaignId}:${contactId}`);
        return { added: options.leadAdded ?? true };
      },
    } as never,
    {
      organizationMembership: {
        findFirst: async () => options.ownerMember ?? null,
      },
    } as never,
  );

  return { service, inboundStatuses, campaignCalls, contactWrites };
}

function envelope(data: Record<string, unknown>) {
  return {
    event: "contact.upserted",
    eventId: "evt_1",
    occurredAt: "2026-05-23T14:30:00.000Z",
    data: {
      externalId: "ext_contact_42",
      phoneNumber: "+1 (415) 555-0123",
      ...data,
    },
  };
}

describe("contact.upserted campaign membership", () => {
  it("adds the synced contact to the campaign the payload names", async () => {
    const { service, campaignCalls, inboundStatuses } = build();

    const result = await service.handle(
      INTEGRATION,
      envelope({ campaignId: CAMPAIGN_ID }),
    );

    assert.equal(result.status, "processed");
    assert.deepEqual(campaignCalls, [
      `assert:${CAMPAIGN_ID}`,
      `add:${CAMPAIGN_ID}:contact-1`,
    ]);
    assert.equal(inboundStatuses.at(-1)?.status, "processed");
  });

  it("re-syncing a contact that is already a lead changes nothing", async () => {
    const { service, campaignCalls } = build({
      existingContact: true,
      leadAdded: false,
    });

    const result = await service.handle(
      INTEGRATION,
      envelope({ campaignId: CAMPAIGN_ID }),
    );

    assert.equal(result.status, "processed");
    assert.deepEqual(campaignCalls, [
      `assert:${CAMPAIGN_ID}`,
      `add:${CAMPAIGN_ID}:contact-1`,
    ]);
  });

  it("leaves campaigns alone when the payload names none", async () => {
    const { service, campaignCalls } = build();

    const result = await service.handle(INTEGRATION, envelope({}));

    assert.equal(result.status, "processed");
    assert.deepEqual(campaignCalls, []);
  });

  it("rejects a campaignId that is not a UUID before touching campaigns", async () => {
    const { service, campaignCalls, contactWrites } = build();

    const result = await service.handle(
      INTEGRATION,
      envelope({ campaignId: "campaign-42" }),
    );

    assert.equal(result.status, "failed");
    assert.equal(result.message, "data.campaignId must be a UUID");
    assert.deepEqual(campaignCalls, []);
    assert.deepEqual(contactWrites, []);
  });

  it("does not half-sync a contact when the campaign does not resolve", async () => {
    const { service, contactWrites, inboundStatuses } = build({
      campaignResolves: false,
    });

    const result = await service.handle(
      INTEGRATION,
      envelope({ campaignId: CAMPAIGN_ID }),
    );

    assert.equal(result.status, "failed");
    assert.equal(result.message, "Campaign not found");
    assert.deepEqual(contactWrites, []);
    assert.deepEqual(inboundStatuses.at(-1), {
      status: "failed",
      error: "Campaign not found",
    });
  });

  it("never writes campaignId onto the contact itself", async () => {
    const { service, contactWrites } = build();

    await service.handle(INTEGRATION, envelope({ campaignId: CAMPAIGN_ID }));

    assert.equal(contactWrites.length, 1);
    assert.equal(contactWrites[0]?.campaignId, undefined);
  });
});

describe("inbound envelope validation", () => {
  it("reports every envelope problem in one rejection", async () => {
    const { service } = build();

    await assert.rejects(
      () => service.handle(INTEGRATION, { event: "contact.upserted" }),
      /eventId is required; occurredAt is required; data must be an object/,
    );
  });

  it("rejects a body that is not a JSON object", async () => {
    const { service } = build();

    await assert.rejects(
      () => service.handle(INTEGRATION, "not json"),
      /body must be a JSON object/,
    );
  });

  it("reports every missing data field in one answer", async () => {
    const { service, contactWrites } = build();

    const result = await service.handle(INTEGRATION, {
      event: "contact.upserted",
      eventId: "evt_1",
      occurredAt: "2026-05-23T14:30:00.000Z",
      data: {},
    });

    assert.equal(result.status, "failed");
    assert.equal(
      result.message,
      "data.externalId is required; data.phoneNumber is required",
    );
    assert.deepEqual(contactWrites, []);
  });
});

describe("inbound warnings", () => {
  it("tells the sender which fields it ignored", async () => {
    const { service } = build();

    const result = await service.handle(
      INTEGRATION,
      envelope({ campagnId: CAMPAIGN_ID }),
    );

    assert.equal(result.status, "processed");
    assert.deepEqual(result.warnings, [
      "Unknown contact.upserted fields were ignored: campagnId. Check them for typos.",
    ]);
  });

  it("says which country a number without a prefix was read as", async () => {
    const { service, contactWrites } = build();

    const result = await service.handle(
      INTEGRATION,
      envelope({ phoneNumber: "(415) 555-0123" }),
    );

    assert.equal(result.status, "processed");
    assert.equal(contactWrites[0]?.phoneNumber, "+14155550123");
    assert.match(result.warnings?.[0] ?? "", /has no country code/);
  });

  it("normalizes through real numbering plans, not a digit strip", async () => {
    const { service, contactWrites } = build();

    await service.handle(
      INTEGRATION,
      envelope({ phoneNumber: "+34 911 23 45 67" }),
    );

    assert.equal(contactWrites[0]?.phoneNumber, "+34911234567");
  });

  it("fails a number nothing can dial instead of storing it", async () => {
    const { service, contactWrites } = build();

    const result = await service.handle(
      INTEGRATION,
      envelope({ phoneNumber: "n/a" }),
    );

    assert.equal(result.status, "failed");
    assert.match(result.message ?? "", /not a dialable number/);
    assert.deepEqual(contactWrites, []);
  });

  it("warns when ownerEmail matches nobody in the workspace", async () => {
    const { service } = build({ ownerMember: null });

    const result = await service.handle(
      INTEGRATION,
      envelope({ ownerEmail: "nobody@example.com" }),
    );

    assert.equal(result.status, "processed");
    assert.match(result.warnings?.[0] ?? "", /does not match a member/);
  });

  it("stays quiet when the payload is exactly what the spec documents", async () => {
    const { service } = build({ ownerMember: { userId: "user-2" } });

    const result = await service.handle(
      INTEGRATION,
      envelope({
        campaignId: CAMPAIGN_ID,
        ownerEmail: "rep@example.com",
        email: "ada@example.com",
        customFields: { tier: "vip" },
      }),
    );

    assert.equal(result.status, "processed");
    assert.equal(result.warnings, undefined);
  });
});
