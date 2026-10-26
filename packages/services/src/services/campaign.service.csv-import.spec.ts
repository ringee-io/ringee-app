/// <reference types="node" />

import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CampaignService } from "./campaign.service";
import { ContactService } from "./contact.service";

const ORG_CTX = { userId: "user-1", organizationId: "org-1" };
const CAMPAIGN_ID = "3f8a1c54-9d2b-4e7a-b1c6-5a0d9e8f7c21";

const PROSPEO_EXPORT = [
  "First name,Last name,Full name,Email,Mobile,Mobile international format,Job title,Company name,Company description",
  'Jean,Dupont,Jean Dupont,jean@acme.fr,+33612345678,+33 6 12 34 56 78,Head of Sales,Acme,"We build things,\nwell."',
  "Ana,Ruiz,Ana Ruiz,ana@beta.es,,,CEO,Beta,",
].join("\n");

function build() {
  const created: Array<{
    phoneNumber: string;
    name: string;
    customFields?: Record<string, string>;
  }> = [];
  const leadContactIds: string[] = [];
  const idByPhone = new Map<string, string>();

  const contactRepo = {
    findByPhoneNumbers: async () => [],
    updateImportedSalesProperties: async () => undefined,
    createMany: async (
      _ctx: unknown,
      rows: Array<{ phoneNumber: string; name: string }>,
    ) => {
      for (const row of rows) {
        created.push(row);
        idByPhone.set(row.phoneNumber, `contact-${idByPhone.size + 1}`);
      }
      return rows.length;
    },
    findByPhone: async (_ctx: unknown, phoneNumber: string) =>
      idByPhone.has(phoneNumber) ? { id: idByPhone.get(phoneNumber) } : null,
  };

  const campaignLeadRepo = {
    findExistingContactIds: async () => [],
    createMany: async (
      _campaignId: string,
      leads: Array<{ contactId: string }>,
    ) => {
      leadContactIds.push(...leads.map((lead) => lead.contactId));
      return leads.length;
    },
  };

  // The real CSV reader; only the company-profile write is stubbed.
  const contactService = Object.assign(
    Object.create(ContactService.prototype),
    { syncImportedCompanyLinkedinProfiles: async () => undefined },
  );

  const service = new CampaignService(
    {
      findById: async () => ({
        id: CAMPAIGN_ID,
        organizationId: "org-1",
        status: "draft",
      }),
    } as never,
    campaignLeadRepo as never,
    {} as never,
    contactRepo as never,
    {} as never,
    contactService as never,
    { releaseLeadsIfRunning: async () => undefined } as never,
  );

  return { service, created, leadContactIds };
}

describe("CampaignService.importLeadsFromCsv", () => {
  it("adds the leads of a Prospeo export uploaded as it was exported", async () => {
    const { service, created, leadContactIds } = build();

    const result = await service.importLeadsFromCsv(
      ORG_CTX,
      CAMPAIGN_ID,
      PROSPEO_EXPORT,
      undefined,
      "prospeo",
    );

    assert.deepEqual(
      created.map((contact) => [contact.phoneNumber, contact.name]),
      [["+33612345678", "Jean Dupont"]],
    );
    assert.deepEqual(leadContactIds, ["contact-1"]);
    assert.equal(
      created[0].customFields?.["Company description"],
      "We build things,\nwell.",
    );
    assert.deepEqual(result.summary, {
      totalRows: 2,
      contactsCreated: 1,
      leadsAdded: 1,
      duplicatesSkipped: 0,
      invalidRows: 1,
      errors: [
        {
          row: 3,
          field: "phoneNumber",
          message: "Required field 'phoneNumber' is missing or empty",
        },
      ],
    });
  });
});
