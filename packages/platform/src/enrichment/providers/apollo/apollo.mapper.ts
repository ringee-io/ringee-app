import type {
  EnrichedCompany,
  EnrichedPerson,
  EnrichedSocialProfile,
} from "../../types";
import type { ApolloOrganization, ApolloPerson } from "./apollo.types";

export function mapApolloCompany(
  o: ApolloOrganization | undefined | null,
): EnrichedCompany | null {
  if (!o) return null;
  const social: EnrichedSocialProfile[] = [];
  if (o.linkedin_url)
    social.push({ platform: "linkedin", url: o.linkedin_url });
  if (o.twitter_url) social.push({ platform: "twitter", url: o.twitter_url });
  if (o.facebook_url)
    social.push({ platform: "facebook", url: o.facebook_url });
  if (o.crunchbase_url)
    social.push({ platform: "crunchbase", url: o.crunchbase_url });

  return {
    name: o.name ?? null,
    domain: o.primary_domain ?? o.domain ?? null,
    description: o.long_description ?? o.short_description ?? null,
    industry: o.industry ?? null,
    employeeCount: o.estimated_num_employees ?? null,
    foundedYear: o.founded_year ?? null,
    annualRevenue: o.annual_revenue ?? null,
    fundingTotal: o.total_funding ?? null,
    fundingStage: o.latest_funding_stage ?? null,
    ticker: o.publicly_traded_symbol ?? null,
    exchange: o.publicly_traded_exchange ?? null,
    website: o.website_url ?? null,
    phone: o.phone ?? null,
    technologies: o.technology_names ?? null,
    keywords: o.keywords ?? null,
    logoUrl: o.logo_url ?? null,
    linkedinUrl: o.linkedin_url ?? null,
    twitterUrl: o.twitter_url ?? null,
    facebookUrl: o.facebook_url ?? null,
    crunchbaseUrl: o.crunchbase_url ?? null,
    socialProfiles: social.length > 0 ? social : null,
    hq:
      o.city || o.state || o.country
        ? {
            street: o.street_address ?? null,
            city: o.city ?? null,
            region: o.state ?? null,
            postalCode: o.postal_code ?? null,
            country: o.country ?? null,
          }
        : null,
  };
}

export function mapApolloPerson(p: ApolloPerson): EnrichedPerson {
  const social: EnrichedSocialProfile[] = [];
  if (p.linkedin_url)
    social.push({ platform: "linkedin", url: p.linkedin_url });
  if (p.twitter_url) social.push({ platform: "twitter", url: p.twitter_url });
  if (p.github_url) social.push({ platform: "github", url: p.github_url });
  if (p.facebook_url)
    social.push({ platform: "facebook", url: p.facebook_url });

  const phones = (p.phone_numbers ?? [])
    .map((ph) => ({
      value: ph.sanitized_number ?? ph.raw_number ?? "",
      type: ph.type ?? null,
    }))
    .filter((x) => x.value);

  const verified = p.email_status === "verified";

  return {
    firstName: p.first_name ?? null,
    lastName: p.last_name ?? null,
    fullName: p.name ?? null,
    headline: p.headline ?? null,
    jobTitle: p.title ?? null,
    seniority: p.seniority ?? null,
    department: p.departments?.[0] ?? null,
    emails: p.email ? [{ value: p.email, type: "work", verified }] : [],
    phones,
    socialProfiles: social,
    linkedinUrl: p.linkedin_url ?? null,
    twitterUrl: p.twitter_url ?? null,
    githubUrl: p.github_url ?? null,
    facebookUrl: p.facebook_url ?? null,
    location:
      p.city || p.state || p.country
        ? {
            city: p.city ?? null,
            region: p.state ?? null,
            country: p.country ?? null,
          }
        : null,
    workHistory:
      p.employment_history?.map((h) => ({
        company: h.organization_name ?? null,
        title: h.title ?? null,
        startDate: h.start_date ? new Date(h.start_date) : null,
        endDate: h.end_date ? new Date(h.end_date) : null,
        current: h.current ?? null,
      })) ?? null,
  };
}
