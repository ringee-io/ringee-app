import { Injectable } from "@nestjs/common";
import { CrmMemberLink, CrmProviderType } from "@prisma/client";
import { PrismaService } from "../prisma.service";

/**
 * The admin-set links between workspace members and CRM users, one per
 * member and connection. A member without one is linked by e-mail, which is
 * decided in `CrmMemberLinkService`, not stored.
 */
@Injectable()
export class CrmMemberLinkRepository {
  constructor(private readonly prisma: PrismaService) {}

  listByConnection(connectionId: string): Promise<CrmMemberLink[]> {
    return this.prisma.crmMemberLink.findMany({ where: { connectionId } });
  }

  find(connectionId: string, userId: string): Promise<CrmMemberLink | null> {
    return this.prisma.crmMemberLink.findUnique({
      where: { connectionId_userId: { connectionId, userId } },
    });
  }

  upsert(input: {
    connectionId: string;
    userId: string;
    provider: CrmProviderType;
    externalMemberId: string | null;
    externalMemberEmail: string | null;
    externalMemberName: string | null;
  }): Promise<CrmMemberLink> {
    const values = {
      externalMemberId: input.externalMemberId,
      externalMemberEmail: input.externalMemberEmail,
      externalMemberName: input.externalMemberName,
    };
    return this.prisma.crmMemberLink.upsert({
      where: {
        connectionId_userId: {
          connectionId: input.connectionId,
          userId: input.userId,
        },
      },
      create: {
        connectionId: input.connectionId,
        userId: input.userId,
        provider: input.provider,
        ...values,
      },
      update: values,
    });
  }

  /** Back to the e-mail match. Removing a link that is not there is a no-op. */
  async remove(connectionId: string, userId: string): Promise<void> {
    await this.prisma.crmMemberLink.deleteMany({
      where: { connectionId, userId },
    });
  }
}
