import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  Contact,
  ContactListEntryRecord,
  ContactListRecord,
  ContactListRepository,
  ContactRepository,
  OrganizationRepository,
} from "@ringee/database";
import {
  AddContactListContactDto,
  CONTACT_LIST_LIMITS,
  CreateContactListDto,
  CsvRowError,
  OwnershipContext,
  UpdateContactListDto,
} from "@ringee/platform";
import { ContactService, ParsedContactsCsv } from "../contact.service";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/** Who is acting on a list: the workspace, and whether they run it. */
export interface ContactListActor extends OwnershipContext {
  /** `org:admin` of the active organization. Meaningless outside one. */
  isOrgAdmin: boolean;
}

/**
 * What the caller may do with one list (LIST-002). The server enforces every
 * one of these itself; the UI only reads them to hide what would be refused.
 */
export interface ContactListPermissions {
  /** Rename it, change its description, remove contacts, delete it. */
  canManage: boolean;
  /** Upload a CSV into it, add contacts by hand. */
  canAddContacts: boolean;
  /** Hand it to another member of the organization. */
  canAssign: boolean;
}

export interface ContactListPerson {
  id: string;
  name: string | null;
  email: string | null;
  imageUrl: string | null;
}

export interface ContactListView {
  id: string;
  name: string;
  description: string | null;
  contactCount: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: ContactListPerson;
  /** Null only once the person it was assigned to no longer exists. */
  assignedTo: ContactListPerson | null;
  permissions: ContactListPermissions;
}

/** A contact as a list shows it, with when it was added. */
export interface ContactListContactView {
  /** The contact's id. */
  id: string;
  name: string | null;
  phoneNumber: string;
  email: string | null;
  company: string | null;
  jobTitle: string | null;
  lastCallAt: Date | null;
  doNotCall: boolean;
  addedAt: Date;
  source: string;
}

export interface ContactListImportSummary {
  totalRows: number;
  /** Contacts the file created in the workspace. */
  contactsCreated: number;
  /** Rows whose number the workspace already had: that contact is used. */
  existingContacts: number;
  addedToList: number;
  alreadyInList: number;
  invalidRows: number;
  errors: CsvRowError[];
}

export interface ContactListPage<T> {
  data: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

interface PageQuery {
  page?: number;
  limit?: number;
}

/**
 * Contact lists: named sets of workspace contacts that someone works through
 * (LIST-001..LIST-004).
 *
 * Whoever runs the workspace — a freelancer, an org admin — sees and manages
 * every list and may assign one to any member. An org member sees only the
 * lists assigned to them; they work those (call, add contacts) and fully
 * manage only the ones they created for themselves.
 */
@Injectable()
export class ContactListService {
  constructor(
    private readonly lists: ContactListRepository,
    private readonly contacts: ContactService,
    private readonly contactRepo: ContactRepository,
    private readonly organizations: OrganizationRepository,
  ) {}

  /**
   * The lists the actor works with, newest first. `assignedToId` narrows an
   * admin's view to one person; a member is always narrowed to themselves.
   */
  async list(
    actor: ContactListActor,
    query: { search?: string; assignedToId?: string } & PageQuery,
  ): Promise<ContactListPage<ContactListView>> {
    const { page, limit } = pageOf(query);
    const assignedToId = this.runsWorkspace(actor)
      ? query.assignedToId || undefined
      : actor.userId;
    const { data, total } = await this.lists.listInWorkspace(actor, {
      assignedToId,
      search: query.search,
      page,
      limit,
    });
    return {
      data: data.map((list) => this.toView(actor, list)),
      meta: metaOf(total, page, limit),
    };
  }

  async get(actor: ContactListActor, listId: string): Promise<ContactListView> {
    return this.toView(actor, await this.loadVisible(actor, listId));
  }

