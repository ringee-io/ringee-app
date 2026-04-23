import { Injectable, Logger } from "@nestjs/common";
import {
  Company,
  CompanyRepository,
  Contact,
  ContactAffiliationRepository,
  ContactEmailRepository,
  ContactPhoneRepository,
  ContactRepository,
  Prisma,
  SocialLinkRepository,
  SocialPlatform,
} from "@ringee/database";
import {
  EnrichedCompany,
  EnrichedPerson,
  EnrichedSocialProfile,
  EnrichmentResult,
  OwnershipContext,
} from "@ringee/platform";

const CONFIDENCE_THRESHOLD = 0.7;

export type MergeOutcome = {
  contact: Contact;
  company: Company | null;
  changedScalarFields: string[];
  appendedEmails: number;
  appendedPhones: number;
  appendedSocialLinks: number;
};

@Injectable()
export class EnrichmentMergeService {
  private readonly logger = new Logger(EnrichmentMergeService.name);

  constructor(
    private readonly contactRepo: ContactRepository,
    private readonly contactEmailRepo: ContactEmailRepository,
    private readonly contactPhoneRepo: ContactPhoneRepository,
    private readonly companyRepo: CompanyRepository,
    private readonly affiliationRepo: ContactAffiliationRepository,
    private readonly socialLinkRepo: SocialLinkRepository,
  ) {}

  /**
   * Non-destructive merge: only fills empty scalar fields when the provider
   * confidence is at or above the threshold; appends multivalued data.
   */
  async mergeIntoContact(
    ctx: OwnershipContext,
    contact: Contact,
    result: EnrichmentResult,
    providerLabel: string,
  ): Promise<MergeOutcome> {
    const outcome: MergeOutcome = {
      contact,
      company: null,
      changedScalarFields: [],
      appendedEmails: 0,
      appendedPhones: 0,
      appendedSocialLinks: 0,
    };

    if (!result.found || !result.person) return outcome;

    const confident =
      result.confidence === null ||
      (typeof result.confidence === "number" &&
        result.confidence >= CONFIDENCE_THRESHOLD);

    const scalarUpdates = confident
      ? this.computeContactScalarUpdates(contact, result.person)
      : {};

    if (Object.keys(scalarUpdates).length > 0) {
      outcome.changedScalarFields = Object.keys(scalarUpdates);
      outcome.contact = await this.contactRepo.update(contact.id, {
        ...scalarUpdates,
        enrichmentMetadata: {
          provider: providerLabel,
          at: new Date().toISOString(),
          confidence: result.confidence,
        } as Prisma.InputJsonValue,
        lastEnrichedAt: new Date(),
      });
    } else {
      // even when nothing scalar changed, record that we tried
      outcome.contact = await this.contactRepo.update(contact.id, {
        enrichmentMetadata: {
          provider: providerLabel,
          at: new Date().toISOString(),
          confidence: result.confidence,
          note: "no scalar fields changed",
        } as Prisma.InputJsonValue,
        lastEnrichedAt: new Date(),
      });
    }

    // Append multi-valued data
    outcome.appendedEmails = await this.appendEmails(
      contact.id,
      result.person.emails ?? [],
    );
    outcome.appendedPhones = await this.appendPhones(
      contact.id,
      result.person.phones ?? [],
    );
    outcome.appendedSocialLinks = await this.appendSocialLinks(
      contact.id,
      result.person,
    );

    // Affiliation + Company
    if (result.company) {
      outcome.company = await this.findOrCreateCompany(ctx, result.company);
      if (outcome.company) {
        await this.affiliationRepo.upsert({
          contactId: contact.id,
          companyId: outcome.company.id,
          role: result.person.jobTitle ?? null,
        });
      }
    }

    return outcome;
  }

