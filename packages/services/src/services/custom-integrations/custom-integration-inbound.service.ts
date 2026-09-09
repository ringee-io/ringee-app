import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import {
  Company,
  CompanyRepository,
  Contact,
  ContactRepository,
  CustomIntegration,
  CustomIntegrationCompanyLinkRepository,
  CustomIntegrationContactLinkRepository,
  CustomIntegrationInboundRepository,
  Prisma,
} from "@ringee/database";
import {
  InboundEventName,
  OwnershipContext,
  normalizePhoneE164,
  validateInboundEnvelope,
  validateInboundEventData,
} from "@ringee/platform";
import { PrismaService } from "@ringee/database";
import { CampaignService } from "../campaign.service";

export interface InboundResult {
  status: "processed" | "skipped" | "failed";
  eventId: string;
  message?: string;
  /**
   * Non-fatal remarks about the payload — a field that was ignored, a phone
   * number read with an assumed country. The event still applied.
   */
  warnings?: string[];
}

/**
 * The inbound half of the Public API: a CRM's view of a contact or company,
 * turned into Ringee records.
 *
 * Two properties every handler below is built around:
 *
 *  - **Validate, resolve, then write.** Everything that can reject the event —
 *    payload shape, phone normalization, the campaign it names — is settled
 *    before the first row is written, so a rejected event never leaves a
 *    half-synced contact behind.
 *  - **Say what was ignored.** A field Ringee silently drops is the most
 *    expensive kind of integration bug, so anything skipped comes back as a
 *    warning on the response.
 */
@Injectable()
export class CustomIntegrationInboundService {
  private readonly logger = new Logger(CustomIntegrationInboundService.name);

  constructor(
    private readonly inboundRepo: CustomIntegrationInboundRepository,
    private readonly contactLinkRepo: CustomIntegrationContactLinkRepository,
    private readonly companyLinkRepo: CustomIntegrationCompanyLinkRepository,
    private readonly contactRepo: ContactRepository,
    private readonly companyRepo: CompanyRepository,
    private readonly campaignService: CampaignService,
    private readonly prisma: PrismaService,
  ) {}

