// Prospeo /search-person only accepts location strings that match values
// returned by its /search-suggestions endpoint. Free-form strings like
// "Mexico City" or "MX" fail with INVALID_FILTERS even when they look right,
// burning daily search quota.
//
// This module:
//  - Seeds a static cache of canonical country names (the form Prospeo
//    returns from /search-suggestions for COUNTRY type) so the most common
//    LATAM/EU/NA inputs resolve without an API call.
//  - For anything else, calls /search-suggestions on demand and caches the
//    result. /search-suggestions is free per Prospeo's pricing and rate-
//    limited at 15 req/s — safe to call eagerly.

export type RawRequester = <T>(input: {
  method: "GET" | "POST";
  url: string;
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  timeoutMs?: number;
}) => Promise<T>;

export type SuggestionType = "COUNTRY" | "STATE" | "CITY" | "REGION";

export type ProspeoLocationSuggestion = {
  name: string;
  type?: SuggestionType | string;
};

type CacheEntry = {
  // Best-match canonical name for the input. `null` means the input is
  // known-not-found (don't retry until the negative TTL expires).
  canonical: string | null;
  expiresAt: number;
};

const POSITIVE_TTL_MS = 24 * 60 * 60 * 1000; // 1 day
const NEGATIVE_TTL_MS = 60 * 60 * 1000; // 1 hour — let the user retype

// Confirmed-canonical country names seeded from the Prospeo docs and from
// observed `/search-suggestions` responses. Keys are lowercased so we can
// match against ISO codes, native-language names, and common English names.
const STATIC_CANONICAL: Record<string, string> = {
  // LATAM
  ar: "Argentina",
  argentina: "Argentina",
  bo: "Bolivia",
  bolivia: "Bolivia",
  br: "Brazil",
  brazil: "Brazil",
  brasil: "Brazil",
  cl: "Chile",
  chile: "Chile",
  co: "Colombia",
  colombia: "Colombia",
  cr: "Costa Rica",
  "costa rica": "Costa Rica",
  cu: "Cuba",
  cuba: "Cuba",
  do: "Dominican Republic",
  "dominican republic": "Dominican Republic",
  ec: "Ecuador",
  ecuador: "Ecuador",
  sv: "El Salvador",
  "el salvador": "El Salvador",
  gt: "Guatemala",
  guatemala: "Guatemala",
  hn: "Honduras",
  honduras: "Honduras",
  mx: "Mexico",
  mexico: "Mexico",
  méxico: "Mexico",
  ni: "Nicaragua",
  nicaragua: "Nicaragua",
  pa: "Panama",
  panama: "Panama",
  panamá: "Panama",
  py: "Paraguay",
  paraguay: "Paraguay",
  pe: "Peru",
  peru: "Peru",
  perú: "Peru",
  pr: "Puerto Rico",
  "puerto rico": "Puerto Rico",
  uy: "Uruguay",
  uruguay: "Uruguay",
  ve: "Venezuela",
  venezuela: "Venezuela",
  // North America
  us: "United States",
  usa: "United States",
  "united states": "United States",
  "united states of america": "United States",
  ca: "Canada",
  canada: "Canada",
  // Europe
  at: "Austria",
  austria: "Austria",
  be: "Belgium",
  belgium: "Belgium",
  ch: "Switzerland",
  switzerland: "Switzerland",
  de: "Germany",
  germany: "Germany",
  dk: "Denmark",
  denmark: "Denmark",
  es: "Spain",
  spain: "Spain",
  españa: "Spain",
  fi: "Finland",
  finland: "Finland",
  fr: "France",
  france: "France",
  gb: "United Kingdom",
  uk: "United Kingdom",
  "united kingdom": "United Kingdom",
  ie: "Ireland",
  ireland: "Ireland",
  it: "Italy",
  italy: "Italy",
  nl: "Netherlands",
  netherlands: "Netherlands",
  no: "Norway",
  norway: "Norway",
  pl: "Poland",
  poland: "Poland",
  pt: "Portugal",
  portugal: "Portugal",
  se: "Sweden",
  sweden: "Sweden",
  // APAC + others
  au: "Australia",
  australia: "Australia",
  nz: "New Zealand",
  "new zealand": "New Zealand",
  in: "India",
  india: "India",
  sg: "Singapore",
  singapore: "Singapore",
  ph: "Philippines",
  philippines: "Philippines",
  jp: "Japan",
  japan: "Japan",
  kr: "South Korea",
  "south korea": "South Korea",
  cn: "China",
  china: "China",
  hk: "Hong Kong",
  "hong kong": "Hong Kong",
  tw: "Taiwan",
  taiwan: "Taiwan",
  ae: "United Arab Emirates",
  "united arab emirates": "United Arab Emirates",
  sa: "Saudi Arabia",
  "saudi arabia": "Saudi Arabia",
  il: "Israel",
  israel: "Israel",
  tr: "Turkey",
  turkey: "Turkey",
  za: "South Africa",
  "south africa": "South Africa",
};

