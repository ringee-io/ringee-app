/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { NumberPricingCatalogService } from "./number-pricing-catalog.service";

type SearchCall = { countryCode: string; numberType?: string };

function build(options?: {
  /** Numbers returned per `${countryCode}:${numberType}`; missing = none. */
  inventory?: Record<
    string,
    Array<{ monthly: number; locality?: string; sms?: boolean }>
  >;
  /** The carrier's published list price per `${countryCode}:${numberType}`. */
  listPrices?: Record<string, { monthly: number; upfront?: number | null }>;
  /** Keys whose first search answers empty before the inventory shows up. */
  emptyFirstAnswer?: string[];
  requirementsThrow?: boolean;
}) {
  const inventory = options?.inventory ?? {};
  const emptyFirstAnswer = new Set(options?.emptyFirstAnswer ?? []);
  const searches: SearchCall[] = [];

  const telephony = {
    getNumberCoverage: async () => [
      {
        countryCode: "GB",
        countryName: "United Kingdom",
        region: "EMEA",
        // "national" is covered by the carrier but not sold by Ringee.
        numberTypes: ["local", "mobile", "national"],
      },
    ],
    searchAvailableNumbers: async (params: SearchCall) => {
      searches.push(params);
      const key = `${params.countryCode}:${params.numberType}`;
      if (emptyFirstAnswer.delete(key)) return [];
      const numbers = inventory[key];
      return (numbers ?? []).map((number, index) => ({
        phoneNumber: `+4420000000${index}`,
        countryCode: params.countryCode,
        locality: number.locality ?? "LONDON",
        numberType: params.numberType,
        capabilities: {
          voice: true,
          sms: number.sms ?? false,
          mms: false,
          fax: false,
          emergency: false,
          hdVoice: false,
          internationalSms: false,
        },
        costInformation: {
          currency: "USD" as const,
          monthlyCost: number.monthly,
          upfrontCost: number.monthly,
        },
      }));
    },
    getNumberListPrices: async () =>
      Object.entries(options?.listPrices ?? {}).map(([key, price]) => {
        const [countryCode, numberType] = key.split(":");
        return {
          countryCode,
          numberType,
          currency: "USD",
          monthlyCost: price.monthly,
          upfrontCost: price.upfront ?? null,
        };
      }),
    getRegulatoryRequirements: async () => {
      if (options?.requirementsThrow) throw new Error("provider unreachable");
      return {
        countryCode: "GB",
        phoneNumberType: "local",
        action: "ordering",
        requirementsMet: false,
        requirements: [
          {
            id: "req-1",
            name: "Proof of Address",
            description: "A recent utility bill.",
            fieldType: "document",
            example: "A bill from the last 3 months.",
          },
        ],
      };
    },
  };

  const rateService = {
    listRates: async () => [
      {
        countryCode: "GB",
        countryName: "United Kingdom",
        currency: "USD",
        mobileMinRatePerMinute: 0.05,
        mobileMaxRatePerMinute: 0.2,
        mobileAvgRatePerMinute: 0.1,
        mobileRouteCount: 12,
        landlineMinRatePerMinute: 0.011,
        landlineMaxRatePerMinute: 1.15,
        landlineAvgRatePerMinute: 0.2,
        landlineRouteCount: 0,
        provider: "telnyx",
      },
    ],
  };

  const service = new NumberPricingCatalogService(
    telephony as never,
    rateService as never,
  );

  return { service, searches };
}

