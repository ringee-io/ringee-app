import { Injectable, Logger } from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import {
  TelephonyService,
  VOICE_AGENT_LIST_PRICE_PER_MINUTE_USD,
  type NumberCapability,
  type NumberListPrice,
  type RegulatoryRequirement,
  type TelephonyCountryRate,
} from "@ringee/platform";

import { TelephonyRateService } from "./telephony-rate.service";

/** The number types a customer can actually buy in Ringee today. */
export const PUBLIC_NUMBER_TYPES = ["local", "toll_free", "mobile"] as const;
export type PublicNumberType = (typeof PUBLIC_NUMBER_TYPES)[number];

/** How many numbers are sampled per country and type to price the type. */
const SAMPLE_SIZE = 50;

/** How long to wait before re-asking for a range the carrier answered empty. */
const EMPTY_RETRY_DELAY_MS = 750;

export interface PublicNumberRequirement {
  id: string;
  name: string;
  description?: string;
  /** "document", "textual", "address", … — what the customer has to supply. */
  fieldType: string;
  example?: string | null;
}

/**
 * How the customer gets the number.
 *
 * `in_stock` was priced from inventory that can be ordered right now.
 * `advance_order` is a type the carrier sells in the country but does not keep
 * in stock: it is sourced to order, priced from the carrier's published list
 * price, and cannot be self-served in the dashboard.
 */
export type NumberAvailability = "in_stock" | "advance_order";

export interface PublicNumberOffer {
  numberType: PublicNumberType;
  currency: "USD";
  availability: NumberAvailability;
  /** Cheapest and dearest monthly price seen in the sampled inventory. */
  monthlyFromUsd: number;
  monthlyToUsd: number;
  /**
   * One-time cost on top of the first month, where the carrier charges one.
   * Only known for an advance order, whose list price states it; null for
   * in-stock inventory, which a number search does not break out.
   */
  setupUsd: number | null;
  /** Numbers the sample found. `SAMPLE_SIZE` means "plenty", not "exactly". */
  sampled: number;
  capabilities: NumberCapability[];
  /** A few real cities/regions the numbers are in, for the page to show. */
  localities: string[];
  requirements: PublicNumberRequirement[];
  /**
   * False when the regulator's requirements could not be read for this type.
   * An empty `requirements` then means "not known", not "none required" — the
   * page must not promise activation without documents on that basis.
   */
  requirementsKnown: boolean;
}

export interface PublicCallRate {
  mobileFromUsd: number | null;
  mobileToUsd: number | null;
  landlineFromUsd: number | null;
  landlineToUsd: number | null;
}

export interface PublicCountryNumberPricing {
  countryCode: string;
  countryName: string;
  region: string | null;
  offers: PublicNumberOffer[];
  /** Null when the rate deck prices no ordinary call to this country. */
  callRate: PublicCallRate | null;
  /**
   * Number types the provider covers but that could be neither sampled nor
   * priced from its list — nothing to quote, in stock or to order.
   */
  unavailableTypes: PublicNumberType[];
}

export interface PublicNumberPricingCatalog {
  generatedAt: string;
  /** The multipliers the prices were built with, for auditing a snapshot. */
  margins: { call: number; aiVoiceAgent: number };
  aiVoiceAgent: {
    /** Conversation engine per minute, with margin. */
    enginePerMinuteUsd: number;
    /** Provider-hosted model per minute, with margin. */
    modelPerMinuteUsd: number;
    /** Engine + hosted model. The call itself is charged on top. */
    perMinuteUsd: number;
  };
  countries: PublicCountryNumberPricing[];
}