  /**
   * Creates a list and, given a CSV, fills it in the same step. A file that
   * cannot be imported at all is refused before the list exists, so a typo in
   * a header does not leave an empty list behind; one that fails while it is
   * being filed takes the new list away with it.
   */
  async create(
    actor: ContactListActor,
    input: CreateContactListDto,
    csvContent?: string,
  ): Promise<{
    list: ContactListView;
    import: ContactListImportSummary | null;
  }> {
    const name = cleanName(input.name);
    const description = cleanDescription(input.description);
    const assignedToId = await this.resolveAssignee(actor, input.assignedToId);
    const parsed =
      csvContent === undefined
        ? null
        : this.contacts.parseContactsCsv(csvContent);

    const created = await this.lists.create(actor, {
      name,
      description,
      assignedToId,
    });
    if (!parsed) return { list: this.toView(actor, created), import: null };

    let summary: ContactListImportSummary;
    try {
      summary = await this.fileRows(actor, created.id, parsed);
    } catch (error) {
      // The list was made for this file: left behind, it would be an empty
      // list named after a failed upload. Contacts the file already wrote
      // stay, as they would after any import (LIST-004).
      await this.lists.delete(created.id).catch(() => undefined);
      throw error;
    }
    const filled = await this.lists.findInWorkspace(actor, created.id);
    return { list: this.toView(actor, filled ?? created), import: summary };
  }

  async update(
    actor: ContactListActor,
    listId: string,
    input: UpdateContactListDto,
  ): Promise<ContactListView> {
    const list = await this.loadVisible(actor, listId);
    const permissions = this.permissionsFor(actor, list);
    const data: {
      name?: string;
      description?: string | null;
      assignedToId?: string;
    } = {};

    if (input.name !== undefined || input.description !== undefined) {
      if (!permissions.canManage) {
        throw new ForbiddenException("Only an admin can change this list");
      }
      if (input.name !== undefined) data.name = cleanName(input.name);
      if (input.description !== undefined) {
        data.description = cleanDescription(input.description);
      }
    }

    if (
      input.assignedToId !== undefined &&
      input.assignedToId !== list.assignedToId
    ) {
      if (!permissions.canAssign) {
        throw new ForbiddenException("Only an admin can reassign a list");
      }
      data.assignedToId = await this.resolveAssignee(actor, input.assignedToId);
    }

    if (Object.keys(data).length === 0) return this.toView(actor, list);
    return this.toView(actor, await this.lists.update(list.id, data));
  }

  /**
   * The workspace's first list — of the ones that still exist — or null
   * before it has any. The onboarding gift is for that list only (BILL-022).
   */
  firstListInWorkspace(ctx: OwnershipContext): Promise<string | null> {
    return this.lists.firstInWorkspace(ctx);
  }

  /** Deletes the list. Its contacts stay in the workspace (LIST-004). */
  async remove(actor: ContactListActor, listId: string): Promise<void> {
    const list = await this.loadVisible(actor, listId);
    if (!this.permissionsFor(actor, list).canManage) {
      throw new ForbiddenException("Only an admin can delete this list");
    }
    await this.lists.delete(list.id);
  }

  /** The list's contacts, in the order it is worked in. */
  async listContacts(
    actor: ContactListActor,
    listId: string,
    query: { search?: string } & PageQuery,
  ): Promise<ContactListPage<ContactListContactView>> {
    const list = await this.loadVisible(actor, listId);
    const { page, limit } = pageOf(query);
    const { data, total } = await this.lists.listEntries(list.id, {
      search: query.search,
      page,
      limit,
    });
    return { data: data.map(toContactView), meta: metaOf(total, page, limit) };
  }

  /**
   * Imports a contacts CSV into the list (LIST-003): the same format and the
   * same contact rules as the Contacts import, then every row's contact —
   * new or already in the workspace — goes into the list.
   */
  async importCsv(
    actor: ContactListActor,
    listId: string,
    csvContent: string,
  ): Promise<ContactListImportSummary> {
    const list = await this.loadVisible(actor, listId);
    this.assertCanAdd(actor, list);
    return this.fileRows(
      actor,
      list.id,
      this.contacts.parseContactsCsv(csvContent),
    );
  }

