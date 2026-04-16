import { Injectable } from "@nestjs/common";
import { ContactAffiliation, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";

@Injectable()
export class ContactAffiliationRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByContact(contactId: string): Promise<ContactAffiliation[]> {
    return this.prisma.contactAffiliation.findMany({
      where: { contactId },
      include: { company: true },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
    });
  }

  findByCompany(companyId: string): Promise<ContactAffiliation[]> {
    return this.prisma.contactAffiliation.findMany({
      where: { companyId },
      include: { contact: true },
      orderBy: { createdAt: "desc" },
    });
  }

  upsert(input: {
    contactId: string;
    companyId: string;
    role?: string | null;
    isPrimary?: boolean;
    startDate?: Date | null;
    endDate?: Date | null;
    crmMetadata?: Record<string, unknown> | null;
  }): Promise<ContactAffiliation> {
    return this.prisma.contactAffiliation.upsert({
      where: {
        contactId_companyId: {
          contactId: input.contactId,
          companyId: input.companyId,
        },
      },
      create: {
        contactId: input.contactId,
        companyId: input.companyId,
        role: input.role ?? null,
        isPrimary: input.isPrimary ?? false,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        crmMetadata: (input.crmMetadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
      update: {
        role: input.role ?? undefined,
        isPrimary: input.isPrimary ?? undefined,
        startDate: input.startDate ?? undefined,
        endDate: input.endDate ?? undefined,
        crmMetadata: (input.crmMetadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  remove(id: string): Promise<ContactAffiliation> {
    return this.prisma.contactAffiliation.delete({ where: { id } });
  }

  removeByContactAndCompany(contactId: string, companyId: string): Promise<ContactAffiliation> {
    return this.prisma.contactAffiliation.delete({
      where: { contactId_companyId: { contactId, companyId } },
    });
  }
}