/**
 * Ringee's public price list for phone numbers, calling and AI voice agents,
 * one entry per country.
 *
 * Every figure here is produced by the same code that charges for the real
 * thing: number prices come from `TelephonyService` (carrier cost × the number
 * margin), per-minute prices from `TelephonyRateService` (deck cost ×
 * `CALL_PROFIT_MARGIN`), and the agent estimate from the provider's published
 * list price × `AI_VOICE_AGENT_PROFIT_MARGIN`. Nothing is re-typed by hand, so
 * a published page and an invoice cannot disagree.
 *
 * A number type the carrier sells in a country without keeping stock of it is
 * still a product — it is bought by advance order — so it is priced from the
 * carrier's published price list, but only where that list is shown to
 * reproduce the inventory prices of the same country. See
 * `listPricesAgreeWithInventory`.
 *
 * Building the catalog walks the whole carrier inventory, so it is a
 * generator — run out of band, never on a request path.
 */
@Injectable()
export class NumberPricingCatalogService {
  private readonly logger = new Logger(NumberPricingCatalogService.name);

  constructor(
    private readonly telephonyService: TelephonyService,
    private readonly telephonyRateService: TelephonyRateService,
  ) {}

  async buildCatalog(): Promise<PublicNumberPricingCatalog> {
    const [coverage, rates, listPrices] = await Promise.all([
      this.telephonyService.getNumberCoverage(),
      this.telephonyRateService.listRates(),
      this.telephonyService.getNumberListPrices(),
    ]);

    const ratesByCountry = new Map<string, TelephonyCountryRate>(
      rates.map((rate) => [rate.countryCode.toUpperCase(), rate]),
    );

    // Only USD rows are indexed: the catalog publishes USD and this service
    // does not convert currencies, so a row in another one is not a price here.
    const listPriceByType = new Map<string, NumberListPrice>(
      listPrices
        .filter((listPrice) => listPrice.currency.toUpperCase() === "USD")
        .map((listPrice) => [
          listPriceKey(listPrice.countryCode, listPrice.numberType),
          listPrice,
        ]),
    );

    const countries: PublicCountryNumberPricing[] = [];

    for (const country of coverage) {
      const types = PUBLIC_NUMBER_TYPES.filter((type) =>
        country.numberTypes.includes(type),
      );
      if (!types.length) continue;

      const offers: PublicNumberOffer[] = [];
      const unsampled: PublicNumberType[] = [];

      for (const numberType of types) {
        const offer = await this.buildOffer(country.countryCode, numberType);
        if (offer) offers.push(offer);
        else unsampled.push(numberType);
      }

      const unavailableTypes: PublicNumberType[] = [];

      if (unsampled.length) {
        const trustListPrices = this.listPricesAgreeWithInventory(
          country.countryCode,
          offers,
          listPriceByType,
        );

        for (const numberType of unsampled) {
          const listPrice = trustListPrices
            ? listPriceByType.get(listPriceKey(country.countryCode, numberType))
            : undefined;

          if (listPrice) {
            offers.push(
              await this.buildAdvanceOrderOffer(
                country.countryCode,
                numberType,
                listPrice,
              ),
            );
          } else {
            unavailableTypes.push(numberType);
          }
        }

        // Pages read the types in one fixed order, whichever way each is sold.
        offers.sort(
          (a, b) =>
            PUBLIC_NUMBER_TYPES.indexOf(a.numberType) -
            PUBLIC_NUMBER_TYPES.indexOf(b.numberType),
        );
      }

      countries.push({
        countryCode: country.countryCode,
        countryName: country.countryName,
        region: country.region,
        offers,
        callRate: this.buildCallRate(
          ratesByCountry.get(country.countryCode.toUpperCase()),
        ),
        unavailableTypes,
      });
    }

    return {
      generatedAt: new Date().toISOString(),
      margins: {
        call: apiConfiguration.CALL_PROFIT_MARGIN,
        aiVoiceAgent: apiConfiguration.AI_VOICE_AGENT_PROFIT_MARGIN,
      },
      aiVoiceAgent: this.buildAgentPricing(),
      countries,
    };
  }

