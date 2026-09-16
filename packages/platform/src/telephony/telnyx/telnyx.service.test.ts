import { HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { TelnyxClient } from "./telnyx.client";
import { TelnyxService } from "./telnyx.service";

/**
 * `@ringee/configuration` validates the whole app environment on import and
 * calls `process.exit(1)` when anything is missing. Nothing under test reads
 * it, so it is replaced rather than satisfied with eighteen fake variables.
 */
vi.mock("@ringee/configuration", () => ({ apiConfiguration: {} }));

/** The module builds a real SDK client at import time; it is never called. */
vi.mock("telnyx", () => ({ default: class {} }));

/** What Telnyx answers a teardown command with once the leg is gone. */
const CALL_ENDED = {
  errors: [
    {
      code: "90018",
      title: "Call has already ended",
      detail: "This call is no longer active and can't receive commands.",
    },
  ],
};

function build(reason: unknown) {
  const post = vi.fn(() => Promise.reject(reason));
  const service = new TelnyxService({ post } as unknown as TelnyxClient);
  return { service, post };
}

describe("TelnyxService.stopStreaming", () => {
  /**
   * The shape that actually reaches the service: `TelnyxClient.handleError`
   * rethrows the provider's body as an `HttpException` under its own status.
   */
  it("treats a leg that already ended as the outcome it asked for", async () => {
    const { service, post } = build(new HttpException(CALL_ENDED, 422));

    await expect(service.stopStreaming("v3:cc-1")).resolves.toBeUndefined();
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("recognises it unwrapped too, in case the client stops mapping it", async () => {
    const { service } = build({ response: { status: 422, data: CALL_ENDED } });

    await expect(service.stopStreaming("v3:cc-1")).resolves.toBeUndefined();
  });

  it("still surfaces every other provider failure", async () => {
    const rejection = new HttpException({ errors: [{ code: "10015" }] }, 422);
    const { service } = build(rejection);

    await expect(service.stopStreaming("v3:cc-1")).rejects.toBe(rejection);
  });
});

describe("TelnyxService.getNumberListPrices", () => {
  /** The shape Telnyx answers `/pricing` with: CSV, whatever you ask for. */
  const PRICE_LIST = [
    "ISO,Country,Country Code,Phone Number Type,Phone Number One-Time-Cost,Phone Number Price / month,Inbound SIP Trunking Price / min (from landline numbers),Inbound SIP Trunking Price / min (from mobile numbers),Currency",
    "MX,Mexico,484,Local,5,5,0.005,0.005,USD",
    "MX,Mexico,484,National,2,4,0.0068,0.0068,USD",
    'BO,"Bolivia, Plurinational State of",068,Toll Free,300,75,0.28,0.28,USD',
    "GB,United Kingdom,826,Local,1,1,0.005,0.005,USD",
    "BH,Bahrain,048,Mobile,,,,,USD",
  ].join("\n");

  function buildWithPriceList(csv: string) {
    const getText = vi.fn(() => Promise.resolve(csv));
    const service = new TelnyxService({ getText } as unknown as TelnyxClient);
    return { service, getText };
  }

  it("reads the price list by column, with the number margin applied", async () => {
    const { service, getText } = buildWithPriceList(PRICE_LIST);

    const prices = await service.getNumberListPrices();

    expect(getText).toHaveBeenCalledWith("/pricing");
    expect(prices).toEqual([
      {
        countryCode: "MX",
        numberType: "local",
        currency: "USD",
        monthlyCost: 10,
        upfrontCost: 10,
      },
      {
        // The quoted country name keeps its comma from splitting the row.
        countryCode: "BO",
        numberType: "toll_free",
        currency: "USD",
        monthlyCost: 150,
        upfrontCost: 600,
      },
      {
        // A $1 number is priced at the same flat $3 a searched one is.
        countryCode: "GB",
        numberType: "local",
        currency: "USD",
        monthlyCost: 3,
        upfrontCost: 3,
      },
    ]);
  });

  it("skips a row whose currency the provider left blank", async () => {
    const { service } = buildWithPriceList(
      [
        "ISO,Country,Country Code,Phone Number Type,Phone Number One-Time-Cost,Phone Number Price / month,Currency",
        "MX,Mexico,484,Local,5,5,",
        "GB,United Kingdom,826,Local,1,1,USD",
      ].join("\n"),
    );

    // A price with no currency is not a USD price: a consumer that publishes
    // only USD would otherwise quote it as one.
    const prices = await service.getNumberListPrices();

    expect(prices.map((price) => price.countryCode)).toEqual(["GB"]);
  });

  it("returns nothing when the provider renames its columns", async () => {
    const { service } = buildWithPriceList(
      ["Country,Type,Price", "MX,Local,5"].join("\n"),
    );

    await expect(service.getNumberListPrices()).resolves.toEqual([]);
  });
});
