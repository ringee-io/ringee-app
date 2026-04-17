import { Injectable } from "@nestjs/common";
import { CrmCompanyLink, CrmProviderType, CrmRecordType, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";

@Injectable()
export class CrmCompanyLinkRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByDomain(connectionId: string, domain: string): Promise<CrmCompanyLink | null> {
    return this.prisma.crmCompanyLink.findFirst({
      where: { connectionId, domain: { equals: domain, mode: "insensitive" } },
    });
  }

  findByExternalId(
    connectionId: string,
    externalType: CrmRecordType,
    externalId: string,
  ): Promise<CrmCompanyLink | null> {
    return this.prisma.crmCompanyLink.findUnique({
      where: {
        connectionId_externalType_externalId: { connectionId, externalType, externalId },
      },
    });
  }

  upsertLink(input: {
    connectionId: string;
    provider: CrmProviderType;
    externalId: string;
    externalType: CrmRecordType;
    companyId?: string | null;
    domain?: string | null;
    matchConfidence?: string;
    rawSnapshot?: Record<string, unknown> | null;
  }): Promise<CrmCompanyLink> {
    return this.prisma.crmCompanyLink.upsert({
      where: {
        connectionId_externalType_externalId: {
          connectionId: input.connectionId,
          externalType: input.externalType,
          externalId: input.externalId,
        },
      },
      create: {
        connectionId: input.connectionId,
        provider: input.provider,
        externalId: input.externalId,
        externalType: input.externalType,
        companyId: input.companyId ?? null,
        domain: input.domain ?? null,
        matchConfidence: input.matchConfidence ?? "domain_exact",
        rawSnapshot: (input.rawSnapshot ?? undefined) as Prisma.InputJsonValue | undefined,
      },
      update: {
        companyId: input.companyId ?? undefined,
        domain: input.domain ?? undefined,
        matchConfidence: input.matchConfidence ?? undefined,
        rawSnapshot: (input.rawSnapshot ?? undefined) as Prisma.InputJsonValue | undefined,
        lastSyncedAt: new Date(),
      },
    });
  }

  listByCompany(companyId: string): Promise<CrmCompanyLink[]> {
    return this.prisma.crmCompanyLink.findMany({ where: { companyId } });
  }

  listByConnection(connectionId: string): Promise<CrmCompanyLink[]> {
    return this.prisma.crmCompanyLink.findMany({
      where: { connectionId },
      orderBy: { lastSyncedAt: "desc" },
    });
  }

  remove(id: string): Promise<CrmCompanyLink> {
    return this.prisma.crmCompanyLink.delete({ where: { id } });
  }
}