describe("NumberPricingCatalogService", () => {
  it("prices only the number types Ringee sells", async () => {
    const { service, searches } = build({
      inventory: {
        "GB:local": [{ monthly: 3 }, { monthly: 6, locality: "EDINBURGH" }],
      },
    });

    const catalog = await service.buildCatalog();
    const [country] = catalog.countries;

    // "national" is never searched, and the empty mobile answer is confirmed
    // once before it counts as no stock.
    assert.deepEqual(
      searches.map((search) => search.numberType),
      ["local", "mobile", "mobile"],
    );
    assert.equal(country.offers.length, 1);
    assert.equal(country.offers[0].numberType, "local");
    assert.equal(country.offers[0].monthlyFromUsd, 3);
    assert.equal(country.offers[0].monthlyToUsd, 6);
    assert.deepEqual(country.offers[0].localities, ["London", "Edinburgh"]);
  });

  it("does not believe a single empty inventory answer", async () => {
    const { service, searches } = build({
      inventory: { "GB:local": [{ monthly: 3 }] },
      emptyFirstAnswer: ["GB:local"],
    });

    const [country] = (await service.buildCatalog()).countries;

    // The flaky zero would have dropped the UK out of the price list entirely.
    assert.equal(country.offers.length, 1);
    assert.equal(country.offers[0].numberType, "local");
    assert.equal(country.offers[0].monthlyFromUsd, 3);
    assert.equal(
      searches.filter((search) => search.numberType === "local").length,
      2,
    );
  });

  it("reports a covered type with no inventory and no list price as unavailable", async () => {
    const { service } = build({ inventory: { "GB:local": [{ monthly: 3 }] } });

    const [country] = (await service.buildCatalog()).countries;

    assert.deepEqual(country.unavailableTypes, ["mobile"]);
  });

  it("prices a type with no inventory from the carrier's list price", async () => {
    const { service } = build({
      inventory: { "GB:local": [{ monthly: 3 }] },
      listPrices: {
        // Agrees with the sampled local price, so the list can be trusted here.
        "GB:local": { monthly: 3 },
        "GB:mobile": { monthly: 20, upfront: 40 },
      },
    });

    const [country] = (await service.buildCatalog()).countries;

    assert.deepEqual(country.unavailableTypes, []);
    assert.deepEqual(
      country.offers.map((offer) => [offer.numberType, offer.availability]),
      [
        ["local", "in_stock"],
        ["mobile", "advance_order"],
      ],
    );

    const [, mobile] = country.offers;
    assert.equal(mobile.monthlyFromUsd, 20);
    assert.equal(mobile.monthlyToUsd, 20);
    assert.equal(mobile.setupUsd, 40);
    assert.equal(mobile.sampled, 0);
    assert.deepEqual(mobile.localities, []);
    // Nothing was sampled, so nothing beyond a voice line is claimed.
    assert.deepEqual(mobile.capabilities, ["voice"]);
    assert.equal(mobile.requirements.length, 1);
  });

  it("withholds a list price that disagrees with the sampled inventory", async () => {
    const { service } = build({
      inventory: { "GB:local": [{ monthly: 3 }] },
      listPrices: {
        // The list says $100 for a number the carrier actually sells at $3, so
        // it does not describe this country and nothing may be published.
        "GB:local": { monthly: 100 },
        "GB:mobile": { monthly: 20 },
      },
    });

    const [country] = (await service.buildCatalog()).countries;

    assert.equal(country.offers.length, 1);
    assert.deepEqual(country.unavailableTypes, ["mobile"]);
  });

  it("withholds a list price it has no sampled price to check against", async () => {
    const { service } = build({
      listPrices: { "GB:mobile": { monthly: 20 } },
    });

    const [country] = (await service.buildCatalog()).countries;

    assert.deepEqual(country.offers, []);
    assert.deepEqual(country.unavailableTypes, ["local", "mobile"]);
  });

  it("quotes a per-minute price only for the sides the rate deck priced", async () => {
    const { service } = build({ inventory: { "GB:local": [{ monthly: 3 }] } });

    const [country] = (await service.buildCatalog()).countries;

    assert.equal(country.callRate?.mobileFromUsd, 0.05);
    assert.equal(country.callRate?.mobileToUsd, 0.2);
    // No priced landline route: unknown, never a placeholder price.
    assert.equal(country.callRate?.landlineFromUsd, null);
    assert.equal(country.callRate?.landlineToUsd, null);
  });

  it("prices an agent minute from the provider list price and its margin", async () => {
    const { service } = build({ inventory: { "GB:local": [{ monthly: 3 }] } });

    const catalog = await service.buildCatalog();
    const margin = catalog.margins.aiVoiceAgent;

    assert.equal(catalog.aiVoiceAgent.enginePerMinuteUsd, 0.05 * margin);
    assert.equal(catalog.aiVoiceAgent.modelPerMinuteUsd, 0.004 * margin);
    assert.equal(
      catalog.aiVoiceAgent.perMinuteUsd,
      parseFloat((0.054 * margin).toFixed(4)),
    );
  });

  it("keeps a country whose requirements cannot be read, with none claimed", async () => {
    const { service } = build({
      inventory: { "GB:local": [{ monthly: 3 }] },
      requirementsThrow: true,
    });

    const [country] = (await service.buildCatalog()).countries;

    assert.equal(country.offers.length, 1);
    assert.deepEqual(country.offers[0].requirements, []);
  });
});
