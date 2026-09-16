/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  summarizeCountryRates,
  type CountryRateRoute,
} from "./country-rate.util";

const route = (
  iso: string,
  country: string,
  description: string,
  rate: number,
): CountryRateRoute => ({ iso, country, description, rate });

describe("summarizeCountryRates", () => {
  it("prices mobile and landline routes with the call margin", () => {
    const [rate] = summarizeCountryRates(
      [
        route(
          "DE",
          "Germany",
          "Trunking Outbound Minute - Germany - Mobile",
          0.04,
        ),
        route(
          "DE",
          "Germany",
          "Trunking Outbound Minute - Germany - Fixed",
          0.006,
        ),
      ],
      2.5,
    );

    assert.equal(rate.countryCode, "DE");
    assert.equal(rate.mobileMinRatePerMinute, 0.1);
    assert.equal(rate.landlineMinRatePerMinute, 0.015);
    assert.equal(rate.mobileRouteCount, 1);
    assert.equal(rate.landlineRouteCount, 1);
  });

  it("keeps a mobile route reached locally on the mobile side", () => {
    const [rate] = summarizeCountryRates(
      [route("GB", "United Kingdom", "United Kingdom - Mobile - Local", 0.02)],
      1,
    );

    assert.equal(rate.mobileRouteCount, 1);
    assert.equal(rate.landlineRouteCount, 0);
  });

  it("drops service numbers that nobody dials from a dialer", () => {
    const [rate] = summarizeCountryRates(
      [
        route("GB", "United Kingdom", "United Kingdom - Fixed Cities", 0.0043),
        route(
          "GB",
          "United Kingdom",
          "United Kingdom - NGCS SC024 - Local",
          1.06,
        ),
        route("GB", "United Kingdom", "United Kingdom - Freephone", 0.5),
        route("GB", "United Kingdom", "United Kingdom - Premium", 3),
      ],
      1,
    );

    assert.equal(rate.landlineRouteCount, 1);
    assert.equal(rate.landlineMaxRatePerMinute, 0.0043);
  });

  it("does not read a rule out of the country's own name", () => {
    // "Lithuania" contains "uan"; matching keywords as bare substrings dropped
    // every Lithuanian route as a UAN service number.
    const [rate] = summarizeCountryRates(
      [
        route(
          "LT",
          "Lithuania",
          "Trunking Outbound Minute - Lithuania - Mobile",
          0.0377,
        ),
      ],
      1,
    );

    assert.equal(rate.countryCode, "LT");
    assert.equal(rate.mobileRouteCount, 1);
  });

  it("falls back to a country's own routes when its deck never says mobile or fixed", () => {
    const [rate] = summarizeCountryRates(
      [
        route(
          "US",
          "United States",
          "Trunking Outbound Minute - United States 48 (Zone 1)",
          0.005,
        ),
        route(
          "US",
          "United States",
          "Trunking Outbound Minute - United States - High Cost (Zone 4)",
          0.01,
        ),
      ],
      2.5,
    );

    // The high-cost zone is excluded; the ordinary route prices both sides,
    // because the NANP draws no mobile/landline line.
    assert.equal(rate.mobileMinRatePerMinute, 0.0125);
    assert.equal(rate.landlineMinRatePerMinute, 0.0125);
    assert.equal(rate.mobileRouteCount, 1);
  });

  it("reports zero routes when nothing priced the country, without inventing a price", () => {
    const [rate] = summarizeCountryRates(
      [
        route(
          "IN",
          "India",
          "Trunking Outbound Minute - India - Mobile",
          0.0351,
        ),
      ],
      1,
    );

    assert.equal(rate.mobileRouteCount, 1);
    assert.equal(rate.landlineRouteCount, 0);
  });

  it("groups one country's area-code decks into a single entry", () => {
    const rates = summarizeCountryRates(
      [
        route(
          "DO",
          "Dominican Republic 1809",
          "Dominican Republic - Mobile",
          0.13,
        ),
        route(
          "DO",
          "Dominican Republic 1829",
          "Dominican Republic - Mobile",
          0.14,
        ),
      ],
      1,
    );

    assert.equal(rates.length, 1);
    assert.equal(rates[0].countryName, "Dominican Republic");
    assert.equal(rates[0].mobileMaxRatePerMinute, 0.14);
  });

  it("does not count an unpriced route as a priced one", () => {
    const [rate] = summarizeCountryRates(
      [
        route("PT", "Portugal", "Portugal - Mobile", 0),
        route("PT", "Portugal", "Portugal - Fixed", 0.008),
      ],
      2.5,
    );

    // A zero cell is the deck declining to price the route. Counting it would
    // publish the placeholder as if a real rate stood behind it — and the
    // landline rate, not that placeholder, is what the mobile side falls to.
    assert.equal(rate.mobileRouteCount, 0);
    assert.equal(rate.landlineRouteCount, 1);
    assert.equal(rate.landlineMinRatePerMinute, 0.02);
  });

  it("drops a country the deck priced at zero everywhere", () => {
    const rates = summarizeCountryRates(
      [route("PT", "Portugal", "Portugal - Mobile", 0)],
      2.5,
    );

    assert.deepEqual(rates, []);
  });

  it("keeps digits that are not a trailing range", () => {
    // Only a 3-4 digit suffix is an area code; "48" is part of the name.
    const [rate] = summarizeCountryRates(
      [route("US", "United States 48", "United States 48 - Fixed", 0.005)],
      1,
    );

    assert.equal(rate.countryName, "United States 48");
  });

  it("lists the United States first, then countries alphabetically", () => {
    const rates = summarizeCountryRates(
      [
        route("ZA", "South Africa", "South Africa - Mobile", 0.05),
        route("AR", "Argentina", "Argentina - Mobile", 0.03),
        route("US", "United States", "United States 48 (Zone 1)", 0.005),
      ],
      1,
    );

    assert.deepEqual(
      rates.map((rate) => rate.countryCode),
      ["US", "AR", "ZA"],
    );
  });
});