  private computeContactScalarUpdates(
    contact: Contact,
    p: EnrichedPerson,
  ): Prisma.ContactUpdateInput {
    const updates: Prisma.ContactUpdateInput = {};
    const fillIfEmpty = <K extends keyof Contact>(
      key: K,
      value: NonNullable<Contact[K]> | null | undefined,
    ) => {
      if (contact[key] != null && contact[key] !== "") return;
      if (value == null || value === "") return;
      (updates as Record<string, unknown>)[key as string] = value;
    };

    fillIfEmpty("firstName", p.firstName);
    fillIfEmpty("lastName", p.lastName);
    fillIfEmpty("name", p.fullName ?? null);
    fillIfEmpty("fullName", p.fullName ?? null);
    fillIfEmpty("jobTitle", p.jobTitle);
    fillIfEmpty("headline", p.headline);
    fillIfEmpty("summary", p.summary);
    fillIfEmpty("seniority", p.seniority);
    fillIfEmpty("department", p.department);
    fillIfEmpty("yearsExperience", p.yearsExperience);

    fillIfEmpty("linkedinUrl", p.linkedinUrl);
    fillIfEmpty("twitterUrl", p.twitterUrl);
    fillIfEmpty("githubUrl", p.githubUrl);
    fillIfEmpty("facebookUrl", p.facebookUrl);
    fillIfEmpty("websiteUrl", p.websiteUrl);

    if (p.location) {
      fillIfEmpty("locationCity", p.location.city);
      fillIfEmpty("locationRegion", p.location.region);
      fillIfEmpty("locationCountry", p.location.country);
      fillIfEmpty("locationCountryCode", p.location.countryCode);
      fillIfEmpty("locationPostalCode", p.location.postalCode);
    }
    fillIfEmpty("timezone", p.timezone);

    // Append-style for arrays: only set if currently empty
    if (
      (!contact.languages || contact.languages.length === 0) &&
      p.languages?.length
    ) {
      updates.languages = p.languages;
    }
    if ((!contact.skills || contact.skills.length === 0) && p.skills?.length) {
      updates.skills = p.skills;
    }
    // First email becomes primary email if empty
    const primaryEmail = p.emails?.[0]?.value;
    if (!contact.email && primaryEmail) {
      updates.email = primaryEmail;
    }
    // Mark email verified if provider marked it so AND we just set/match it
    const matchedEmail = p.emails?.find(
      (e) => e.value === (updates.email ?? contact.email),
    );
    if (matchedEmail?.verified && !contact.emailVerified) {
      updates.emailVerified = true;
    }

    return updates;
  }

  private async appendEmails(
    contactId: string,
    emails: {
      value: string;
      type?: string | null;
      verified?: boolean | null;
    }[],
  ): Promise<number> {
    let appended = 0;
    for (const e of emails) {
      if (!e.value) continue;
      try {
        await this.contactEmailRepo.upsert({
          contactId,
          email: e.value,
          type: e.type ?? "work",
        });
        appended += 1;
      } catch (err) {
        this.logger.debug(
          `skip email ${e.value} for ${contactId}: ${(err as Error).message}`,
        );
      }
    }
    return appended;
  }

  private async appendPhones(
    contactId: string,
    phones: { value: string; type?: string | null }[],
  ): Promise<number> {
    let appended = 0;
    for (const p of phones) {
      if (!p.value) continue;
      try {
        await this.contactPhoneRepo.upsert({
          contactId,
          phone: p.value,
          type: p.type ?? "work",
        });
        appended += 1;
      } catch (err) {
        this.logger.debug(
          `skip phone ${p.value} for ${contactId}: ${(err as Error).message}`,
        );
      }
    }
    return appended;
  }

  private async appendSocialLinks(
    contactId: string,
    p: EnrichedPerson,
  ): Promise<number> {
    const links: EnrichedSocialProfile[] = [...(p.socialProfiles ?? [])];
    const pushUnique = (platform: string, url: string | null | undefined) => {
      if (!url) return;
      if (links.find((l) => l.url === url)) return;
      links.push({ platform, url });
    };
    pushUnique("linkedin", p.linkedinUrl);
    pushUnique("twitter", p.twitterUrl);
    pushUnique("github", p.githubUrl);
    pushUnique("facebook", p.facebookUrl);
    pushUnique("website", p.websiteUrl);

    let appended = 0;
    for (const link of links) {
      const platform = mapPlatform(link.platform);
      try {
        await this.socialLinkRepo.upsertForContact(contactId, {
          platform,
          url: link.url,
          handle: link.handle ?? null,
        });
        appended += 1;
      } catch (err) {
        this.logger.debug(`skip social ${link.url}: ${(err as Error).message}`);
      }
    }
    return appended;
  }

