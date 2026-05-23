import { Injectable } from "@nestjs/common";
import { CrmContactLink, CrmProviderType, CrmRecordType, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";

@Injectable()
export class CrmContactLinkRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByPhone(connectionId: string, phoneE164: string): Promise<CrmContactLink | null> {
    if (!phoneE164) return Promise.resolve(null);
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

  async upsertLink(input: {
    connectionId: string;
    provider: CrmProviderType;
    externalId: string;
    externalType: CrmRecordType;
    phoneNumberE164?: string | null;
    contactId?: string | null;
    matchConfidence?: string;
    rawSnapshot?: Record<string, unknown> | null;
  }): Promise<CrmContactLink> {
    // Normalize empty/whitespace phone to null so multiple phoneless links can coexist.
    const rawPhone = input.phoneNumberE164?.trim() ? input.phoneNumberE164.trim() : null;

    // If another link in this connection already owns this phone (different externalId),
    // we cannot set it on this row without violating the (connectionId, phoneNumberE164)
    // unique constraint — store null on this link instead. The other link keeps the phone
    // so call-time lookups by phone still resolve.
    let phoneNumberE164: string | null = rawPhone;
    if (rawPhone) {
      const owner = await this.prisma.crmContactLink.findUnique({
        where: {
          connectionId_phoneNumberE164: {
            connectionId: input.connectionId,
            phoneNumberE164: rawPhone,
          },
        },
        select: { externalId: true, externalType: true },
      });
      if (
        owner &&
        (owner.externalId !== input.externalId || owner.externalType !== input.externalType)
      ) {
        phoneNumberE164 = null;
      }
    }

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
        phoneNumberE164,
        contactId: input.contactId ?? null,
        matchConfidence: input.matchConfidence ?? "phone_exact",
        rawSnapshot: (input.rawSnapshot ?? undefined) as Prisma.InputJsonValue | undefined,
      },
      update: {
        phoneNumberE164,
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
