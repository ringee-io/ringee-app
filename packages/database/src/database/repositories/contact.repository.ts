import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { Prisma, Contact, CallOutcome } from "@prisma/client";
import { OwnershipContext, buildOwnershipFilter } from "@ringee/platform";

/** A contact row with the multi-value email/phone relations needed for dedup. */
export type ContactDedupMatch = Prisma.ContactGetPayload<{
  include: { emails: true; phones: true };
}>;

/** A contact row with its single most-recent call (outcome + time) attached. */
export type ContactWithLastCall = Prisma.ContactGetPayload<{
  include: { calls: { select: { outcome: true; createdAt: true } } };
}>;

const CONTACT_WITH_LATEST_NOTES_SELECT = {
  id: true,
  name: true,
  firstName: true,
  lastName: true,
  phoneNumber: true,
  email: true,
  company: true,
  jobTitle: true,
  locationCity: true,
  locationRegion: true,
  locationCountry: true,
  tags: {
    where: { tag: { deletedAt: null } },
    select: { tag: { select: { name: true } } },
  },
  _count: { select: { notes: { where: { deletedAt: null } } } },
} satisfies Prisma.ContactSelect;

/** Who a contact is, its tags, and its latest notes with their authors. */
export type ContactWithLatestNotes = Prisma.ContactGetPayload<{
  select: typeof CONTACT_WITH_LATEST_NOTES_SELECT & {
    notes: {
      select: {
        content: true;
        createdAt: true;
        user: { select: { firstName: true; lastName: true } };
      };
    };
  };
}>;

