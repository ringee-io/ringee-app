/// <reference types="node" />

import "reflect-metadata";

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import type { ContactListRecord } from "@ringee/database";
import { ContactListActor, ContactListService } from "./contact-list.service";

const ORG = "org-1";
const admin: ContactListActor = {
  userId: "admin",
  organizationId: ORG,
  isOrgAdmin: true,
};
const ana: ContactListActor = {
  userId: "ana",
  organizationId: ORG,
  isOrgAdmin: false,
};
const bruno: ContactListActor = {
  userId: "bruno",
  organizationId: ORG,
  isOrgAdmin: false,
};
const freelancer: ContactListActor = {
  userId: "solo",
  organizationId: null,
  isOrgAdmin: false,
};

const MEMBERS = new Set(["admin", "ana", "bruno"]);

function person(id: string) {
  return {
    id,
    firstName: id,
    lastName: null,
    imageUrl: null,
    emails: [{ email: `${id}@example.com` }],
  };
}

/** In-memory stand-ins for the repositories and ContactService. */
function build() {
  const lists = new Map<string, ContactListRecord>();
  const entries = new Map<string, string[]>();
  const workspaceContacts = new Set(["c1", "c2", "c3"]);
  const contactsByPhone = new Map<string, { id: string; name: string | null }>([
    ["+15550001", { id: "c1", name: "Uno" }],
  ]);
  let nextId = 0;

  const record = (
    ctx: ContactListActor,
    data: { name: string; description: string | null; assignedToId: string },
  ): ContactListRecord => {
    const id = `list-${++nextId}`;
    const now = new Date("2026-10-09T12:00:00.000Z");
    return {
      id,
      name: data.name,
      description: data.description,
      userId: ctx.userId,
      organizationId: ctx.organizationId ?? null,
      assignedToId: data.assignedToId,
      createdAt: now,
      updatedAt: now,
      user: person(ctx.userId),
      assignedTo: person(data.assignedToId),
      _count: { entries: 0 },
    };
  };

  const inWorkspace = (ctx: ContactListActor, list: ContactListRecord) =>
    ctx.organizationId
      ? list.organizationId === ctx.organizationId
      : list.userId === ctx.userId && list.organizationId === null;

  const repo = {
    create: async (
      ctx: ContactListActor,
      data: { name: string; description: string | null; assignedToId: string },
    ) => {
      const list = record(ctx, data);
      lists.set(list.id, list);
      entries.set(list.id, []);
      return list;
    },
    findInWorkspace: async (ctx: ContactListActor, id: string) => {
      const list = lists.get(id);
      if (!list || !inWorkspace(ctx, list)) return null;
      return { ...list, _count: { entries: entries.get(id)!.length } };
    },
    listInWorkspace: async (
      ctx: ContactListActor,
      options: { assignedToId?: string },
    ) => {
      const data = [...lists.values()].filter(
        (list) =>
          inWorkspace(ctx, list) &&
          (!options.assignedToId || list.assignedToId === options.assignedToId),
      );
      return { data, total: data.length };
    },
    update: async (
      id: string,
      data: {
        name?: string;
        description?: string | null;
        assignedToId?: string;
      },
    ) => {
      const list = { ...lists.get(id)!, ...data };
      if (data.assignedToId) list.assignedTo = person(data.assignedToId);
      lists.set(id, list);
      return list;
    },
    delete: async (id: string, onlyIfEmpty = false) => {
      if (onlyIfEmpty && entries.get(id)?.length) return;
      lists.delete(id);
      entries.delete(id);
    },
    addEntries: async (listId: string, contactIds: string[]) => {
      const current = entries.get(listId)!;
      let added = 0;
      for (const id of contactIds) {
        if (current.includes(id)) continue;
        current.push(id);
        added++;
      }
      return added;
    },
    removeEntry: async (listId: string, contactId: string) => {
      const current = entries.get(listId)!;
      const at = current.indexOf(contactId);
      if (at === -1) return false;
      current.splice(at, 1);
      return true;
    },
    listEntries: async () => ({ data: [], total: 0 }),
  };

  const contacts = {
    parseContactsCsv: (csv: string) => {
      if (!csv.startsWith("phoneNumber,name")) {
        throw new BadRequestException("Missing required columns: name");
      }
      return { totalRows: 3, rows: [], errors: [] };
    },
    importParsedContacts: async () => ({
      result: {
        success: true,
        summary: {
          totalRows: 3,
          inserted: 1,
          duplicatesSkipped: 2,
          invalidRows: 0,
          errors: [],
        },
      },
      contactIds: ["c1", "c2", "c3"],
    }),
    findByPhone: async (_ctx: unknown, phone: string) =>
      contactsByPhone.get(phone) ?? null,
    createContact: async (
      _ctx: unknown,
      dto: { phoneNumber: string; name?: string },
    ) => {
      const contact = { id: "c-new", name: dto.name ?? null };
      contactsByPhone.set(dto.phoneNumber, contact);
      return { ...contact, phoneNumber: dto.phoneNumber };
    },
  };

  const contactRepo = {
    findOwnedIds: async (_ctx: unknown, ids: string[]) =>
      ids.filter((id) => workspaceContacts.has(id)),
  };

  const organizations = {
    isMember: async (userId: string, organizationId: string) =>
      organizationId === ORG && MEMBERS.has(userId),
  };

  const service = new ContactListService(
    repo as never,
    contacts as never,
    contactRepo as never,
    organizations as never,
  );
  return { service, lists, entries, contacts };
}