  /**
   * Prices one country/type from the inventory that is actually orderable.
   * Returns null when the carrier has nothing to sample, which is the caller's
   * cue to look for a list price instead of quoting a number nobody can buy.
   */
  private async buildOffer(
    countryCode: string,
    numberType: PublicNumberType,
  ): Promise<PublicNumberOffer | null> {
    const numbers = await this.sampleInventory(countryCode, numberType);

    if (!numbers.length) return null;

    // A number the carrier returned without a usable monthly cost is not a $0
    // number: the adapter coerces a missing cost to zero, and one such record
    // would publish "from $0/month" for the whole type. Price from the records
    // that carry a real cost, and treat a type with none as unpriced.
    const monthly = numbers
      .map((number) => number.costInformation.monthlyCost)
      .filter((cost): cost is number => Number.isFinite(cost) && cost > 0);

    if (!monthly.length) return null;

    const capabilities = new Set<NumberCapability>();
    const localities = new Set<string>();

    for (const number of numbers) {
      for (const [capability, enabled] of Object.entries(number.capabilities)) {
        if (enabled) capabilities.add(capability as NumberCapability);
      }
      const locality = number.locality?.trim();
      if (locality) localities.add(toTitleCase(locality));
    }

    return {
      numberType,
      currency: "USD",
      availability: "in_stock",
      monthlyFromUsd: Math.min(...monthly),
      monthlyToUsd: Math.max(...monthly),
      setupUsd: null,
      sampled: numbers.length,
      capabilities: [...capabilities].sort(),
      localities: [...localities].slice(0, 12),
      ...(await this.buildRequirements(countryCode, numberType)),
    };
  }

  /**
   * Samples the orderable inventory for one country and type.
   *
   * The carrier's search answers "nothing" for a range it serves numbers from a
   * moment later — Portugal and Switzerland both came back empty mid-run and
   * had stock again minutes afterwards. An empty answer is load-bearing here (it
   * decides whether a country is published at all, and whether its list prices
   * can be checked), so a single empty result is confirmed once before it is
   * believed.
   */
  private async sampleInventory(
    countryCode: string,
    numberType: PublicNumberType,
  ) {
    const search = () =>
      this.telephonyService.searchAvailableNumbers({
        countryCode,
        numberType,
        limit: SAMPLE_SIZE,
      });

    const numbers = await search();
    if (numbers.length) return numbers;

    await new Promise((resolve) => setTimeout(resolve, EMPTY_RETRY_DELAY_MS));
    const retried = await search();

    if (retried.length) {
      this.logger.warn(
        `${countryCode}/${numberType} answered empty once, then returned ` +
          `${retried.length} numbers — the first answer was not its stock.`,
      );
    }

    return retried;
  }

  /**
   * Prices a type the carrier sells in the country but keeps no inventory of,
   * from its published list price. The customer gets it by advance order, so
   * the offer carries no sampled numbers and no localities — only what the list
   * price itself states, plus the regulator's requirements, which are published
   * per country and type and do not depend on stock.
   */
  private async buildAdvanceOrderOffer(
    countryCode: string,
    numberType: PublicNumberType,
    listPrice: NumberListPrice,
  ): Promise<PublicNumberOffer> {
    return {
      numberType,
      currency: "USD",
      availability: "advance_order",
      monthlyFromUsd: listPrice.monthlyCost,
      monthlyToUsd: listPrice.monthlyCost,
      setupUsd: listPrice.upfrontCost,
      sampled: 0,
      // The list price prices the line and its inbound voice minutes, so voice
      // is all it proves. Messaging on an advance order is the carrier's to
      // confirm per range, and is not claimed here.
      capabilities: ["voice"],
      localities: [],
      ...(await this.buildRequirements(countryCode, numberType)),
    };
  }

