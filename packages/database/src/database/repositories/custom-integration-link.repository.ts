import { Injectable } from "@nestjs/common";
import {
  CustomIntegrationCompanyLink,
  CustomIntegrationContactLink,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../prisma.service";

@Injectable()
export class CustomIntegrationContactLinkRepository {
  constructor(private readonly prisma: PrismaService) {}

  upsert(input: {
    integrationId: string;
    externalId: string;
    contactId: string | null;
    rawSnapshot?: Record<string, unknown> | null;
    clearArchived?: boolean;
  }): Promise<CustomIntegrationContactLink> {
    const { integrationId, externalId, contactId, rawSnapshot, clearArchived } =
      input;
    return this.prisma.customIntegrationContactLink.upsert({
      where: { integrationId_externalId: { integrationId, externalId } },
      create: {
        integrationId,
        externalId,
        contactId,
        rawSnapshot: (rawSnapshot ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
      },
      update: {
        contactId,
        rawSnapshot: (rawSnapshot ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
        archivedAt: clearArchived ? null : undefined,
      },
    });
  }

  findByExternalId(
    integrationId: string,
    externalId: string,
  ): Promise<CustomIntegrationContactLink | null> {
    return this.prisma.customIntegrationContactLink.findUnique({
      where: { integrationId_externalId: { integrationId, externalId } },
    });
  }

  markArchived(id: string): Promise<CustomIntegrationContactLink> {
    return this.prisma.customIntegrationContactLink.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
  }
}

@Injectable()
export class CustomIntegrationCompanyLinkRepository {
  constructor(private readonly prisma: PrismaService) {}

  upsert(input: {
    integrationId: string;
    externalId: string;
    companyId: string | null;
    rawSnapshot?: Record<string, unknown> | null;
    clearArchived?: boolean;
  }): Promise<CustomIntegrationCompanyLink> {
    const { integrationId, externalId, companyId, rawSnapshot, clearArchived } =
      input;
    return this.prisma.customIntegrationCompanyLink.upsert({
      where: { integrationId_externalId: { integrationId, externalId } },
      create: {
        integrationId,
        externalId,
        companyId,
        rawSnapshot: (rawSnapshot ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
      },
      update: {
        companyId,
        rawSnapshot: (rawSnapshot ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
        archivedAt: clearArchived ? null : undefined,
      },
    });
  }

  findByExternalId(
    integrationId: string,
    externalId: string,
  ): Promise<CustomIntegrationCompanyLink | null> {
    return this.prisma.customIntegrationCompanyLink.findUnique({
      where: { integrationId_externalId: { integrationId, externalId } },
    });
  }

  markArchived(id: string): Promise<CustomIntegrationCompanyLink> {
    return this.prisma.customIntegrationCompanyLink.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
  }
}