describe("ContactListService — who a list goes to (LIST-002)", () => {
  let ctx: ReturnType<typeof build>;
  beforeEach(() => {
    ctx = build();
  });

  it("assigns a member's list to the member", async () => {
    const { list } = await ctx.service.create(ana, { name: " Miami " });
    assert.equal(list.name, "Miami");
    assert.equal(list.assignedTo?.id, "ana");
    assert.equal(list.createdBy.id, "ana");
    assert.deepEqual(list.permissions, {
      canManage: true,
      canAddContacts: true,
      canAssign: false,
    });
  });

  it("refuses a member creating a list for somebody else", async () => {
    await assert.rejects(
      ctx.service.create(ana, { name: "For Bruno", assignedToId: "bruno" }),
      ForbiddenException,
    );
    assert.equal(ctx.lists.size, 0);
  });

  it("lets an admin assign a list to a member, and only to a member", async () => {
    const { list } = await ctx.service.create(admin, {
      name: "Leads",
      assignedToId: "ana",
    });
    assert.equal(list.assignedTo?.id, "ana");
    assert.equal(list.createdBy.id, "admin");

    await assert.rejects(
      ctx.service.create(admin, { name: "Nope", assignedToId: "stranger" }),
      BadRequestException,
    );
  });

  it("keeps a freelancer's list their own", async () => {
    const { list } = await ctx.service.create(freelancer, { name: "Mine" });
    assert.equal(list.assignedTo?.id, "solo");
    assert.equal(list.permissions.canAssign, false);
    await assert.rejects(
      ctx.service.create(freelancer, { name: "x", assignedToId: "ana" }),
      BadRequestException,
    );
  });

  it("lets only an admin reassign", async () => {
    const { list } = await ctx.service.create(ana, { name: "Mine" });
    await assert.rejects(
      ctx.service.update(ana, list.id, { assignedToId: "bruno" }),
      ForbiddenException,
    );
    const moved = await ctx.service.update(admin, list.id, {
      assignedToId: "bruno",
    });
    assert.equal(moved.assignedTo?.id, "bruno");
  });
});

describe("ContactListService — who sees a list (LIST-001)", () => {
  let ctx: ReturnType<typeof build>;
  beforeEach(() => {
    ctx = build();
  });

  it("hides a teammate's list from a member, as if it did not exist", async () => {
    const { list } = await ctx.service.create(admin, {
      name: "Bruno's",
      assignedToId: "bruno",
    });
    await assert.rejects(ctx.service.get(ana, list.id), NotFoundException);
    await assert.rejects(
      ctx.service.importCsv(ana, list.id, "phoneNumber,name\n"),
      NotFoundException,
    );
  });

  it("narrows a member's index to their own lists whatever they ask for", async () => {
    await ctx.service.create(admin, { name: "A", assignedToId: "ana" });
    await ctx.service.create(admin, { name: "B", assignedToId: "bruno" });

    const mine = await ctx.service.list(ana, { assignedToId: "bruno" });
    assert.deepEqual(
      mine.data.map((list) => list.name),
      ["A"],
    );

    const all = await ctx.service.list(admin, {});
    assert.equal(all.data.length, 2);
    const bruno = await ctx.service.list(admin, { assignedToId: "bruno" });
    assert.deepEqual(
      bruno.data.map((list) => list.name),
      ["B"],
    );
  });

  it("never shows another workspace's list", async () => {
    const { list } = await ctx.service.create(admin, { name: "Org list" });
    await assert.rejects(
      ctx.service.get(freelancer, list.id),
      NotFoundException,
    );
  });
});

