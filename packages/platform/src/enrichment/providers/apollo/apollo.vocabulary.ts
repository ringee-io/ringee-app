// Verified vocabulary + normalizers for Apollo's `/v1/mixed_people/search`
// filter surface. Unlike Prospeo (which 400s on an unknown enum value),
// Apollo silently ignores filter values it does not recognise — a wrong
// seniority code or a mis-formatted employee range just quietly produces a
// worse result set with no error to react to. Normalizing the agent's
// natural-language / Prospeo-style filters into Apollo's exact vocabulary
// here is what keeps lead search precise.
//
// Sourced from the People Search API reference:
//   https://docs.apollo.io/reference/people-api-search
//
// NOTE on coverage: Apollo's *documented* people-search filters are
// seniorities, employee ranges, locations, technologies, revenue and email
// status — all handled below. Industry and department filtering depend on
// Apollo-internal tag IDs that are NOT publicly enumerable, so industries are
// handled best-effort (see normalizeIndustryTagIds) rather than with a
// hard-coded name→ID table we could not keep correct.

// ── Seniorities ───────────────────────────────────────────────────────────
// Verbatim accepted values for `person_seniorities[]`. Apollo keeps "founder"
// and "owner" as distinct codes (Prospeo merges them into "Founder/Owner").

export const APOLLO_SENIORITIES = [
  "owner",
  "founder",
  "c_suite",
  "partner",
  "vp",
  "head",
  "director",
  "manager",
  "senior",
  "entry",
  "intern",
] as const;
const APOLLO_SENIORITY_SET = new Set<string>(APOLLO_SENIORITIES);

// Natural-language / Prospeo-style seniority names → Apollo codes. A value
// may map to several codes (e.g. "founder/owner" covers both).
const SENIORITY_ALIASES: Record<string, string | string[]> = {
  founder: "founder",
  "co-founder": "founder",
  cofounder: "founder",
  "co founder": "founder",
  owner: "owner",
  "business owner": "owner",
  proprietor: "owner",
  "founder/owner": ["founder", "owner"],
  "founder owner": ["founder", "owner"],
  "owner/founder": ["founder", "owner"],
  "c-suite": "c_suite",
  "c suite": "c_suite",
  csuite: "c_suite",
  cxo: "c_suite",
  executive: "c_suite",
  "chief executive": "c_suite",
  ceo: "c_suite",
  cto: "c_suite",
  coo: "c_suite",
  cfo: "c_suite",
  cmo: "c_suite",
  cro: "c_suite",
  cio: "c_suite",
  ciso: "c_suite",
  cpo: "c_suite",
  partner: "partner",
  "managing partner": "partner",
  vp: "vp",
  "v.p.": "vp",
  "vice president": "vp",
  "vice-president": "vp",
  svp: "vp",
  "senior vice president": "vp",
  evp: "vp",
  "executive vice president": "vp",
  head: "head",
  "head of": "head",
  director: "director",
  "director of": "director",
  "senior director": "director",
  manager: "manager",
  "senior manager": "manager",
  lead: "manager",
  senior: "senior",
  "senior-level": "senior",
  "mid-senior": "senior",
  entry: "entry",
  "entry-level": "entry",
  "entry level": "entry",
  junior: "entry",
  associate: "entry",
  intern: "intern",
  internship: "intern",
  trainee: "intern",
};

export function normalizeSeniorities(input: string[] | undefined): string[] {
  if (!input?.length) return [];
  const out = new Set<string>();
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const lc = trimmed.toLowerCase();
    // Apollo codes are lowercase; accept an exact code straight away.
    if (APOLLO_SENIORITY_SET.has(lc)) {
      out.add(lc);
      continue;
    }
    const alias = SENIORITY_ALIASES[lc];
    if (alias) {
      for (const v of Array.isArray(alias) ? alias : [alias]) {
        if (APOLLO_SENIORITY_SET.has(v)) out.add(v);
      }
    }
    // Otherwise drop — Apollo silently ignores unknown seniorities anyway.
  }
  return Array.from(out);
}

// ── Employee count ranges ─────────────────────────────────────────────────
// `organization_num_employees_ranges[]` wants the bounds joined by a single
// comma, e.g. "1,10" or "10000,20000". Apollo accepts arbitrary bounds (not
// just preset brackets), so we just translate whatever range syntax the
// caller used — dashes, "to", a bare "X,Y", or an open-ended "X+".

// Upper sentinel for open-ended ranges ("10001+"): large enough to cover any
// real headcount without Apollo treating it as unbounded.
const EMPLOYEES_OPEN_MAX = 1_000_000;

