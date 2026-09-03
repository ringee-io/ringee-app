import { Injectable } from "@nestjs/common";
import { Company, Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma.service";
import { OwnershipContext, buildOwnershipFilter } from "@ringee/platform";

function normalizeCompanyName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

@Injectable()
export class CompanyRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<Company | null> {
    return this.prisma.company.findFirst({
      where: { id, deletedAt: null },
    });
  }

  findByDomain(ctx: OwnershipContext, domain: string): Promise<Company | null> {
    return this.prisma.company.findFirst({
      where: {
        ...buildOwnershipFilter(ctx),
        domain: { equals: domain, mode: "insensitive" },
        deletedAt: null,
      },
    });
  }

  findByName(ctx: OwnershipContext, name: string): Promise<Company | null> {
    return this.prisma.company.findFirst({
      where: {
        ...buildOwnershipFilter(ctx),
        normalizedName: normalizeCompanyName(name),
        deletedAt: null,
      },
    });
  }

  /**
   * Atomically resolve the active company for a normalized name and workspace.
   * The matching partial unique indexes are defined by the database migration.
   */
  async upsertActiveByName(
    ctx: OwnershipContext,
    data: {
      name: string;
      website?: string | null;
      linkedinUrl: string;
      source?: string | null;
    },
  ): Promise<Company> {
    const normalizedName = normalizeCompanyName(data.name);
    const website = data.website?.trim() || null;
    const conflictTarget = ctx.organizationId
      ? Prisma.sql`("organizationId", "normalizedName")
          WHERE "deletedAt" IS NULL AND "organizationId" IS NOT NULL`
      : Prisma.sql`("userId", "normalizedName")
          WHERE "deletedAt" IS NULL AND "organizationId" IS NULL`;

    const companies = await this.prisma.$queryRaw<Company[]>(Prisma.sql`
      INSERT INTO "Company" (
        "id",
        "name",
        "normalizedName",
        "secondaryDomains",
        "technologies",
        "keywords",
        "tags",
        "website",
        "linkedinUrl",
        "userId",
        "organizationId",
        "source",
        "createdAt",
        "updatedAt"
      ) VALUES (
        ${randomUUID()}::uuid,
        ${data.name.trim()},
        ${normalizedName},
        ARRAY[]::TEXT[],
        ARRAY[]::TEXT[],
        ARRAY[]::TEXT[],
        ARRAY[]::TEXT[],
        ${website},
        ${data.linkedinUrl},
        ${ctx.userId}::uuid,
        ${ctx.organizationId ?? null}::uuid,
        ${data.source ?? null},
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT ${conflictTarget}
      DO UPDATE SET
        "linkedinUrl" = EXCLUDED."linkedinUrl",
        "website" = COALESCE(EXCLUDED."website", "Company"."website"),
        "updatedAt" = CURRENT_TIMESTAMP
      RETURNING *
    `);

    const company = companies[0];
    if (!company) {
      throw new Error("Company upsert did not return a row");
    }
    return company;
  }

  listByOwner(
    ctx: OwnershipContext,
    opts: { search?: string; limit?: number; offset?: number } = {},
  ): Promise<Company[]> {
    return this.prisma.company.findMany({
      where: {
        ...buildOwnershipFilter(ctx),
        deletedAt: null,
        ...(opts.search
          ? {
              OR: [
                { name: { contains: opts.search, mode: "insensitive" } },
                { domain: { contains: opts.search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: opts.limit ?? 50,
      skip: opts.offset ?? 0,
    });
  }

  create(
    ctx: OwnershipContext,
    data: {
      name: string;
      domain?: string | null;
      industry?: string | null;
      size?: string | null;
      phone?: string | null;
      website?: string | null;
      linkedinUrl?: string | null;
      source?: string | null;
      crmMetadata?: Record<string, unknown> | null;
      customFields?: Record<string, unknown> | null;
    },
  ): Promise<Company> {
    return this.prisma.company.create({
      data: {
        name: data.name,
        normalizedName: normalizeCompanyName(data.name),
        domain: data.domain ?? null,
        industry: data.industry ?? null,
        size: data.size ?? null,
        phone: data.phone ?? null,
        website: data.website ?? null,
        linkedinUrl: data.linkedinUrl ?? null,
        source: data.source ?? null,
        crmMetadata: (data.crmMetadata ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
        customFields: (data.customFields ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
        userId: ctx.userId,
        organizationId: ctx.organizationId ?? null,
      },
    });
  }

  update(id: string, data: Prisma.CompanyUpdateInput): Promise<Company> {
    const name = typeof data.name === "string" ? data.name : undefined;
    return this.prisma.company.update({
      where: { id },
      data: name
        ? { ...data, normalizedName: normalizeCompanyName(name) }
        : data,
    });
  }

  softDelete(id: string): Promise<Company> {
    return this.prisma.company.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