  /**
   * Find or create a company matching by domain (preferred) then by name.
   * Always merges enrichment fields non-destructively.
   */
  async findOrCreateCompany(
    ctx: OwnershipContext,
    c: EnrichedCompany,
  ): Promise<Company | null> {
    if (!c.name && !c.domain) return null;

    let existing: Company | null = null;
    if (c.domain) existing = await this.companyRepo.findByDomain(ctx, c.domain);
    if (!existing && c.name)
      existing = await this.companyRepo.findByName(ctx, c.name);

    if (!existing) {
      existing = await this.companyRepo.create(ctx, {
        name: c.name ?? c.domain ?? "Unknown",
        domain: c.domain ?? null,
        industry: c.industry ?? null,
        size: c.size ?? c.employeeCountRange ?? null,
        phone: c.phone ?? null,
        website: c.website ?? null,
        source: "enrichment",
      });
    }

    // Non-destructive merge of new fields
    const updates: Prisma.CompanyUpdateInput = {};
    const setIfEmpty = <K extends keyof Company>(
      key: K,
      value: NonNullable<Company[K]> | null | undefined,
    ) => {
      if (existing![key] != null && existing![key] !== "") return;
      if (value == null || value === "") return;
      (updates as Record<string, unknown>)[key as string] = value;
    };

    setIfEmpty("description", c.description);
    setIfEmpty("industry", c.industry);
    setIfEmpty("subIndustry", c.subIndustry);
    setIfEmpty("size", c.size ?? c.employeeCountRange);
    setIfEmpty("employeeCount", c.employeeCount);
    setIfEmpty("employeeCountRange", c.employeeCountRange);
    setIfEmpty(
      "annualRevenue",
      c.annualRevenue ? BigInt(Math.round(c.annualRevenue)) : null,
    );
    setIfEmpty("revenueRange", c.revenueRange);
    setIfEmpty(
      "fundingTotal",
      c.fundingTotal ? BigInt(Math.round(c.fundingTotal)) : null,
    );
    setIfEmpty("fundingStage", c.fundingStage);
    setIfEmpty("foundedYear", c.foundedYear);
    setIfEmpty("companyType", c.companyType);
    setIfEmpty("ticker", c.ticker);
    setIfEmpty("exchange", c.exchange);
    setIfEmpty("website", c.website);
    setIfEmpty("phone", c.phone);
    setIfEmpty("contactEmail", c.contactEmail);
    setIfEmpty("emailDomain", c.emailDomain);
    setIfEmpty("logoUrl", c.logoUrl);
    setIfEmpty("linkedinUrl", c.linkedinUrl);
    setIfEmpty("twitterUrl", c.twitterUrl);
    setIfEmpty("facebookUrl", c.facebookUrl);
    setIfEmpty("crunchbaseUrl", c.crunchbaseUrl);
    if (
      (!existing.technologies || existing.technologies.length === 0) &&
      c.technologies?.length
    ) {
      updates.technologies = c.technologies;
    }
    if (
      (!existing.keywords || existing.keywords.length === 0) &&
      c.keywords?.length
    ) {
      updates.keywords = c.keywords;
    }
    if (c.hq) {
      setIfEmpty("hqStreet", c.hq.street);
      setIfEmpty("hqCity", c.hq.city);
      setIfEmpty("hqRegion", c.hq.region);
      setIfEmpty("hqPostalCode", c.hq.postalCode);
      setIfEmpty("hqCountry", c.hq.country);
      setIfEmpty("hqCountryCode", c.hq.countryCode);
    }

    updates.lastEnrichedAt = new Date();

    const updated = await this.companyRepo.update(existing.id, updates);

    // Append company social links
    const social: EnrichedSocialProfile[] = [...(c.socialProfiles ?? [])];
    const pushUnique = (platform: string, url: string | null | undefined) => {
      if (!url) return;
      if (social.find((l) => l.url === url)) return;
      social.push({ platform, url });
    };
    pushUnique("linkedin", c.linkedinUrl);
    pushUnique("twitter", c.twitterUrl);
    pushUnique("facebook", c.facebookUrl);
    pushUnique("crunchbase", c.crunchbaseUrl);

    for (const link of social) {
      try {
        await this.socialLinkRepo.upsertForCompany(updated.id, {
          platform: mapPlatform(link.platform),
          url: link.url,
          handle: link.handle ?? null,
        });
      } catch (err) {
        this.logger.debug(
          `skip company social ${link.url}: ${(err as Error).message}`,
        );
      }
    }

    return updated;
  }
}

function mapPlatform(name: string): SocialPlatform {
  const k = name.toLowerCase();
  const map: Record<string, SocialPlatform> = {
    linkedin: SocialPlatform.linkedin,
    twitter: SocialPlatform.twitter,
    x: SocialPlatform.twitter,
    github: SocialPlatform.github,
    facebook: SocialPlatform.facebook,
    instagram: SocialPlatform.instagram,
    youtube: SocialPlatform.youtube,
    tiktok: SocialPlatform.tiktok,
    pinterest: SocialPlatform.pinterest,
    reddit: SocialPlatform.reddit,
    medium: SocialPlatform.medium,
    dribbble: SocialPlatform.dribbble,
    behance: SocialPlatform.behance,
    stackoverflow: SocialPlatform.stackoverflow,
    angellist: SocialPlatform.angellist,
    crunchbase: SocialPlatform.crunchbase,
    producthunt: SocialPlatform.producthunt,
    website: SocialPlatform.website,
    blog: SocialPlatform.blog,
    calendly: SocialPlatform.calendly,
    skype: SocialPlatform.skype,
    telegram: SocialPlatform.telegram,
    whatsapp: SocialPlatform.whatsapp,
    signal: SocialPlatform.signal,
    discord: SocialPlatform.discord,
    slack: SocialPlatform.slack,
  };
  return map[k] ?? SocialPlatform.other;
}
