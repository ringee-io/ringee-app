/// <reference types="node" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import examples from "libphonenumber-js/mobile/examples";
import { getCountryCallingCode, type CountryCode } from "libphonenumber-js/max";
import { resolveRegion } from "./destination-region";
import { US_AREA_CODES_BY_STATE } from "./us-area-codes";

describe("international rotation geography", () => {
  // These territories share mobile ranges with their parent numbering plan;
  // fixed geographic examples carry the prefix that actually identifies them.
  const geographicExamples: Record<string, string> = {
    AX: "+3581812345",
    BL: "+590590271234",
    MF: "+590590071234",
    CC: "+61891621234",
    CX: "+61891641234",
    EH: "+212528812345",
    IM: "+441624756789",
    SJ: "+4779123456",
    VA: "+390669812345",
  };
  for (const [country, number] of Object.entries(examples)) {
    it(`recognizes ${country} and its international calling code`, () => {
      const region = resolveRegion(
        geographicExamples[country] ??
          `+${getCountryCallingCode(country as CountryCode)}${number}`,
      );
      assert.equal(region.country, country);
      assert.equal(
        region.callingCode,
        getCountryCallingCode(country as CountryCode),
      );
    });
  }
  it("contains all 50 US states and Washington DC without treating territories as US numbers", () => {
    const expected =
      "AK AL AR AZ CA CO CT DC DE FL GA HI IA ID IL IN KS KY LA MA MD ME MI MN MO MS MT NC ND NE NH NJ NM NV NY OH OK OR PA RI SC SD TN TX UT VA VT WA WI WV WY"
        .split(" ")
        .sort();
    assert.deepEqual(Object.keys(US_AREA_CODES_BY_STATE).sort(), expected);
    const codes = Object.values(US_AREA_CODES_BY_STATE).flat();
    assert.equal(new Set(codes).size, codes.length);
  });
  for (const [state, codes] of Object.entries(US_AREA_CODES_BY_STATE)) {
    it(`recognizes every in-service area code in ${state}`, () => {
      for (const code of codes) {
        assert.deepEqual(resolveRegion(`+1${code}5550123`), {
          country: "US",
          callingCode: "1",
          areaCode: code,
          state,
        });
      }
    });
  }
  for (const [prefix, country] of [
    ["809", "DO"],
    ["829", "DO"],
    ["849", "DO"],
    ["416", "CA"],
    ["787", "PR"],
    ["939", "PR"],
    ["340", "VI"],
    ["671", "GU"],
    ["670", "MP"],
    ["684", "AS"],
  ]) {
    it(`keeps +1 ${prefix} separate from US states`, () => {
      const region = resolveRegion(`+1${prefix}5550123`);
      assert.equal(region.country, country);
      assert.equal(region.state, null);
    });
  }
  it("accepts formatted international numbers and 00/011 access prefixes", () => {
    for (const number of [
      "+1 (212) 555-0123",
      "0012125550123",
      "01112125550123",
    ]) {
      assert.equal(resolveRegion(number).state, "NY");
    }
    assert.equal(resolveRegion("0034 912 345 678").country, "ES");
    assert.equal(resolveRegion("011 44 20 7946 0958").country, "GB");
  });
  it("does not invent geographic areas for toll-free or global calling plans", () => {
    assert.equal(resolveRegion("+18005550123").areaCode, null);
    assert.equal(resolveRegion("+18005550123").state, null);
    assert.equal(resolveRegion("+80012345678").callingCode, "800");
    assert.equal(resolveRegion("+80012345678").country, null);
  });
  it("does not extract phone numbers from arbitrary text or guess national numbers", () => {
    for (const number of [
      "",
      "2125550123",
      "call +12125550123 now",
      "+1",
      "+99912345678",
      "+19995550123",
      null,
      123,
    ]) {
      assert.equal(resolveRegion(number as string).callingCode, null);
    }
  });
});
