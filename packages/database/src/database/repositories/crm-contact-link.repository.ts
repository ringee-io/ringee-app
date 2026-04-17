import { Injectable } from "@nestjs/common";
import { CrmContactLink, CrmProviderType, CrmRecordType, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";

@Injectable()
export class CrmContactLinkRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByPhone(connectionId: string, phoneE164: string): Promise<CrmContactLink | null> {
    return this.prisma.crmContactLink.findUnique({
      where: { connectionId_phoneNumberE164: { connectionId, phoneNumberE164: phoneE164 } },
    });
  }

  findByExternalId(
    connectionId: string,
    externalType: CrmRecordType,
    externalId: string,
  ): Promise<CrmContactLink | null> {
    return this.prisma.crmContactLink.findUnique({
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
    phoneNumberE164: string;
    contactId?: string | null;
    matchConfidence?: string;
    rawSnapshot?: Record<string, unknown> | null;
  }): Promise<CrmContactLink> {
    return this.prisma.crmContactLink.upsert({
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
        phoneNumberE164: input.phoneNumberE164,
        contactId: input.contactId ?? null,
        matchConfidence: input.matchConfidence ?? "phone_exact",
        rawSnapshot: (input.rawSnapshot ?? undefined) as Prisma.InputJsonValue | undefined,
      },
      update: {
        phoneNumberE164: input.phoneNumberE164,
        contactId: input.contactId ?? undefined,
        matchConfidence: input.matchConfidence ?? undefined,
        rawSnapshot: (input.rawSnapshot ?? undefined) as Prisma.InputJsonValue | undefined,
        lastSyncedAt: new Date(),
      },
    });
  }

  listByContact(contactId: string): Promise<CrmContactLink[]> {
    return this.prisma.crmContactLink.findMany({ where: { contactId } });
  }

  remove(id: string): Promise<CrmContactLink> {
    return this.prisma.crmContactLink.delete({ where: { id } });
  }
}
