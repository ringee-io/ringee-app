import type { TelephonyCountryRate } from "@ringee/platform";

/** One route of the carrier's rate deck: a destination and its per-minute cost. */
export type CountryRateRoute = {
  iso: string;
  country: string;
  description: string | null;
  rate: number;
};

/**
 * Routes that are not "calling a person in that country": premium and shared
 * cost services, non-geographic service numbers, freephone, satellite, and the
 * carrier's own high-cost zones. Quoting them as if they were ordinary calls
 * is what turned the United Kingdom's landline rate into $0.76/min — an
 * average dominated by NGCS service numbers nobody dials from a dialer.
 */
const EXCLUDED_KEYWORDS = [
  "premium",
  "special",
  "voip",
  "rural",
  "satellite",
  "satelital",
  "high cost",
  "shared cost",
  "toll free",
  "freephone",
  "uan",
  "paging",
  "personal number",
  "perosonal numbering", // the deck's own spelling
  "special services",
  "ngcs",
  "ngn",
  "service number",
  "short code",
  "n11",
  "military",
  "directory",
  "equal access",
  "unknown",
];

/** The deck has no country for these; they are not destinations. */
const EXCLUDED_ISO = new Set(["ZZ"]);

const MOBILE_KEYWORDS = ["mobile", "cellular"];
const LANDLINE_KEYWORDS = ["fixed", "landline", "local", "fijo"];

/**
 * Used when a country's deck prices a destination we could not classify. It is
 * the same placeholder the rate table has always fallen back to; the route
 * counts on the result say whether a figure is real or this.
 */
const FALLBACK_RATE_PER_MINUTE = 0.012;

type Classified = {
  iso: string;
  name: string;
  mobile: number[];
  landline: number[];
  /** Priced, but neither clearly mobile nor clearly landline. */
  unclassified: number[];
};

const normalize = (description: string | null | undefined): string =>
  (description ?? "").trim().toLowerCase();

/**
 * Matches a keyword only where a word starts, so a country's own name cannot
 * trip a rule: "Lithuania" contains "uan", and matching it as a substring
 * dropped every Lithuanian route as a UAN service number.
 */
const containsKeyword = (description: string, keyword: string): boolean =>
  new RegExp(`(?:^|[^a-z])${keyword}`).test(description);

const matchesAny = (description: string, keywords: string[]): boolean =>
  keywords.some((keyword) => containsKeyword(description, keyword));

const isExcluded = (description: string): boolean =>
  matchesAny(description, EXCLUDED_KEYWORDS);

const isMobile = (description: string): boolean =>
  matchesAny(description, MOBILE_KEYWORDS);

const isLandline = (description: string): boolean =>
  matchesAny(description, LANDLINE_KEYWORDS);

/**
 * Deck names sometimes carry the area code they cover ("Puerto Rico 1787",
 * "Dominican Republic 1809"), which would otherwise list one country four
 * times. The country is the same; only the range differs.
 */
const displayName = (name: string): string =>
  name.replace(/\s+\d{3,4}$/, "").trim();

const priceOf = (rate: number, multiplier: number): number => {
  if (!Number.isFinite(rate) || rate <= 0) return FALLBACK_RATE_PER_MINUTE;
  return rate * multiplier;
};

const round = (value: number): number => parseFloat(value.toFixed(4));

/**
 * Stats for one side of a country (mobile or landline). `routes` is how many
 * priced routes the figures came from — zero means the deck had none and the
 * numbers are the placeholder, which a public quote must not present as a
 * price.
 */
function summarize(rates: number[], multiplier: number) {
  if (!rates.length) {
    return {
      min: FALLBACK_RATE_PER_MINUTE,
      max: FALLBACK_RATE_PER_MINUTE,
      avg: FALLBACK_RATE_PER_MINUTE,
      routes: 0,
    };
  }

  const priced = rates.map((rate) => priceOf(rate, multiplier));
  const total = priced.reduce((sum, value) => sum + value, 0);

  return {
    min: round(Math.min(...priced)),
    max: round(Math.max(...priced)),
    avg: round(total / priced.length),
    routes: priced.length,
  };
}

function classify(routes: CountryRateRoute[]): Map<string, Classified> {
  const byCountry = new Map<string, Classified>();

  for (const route of routes) {
    const iso = route.iso?.trim().toUpperCase();
    const description = normalize(route.description);

    if (!iso || EXCLUDED_ISO.has(iso)) continue;
    if (!route.country || !Number.isFinite(route.rate)) continue;
    if (isExcluded(description)) continue;

    // Grouped by ISO, not by deck name: one country, one rate entry.
    const country = byCountry.get(iso) ?? {
      iso,
      name: displayName(route.country),
      mobile: [],
      landline: [],
      unclassified: [],
    };
    byCountry.set(iso, country);

    // Mobile first: "mobile - local" is a mobile route reached locally, not a
    // landline.
    if (isMobile(description)) country.mobile.push(route.rate);
    else if (isLandline(description)) country.landline.push(route.rate);
    else country.unclassified.push(route.rate);
  }

  return byCountry;
}

/**
 * Turns the carrier's rate deck into Ringee's per-country customer prices.
 *
 * `multiplier` is `CALL_PROFIT_MARGIN` — the same multiplier the call
 * settlement applies (BILL-013), so what a country page quotes and what a call
 * is charged come from one number.
 *
 * Countries whose deck never says "mobile" or "fixed" — the NANP ones, where
 * the numbering plan draws no such line — fall back to their unclassified
 * routes rather than to the placeholder, which is why the United States used
 * to quote $0.012/min while its own deck said $0.005.
 */
export function summarizeCountryRates(
  routes: CountryRateRoute[],
  multiplier: number,
): TelephonyCountryRate[] {
  const safeMultiplier =
    Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;

  const rates = [...classify(routes).values()].map((country) => {
    const mobileRates = country.mobile.length
      ? country.mobile
      : country.unclassified;
    const landlineRates = country.landline.length
      ? country.landline
      : country.unclassified;

    const mobile = summarize(mobileRates, safeMultiplier);
    const landline = summarize(landlineRates, safeMultiplier);

    return {
      countryCode: country.iso,
      countryName: country.name,
      currency: "USD",
      mobileMinRatePerMinute: mobile.min,
      mobileMaxRatePerMinute: mobile.max,
      mobileAvgRatePerMinute: mobile.avg,
      mobileRouteCount: mobile.routes,
      landlineMinRatePerMinute: landline.min,
      landlineMaxRatePerMinute: landline.max,
      landlineAvgRatePerMinute: landline.avg,
      landlineRouteCount: landline.routes,
      provider: "telnyx",
      updatedAt: new Date(),
    } satisfies TelephonyCountryRate;
  });

  return rates.sort((a, b) => {
    if (a.countryCode === "US") return -1;
    if (b.countryCode === "US") return 1;
    return a.countryName.localeCompare(b.countryName);
  });
}
