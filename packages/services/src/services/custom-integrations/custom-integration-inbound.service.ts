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
  INBOUND_EVENT_NAMES,
  InboundEventName,
  OwnershipContext,
  buildOwnershipFilter,
} from "@ringee/platform";
import { PrismaService } from "@ringee/database";

interface InboundEnvelope {
  event?: string;
  eventId?: string;
  occurredAt?: string;
  data?: Record<string, unknown>;
}

export interface InboundResult {
  status: "processed" | "skipped" | "failed";
  eventId: string;
  message?: string;
}

@Injectable()
export class CustomIntegrationInboundService {
  private readonly logger = new Logger(CustomIntegrationInboundService.name);

  constructor(
    private readonly inboundRepo: CustomIntegrationInboundRepository,
    private readonly contactLinkRepo: CustomIntegrationContactLinkRepository,
    private readonly companyLinkRepo: CustomIntegrationCompanyLinkRepository,
    private readonly contactRepo: ContactRepository,
    private readonly companyRepo: CompanyRepository,
    private readonly prisma: PrismaService,
  ) {}

  async handle(
    integration: CustomIntegration,
    envelope: InboundEnvelope,
  ): Promise<InboundResult> {
    const event = envelope.event;
    const eventId = envelope.eventId;
    const data = envelope.data;

    if (!event) throw new BadRequestException("event is required");
    if (!eventId) throw new BadRequestException("eventId is required");
    if (!envelope.occurredAt) throw new BadRequestException("occurredAt is required");
    if (!data || typeof data !== "object") {
      throw new BadRequestException("data must be an object");
    }
    if (!(INBOUND_EVENT_NAMES as readonly string[]).includes(event)) {
      throw new BadRequestException(`Unsupported event: ${event}`);
    }

    const inserted = await this.inboundRepo.insertReceived({
      integrationId: integration.id,
      eventType: event,
      externalEventId: eventId,
      rawPayload: envelope as unknown as Record<string, unknown>,
    });

    if (!inserted) {
      return { status: "skipped", eventId, message: "duplicate eventId" };
    }

    await this.inboundRepo.markStatus(inserted.id, "processing");

    const ctx: OwnershipContext = {
      userId: integration.userId,
      organizationId: integration.organizationId,
    };

    try {
      switch (event as InboundEventName) {
        case "contact.upserted":
          await this.handleContactUpserted(integration, ctx, data);
          break;
        case "company.upserted":
          await this.handleCompanyUpserted(integration, ctx, data);
          break;
        case "contact.deleted":
          await this.handleContactDeleted(integration, data);
          break;
        case "company.deleted":
          await this.handleCompanyDeleted(integration, data);
          break;
      }
      await this.inboundRepo.markStatus(inserted.id, "processed");
      return { status: "processed", eventId };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `inbound ${event} (integration=${integration.id}, eventId=${eventId}) failed: ${msg}`,
      );
      await this.inboundRepo.markStatus(inserted.id, "failed", msg);
      return { status: "failed", eventId, message: msg };
    }
  }

  // ── contact.upserted ─────────────────────────────────────────────

  private async handleContactUpserted(
    integration: CustomIntegration,
    ctx: OwnershipContext,
    data: Record<string, unknown>,
  ): Promise<void> {
    const externalId = requireString(data, "externalId");
    const phoneNumber = normalizePhone(requireString(data, "phoneNumber"));

    // Resolve / create company association first, so the contact's `company`
    // text field and crmMetadata can reference it.
    let companyName: string | null = pickString(data, "companyName");
    let resolvedCompanyId: string | null = null;
    const companyExternalId = pickString(data, "companyExternalId");
    if (companyExternalId) {
      const companyLink = await this.companyLinkRepo.findByExternalId(
        integration.id,
        companyExternalId,
      );
      if (companyLink?.companyId) {
        resolvedCompanyId = companyLink.companyId;
        const co = await this.companyRepo.findById(companyLink.companyId);
        if (co && !companyName) companyName = co.name;
      } else if (companyName) {
        const created = await this.companyRepo.create(ctx, { name: companyName });
        await this.companyLinkRepo.upsert({
          integrationId: integration.id,
          externalId: companyExternalId,
          companyId: created.id,
          clearArchived: true,
        });
        resolvedCompanyId = created.id;
      }
    }

    // Resolve existing contact: link → externalId, fallback → phone within workspace.
    const link = await this.contactLinkRepo.findByExternalId(integration.id, externalId);
    let contact: Contact | null = link?.contactId
      ? await this.contactRepo.findById(link.contactId)
      : null;
    if (!contact) {
      contact = await this.contactRepo.findByPhone(ctx, phoneNumber);
    }

    const fields = this.buildContactWriteFields(data, {
      phoneNumber,
      companyName,
      ownerId: await this.resolveOwnerId(ctx, data),
    });
    const writeFields = stripEmpty(fields);

    if (!contact) {
      // ContactRepository.create injects user + organization itself.
      contact = await this.contactRepo.create(ctx, {
        phoneNumber,
        ...writeFields,
      } as unknown as Prisma.ContactCreateInput);
    } else if (Object.keys(writeFields).length > 0) {
      await this.contactRepo.update(contact.id, writeFields as Prisma.ContactUpdateInput);
    }

    await this.contactLinkRepo.upsert({
      integrationId: integration.id,
      externalId,
      contactId: contact.id,
      rawSnapshot: data,
      clearArchived: true,
    });

    if (resolvedCompanyId) {
      // ContactAffiliation link is the proper Ringee model, but for MVP we
      // mirror what other integrations do: set the `company` text field on
      // the Contact (already handled by buildContactWriteFields above).
    }
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
      customFields: (customFields as Prisma.InputJsonValue | undefined) ?? undefined,
      crmMetadata: (crmMetadata as Prisma.InputJsonValue | undefined) ?? undefined,
    };
  }

  private async resolveOwnerId(
    ctx: OwnershipContext,
    data: Record<string, unknown>,
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
    return member?.userId ?? null;
  }

  // ── company.upserted ─────────────────────────────────────────────

  private async handleCompanyUpserted(
    integration: CustomIntegration,
    ctx: OwnershipContext,
    data: Record<string, unknown>,
  ): Promise<void> {
    const externalId = requireString(data, "externalId");
    const name = requireString(data, "name");

    const link = await this.companyLinkRepo.findByExternalId(integration.id, externalId);
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
      customFields: (pickObject(data, "customFields") as Prisma.InputJsonValue | undefined),
      crmMetadata: (pickObject(data, "crmMetadata") as Prisma.InputJsonValue | undefined),
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
    const link = await this.contactLinkRepo.findByExternalId(integration.id, externalId);
    if (!link) return; // nothing to archive
    await this.contactLinkRepo.markArchived(link.id);
  }

  // ── company.deleted ──────────────────────────────────────────────

  private async handleCompanyDeleted(
    integration: CustomIntegration,
    data: Record<string, unknown>,
  ): Promise<void> {
    const externalId = requireString(data, "externalId");
    const link = await this.companyLinkRepo.findByExternalId(integration.id, externalId);
    if (!link) return;
    await this.companyLinkRepo.markArchived(link.id);
  }
}

// ── helpers ────────────────────────────────────────────────────────

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

function pickObject(data: Record<string, unknown>, key: string): Record<string, unknown> | null {
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

function normalizePhone(input: string): string {
  // Minimal best-effort: keep leading +, strip spaces/dashes/parens.
  const cleaned = input.replace(/[\s\-().]/g, "");
  if (cleaned.startsWith("+")) return cleaned;
  if (/^\d+$/.test(cleaned)) return `+${cleaned}`;
  return cleaned;
}