describe("ContactListService — working a list an admin assigned", () => {
  let ctx: ReturnType<typeof build>;
  let listId: string;
  beforeEach(async () => {
    ctx = build();
    const { list } = await ctx.service.create(admin, {
      name: "Assigned",
      assignedToId: "bruno",
    });
    listId = list.id;
  });

  it("lets the member add contacts", async () => {
    const view = await ctx.service.get(bruno, listId);
    assert.deepEqual(view.permissions, {
      canManage: false,
      canAddContacts: true,
      canAssign: false,
    });

    const added = await ctx.service.addContacts(bruno, listId, ["c1", "c2"]);
    assert.deepEqual(added, { added: 2, alreadyInList: 0 });

    const again = await ctx.service.addContacts(bruno, listId, ["c2", "c3"]);
    assert.deepEqual(again, { added: 1, alreadyInList: 1 });
  });

  it("keeps renaming, removing contacts and deleting for the admin", async () => {
    await assert.rejects(
      ctx.service.update(bruno, listId, { name: "Renamed" }),
      ForbiddenException,
    );
    await assert.rejects(
      ctx.service.removeContact(bruno, listId, "c1"),
      ForbiddenException,
    );
    await assert.rejects(ctx.service.remove(bruno, listId), ForbiddenException);

    await ctx.service.remove(admin, listId);
    assert.equal(ctx.lists.has(listId), false);
  });
});

describe("ContactListService — filling a list", () => {
  let ctx: ReturnType<typeof build>;
  beforeEach(() => {
    ctx = build();
  });

  it("refuses contacts from outside the workspace", async () => {
    const { list } = await ctx.service.create(ana, { name: "Mine" });
    await assert.rejects(
      ctx.service.addContacts(ana, list.id, ["c1", "someone-elses"]),
      BadRequestException,
    );
    assert.deepEqual(ctx.entries.get(list.id), []);
  });

  it("creates no list when the CSV cannot be imported at all", async () => {
    await assert.rejects(
      ctx.service.create(ana, { name: "Broken" }, "phone,whatever\n1,2"),
      BadRequestException,
    );
    assert.equal(ctx.lists.size, 0);
  });

  it("takes the new list away when its file fails while being filed", async () => {
    ctx.contacts.importParsedContacts = async () => {
      throw new Error("database unavailable");
    };
    await assert.rejects(
      ctx.service.create(ana, { name: "Half" }, "phoneNumber,name\n..."),
      /database unavailable/,
    );
    assert.equal(ctx.lists.size, 0);
  });

  it("files every row's contact, new or existing, and counts the repeats", async () => {
    const { list, import: summary } = await ctx.service.create(
      ana,
      { name: "From CSV" },
      "phoneNumber,name\n...",
    );
    assert.deepEqual(summary, {
      totalRows: 3,
      contactsCreated: 1,
      existingContacts: 2,
      addedToList: 3,
      alreadyInList: 0,
      invalidRows: 0,
      errors: [],
    });
    assert.equal(list.contactCount, 3);

    const second = await ctx.service.importCsv(
      ana,
      list.id,
      "phoneNumber,name\n...",
    );
    assert.equal(second.addedToList, 0);
    assert.equal(second.alreadyInList, 3);
  });

  it("adds a typed number the workspace has instead of copying it", async () => {
    const { list } = await ctx.service.create(ana, { name: "Mine" });

    const known = await ctx.service.addNewContact(ana, list.id, {
      phoneNumber: "+15550001",
      name: "Someone else",
    });
    assert.equal(known.contact.id, "c1");
    assert.equal(known.created, false);
    assert.equal(known.added, true);

    const fresh = await ctx.service.addNewContact(ana, list.id, {
      phoneNumber: "+15550002",
      name: "Nueva",
    });
    assert.equal(fresh.contact.id, "c-new");
    assert.equal(fresh.created, true);
    assert.deepEqual(ctx.entries.get(list.id), ["c1", "c-new"]);
  });
});

describe("ContactListService onboarding cleanup", () => {
  it("preserves a populated list but removes an empty draft", async () => {
    const { service, lists, entries } = build();
    const { list } = await service.create(ana, { name: "Saved contacts" });
    entries.set(list.id, ["contact-1"]);
    await service.remove(ana, list.id, { onlyIfEmpty: true });
    assert.ok(lists.has(list.id));
    const { list: empty } = await service.create(ana, { name: "Empty draft" });
    await service.remove(ana, empty.id, { onlyIfEmpty: true });
    assert.equal(lists.has(empty.id), false);
    await assert.rejects(
      service.remove(bruno, list.id, { onlyIfEmpty: true }),
      NotFoundException,
    );
  });
});
