import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { Prisma, Contact } from "@prisma/client";
import {
  OwnershipContext,
  buildOwnershipFilter,
} from "@ringee/platform";

/** A contact row with the multi-value email/phone relations needed for dedup. */
export type ContactDedupMatch = Prisma.ContactGetPayload<{
  include: { emails: true; phones: true };
}>;

@Injectable()
export class ContactRepository {
  constructor(private readonly prisma: PrismaService) { }

  async create(
    ctx: OwnershipContext,
    data: Omit<Prisma.ContactCreateInput, "user" | "organization">,
  ): Promise<Contact> {
    return this.prisma.contact.create({
      data: {
        ...data,
        user: { connect: { id: ctx.userId } },
        organization: ctx.organizationId
          ? { connect: { id: ctx.organizationId } }
          : undefined,
      },
    });
  }

  async findById(id: string): Promise<Contact | null> {
    return this.prisma.contact.findFirst({
      where: { id, deletedAt: null },
      include: {
        notes: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' } },
        calls: { orderBy: { createdAt: 'desc' }, take: 20 },
        meetings: { orderBy: { scheduledAt: 'desc' } },
        tags: { include: { tag: true } },
        phones: { orderBy: { isPrimary: 'desc' } },
        emails: { orderBy: { isPrimary: 'desc' } },
        affiliations: {
          include: { company: true },
          orderBy: { isPrimary: 'desc' },
        },
      },
    });
  }

  async findByPhone(
    ctx: OwnershipContext,
    phoneNumber: string,
  ): Promise<Contact | null> {
    const ownershipFilter = buildOwnershipFilter(ctx);
    return this.prisma.contact.findFirst({
      where: { ...ownershipFilter, phoneNumber, deletedAt: null },
    });
  }

  async listByOwner(
    ctx: OwnershipContext,
    options?: { search?: string; sort?: string; page?: number; limit?: number; tagIds?: string[] },
  ): Promise<{
    data: Contact[];
    meta: { total: number; page: number; limit: number; totalPages: number };
  }> {
    const { search, page = 1, limit = 10, sort, tagIds } = options || {};

    let orderBy: Prisma.ContactOrderByWithRelationInput = {
      updatedAt: "desc",
    };

    if (sort) {
      orderBy = JSON.parse(sort);
    }

    const ownershipFilter = buildOwnershipFilter(ctx);
    
    // Build tag filter
    const tagFilter = tagIds && tagIds.length > 0
      ? {
          tags: {
            some: {
              tagId: { in: tagIds },
            },
          },
        }
      : {};
    
    const where: Prisma.ContactWhereInput = {
      ...ownershipFilter,
      deletedAt: null,
      ...(search
        ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { phoneNumber: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
          ],
        }
        : {}),
      ...tagFilter,
    };

    const total = await this.prisma.contact.count({ where });