  /** Puts contacts the workspace already has into the list. */
  async addContacts(
    actor: ContactListActor,
    listId: string,
    contactIds: string[],
  ): Promise<{ added: number; alreadyInList: number }> {
    const list = await this.loadVisible(actor, listId);
    this.assertCanAdd(actor, list);

    const requested = [...new Set(contactIds)];
    if (requested.length > CONTACT_LIST_LIMITS.ADD_CONTACTS_MAX) {
      throw new BadRequestException(
        `At most ${CONTACT_LIST_LIMITS.ADD_CONTACTS_MAX} contacts at a time`,
      );
    }
    const owned = new Set(
      await this.contactRepo.findOwnedIds(actor, requested),
    );
    if (owned.size !== requested.length) {
      throw new BadRequestException(
        "One or more contacts are not in this workspace",
      );
    }

    const added = await this.lists.addEntries(list.id, requested, {
      source: "manual",
      addedById: actor.userId,
    });
    return { added, alreadyInList: requested.length - added };
  }

  /**
   * Adds a person typed in by hand. A number the workspace already has puts
   * that contact in the list instead of creating a second one.
   */
  async addNewContact(
    actor: ContactListActor,
    listId: string,
    input: AddContactListContactDto,
  ): Promise<{
    contact: Pick<Contact, "id" | "name" | "phoneNumber">;
    created: boolean;
    added: boolean;
  }> {
    const list = await this.loadVisible(actor, listId);
    this.assertCanAdd(actor, list);

    const phoneNumber = input.phoneNumber.trim();
    if (!phoneNumber) throw new BadRequestException("phoneNumber is required");

    const existing = await this.contacts.findByPhone(actor, phoneNumber);
    const contact =
      existing ??
      (await this.contacts.createContact(actor, {
        phoneNumber,
        name: input.name?.trim() || undefined,
        email: input.email?.trim() || undefined,
        organization: input.organization?.trim() || undefined,
        jobTitle: input.jobTitle?.trim() || undefined,
      }));

    const added = await this.lists.addEntries(list.id, [contact.id], {
      source: "manual",
      addedById: actor.userId,
    });
    return {
      contact: {
        id: contact.id,
        name: contact.name,
        phoneNumber: contact.phoneNumber,
      },
      created: !existing,
      added: added > 0,
    };
  }

  /** Takes a contact out of the list. The contact itself stays. */
  async removeContact(
    actor: ContactListActor,
    listId: string,
    contactId: string,
  ): Promise<{ removed: boolean }> {
    const list = await this.loadVisible(actor, listId);
    if (!this.permissionsFor(actor, list).canManage) {
      throw new ForbiddenException(
        "Only an admin can remove contacts from this list",
      );
    }
    return { removed: await this.lists.removeEntry(list.id, contactId) };
  }

  private async fileRows(
    actor: ContactListActor,
    listId: string,
    parsed: ParsedContactsCsv,
  ): Promise<ContactListImportSummary> {
    const { result, contactIds } = await this.contacts.importParsedContacts(
      actor,
      parsed,
    );
    const added = await this.lists.addEntries(listId, contactIds, {
      source: "csv",
      addedById: actor.userId,
    });
    const { summary } = result;
    return {
      totalRows: summary.totalRows,
      contactsCreated: summary.inserted,
      existingContacts: summary.duplicatesSkipped,
      addedToList: added,
      alreadyInList: contactIds.length - added,
      invalidRows: summary.invalidRows,
      errors: summary.errors,
    };
  }

  /** A freelancer runs their own workspace; in an organization, its admins do. */
  private runsWorkspace(actor: ContactListActor): boolean {
    return !actor.organizationId || actor.isOrgAdmin;
  }

  private permissionsFor(
    actor: ContactListActor,
    list: Pick<ContactListRecord, "userId" | "assignedToId">,
  ): ContactListPermissions {
    const runsWorkspace = this.runsWorkspace(actor);
    const assignedToActor = list.assignedToId === actor.userId;
    return {
      canManage:
        runsWorkspace || (assignedToActor && list.userId === actor.userId),
      canAddContacts: runsWorkspace || assignedToActor,
      canAssign: runsWorkspace && !!actor.organizationId,
    };
  }

