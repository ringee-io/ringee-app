// Apollo's `person_locations[]` / `organization_locations[]` filters take
// free-text place names — cities, states/regions, or countries, optionally
// comma-qualified ("California, US", "chicago", "ireland"). Apollo is
// case-insensitive and fairly forgiving, with one important exception: it
// does NOT understand bare ISO country codes. A filter of "MX" or "GB"
// matches nothing, and since LeadSearchFilters.personCountries carries ISO
// codes (see enrichment/types.ts) that is the most common way an Apollo
// search silently comes back empty.
//
// Unlike Prospeo there is no /search-suggestions endpoint to canonicalise
// against, so this is a purely synchronous, static normalizer:
//   • bare 2-letter ISO codes are expanded to the country name Apollo expects;
//   • everything else (cities, "City, State, Country" strings, full country
//     names) is passed through trimmed;
//   • results are de-duplicated case-insensitively.

// ISO 3166-1 alpha-2 → country name. Covers the LATAM / NA / EU / APAC set
// the agent is most likely to emit; unknown codes fall through unchanged.
const ISO_COUNTRY_NAMES: Record<string, string> = {
  // North America
  US: "United States",
  USA: "United States",
  CA: "Canada",
  MX: "Mexico",
  // LATAM
  GT: "Guatemala",
  HN: "Honduras",
  SV: "El Salvador",
  NI: "Nicaragua",
  CR: "Costa Rica",
  PA: "Panama",
  CO: "Colombia",
  VE: "Venezuela",
  EC: "Ecuador",
  PE: "Peru",
  BO: "Bolivia",
  CL: "Chile",
  AR: "Argentina",
  PY: "Paraguay",
  UY: "Uruguay",
  BR: "Brazil",
  DO: "Dominican Republic",
  PR: "Puerto Rico",
  CU: "Cuba",
  // Europe
  ES: "Spain",
  PT: "Portugal",
  FR: "France",
  DE: "Germany",
  IT: "Italy",
  GB: "United Kingdom",
  UK: "United Kingdom",
  IE: "Ireland",
  NL: "Netherlands",
  BE: "Belgium",
  CH: "Switzerland",
  AT: "Austria",
  SE: "Sweden",
  NO: "Norway",
  DK: "Denmark",
  FI: "Finland",
  PL: "Poland",
  CZ: "Czech Republic",
  RO: "Romania",
  GR: "Greece",
  // APAC + others
  AU: "Australia",
  NZ: "New Zealand",
  IN: "India",
  SG: "Singapore",
  PH: "Philippines",
  MY: "Malaysia",
  ID: "Indonesia",
  TH: "Thailand",
  VN: "Vietnam",
  JP: "Japan",
  KR: "South Korea",
  CN: "China",
  HK: "Hong Kong",
  TW: "Taiwan",
  AE: "United Arab Emirates",
  SA: "Saudi Arabia",
  IL: "Israel",
  TR: "Turkey",
  ZA: "South Africa",
  EG: "Egypt",
  NG: "Nigeria",
};

/**
 * Resolve a single raw location string into the form Apollo accepts.
 * Returns `null` for empty input.
 */
export function normalizeApolloLocation(raw: string): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  // Expand a bare ISO code (alpha-2, or the USA/UK aliases) to a country name.
  if (/^[a-z]{2,3}$/i.test(trimmed)) {
    const expanded = ISO_COUNTRY_NAMES[trimmed.toUpperCase()];
    if (expanded) return expanded;
  }
  return trimmed;
}

/**
 * Normalize and de-duplicate a list of raw location strings for an Apollo
 * `person_locations` / `organization_locations` filter.
 */
export function normalizeApolloLocations(
  inputs: (string | null | undefined)[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of inputs) {
    if (typeof raw !== "string") continue;
    const normalized = normalizeApolloLocation(raw);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}