    const data = await this.prisma.contact.findMany({
      where,
      orderBy,
      include: {
        notes: {
          take: 5,
          orderBy: { createdAt: "desc" },
          where: { deletedAt: null },
        },
        tags: {
          include: {
            tag: true,
          },
        },
      },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async update(id: string, data: Prisma.ContactUpdateInput): Promise<Contact> {
    return this.prisma.contact.update({
      where: { id },
      data,
    });
  }

  async addNote(contactId: string, userId: string, content: string) {
    return this.prisma.contactNote.create({
      data: {
        contactId,
        userId,
        content,
      },
    });
  }

  async updateLastCall(contactId: string, date: Date) {
    return this.prisma.contact.update({
      where: { id: contactId },
      data: { lastCallAt: date },
    });
  }

  async deleteContact(contactId: string) {
    return this.prisma.contact.update({
      where: { id: contactId },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Find existing contacts by phone numbers for duplicate detection
   */
  async findByPhoneNumbers(
    ctx: OwnershipContext,
    phoneNumbers: string[],
  ): Promise<string[]> {
    const ownershipFilter = buildOwnershipFilter(ctx);
    const existing = await this.prisma.contact.findMany({
      where: {
        ...ownershipFilter,
        phoneNumber: { in: phoneNumbers },
        deletedAt: null,
      },
      select: { phoneNumber: true },
    });
    return existing.map((c) => c.phoneNumber);
  }

  /**
   * Find contact IDs by phone numbers (for tag assignment after import)
   */
  async findContactIdsByPhoneNumbers(
    ctx: OwnershipContext,
    phoneNumbers: string[],
  ): Promise<string[]> {
    const ownershipFilter = buildOwnershipFilter(ctx);
    const contacts = await this.prisma.contact.findMany({
      where: {
        ...ownershipFilter,
        phoneNumber: { in: phoneNumbers },
        deletedAt: null,
      },
      select: { id: true },
    });
    return contacts.map((c) => c.id);
  }

  /**
   * Find contacts matching any of the given identity keys. Used by the
   * prospecting agent to detect leads Ringee already has BEFORE spending
   * provider credits to reveal them again. Matches the scalar
   * phone/email/linkedin columns, the multi-value email/phone relations, and
   * the lead-import externalId stored under `enrichmentMetadata.externalId`.
   *
   * Email/LinkedIn matching is case-folded best-effort (we query both the
   * original and lowercased forms); a missed case-variant only means a
   * duplicate is not flagged, which is acceptable degradation for a
   * credit-saving heuristic.
   */
  async findByDedupKeys(
    ctx: OwnershipContext,
    keys: {
      emails?: string[];
      phones?: string[];
      linkedinUrls?: string[];
      externalIds?: string[];
    },
  ): Promise<ContactDedupMatch[]> {
    const expand = (values: string[] | undefined): string[] => {
      const out = new Set<string>();
      for (const raw of values ?? []) {
        const trimmed = raw?.trim();
        if (!trimmed) continue;
        out.add(trimmed);
        out.add(trimmed.toLowerCase());
      }
      return [...out];
    };

    const emails = expand(keys.emails);
    const phones = expand(keys.phones);
    const linkedinUrls = expand(keys.linkedinUrls);
    const externalIds = [
      ...new Set((keys.externalIds ?? []).map((v) => v?.trim()).filter(Boolean)),
    ] as string[];

    const or: Prisma.ContactWhereInput[] = [];
    if (emails.length) {
      or.push({ email: { in: emails } });
      or.push({ emails: { some: { email: { in: emails } } } });
    }
    if (phones.length) {
      or.push({ phoneNumber: { in: phones } });
      or.push({
        phones: {
          some: { OR: [{ phone: { in: phones } }, { phoneE164: { in: phones } }] },
        },
      });
    }
    if (linkedinUrls.length) {
      or.push({ linkedinUrl: { in: linkedinUrls } });
    }
    for (const externalId of externalIds) {
      or.push({ enrichmentMetadata: { path: ["externalId"], equals: externalId } });
    }
    if (or.length === 0) return [];

    return this.prisma.contact.findMany({
      where: { ...buildOwnershipFilter(ctx), deletedAt: null, OR: or },
      include: { emails: true, phones: true },
      take: 1000,
    });
  }

  /**
   * Batch create contacts for CSV import
   */
  async createMany(
    ctx: OwnershipContext,
    contacts: Array<{
      phoneNumber: string;
      name: string;
      email?: string;
      company?: string;
    }>,
  ): Promise<number> {
    const result = await this.prisma.contact.createMany({
      data: contacts.map((contact) => ({
        ...contact,
        userId: ctx.userId,
        organizationId: ctx.organizationId ?? null,
      })),
      skipDuplicates: true,
    });
    return result.count;
  }

  async deleteNote(noteId: string) {
    const note = await this.prisma.contactNote.findUnique({
      where: { id: noteId },
    });

    if (!note) {
      throw new NotFoundException("Note not found");
    }

    return this.prisma.contactNote.update({
      where: { id: noteId },
      data: { deletedAt: new Date() },
    });
  }
  async deleteByTags(ctx: OwnershipContext, tagIds: string[]) {
    const ownershipFilter = buildOwnershipFilter(ctx);
    return this.prisma.contact.updateMany({
      where: {
        ...ownershipFilter,
        deletedAt: null,
        tags: { some: { tagId: { in: tagIds } } },
      },
      data: { deletedAt: new Date() },
    });
  }
}