  private assertCanAdd(actor: ContactListActor, list: ContactListRecord) {
    if (!this.permissionsFor(actor, list).canAddContacts) {
      throw new ForbiddenException("You cannot add contacts to this list");
    }
  }

  /**
   * A list of the actor's workspace that they may see (LIST-001). Anything else
   * is a 404 — a teammate's list included — so ids cannot be probed.
   */
  private async loadVisible(
    actor: ContactListActor,
    listId: string,
  ): Promise<ContactListRecord> {
    const list = await this.lists.findInWorkspace(actor, listId);
    const visible =
      !!list &&
      (this.runsWorkspace(actor) || list.assignedToId === actor.userId);
    if (!list || !visible) throw new NotFoundException("List not found");
    return list;
  }

  /**
   * Who a list goes to (LIST-002): the actor by default. Someone else only
   * when an org admin names a member of the same organization — a member's
   * lists are always their own.
   */
  private async resolveAssignee(
    actor: ContactListActor,
    requested?: string,
  ): Promise<string> {
    if (!requested || requested === actor.userId) return actor.userId;
    if (!actor.organizationId) {
      throw new BadRequestException("A personal list is always your own");
    }
    if (!actor.isOrgAdmin) {
      throw new ForbiddenException(
        "Members can only create lists for themselves",
      );
    }
    if (!(await this.organizations.isMember(requested, actor.organizationId))) {
      throw new BadRequestException(
        "The assignee is not a member of this organization",
      );
    }
    return requested;
  }

  private toView(
    actor: ContactListActor,
    list: ContactListRecord,
  ): ContactListView {
    return {
      id: list.id,
      name: list.name,
      description: list.description,
      contactCount: list._count.entries,
      createdAt: list.createdAt,
      updatedAt: list.updatedAt,
      createdBy: toPerson(list.user),
      assignedTo: list.assignedTo ? toPerson(list.assignedTo) : null,
      permissions: this.permissionsFor(actor, list),
    };
  }
}

function cleanName(raw: string): string {
  const name = raw.trim();
  if (!name) throw new BadRequestException("name is required");
  if (name.length > CONTACT_LIST_LIMITS.NAME_MAX) {
    throw new BadRequestException(
      `name must be at most ${CONTACT_LIST_LIMITS.NAME_MAX} characters`,
    );
  }
  return name;
}

function cleanDescription(raw: string | null | undefined): string | null {
  const description = raw?.trim();
  if (!description) return null;
  if (description.length > CONTACT_LIST_LIMITS.DESCRIPTION_MAX) {
    throw new BadRequestException(
      `description must be at most ${CONTACT_LIST_LIMITS.DESCRIPTION_MAX} characters`,
    );
  }
  return description;
}

function pageOf(query: PageQuery): { page: number; limit: number } {
  const page = Math.max(1, Math.floor(Number(query.page) || 1));
  const limit = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.floor(Number(query.limit) || DEFAULT_PAGE_SIZE)),
  );
  return { page, limit };
}

function metaOf(total: number, page: number, limit: number) {
  return { total, page, limit, totalPages: Math.ceil(total / limit) };
}

function toPerson(user: ContactListRecord["user"]): ContactListPerson {
  const name = [user.firstName, user.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  return {
    id: user.id,
    name: name || null,
    email: user.emails[0]?.email ?? null,
    imageUrl: user.imageUrl,
  };
}

function toContactView(entry: ContactListEntryRecord): ContactListContactView {
  const { contact } = entry;
  const composed = [contact.firstName, contact.lastName]
    .filter(Boolean)
    .join(" ");
  return {
    id: contact.id,
    name: contact.name || composed || null,
    phoneNumber: contact.phoneNumber,
    email: contact.email,
    company: contact.company,
    jobTitle: contact.jobTitle,
    lastCallAt: contact.lastCallAt,
    doNotCall: contact.doNotCall,
    addedAt: entry.createdAt,
    source: entry.source,
  };
}
