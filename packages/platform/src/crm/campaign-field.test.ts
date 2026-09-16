import { describe, it, expect } from "vitest";
import { readCrmCampaignField } from "./campaign-field";

const CAMPAIGN_ID = "3f1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

describe("readCrmCampaignField", () => {
  it("returns null when the record carries no campaign field", () => {
    expect(readCrmCampaignField({})).toBeNull();
    expect(readCrmCampaignField({ industry: "SaaS" })).toBeNull();
  });

  it("reads the id whatever the admin called the column", () => {
    for (const key of [
      "campaign",
      "Campaign",
      "CAMPAIGN",
      "Campaign ID",
      "campaign_id",
      "Ringee Campaign",
    ]) {
      expect(readCrmCampaignField({ [key]: CAMPAIGN_ID })).toEqual({
        field: key,
        raw: CAMPAIGN_ID,
        campaignId: CAMPAIGN_ID,
      });
    }
  });

  it("trims what the CRM stored", () => {
    expect(readCrmCampaignField({ campaign: `  ${CAMPAIGN_ID}  ` })).toEqual({
      field: "campaign",
      raw: CAMPAIGN_ID,
      campaignId: CAMPAIGN_ID,
    });
  });

  // Campaign.id is a Postgres uuid: a non-uuid reaching the lookup makes Prisma
  // throw rather than answer "not found", which would fail the contact sync.
  it("reports a value that is not an id without claiming it is one", () => {
    const field = readCrmCampaignField({ Campaign: "Summer Outreach" });
    expect(field).toEqual({
      field: "Campaign",
      raw: "Summer Outreach",
      campaignId: null,
    });
  });

  it("ignores empty and non-scalar values", () => {
    expect(readCrmCampaignField({ campaign: "   " })).toBeNull();
    expect(readCrmCampaignField({ campaign: null })).toBeNull();
    // Odoo many2one tuples ([id, "Name"]) are not a Ringee campaign id.
    expect(readCrmCampaignField({ campaign_id: [4, "Q3 push"] })).toBeNull();
  });

  it("prefers the plainest name when a record carries several", () => {
    const field = readCrmCampaignField({
      ringee_campaign: "2222b2c4-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
      campaign: CAMPAIGN_ID,
    });
    expect(field?.campaignId).toBe(CAMPAIGN_ID);
  });
});
