import { Injectable } from "@nestjs/common";
import { ContactEmail } from "@prisma/client";
import { PrismaService } from "../prisma.service";

@Injectable()
export class ContactEmailRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByContact(contactId: string): Promise<ContactEmail[]> {
    return this.prisma.contactEmail.findMany({
      where: { contactId },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    });
  }

  findByEmail(email: string): Promise<ContactEmail[]> {
    return this.prisma.contactEmail.findMany({
      where: { email: { equals: email, mode: "insensitive" } },
    });
  }

  upsert(input: {
    contactId: string;
    email: string;
    type?: string | null;
    isPrimary?: boolean;
  }): Promise<ContactEmail> {
    return this.prisma.contactEmail.upsert({
      where: {
        contactId_email: { contactId: input.contactId, email: input.email },
      },
      create: {
        contactId: input.contactId,
        email: input.email,
        type: input.type ?? null,
        isPrimary: input.isPrimary ?? false,
      },
      update: {
        type: input.type ?? undefined,
        isPrimary: input.isPrimary ?? undefined,
      },
    });
  }

  removeByContact(contactId: string): Promise<{ count: number }> {
    return this.prisma.contactEmail.deleteMany({ where: { contactId } });
  }

  remove(id: string): Promise<ContactEmail> {
    return this.prisma.contactEmail.delete({ where: { id } });
  }
}
