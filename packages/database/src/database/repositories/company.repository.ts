import { Injectable } from "@nestjs/common";
import { Company, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { OwnershipContext, buildOwnershipFilter } from "@ringee/platform";

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
        name: { equals: name, mode: "insensitive" },
        deletedAt: null,
      },
    });
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
      source?: string | null;
      crmMetadata?: Record<string, unknown> | null;
      customFields?: Record<string, unknown> | null;
    },
  ): Promise<Company> {
    return this.prisma.company.create({
      data: {
        name: data.name,
        domain: data.domain ?? null,
        industry: data.industry ?? null,
        size: data.size ?? null,
        phone: data.phone ?? null,
        website: data.website ?? null,
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
    return this.prisma.company.update({ where: { id }, data });
  }

  softDelete(id: string): Promise<Company> {
    return this.prisma.company.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
