import { Injectable } from "@nestjs/common";
import { ContactPhone } from "@prisma/client";
import { PrismaService } from "../prisma.service";

@Injectable()
export class ContactPhoneRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByContact(contactId: string): Promise<ContactPhone[]> {
    return this.prisma.contactPhone.findMany({
      where: { contactId },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    });
  }

  findByE164(phoneE164: string): Promise<ContactPhone[]> {
    return this.prisma.contactPhone.findMany({
      where: { phoneE164 },
    });
  }

  upsert(input: {
    contactId: string;
    phone: string;
    phoneE164?: string | null;
    type?: string | null;
    isPrimary?: boolean;
  }): Promise<ContactPhone> {
    return this.prisma.contactPhone.upsert({
      where: {
        contactId_phone: { contactId: input.contactId, phone: input.phone },
      },
      create: {
        contactId: input.contactId,
        phone: input.phone,
        phoneE164: input.phoneE164 ?? null,
        type: input.type ?? null,
        isPrimary: input.isPrimary ?? false,
      },
      update: {
        phoneE164: input.phoneE164 ?? undefined,
        type: input.type ?? undefined,
        isPrimary: input.isPrimary ?? undefined,
      },
    });
  }

  removeByContact(contactId: string): Promise<{ count: number }> {
    return this.prisma.contactPhone.deleteMany({ where: { contactId } });
  }

  remove(id: string): Promise<ContactPhone> {
    return this.prisma.contactPhone.delete({ where: { id } });
  }
}