  /**
   * Whether this country's list prices may be published for a type that could
   * not be sampled.
   *
   * The test is the two sources agreeing where both exist: the list price has
   * to be exactly the monthly price the sampled inventory charges. In most
   * countries it is, which is what makes it trustworthy for the types with no
   * inventory to sample. Where it is not — the NANPA countries, whose numbers
   * cost a dollar while the list quotes international rates — it is not what
   * the carrier charges Ringee, so nothing is published from it. A country with
   * nothing sampled at all cannot be checked, and is not trusted either.
   */
  private listPricesAgreeWithInventory(
    countryCode: string,
    sampledOffers: PublicNumberOffer[],
    listPriceByType: Map<string, NumberListPrice>,
  ): boolean {
    const comparable = sampledOffers.flatMap((offer) => {
      const listPrice = listPriceByType.get(
        listPriceKey(countryCode, offer.numberType),
      );
      return listPrice ? [{ offer, listPrice }] : [];
    });

    if (!comparable.length) return false;

    return comparable.every(
      ({ offer, listPrice }) =>
        // Both sides are already rounded to the cent by the adapter's margin.
        // The list price has to reproduce the whole sampled range, not just its
        // floor: a country whose inventory spans several prices while the list
        // quotes one of them has not shown the list is what the carrier charges.
        Math.abs(listPrice.monthlyCost - offer.monthlyFromUsd) < 0.005 &&
        Math.abs(listPrice.monthlyCost - offer.monthlyToUsd) < 0.005,
    );
  }

  private async buildRequirements(
    countryCode: string,
    numberType: PublicNumberType,
  ): Promise<{
    requirements: PublicNumberRequirement[];
    requirementsKnown: boolean;
  }> {
    try {
      const result = await this.telephonyService.getRegulatoryRequirements({
        countryCode,
        phoneNumberType: numberType,
        action: "ordering",
      });

      return {
        requirements: result.requirements.map(
          (requirement: RegulatoryRequirement) => ({
            id: requirement.id,
            name: requirement.name,
            ...(requirement.description
              ? { description: requirement.description }
              : {}),
            fieldType: requirement.fieldType,
            ...(requirement.example ? { example: requirement.example } : {}),
          }),
        ),
        requirementsKnown: true,
      };
    } catch (error) {
      // A country whose requirements cannot be read is still worth listing, but
      // the failure travels with the offer: an empty list published as fact
      // would tell the visitor no documents are required, which is the
      // dangerous claim. The page says "check in the dashboard" instead.
      this.logger.warn(
        `Could not read ${countryCode}/${numberType} requirements: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { requirements: [], requirementsKnown: false };
    }
  }

  /**
   * The per-minute price of calling this country. Each side is null when the
   * rate deck priced no route for it — an unpriced destination is unknown, not
   * free, and never a placeholder dressed up as a quote.
   */
  private buildCallRate(
    rate: TelephonyCountryRate | undefined,
  ): PublicCallRate | null {
    if (!rate) return null;

    const hasMobile = (rate.mobileRouteCount ?? 0) > 0;
    const hasLandline = (rate.landlineRouteCount ?? 0) > 0;
    if (!hasMobile && !hasLandline) return null;

    return {
      mobileFromUsd: hasMobile ? rate.mobileMinRatePerMinute : null,
      mobileToUsd: hasMobile ? rate.mobileMaxRatePerMinute : null,
      landlineFromUsd: hasLandline ? rate.landlineMinRatePerMinute : null,
      landlineToUsd: hasLandline ? rate.landlineMaxRatePerMinute : null,
    };
  }

  private buildAgentPricing(): PublicNumberPricingCatalog["aiVoiceAgent"] {
    const margin = apiConfiguration.AI_VOICE_AGENT_PROFIT_MARGIN;
    const engine = round(VOICE_AGENT_LIST_PRICE_PER_MINUTE_USD.engine * margin);
    const model = round(
      VOICE_AGENT_LIST_PRICE_PER_MINUTE_USD.hostedModel * margin,
    );

    return {
      enginePerMinuteUsd: engine,
      modelPerMinuteUsd: model,
      perMinuteUsd: round(engine + model),
    };
  }
}

const round = (value: number): number => parseFloat(value.toFixed(4));

const listPriceKey = (countryCode: string, numberType: string): string =>
  `${countryCode.toUpperCase()}:${numberType}`;

/** "BUENOS AIRES" and "bath" both read badly on a page; "Buenos Aires" does. */
const toTitleCase = (value: string): string =>
  value
    .toLowerCase()
    .replace(
      /(^|[\s\-/])([a-z])/g,
      (_match, prefix, letter) => prefix + letter.toUpperCase(),
    );
