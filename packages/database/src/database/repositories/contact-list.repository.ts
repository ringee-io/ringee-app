import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  OwnershipContext,
  buildOwnershipData,
  buildOwnershipFilter,
} from "@ringee/platform";
import { PrismaService } from "../prisma.service";

/** How a contact got into a list. */
export type ContactListEntrySource = "csv" | "manual";

/** Rows per `createMany` when filing contacts into a list. */
const ENTRY_BATCH_SIZE = 1000;

/** A person a list names: who created it, who works it. */
const PERSON_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  imageUrl: true,
  emails: {
    select: { email: true },
    orderBy: { isPrimary: "desc" },
    take: 1,
  },
} satisfies Prisma.UserSelect;

/** A soft-deleted contact is no longer in any list, though its entry stays. */
const LIVE_ENTRY = {
  contact: { deletedAt: null },
} satisfies Prisma.ContactListEntryWhereInput;

const LIST_SELECT = {
  id: true,
  name: true,
  description: true,
  userId: true,
  organizationId: true,
  assignedToId: true,
  createdAt: true,
  updatedAt: true,
  user: { select: PERSON_SELECT },
  assignedTo: { select: PERSON_SELECT },
  _count: { select: { entries: { where: LIVE_ENTRY } } },
} satisfies Prisma.ContactListSelect;

export type ContactListRecord = Prisma.ContactListGetPayload<{
  select: typeof LIST_SELECT;
}>;

const ENTRY_SELECT = {
  id: true,
  source: true,
  createdAt: true,
  contact: {
    select: {
      id: true,
      name: true,
      firstName: true,
      lastName: true,
      phoneNumber: true,
      email: true,
      company: true,
      jobTitle: true,
      lastCallAt: true,
      doNotCall: true,
    },
  },
} satisfies Prisma.ContactListEntrySelect;

export type ContactListEntryRecord = Prisma.ContactListEntryGetPayload<{
  select: typeof ENTRY_SELECT;
}>;

/** A list as the person it is assigned to picks it on the Call page. */
const WORKED_LIST_SELECT = {
  id: true,
  name: true,
  description: true,
  _count: { select: { entries: { where: LIVE_ENTRY } } },
} satisfies Prisma.ContactListSelect;

export type WorkedContactList = Prisma.ContactListGetPayload<{
  select: typeof WORKED_LIST_SELECT;
}>;

/**
 * Still to call: a live contact nobody has called since it joined the list,
 * and one not flagged Do Not Call (LIST-005).
 */
const TO_CALL = {
  calledAt: null,
  contact: { deletedAt: null, doNotCall: false },
} satisfies Prisma.ContactListEntryWhereInput;

const ENTRY_TO_CALL_SELECT = {
  id: true,
  sequence: true,
  createdAt: true,
  skippedAt: true,
  contact: {
    select: {
      id: true,
      name: true,
      firstName: true,
      lastName: true,
      company: true,
      phoneNumber: true,
      timezone: true,
    },
  },
} satisfies Prisma.ContactListEntrySelect;

export type ContactListEntryToCall = Prisma.ContactListEntryGetPayload<{
  select: typeof ENTRY_TO_CALL_SELECT;
}>;