function toEmployeeInt(token: string): number | null {
  // Drop thousands separators / whitespace before parsing.
  const n = Number(token.replace(/[,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

function parseEmployeeRange(raw: string): string | null {
  const t = raw.trim().toLowerCase();
  if (!t) return null;
  // Open-ended: "10001+", "10000 +", "5000plus".
  const open = t.match(/^(\d[\d,]*)\s*(?:\+|plus)$/);
  if (open) {
    const min = toEmployeeInt(open[1]);
    return min == null ? null : `${min},${EMPLOYEES_OPEN_MAX}`;
  }
  // Closed range: "1-10", "1 to 10", "1 – 10", or already-Apollo "1,10".
  const range = t.match(/^(\d[\d,]*)\s*(?:-|–|—|to|,)\s*(\d[\d,]*)$/);
  if (range) {
    const a = toEmployeeInt(range[1]);
    const b = toEmployeeInt(range[2]);
    if (a == null || b == null) return null;
    return a <= b ? `${a},${b}` : `${b},${a}`;
  }
  // A bare single number is too ambiguous to turn into a useful range — drop.
  return null;
}

export function normalizeEmployeeRanges(input: string[] | undefined): string[] {
  if (!input?.length) return [];
  const out = new Set<string>();
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const parsed = parseEmployeeRange(raw);
    if (parsed) out.add(parsed);
  }
  return Array.from(out);
}

// ── Technologies ──────────────────────────────────────────────────────────
// `currently_using_any_of_technology_uids[]` expects Apollo technology UIDs:
// lowercase, spaces and punctuation collapsed to underscores
// (e.g. "Google Analytics" → "google_analytics", "WordPress.org" →
// "wordpress_org").

export function normalizeTechnologies(input: string[] | undefined): string[] {
  if (!input?.length) return [];
  const out = new Set<string>();
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const uid = raw
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (uid) out.add(uid);
  }
  return Array.from(out);
}

// ── Contact email status ──────────────────────────────────────────────────
// Verbatim accepted values for `contact_email_status[]`.

export const APOLLO_EMAIL_STATUSES = [
  "verified",
  "unverified",
  "likely to engage",
  "unavailable",
] as const;

// Statuses worth targeting when the caller only asks for "has a usable email".
export const APOLLO_REACHABLE_EMAIL_STATUSES: readonly string[] = [
  "verified",
  "likely to engage",
];

// ── Revenue range ─────────────────────────────────────────────────────────
// `revenue_range` is an OBJECT (`{ min, max }`) of plain integers — not an
// array of strings. We accept whatever band syntax the caller used
// ("1M-10M", "$1,000,000 - $10,000,000", ">100M", "under 5m", …) and collapse
// every band into a single overall {min, max} window.

function parseMoneyToken(token: string): number | null {
  const t = token
    .trim()
    .toLowerCase()
    .replace(/[$€£,\s]/g, "");
  if (!t) return null;
  const m = t.match(/^(\d+(?:\.\d+)?)(k|m|mm|b|bn)?$/);
  if (!m) return null;
  let n = parseFloat(m[1]);
  switch (m[2]) {
    case "k":
      n *= 1_000;
      break;
    case "m":
    case "mm":
      n *= 1_000_000;
      break;
    case "b":
    case "bn":
      n *= 1_000_000_000;
      break;
    default:
      break;
  }
  return Number.isFinite(n) ? Math.round(n) : null;
}

function parseRevenueBand(raw: string): {
  lo: number | null;
  hi: number | null;
} {
  const t = raw.trim().toLowerCase();
  if (!t) return { lo: null, hi: null };
  // Closed range: "A - B", "A to B".
  const range = t.match(/^(.+?)\s*(?:-|–|—|to)\s*(.+)$/);
  if (range) {
    return { lo: parseMoneyToken(range[1]), hi: parseMoneyToken(range[2]) };
  }
  // Open-ended minimum: "A+", ">A", ">=A", "over A", "at least A".
  if (/(\+\s*$)|^(?:>=?|over|more than|at least|min)/.test(t)) {
    const m = t.match(/([\d.,$€£kmb]+)/);
    return { lo: m ? parseMoneyToken(m[1]) : null, hi: null };
  }
  // Open-ended maximum: "<B", "under B", "up to B", "at most B".
  if (/^(?:<=?|under|up to|less than|at most|max)/.test(t)) {
    const m = t.match(/([\d.,$€£kmb]+)/);
    return { lo: null, hi: m ? parseMoneyToken(m[1]) : null };
  }
  // A single value with no qualifier — treat it as a floor.
  return { lo: parseMoneyToken(t), hi: null };
}

export function toApolloRevenueRange(
  input: string[] | undefined,
): { min?: number; max?: number } | null {
  if (!input?.length) return null;
  let min: number | undefined;
  let max: number | undefined;
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const { lo, hi } = parseRevenueBand(raw);
    if (lo != null) min = min == null ? lo : Math.min(min, lo);
    if (hi != null) max = max == null ? hi : Math.max(max, hi);
  }
  if (min == null && max == null) return null;
  const out: { min?: number; max?: number } = {};
  if (min != null) out.min = min;
  if (max != null) out.max = max;
  return out;
}

// ── Industries ────────────────────────────────────────────────────────────
// Apollo filters industries by `organization_industry_tag_ids[]`, which are
// Apollo-internal Mongo ObjectIds (24-char hex) — they are not publicly
// enumerable and cannot be derived from an industry name offline. So:
//   • values that already look like an Apollo tag ID pass straight through;
//   • plain industry NAMES are returned as `unmatched` so the provider can
//     fold them into the free-text `q_keywords` filter instead of silently
//     sending a name where an ID is expected.

const APOLLO_OBJECT_ID = /^[a-f0-9]{24}$/i;

export function looksLikeApolloId(value: string): boolean {
  return APOLLO_OBJECT_ID.test(value.trim());
}

export function normalizeIndustryTagIds(input: string[] | undefined): {
  tagIds: string[];
  unmatched: string[];
} {
  const tagIds = new Set<string>();
  const unmatched: string[] = [];
  for (const raw of input ?? []) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (looksLikeApolloId(trimmed)) tagIds.add(trimmed.toLowerCase());
    else unmatched.push(trimmed);
  }
  return { tagIds: Array.from(tagIds), unmatched };
}