@Injectable()
export class ContactRepository {
  constructor(private readonly prisma: PrismaService) {}

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
        notes: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } },
        calls: { orderBy: { createdAt: "desc" }, take: 20 },
        meetings: { orderBy: { scheduledAt: "desc" } },
        tags: { include: { tag: true } },
        phones: { orderBy: { isPrimary: "desc" } },
        emails: { orderBy: { isPrimary: "desc" } },
        affiliations: {
          include: { company: true },
          orderBy: { isPrimary: "desc" },
        },
      },
    });
  }

  async findByIdForOwner(
    ctx: OwnershipContext,
    id: string,
  ): Promise<Contact | null> {
    return this.prisma.contact.findFirst({
      where: { id, deletedAt: null, ...buildOwnershipFilter(ctx) },
    });
  }

  /**
   * A contact of the workspace as a notification shows it: who they are, their
   * tags, and their `noteLimit` most recent notes, newest first. `_count.notes`
   * says how many there are in all.
   */
  async findWithLatestNotesForOwner(
    ctx: OwnershipContext,
    id: string,
    noteLimit: number,
  ): Promise<ContactWithLatestNotes | null> {
    return this.prisma.contact.findFirst({
      where: { id, deletedAt: null, ...buildOwnershipFilter(ctx) },
      select: {
        ...CONTACT_WITH_LATEST_NOTES_SELECT,
        notes: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: noteLimit,
          select: {
            content: true,
            createdAt: true,
            user: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
  }

  /**
   * Minimal read of a contact — no relations. `findById` eager-loads calls,
   * notes, meetings and tags, which is far too heavy for the per-record work a
   * bulk CRM sync does thousands of times in a row.
   */
  async findBasicById(
    id: string,
  ): Promise<Pick<Contact, "id" | "phoneNumber" | "name" | "email"> | null> {
    return this.prisma.contact.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, phoneNumber: true, name: true, email: true },
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

  /**
   * Find a contact by its primary email within the owner's scope. Complements
   * the ContactEmail lookup: contacts imported before the multi-email table
   * existed — and rows written concurrently, before their ContactEmail is
   * flushed — only carry the address here.
   */
  async findByEmail(
    ctx: OwnershipContext,
    email: string,
  ): Promise<Contact | null> {
    const ownershipFilter = buildOwnershipFilter(ctx);
    return this.prisma.contact.findFirst({
      where: {
        ...ownershipFilter,
        email: { equals: email, mode: "insensitive" },
        deletedAt: null,
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async listByOwner(
    ctx: OwnershipContext,
    options?: {
      search?: string;
      sort?: string;
      page?: number;
      limit?: number;
      tagIds?: string[];
    },
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
    const tagFilter =
      tagIds && tagIds.length > 0
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
              { company: { contains: search, mode: "insensitive" } },
              { jobTitle: { contains: search, mode: "insensitive" } },
              { locationRegion: { contains: search, mode: "insensitive" } },
              { websiteUrl: { contains: search, mode: "insensitive" } },
              { revenue: { contains: search, mode: "insensitive" } },
              { companySize: { contains: search, mode: "insensitive" } },
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
        affiliations: {
          select: {
            isPrimary: true,
            company: { select: { linkedinUrl: true } },
          },
          orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
          take: 1,
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

  /**
   * List contacts whose calls reached one of the given outcomes — the basis
   * for ICP learning ("who already converted/engaged"). Read-only.
   *
   * - `match: "any"` (default): the contact has at least one call whose outcome
   *   is in `outcomes`. Filtered and paginated entirely in the database.
   * - `match: "last"`: only the contact's MOST RECENT call counts. Prisma
   *   relation filters can't express "the latest related row matches", so we
   *   first pick the latest call per in-scope contact (Postgres `DISTINCT ON`
   *   via `distinct` + ordered `findMany`), keep those whose outcome is in
   *   `outcomes`, then page over that id set.
   *
   * Contacts flagged `doNotCall`/`unsubscribed` are excluded unless
   * `includeUnreachable` is set. Soft-deleted contacts are always excluded.
   * Each row carries its single most-recent call so callers can surface
   * `lastOutcome`/`lastCallAt`.
   */
  async listByCallOutcome(
    ctx: OwnershipContext,
    options: {
      outcomes: CallOutcome[];
      match?: "any" | "last";
      includeUnreachable?: boolean;
      page?: number;
      limit?: number;
    },
  ): Promise<{
    data: ContactWithLastCall[];
    meta: { total: number; page: number; limit: number; totalPages: number };
  }> {
    const {
      outcomes,
      match = "any",
      includeUnreachable = false,
      page = 1,
      limit = 10,
    } = options;

    const ownershipFilter = buildOwnershipFilter(ctx);
    // Marketing-preference exclusions, applied unless explicitly overridden.
    const reachableFilter: Prisma.ContactWhereInput = includeUnreachable
      ? {}
      : { doNotCall: false, unsubscribed: false };

    const baseWhere: Prisma.ContactWhereInput = {
      ...ownershipFilter,
      deletedAt: null,
      ...reachableFilter,
    };

    let where: Prisma.ContactWhereInput;

    if (match === "last") {
      // Latest call per in-scope contact, then keep the qualifying ones.
      const latestCalls = await this.prisma.call.findMany({
        where: { contact: { is: baseWhere } },
        orderBy: [{ contactId: "asc" }, { createdAt: "desc" }],
        distinct: ["contactId"],
        select: { contactId: true, outcome: true },
      });
      const wanted = new Set<CallOutcome>(outcomes);
      const matchingIds = latestCalls
        .filter((c) => c.contactId && c.outcome && wanted.has(c.outcome))
        .map((c) => c.contactId as string);
      where = { ...baseWhere, id: { in: matchingIds } };
    } else {
      where = {
        ...baseWhere,
        calls: { some: { outcome: { in: outcomes } } },
      };
    }

    const total = await this.prisma.contact.count({ where });

    const data = await this.prisma.contact.findMany({
      where,
      orderBy: { lastCallAt: "desc" },
      include: {
        calls: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { outcome: true, createdAt: true },
        },
      },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async update(id: string, data: Prisma.ContactUpdateInput): Promise<Contact> {
    return this.prisma.contact.update({
      where: { id },
      data,
    });
  }

  /**
   * Whether this author already left this exact note on the contact since
   * `since`. A note deleted afterwards still counts: it was added.
   */
  async hasNoteSince(
    contactId: string,
    userId: string,
    content: string,
    since: Date,
  ): Promise<boolean> {
    const note = await this.prisma.contactNote.findFirst({
      where: { contactId, userId, content, createdAt: { gte: since } },
      select: { id: true },
    });
    return !!note;
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

  /** The ids among `ids` that are live contacts of the workspace. */
  async findOwnedIds(ctx: OwnershipContext, ids: string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const contacts = await this.prisma.contact.findMany({
      where: { ...buildOwnershipFilter(ctx), id: { in: ids }, deletedAt: null },
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
      ...new Set(
        (keys.externalIds ?? []).map((v) => v?.trim()).filter(Boolean),
      ),
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
          some: {
            OR: [{ phone: { in: phones } }, { phoneE164: { in: phones } }],
          },
        },
      });
    }
    if (linkedinUrls.length) {
      or.push({ linkedinUrl: { in: linkedinUrls } });
    }
    for (const externalId of externalIds) {
      or.push({
        enrichmentMetadata: { path: ["externalId"], equals: externalId },
      });
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
      jobTitle?: string;
      location?: string;
      state?: string;
      website?: string;
      linkedinUrl?: string;
      companyLinkedinUrl?: string;
      revenue?: string;
      companySize?: string;
    }>,
  ): Promise<number> {
    const result = await this.prisma.contact.createMany({
      data: contacts.map((contact) => ({
        phoneNumber: contact.phoneNumber,
        name: contact.name,
        email: contact.email,
        company: contact.company,
        jobTitle: contact.jobTitle,
        locationCity: contact.location,
        locationRegion: contact.state,
        websiteUrl: contact.website,
        linkedinUrl: contact.linkedinUrl,
        revenue: contact.revenue,
        companySize: contact.companySize,
        userId: ctx.userId,
        organizationId: ctx.organizationId ?? null,
      })),
      skipDuplicates: true,
    });
    return result.count;
  }

  /**
   * Apply sales-profile columns from an import to contacts that already exist.
   * Empty CSV cells are omitted so an import never erases stored enrichment.
   */
  async updateImportedSalesProperties(
    ctx: OwnershipContext,
    contacts: Array<{
      phoneNumber: string;
      jobTitle?: string;
      state?: string;
      website?: string;
      linkedinUrl?: string;
      companyLinkedinUrl?: string;
      revenue?: string;
      companySize?: string;
    }>,
  ): Promise<void> {
    const ownershipFilter = buildOwnershipFilter(ctx);
    const operations: Prisma.PrismaPromise<Prisma.BatchPayload>[] = [];
    for (const contact of contacts) {
      const data: Prisma.ContactUpdateManyMutationInput = {};
      if (contact.jobTitle) data.jobTitle = contact.jobTitle;
      if (contact.state) data.locationRegion = contact.state;
      if (contact.website) data.websiteUrl = contact.website;
      if (contact.linkedinUrl) data.linkedinUrl = contact.linkedinUrl;
      if (contact.revenue) data.revenue = contact.revenue;
      if (contact.companySize) data.companySize = contact.companySize;
      if (Object.keys(data).length === 0) continue;
      operations.push(
        this.prisma.contact.updateMany({
          where: {
            ...ownershipFilter,
            phoneNumber: contact.phoneNumber,
            deletedAt: null,
          },
          data,
        }),
      );
    }

    if (operations.length > 0) {
      await this.prisma.$transaction(operations);
    }
  }

  /** Minimal contact data needed to attach imported company profiles. */
  async findImportTargetsByPhoneNumbers(
    ctx: OwnershipContext,
    phoneNumbers: string[],
  ): Promise<
    Array<{
      id: string;
      phoneNumber: string;
      company: string | null;
      jobTitle: string | null;
    }>
  > {
    return this.prisma.contact.findMany({
      where: {
        ...buildOwnershipFilter(ctx),
        phoneNumber: { in: phoneNumbers },
        deletedAt: null,
      },
      select: {
        id: true,
        phoneNumber: true,
        company: true,
        jobTitle: true,
      },
    });
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