  async handle(
    integration: CustomIntegration,
    body: unknown,
  ): Promise<InboundResult> {
    // The envelope is checked before anything is recorded: without an eventId
    // there is nothing to deduplicate against, and without an event name there
    // is nothing to log the request as.
    const parsed = validateInboundEnvelope(body);
    if (!parsed.ok) {
      throw new BadRequestException(parsed.errors.join("; "));
    }
    const { event, eventId, data } = parsed.envelope;

    const inserted = await this.inboundRepo.insertReceived({
      integrationId: integration.id,
      eventType: event,
      externalEventId: eventId,
      rawPayload: parsed.envelope as unknown as Record<string, unknown>,
    });

    if (!inserted) {
      return { status: "skipped", eventId, message: "duplicate eventId" };
    }

    // Recorded first, validated second: a malformed payload is exactly what an
    // integrator needs to find in the event log afterwards.
    await this.inboundRepo.markStatus(inserted.id, "processing");

    const ctx: OwnershipContext = {
      userId: integration.userId,
      organizationId: integration.organizationId,
    };

    try {
      const warnings = await this.apply(integration, ctx, event, data);
      await this.inboundRepo.markStatus(inserted.id, "processed");
      return withWarnings({ status: "processed", eventId }, warnings);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `inbound ${event} (integration=${integration.id}, eventId=${eventId}) failed: ${msg}`,
      );
      await this.inboundRepo.markStatus(inserted.id, "failed", msg);
      return { status: "failed", eventId, message: msg };
    }
  }

  /** Validate the event's `data`, then apply it. Returns its warnings. */
  private async apply(
    integration: CustomIntegration,
    ctx: OwnershipContext,
    event: InboundEventName,
    data: Record<string, unknown>,
  ): Promise<string[]> {
    const issues = validateInboundEventData(event, data);
    if (issues.errors.length > 0) {
      throw new BadRequestException(issues.errors.join("; "));
    }

    switch (event) {
      case "contact.upserted":
        return [
          ...issues.warnings,
          ...(await this.handleContactUpserted(integration, ctx, data)),
        ];
      case "company.upserted":
        await this.handleCompanyUpserted(integration, ctx, data);
        return issues.warnings;
      case "contact.deleted":
        await this.handleContactDeleted(integration, data);
        return issues.warnings;
      case "company.deleted":
        await this.handleCompanyDeleted(integration, data);
        return issues.warnings;
    }
  }

  // ── contact.upserted ─────────────────────────────────────────────

  private async handleContactUpserted(
    integration: CustomIntegration,
    ctx: OwnershipContext,
    data: Record<string, unknown>,
  ): Promise<string[]> {
    const warnings: string[] = [];
    const externalId = requireString(data, "externalId");
    const phoneNumber = this.resolvePhoneNumber(data, warnings);

    // Resolved, not written, before anything else: an unknown campaign is a
    // payload mistake, and the sender should get it back with their contact
    // untouched rather than half-synced. `addContactToCampaign` re-checks it —
    // it is a public service method and cannot take our word for it.
    const campaignId = pickString(data, "campaignId");
    if (campaignId) {
      await this.campaignService.assertCampaignForLeadWrite(ctx, campaignId);
    }

    const ownerId = await this.resolveOwnerId(ctx, data, warnings);

    // Resolve / create company association first, so the contact's `company`
    // text field and crmMetadata can reference it. The proper Ringee model is
    // ContactAffiliation, but for MVP this mirrors the other integrations and
    // only sets the Contact's `company` text field.
    const companyName = await this.resolveCompanyName(integration, ctx, data);

    // Resolve existing contact: link → externalId, fallback → phone within workspace.
    const link = await this.contactLinkRepo.findByExternalId(
      integration.id,
      externalId,
    );
    let contact: Contact | null = link?.contactId
      ? await this.contactRepo.findById(link.contactId)
      : null;
    if (!contact) {
      contact = await this.contactRepo.findByPhone(ctx, phoneNumber);
    }

    const fields = this.buildContactWriteFields(data, {
      phoneNumber,
      companyName,
      ownerId,
    });
    const writeFields = stripEmpty(fields);

    if (!contact) {
      // ContactRepository.create injects user + organization itself.
      contact = await this.contactRepo.create(ctx, {
        phoneNumber,
        ...writeFields,
      } as unknown as Prisma.ContactCreateInput);
    } else if (Object.keys(writeFields).length > 0) {
      await this.contactRepo.update(
        contact.id,
        writeFields as Prisma.ContactUpdateInput,
      );
    }

    await this.contactLinkRepo.upsert({
      integrationId: integration.id,
      externalId,
      contactId: contact.id,
      rawSnapshot: data,
      clearArchived: true,
    });

    // Campaign membership is the external system's call, not ours: it names a
    // campaign, we put the contact in it. Adding an existing lead again is a
    // no-op, so a CRM that replays `contact.upserted` on every edit never
    // resets the attempts or dispositions the lead has already accumulated.
    if (campaignId) {
      await this.campaignService.addContactToCampaign(
        ctx,
        campaignId,
        contact.id,
      );
    }

    return warnings;
  }

  /**
   * E.164 through the canonical normalizer, which knows real numbering plans.
   * A number Ringee cannot turn into something dialable fails the event: the
   * whole point of a synced contact is that someone can call it.
   */
  private resolvePhoneNumber(
    data: Record<string, unknown>,
    warnings: string[],
  ): string {
    const raw = requireString(data, "phoneNumber");
    const normalized = normalizePhoneE164(raw);
    if (!normalized) {
      throw new BadRequestException(
        `data.phoneNumber is not a dialable number: ${raw}`,
      );
    }
    if (!raw.startsWith("+")) {
      warnings.push(
        `data.phoneNumber "${raw}" has no country code and was read as ${normalized}. Send E.164 to be sure.`,
      );
    }
    return normalized;
  }

  /** The company text this contact should carry, creating the link if needed. */
  private async resolveCompanyName(
    integration: CustomIntegration,
    ctx: OwnershipContext,
    data: Record<string, unknown>,
  ): Promise<string | null> {
    const companyName = pickString(data, "companyName");
    const companyExternalId = pickString(data, "companyExternalId");
    if (!companyExternalId) return companyName;

    const companyLink = await this.companyLinkRepo.findByExternalId(
      integration.id,
      companyExternalId,
    );

    if (companyLink?.companyId) {
      if (companyName) return companyName;
      const company = await this.companyRepo.findById(companyLink.companyId);
      return company?.name ?? null;
    }

    if (!companyName) return null;

    const created = await this.companyRepo.create(ctx, { name: companyName });
    await this.companyLinkRepo.upsert({
      integrationId: integration.id,
      externalId: companyExternalId,
      companyId: created.id,
      clearArchived: true,
    });
    return companyName;
  }

  private buildContactWriteFields(
    data: Record<string, unknown>,
    overrides: {
      phoneNumber: string;
      companyName: string | null;
      ownerId: string | null;
    },
  ): Prisma.ContactUncheckedUpdateInput {
    const customFields = pickObject(data, "customFields");
    const crmMetadata = pickObject(data, "crmMetadata");
    return {
      phoneNumber: overrides.phoneNumber,
      name: pickString(data, "name"),
      firstName: pickString(data, "firstName"),
      lastName: pickString(data, "lastName"),
      fullName: pickString(data, "fullName"),
      email: pickString(data, "email"),
      company: overrides.companyName ?? undefined,
      jobTitle: pickString(data, "jobTitle"),
      source: pickString(data, "source"),
      ownerId: overrides.ownerId ?? undefined,
      customFields:
        (customFields as Prisma.InputJsonValue | undefined) ?? undefined,
      crmMetadata:
        (crmMetadata as Prisma.InputJsonValue | undefined) ?? undefined,
    };
  }

  private async resolveOwnerId(
    ctx: OwnershipContext,
    data: Record<string, unknown>,
    warnings: string[],
  ): Promise<string | null> {
    // Freelancer workspace: owner is always the workspace user.
    if (!ctx.organizationId) return ctx.userId;

    const ownerEmail = pickString(data, "ownerEmail");
    if (!ownerEmail) return null;

    const member = await this.prisma.organizationMembership.findFirst({
      where: {
        organizationId: ctx.organizationId,
        user: { emails: { some: { email: ownerEmail.toLowerCase() } } },
      },
      include: { user: true },
    });

    if (!member) {
      // Not fatal — an unassigned contact is still callable — but it is the
      // one thing an integrator cannot see from the outside.
      warnings.push(
        `data.ownerEmail "${ownerEmail}" does not match a member of this workspace; the contact was left unassigned.`,
      );
      return null;
    }

    return member.userId;
  }

  // ── company.upserted ─────────────────────────────────────────────

  private async handleCompanyUpserted(
    integration: CustomIntegration,
    ctx: OwnershipContext,
    data: Record<string, unknown>,
  ): Promise<void> {
    const externalId = requireString(data, "externalId");
    const name = requireString(data, "name");

    const link = await this.companyLinkRepo.findByExternalId(
      integration.id,
      externalId,
    );
    let company: Company | null = link?.companyId
      ? await this.companyRepo.findById(link.companyId)
      : null;

    // Secondary dedup by domain within workspace.
    const domain = pickString(data, "domain");
    if (!company && domain) {
      company = await this.companyRepo.findByDomain(ctx, domain);
    }

    const fields: Prisma.CompanyUpdateInput = stripEmpty({
      name,
      legalName: pickString(data, "legalName"),
      domain,
      industry: pickString(data, "industry"),
      size: pickString(data, "size"),
      phone: pickString(data, "phone"),
      website: pickString(data, "website"),
      source: pickString(data, "source"),
      customFields: pickObject(data, "customFields") as
        | Prisma.InputJsonValue
        | undefined,
      crmMetadata: pickObject(data, "crmMetadata") as
        | Prisma.InputJsonValue
        | undefined,
    }) as Prisma.CompanyUpdateInput;

    if (!company) {
      company = await this.companyRepo.create(ctx, {
        name,
        domain: domain ?? null,
        industry: pickString(data, "industry") ?? null,
        size: pickString(data, "size") ?? null,
        phone: pickString(data, "phone") ?? null,
        website: pickString(data, "website") ?? null,
        source: pickString(data, "source") ?? null,
        customFields: pickObject(data, "customFields") ?? null,
        crmMetadata: pickObject(data, "crmMetadata") ?? null,
      });
    } else if (Object.keys(fields).length > 0) {
      await this.companyRepo.update(company.id, fields);
    }

    await this.companyLinkRepo.upsert({
      integrationId: integration.id,
      externalId,
      companyId: company.id,
      rawSnapshot: data,
      clearArchived: true,
    });
  }

  // ── contact.deleted ──────────────────────────────────────────────

  private async handleContactDeleted(
    integration: CustomIntegration,
    data: Record<string, unknown>,
  ): Promise<void> {
    const externalId = requireString(data, "externalId");
    const link = await this.contactLinkRepo.findByExternalId(
      integration.id,
      externalId,
    );
    if (!link) return; // nothing to archive
    await this.contactLinkRepo.markArchived(link.id);
  }

  // ── company.deleted ──────────────────────────────────────────────

  private async handleCompanyDeleted(
    integration: CustomIntegration,
    data: Record<string, unknown>,
  ): Promise<void> {
    const externalId = requireString(data, "externalId");
    const link = await this.companyLinkRepo.findByExternalId(
      integration.id,
      externalId,
    );
    if (!link) return;
    await this.companyLinkRepo.markArchived(link.id);
  }
}

// ── helpers ────────────────────────────────────────────────────────

function withWarnings(
  result: InboundResult,
  warnings: string[],
): InboundResult {
  return warnings.length > 0 ? { ...result, warnings } : result;
}

/**
 * Required fields are already guaranteed by `validateInboundEventData`; this
 * narrows the type for the handlers and stays as the last line of defence for
 * a field the spec has not caught up with.
 */
function requireString(data: Record<string, unknown>, key: string): string {
  const v = data[key];
  if (typeof v !== "string" || v.trim() === "") {
    throw new BadRequestException(`data.${key} is required`);
  }
  return v.trim();
}

function pickString(data: Record<string, unknown>, key: string): string | null {
  const v = data[key];
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed === "" ? null : trimmed;
}

function pickObject(
  data: Record<string, unknown>,
  key: string,
): Record<string, unknown> | null {
  const v = data[key];
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function stripEmpty<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    out[k] = v;
  }
  return out as Partial<T>;
}
