import catalog from './number-pricing.generated.json';

/**
 * The public phone-number price list.
 *
 * `number-pricing.generated.json` is produced by
 * `pnpm --filter backend run generate:number-pricing`, which runs the same
 * server code that charges for a number, a minute and an agent call — so what
 * these pages publish and what a customer is billed come from one place. This
 * module only shapes that snapshot for rendering: no price is computed here.
 *
 * Regenerate it when the carrier's inventory or Ringee's margins change.
 */

export type PhoneNumberTypeSlug = 'local' | 'toll-free' | 'mobile';

type RawNumberType = 'local' | 'toll_free' | 'mobile';

export type NumberCapability =
  | 'voice'
  | 'sms'
  | 'mms'
  | 'fax'
  | 'emergency'
  | 'hdVoice'
  | 'internationalSms';

export type NumberRequirement = {
  id: string;
  name: string;
  description?: string;
  fieldType: string;
  example?: string | null;
};

/**
 * `in_stock` numbers are sitting in the carrier's inventory and are bought in
 * the dashboard. An `advance_order` type is one the carrier sells in the country
 * but keeps no stock of: it is priced from the carrier's own price list and
 * sourced to order, so it is offered on request rather than self-served.
 */
export type NumberAvailability = 'in_stock' | 'advance_order';

export type NumberOffer = {
  numberType: RawNumberType;
  currency: string;
  availability: NumberAvailability;
  monthlyFromUsd: number;
  monthlyToUsd: number;
  /** One-time carrier cost, where the price list states one. */
  setupUsd: number | null;
  sampled: number;
  capabilities: string[];
  localities: string[];
  requirements: NumberRequirement[];
  /**
   * False when the carrier could not be asked for the regulator's requirements.
   * Absent in snapshots generated before the flag existed, which were built
   * only from answers that succeeded.
   */
  requirementsKnown?: boolean;
};

export type CallRate = {
  mobileFromUsd: number | null;
  mobileToUsd: number | null;
  landlineFromUsd: number | null;
  landlineToUsd: number | null;
};

export type CountryPricing = {
  countryCode: string;
  countryName: string;
  region: string | null;
  offers: NumberOffer[];
  callRate: CallRate | null;
  unavailableTypes: RawNumberType[];
};

export type PhoneNumberCountry = CountryPricing & {
  slug: string;
  flag: string;
  /** Lowest monthly price across the country's number types. */
  fromMonthlyUsd: number;
};

/** What Ringee charges per minute for the AI voice agent itself. */
export const AI_VOICE_AGENT_PRICING = catalog.aiVoiceAgent as {
  enginePerMinuteUsd: number;
  modelPerMinuteUsd: number;
  perMinuteUsd: number;
};

/** When the snapshot was generated — the "prices as of" date on the pages. */
export const PRICING_GENERATED_AT = catalog.generatedAt as string;

const TYPE_SLUGS: Record<RawNumberType, PhoneNumberTypeSlug> = {
  local: 'local',
  toll_free: 'toll-free',
  mobile: 'mobile'
};

export type NumberTypeMeta = {
  slug: PhoneNumberTypeSlug;
  label: string;
  /** Used in headings: "a local number in Spain". */
  article: string;
  tagline: string;
  description: string;
  bestFor: string[];
};

export const NUMBER_TYPE_META: Record<PhoneNumberTypeSlug, NumberTypeMeta> = {
  local: {
    slug: 'local',
    label: 'Local',
    article: 'a local number',
    tagline: 'A geographic number tied to a city or area code.',
    description:
      'A local number carries the area code of a city, so the person you call sees a neighbour calling rather than an unknown foreign number. It is the number type outbound teams buy first, and the one caller ID rotation uses to match each lead.',
    bestFor: [
      'Outbound calling where pickup rate decides the day',
      'Showing local presence in a city you sell into',
      'Caller ID rotation across a pool of local numbers'
    ]
  },
  'toll-free': {
    slug: 'toll-free',
    label: 'Toll-free',
    article: 'a toll-free number',
    tagline: 'A national number that is free for the caller to dial.',
    description:
      'A toll-free number is free for the person calling you and reads as a national, established business line. It is an inbound number first: support lines, sales lines, and the number you print on a website.',
    bestFor: [
      'Inbound support and sales lines',
      'A national presence instead of a single city',
      'Campaigns where the caller should not pay'
    ]
  },
  mobile: {
    slug: 'mobile',
    label: 'Mobile',
    article: 'a mobile number',
    tagline: 'A number in the mobile range, where mobile-first markets answer.',
    description:
      'A mobile number sits in the country’s mobile range, which in many markets is the only kind of number people answer — and, where the carrier enables it, the kind that can send and receive SMS.',
    bestFor: [
      'Markets where a landline number is ignored',
      'Following a call with a text, where SMS is enabled',
      'Consumer outreach on mobile-first networks'
    ]
  }
};

export const NUMBER_TYPE_ORDER: PhoneNumberTypeSlug[] = [
  'local',
  'toll-free',
  'mobile'
];

const CAPABILITY_LABELS: Record<string, string> = {
  voice: 'Voice calls',
  sms: 'SMS',
  mms: 'MMS',
  fax: 'Fax',
  emergency: 'Emergency calling',
  hdVoice: 'HD voice',
  internationalSms: 'International SMS'
};

export const REGION_LABELS: Record<string, string> = {
  AMER: 'Americas',
  EMEA: 'Europe, Middle East & Africa',
  APAC: 'Asia Pacific',
  OTHER: 'Other regions'
};