export class ProspeoLocationResolver {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inflight = new Map<string, Promise<string | null>>();

  constructor(
    private readonly baseUrl: string,
    private readonly requester: RawRequester,
  ) {}

  /**
   * Resolve every requested location to its canonical Prospeo string,
   * dropping any that don't match a known location. Static-cache hits cost
   * nothing; misses fire a /search-suggestions request (free).
   */
  async resolveMany(
    apiKey: string,
    inputs: (string | null | undefined)[],
    opts?: { preferType?: SuggestionType; timeoutMs?: number },
  ): Promise<string[]> {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of inputs) {
      if (typeof raw !== "string") continue;
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const canonical = await this.resolve(apiKey, trimmed, opts);
      if (!canonical) continue;
      if (seen.has(canonical)) continue;
      seen.add(canonical);
      out.push(canonical);
    }
    return out;
  }

  async resolve(
    apiKey: string,
    raw: string,
    opts?: { preferType?: SuggestionType; timeoutMs?: number },
  ): Promise<string | null> {
    const key = raw.trim().toLowerCase();
    if (!key) return null;

    // Static seed.
    const seeded = STATIC_CANONICAL[key];
    if (seeded) return seeded;

    // Per-request cache.
    const now = Date.now();
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > now) {
      return cached.canonical;
    }

    // Coalesce concurrent lookups for the same input.
    const pending = this.inflight.get(key);
    if (pending) return pending;

    const work = this.lookup(apiKey, raw, opts).then((result) => {
      this.cache.set(key, {
        canonical: result,
        expiresAt: Date.now() + (result ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS),
      });
      this.inflight.delete(key);
      return result;
    });
    this.inflight.set(key, work);
    return work;
  }

  private async lookup(
    apiKey: string,
    raw: string,
    opts?: { preferType?: SuggestionType; timeoutMs?: number },
  ): Promise<string | null> {
    if (raw.trim().length < 2) return null;
    try {
      const res = await this.requester<{
        error?: boolean;
        location_suggestions?: ProspeoLocationSuggestion[];
      }>({
        method: "POST",
        url: `${this.baseUrl}/search-suggestions`,
        headers: { "X-KEY": apiKey, "Content-Type": "application/json" },
        body: { location_search: raw },
        timeoutMs: opts?.timeoutMs ?? 5000,
      });
      if (!res || res.error) return null;
      const suggestions = Array.isArray(res.location_suggestions)
        ? res.location_suggestions
        : [];
      if (suggestions.length === 0) return null;

      const preferred = opts?.preferType;
      if (preferred) {
        const match = suggestions.find(
          (s) => (s.type ?? "").toUpperCase() === preferred,
        );
        if (match?.name) return match.name;
      }
      // Otherwise prefer COUNTRY when the user typed something short, else
      // the first suggestion (usually the most specific match).
      const lc = raw.trim().toLowerCase();
      const looksLikeCountry = !lc.includes(",") && lc.length <= 30;
      if (looksLikeCountry) {
        const country = suggestions.find(
          (s) => (s.type ?? "").toUpperCase() === "COUNTRY",
        );
        if (country?.name) return country.name;
      }
      return suggestions[0]?.name ?? null;
    } catch {
      return null;
    }
  }
}