@Injectable()
export class ContactListRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(
    ctx: OwnershipContext,
    data: { name: string; description: string | null; assignedToId: string },
  ): Promise<ContactListRecord> {
    return this.prisma.contactList.create({
      data: { ...buildOwnershipData(ctx), ...data },
      select: LIST_SELECT,
    });
  }

  /** The list, only when it belongs to the workspace (WRK-002). */
  findInWorkspace(
    ctx: OwnershipContext,
    id: string,
  ): Promise<ContactListRecord | null> {
    return this.prisma.contactList.findFirst({
      where: { id, ...buildOwnershipFilter(ctx) },
      select: LIST_SELECT,
    });
  }

  /** The workspace's lists, newest first; `assignedToId` narrows to one person's. */
  async listInWorkspace(
    ctx: OwnershipContext,
    options: {
      assignedToId?: string;
      search?: string;
      page: number;
      limit: number;
    },
  ): Promise<{ data: ContactListRecord[]; total: number }> {
    const search = options.search?.trim();
    const where: Prisma.ContactListWhereInput = {
      ...buildOwnershipFilter(ctx),
      ...(options.assignedToId ? { assignedToId: options.assignedToId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { description: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [total, data] = await Promise.all([
      this.prisma.contactList.count({ where }),
      this.prisma.contactList.findMany({
        where,
        select: LIST_SELECT,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: (options.page - 1) * options.limit,
        take: options.limit,
      }),
    ]);
    return { data, total };
  }

  /** Callers load the list through `findInWorkspace` first. */
  update(
    id: string,
    data: {
      name?: string;
      description?: string | null;
      assignedToId?: string;
    },
  ): Promise<ContactListRecord> {
    return this.prisma.contactList.update({
      where: { id },
      data,
      select: LIST_SELECT,
    });
  }

  /** Removes the list and its entries. The contacts themselves stay. */
  async delete(id: string): Promise<void> {
    await this.prisma.contactList.deleteMany({ where: { id } });
  }

  /**
   * Puts contacts in the list in the order given, skipping the ones it already
   * holds, and returns how many went in. The entry `sequence` follows the
   * insert order, which is what keeps a CSV's rows in the file's order.
   *
   * The contacts must already be known to belong to the list's workspace.
   */
  async addEntries(
    listId: string,
    contactIds: string[],
    meta: { source: ContactListEntrySource; addedById: string },
  ): Promise<number> {
    let added = 0;
    for (let i = 0; i < contactIds.length; i += ENTRY_BATCH_SIZE) {
      const { count } = await this.prisma.contactListEntry.createMany({
        data: contactIds.slice(i, i + ENTRY_BATCH_SIZE).map((contactId) => ({
          listId,
          contactId,
          source: meta.source,
          addedById: meta.addedById,
        })),
        skipDuplicates: true,
      });
      added += count;
    }
    return added;
  }

  async removeEntry(listId: string, contactId: string): Promise<boolean> {
    const { count } = await this.prisma.contactListEntry.deleteMany({
      where: { listId, contactId },
    });
    return count > 0;
  }

  /** The list's live contacts in the order it is worked in. */
  async listEntries(
    listId: string,
    options: { search?: string; page: number; limit: number },
  ): Promise<{ data: ContactListEntryRecord[]; total: number }> {
    const search = options.search?.trim();
    const where: Prisma.ContactListEntryWhereInput = {
      listId,
      contact: {
        deletedAt: null,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { firstName: { contains: search, mode: "insensitive" } },
                { lastName: { contains: search, mode: "insensitive" } },
                { phoneNumber: { contains: search } },
                { email: { contains: search, mode: "insensitive" } },
                { company: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
    };

    const [total, data] = await Promise.all([
      this.prisma.contactListEntry.count({ where }),
      this.prisma.contactListEntry.findMany({
        where,
        select: ENTRY_SELECT,
        orderBy: { sequence: "asc" },
        skip: (options.page - 1) * options.limit,
        take: options.limit,
      }),
    ]);
    return { data, total };
  }

  /** The workspace's lists assigned to `userId`, newest first. */
  listAssignedTo(
    ctx: OwnershipContext,
    userId: string,
    limit: number,
  ): Promise<WorkedContactList[]> {
    return this.prisma.contactList.findMany({
      where: { ...buildOwnershipFilter(ctx), assignedToId: userId },
      select: WORKED_LIST_SELECT,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: limit,
    });
  }

  /** The list, only when it is in the workspace and assigned to `userId`. */
  findAssignedTo(
    ctx: OwnershipContext,
    listId: string,
    userId: string,
  ): Promise<WorkedContactList | null> {
    return this.prisma.contactList.findFirst({
      where: { id: listId, ...buildOwnershipFilter(ctx), assignedToId: userId },
      select: WORKED_LIST_SELECT,
    });
  }

  /** How many contacts each list still has to call. */
  async countToCall(listIds: string[]): Promise<Map<string, number>> {
    if (listIds.length === 0) return new Map();
    const rows = await this.prisma.contactListEntry.groupBy({
      by: ["listId"],
      where: { listId: { in: listIds }, ...TO_CALL },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.listId, row._count._all]));
  }

  /**
   * One page of the list's contacts still to call, in the order "Call next"
   * offers them: never skipped ones by `sequence`, or — with `skipped` — the
   * skipped ones, longest skipped first. `after` is the last entry of the
   * previous page.
   */
  listToCall(
    listId: string,
    options: {
      skipped: boolean;
      after?: Pick<ContactListEntryToCall, "sequence" | "skippedAt">;
      limit: number;
    },
  ): Promise<ContactListEntryToCall[]> {
    const { after } = options;
    let where: Prisma.ContactListEntryWhereInput;
    if (!options.skipped) {
      where = {
        skippedAt: null,
        ...(after ? { sequence: { gt: after.sequence } } : {}),
      };
    } else if (after?.skippedAt) {
      where = {
        OR: [
          { skippedAt: { gt: after.skippedAt } },
          { skippedAt: after.skippedAt, sequence: { gt: after.sequence } },
        ],
      };
    } else {
      where = { skippedAt: { not: null } };
    }

    return this.prisma.contactListEntry.findMany({
      where: { listId, ...TO_CALL, ...where },
      select: ENTRY_TO_CALL_SELECT,
      orderBy: options.skipped
        ? [{ skippedAt: "asc" }, { sequence: "asc" }]
        : { sequence: "asc" },
      take: options.limit,
    });
  }

  /**
   * Records that each entry's contact has been called since it joined the
   * list. The first call recorded stays.
   */
  async markCalled(entries: { id: string; at: Date }[]): Promise<void> {
    if (entries.length === 0) return;
    await this.prisma.$transaction(
      entries.map((entry) =>
        this.prisma.contactListEntry.updateMany({
          where: { id: entry.id, calledAt: null },
          data: { calledAt: entry.at },
        }),
      ),
    );
  }

  /**
   * Sends an entry still to call to the back of its list. False when the list
   * holds no such entry, or its contact has already been called.
   */
  async skipEntry(listId: string, entryId: string, at: Date): Promise<boolean> {
    const { count } = await this.prisma.contactListEntry.updateMany({
      where: { id: entryId, listId, calledAt: null },
      data: { skippedAt: at },
    });
    return count > 0;
  }

  /** Which of the workspace's lists assigned to `userId` hold each contact. */
  listsHolding(
    ctx: OwnershipContext,
    userId: string,
    contactIds: string[],
  ): Promise<{ contactId: string; list: { id: string; name: string } }[]> {
    if (contactIds.length === 0) return Promise.resolve([]);
    return this.prisma.contactListEntry.findMany({
      where: {
        contactId: { in: contactIds },
        list: { ...buildOwnershipFilter(ctx), assignedToId: userId },
      },
      select: { contactId: true, list: { select: { id: true, name: true } } },
      orderBy: [{ list: { name: "asc" } }, { listId: "asc" }],
    });
  }
}