/** Slugs are part of the URL, so they are derived once and never re-cased. */
export function countrySlug(countryName: string): string {
  return countryName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** 🇬🇧 from "GB". Regional-indicator letters, no image assets. */
export function countryFlag(countryCode: string): string {
  if (!/^[A-Za-z]{2}$/.test(countryCode)) return '🌍';
  return String.fromCodePoint(
    ...countryCode
      .toUpperCase()
      .split('')
      .map((letter) => 127397 + letter.charCodeAt(0))
  );
}

export function numberTypeSlug(numberType: string): PhoneNumberTypeSlug {
  return TYPE_SLUGS[numberType as RawNumberType] ?? 'local';
}

/** A type the carrier sources to order instead of holding it in stock. */
export function isAdvanceOrder(offer: NumberOffer): boolean {
  return offer.availability === 'advance_order';
}

/**
 * What the pages may say about a type's paperwork.
 *
 * `unknown` is the case an empty list must not be read as: the carrier did not
 * answer, so "no documents required" would be a promise nobody checked. Only
 * `none` states it, and only an in-stock type can add that the number activates
 * right away — an advance order is sourced by the carrier first, documents or
 * not.
 */
export type RequirementsState = 'documents' | 'none' | 'unknown';

export function requirementsState(offer: NumberOffer): RequirementsState {
  if (offer.requirements.length) return 'documents';
  return offer.requirementsKnown === false ? 'unknown' : 'none';
}

/**
 * "Local", or "Local (on request)" where the carrier sources the type to order.
 * Lists that show a type next to a price use this, so a price a visitor cannot
 * self-serve never appears as one they can.
 */
export function offerTypeLabel(offer: NumberOffer): string {
  const label = NUMBER_TYPE_META[numberTypeSlug(offer.numberType)].label;
  return isAdvanceOrder(offer) ? `${label} (on request)` : label;
}

/**
 * How an advance order works, in one sentence the pages share so they cannot
 * drift into promising different things.
 */
export const ADVANCE_ORDER_NOTE =
  'The carrier holds none of these in stock: Ringee places the order for you, and the carrier confirms availability and the final price before anything is charged.';

export function capabilityLabel(capability: string): string {
  return CAPABILITY_LABELS[capability] ?? capability;
}

/** Monthly prices read as money: "$3", "$12.50". */
export function formatMonthly(usd: number): string {
  return Number.isInteger(usd)
    ? `$${usd}`
    : `$${usd.toFixed(2).replace(/0$/, '')}`;
}

/** Per-minute prices need their small digits: "$0.0125". */
export function formatPerMinute(usd: number): string {
  return `$${usd.toFixed(4)}`;
}

const COUNTRIES: PhoneNumberCountry[] = (catalog.countries as CountryPricing[])
  .filter((country) => country.offers.length > 0)
  .map((country) => ({
    ...country,
    slug: countrySlug(country.countryName),
    flag: countryFlag(country.countryCode),
    fromMonthlyUsd: Math.min(
      ...country.offers.map((offer) => offer.monthlyFromUsd)
    )
  }))
  .sort((a, b) => a.countryName.localeCompare(b.countryName));

export const PHONE_NUMBER_COUNTRIES = COUNTRIES;

export function getPhoneNumberCountry(
  slug: string
): PhoneNumberCountry | undefined {
  return COUNTRIES.find((country) => country.slug === slug);
}

export function getNumberOffer(
  country: PhoneNumberCountry,
  type: string
): NumberOffer | undefined {
  return country.offers.find(
    (offer) => numberTypeSlug(offer.numberType) === type
  );
}

/** Every country/type pair that has a page, for `generateStaticParams`. */
export function listCountryTypePairs(): {
  country: string;
  type: PhoneNumberTypeSlug;
}[] {
  return COUNTRIES.flatMap((country) =>
    country.offers.map((offer) => ({
      country: country.slug,
      type: numberTypeSlug(offer.numberType)
    }))
  );
}

export function countriesByRegion(): {
  region: string;
  label: string;
  countries: PhoneNumberCountry[];
}[] {
  const groups = new Map<string, PhoneNumberCountry[]>();

  for (const country of COUNTRIES) {
    const region = country.region ?? 'OTHER';
    groups.set(region, [...(groups.get(region) ?? []), country]);
  }

  return [...groups.entries()]
    .map(([region, countries]) => ({
      region,
      label: REGION_LABELS[region] ?? REGION_LABELS.OTHER,
      countries
    }))
    .sort((a, b) => b.countries.length - a.countries.length);
}

/** The cheapest number on the whole list — the "from $X" the index leads with. */
export const CHEAPEST_MONTHLY_USD = Math.min(
  ...COUNTRIES.map((country) => country.fromMonthlyUsd)
);

/** The cheapest priced minute on the list, for the same reason. */
export const CHEAPEST_PER_MINUTE_USD = Math.min(
  ...COUNTRIES.flatMap((country) =>
    [
      country.callRate?.mobileFromUsd ?? null,
      country.callRate?.landlineFromUsd ?? null
    ].filter((rate): rate is number => rate !== null)
  )
);

/**
 * What an agent minute costs into one country: the agent itself plus the call
 * it places. Null when that country's minute is not priced in the deck.
 */
export function agentMinuteFrom(country: PhoneNumberCountry): number | null {
  const callRates = [
    country.callRate?.landlineFromUsd ?? null,
    country.callRate?.mobileFromUsd ?? null
  ].filter((rate): rate is number => rate !== null);

  if (!callRates.length) return null;

  return AI_VOICE_AGENT_PRICING.perMinuteUsd + Math.min(...callRates);
}
