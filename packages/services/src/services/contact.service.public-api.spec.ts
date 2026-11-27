import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ContactService } from "./contact.service";

type Row = Record<string, any>;

const CTX = { userId: "user-1", organizationId: "org-1" };

/**
 * A ContactService over an in-memory phone book, so the upsert and the
 * confirmed delete are exercised through the real `createContact` and
 * `updateContact` rather than around them.
 */
function setup(initial: Row[] = []) {
  const rows = new Map<string, Row>(initial.map((row) => [row.id, row]));
  const created: Row[] = [];
  const updated: Array<{ id: string; data: Row }> = [];
  const deleted: string[] = [];
  const tagSets: Array<{ id: string; tagIds: string[] }> = [];
  /**
   * A contact another request is creating at this moment. Only the locked
   * find-or-create can see it; the plain look-up before it cannot, exactly as
   * when the other request commits between the two.
   */
  let racing: Row | null = null;
  /** Runs once, between a look-up by id and the write that follows it. */
  let afterLookup: (() => void) | null = null;
  const byId = (id: string) =>
    rows.get(id) ?? (racing?.id === id ? racing : undefined);
  const live = (row: Row | undefined) =>
    row && !row.deletedAt ? row : undefined;

  const service = Object.assign(Object.create(ContactService.prototype), {
    repo: {
      findByPhone: async (_ctx: unknown, phone: string) =>
        [...rows.values()].find(
          (row) => row.phoneNumber === phone && !row.deletedAt,
        ) ?? null,
      findByIdForOwner: async (_ctx: unknown, id: string) => {
        const found = live(byId(id));
        const snapshot = found ? { ...found } : null;
        const hook = afterLookup;
        afterLookup = null;
        hook?.();
        return snapshot;
      },
      create: async (_ctx: unknown, data: Row) => {
        if (racing) throw new Error("Unique constraint failed");
        const row = { id: `contact-${created.length + 1}`, ...data };
        created.push(data);
        rows.set(row.id, row);
        return row;
      },
      // The atomic find-or-create both `createContact` and `upsertContact`
      // write through: the repository serialises callers per workspace and
      // number, so a caller that loses a race finds the winner's contact.
      createUnlessPhoneTaken: async (
        _ctx: unknown,
        phone: string,
        data: Row,
      ) => {
        const existing =
          [...rows.values()].find(
            (row) => row.phoneNumber === phone && !row.deletedAt,
          ) ?? (racing?.phoneNumber === phone ? racing : null);
        if (existing) {
          const snapshot = { ...existing };
          const hook = afterLookup;
          afterLookup = null;
          hook?.();
          return { contact: snapshot, created: false };
        }
        const row = { id: `contact-${created.length + 1}`, ...data };
        created.push(data);
        rows.set(row.id, row);
        return { contact: row, created: true };
      },
      update: async (id: string, data: Row) => {
        updated.push({ id, data });
        const merged = { ...byId(id), ...stripUndefined(data) };
        rows.set(id, merged);
        return merged;
      },
      // The write is conditional on the number it was found by, as the
      // repository's single UPDATE … WHERE is, and the tags go with it.
      updateIfPhoneUnchanged: async (
        _ctx: unknown,
        id: string,
        phone: string,
        data: Row,
        tagIds?: string[],
      ) => {
        const row = live(byId(id));
        if (!row || row.phoneNumber !== phone) return null;
        updated.push({ id, data });
        if (tagIds) tagSets.push({ id, tagIds });
        const merged = { ...row, ...stripUndefined(data) };
        rows.set(id, merged);
        return merged;
      },
      // A move to a new number is checked and written in one step, under the
      // lock a create takes on the number, so it sees a racing create too.
      updateUnlessPhoneTaken: async (
        _ctx: unknown,
        id: string,
        phone: string,
        data: Row,
        tagIds?: string[],
      ) => {
        const holder =
          [...rows.values()].find(
            (row) =>
              row.phoneNumber === phone && !row.deletedAt && row.id !== id,
          ) ?? (racing?.phoneNumber === phone ? racing : null);
        if (holder) return "taken";
        const row = live(byId(id));
        if (!row) return null;
        updated.push({ id, data: { ...data, phoneNumber: phone } });
        if (tagIds) tagSets.push({ id, tagIds });
        const merged = { ...row, ...stripUndefined(data), phoneNumber: phone };
        rows.set(id, merged);
        return merged;
      },
      softDeleteIfPhone: async (_ctx: unknown, id: string, phone: string) => {
        const row = live(byId(id));
        if (!row || row.phoneNumber !== phone) return null;
        deleted.push(id);
        const gone = { ...row, deletedAt: new Date() };
        rows.set(id, gone);
        return gone;
      },
    },
    tagRepo: {
      findOwnedIds: async () => [],
      setContactTags: async (id: string, tagIds: string[]) => {
        tagSets.push({ id, tagIds });
      },
    },
    validateOwnedTagIds: async (_ctx: unknown, ids?: string[]) => ids ?? [],
  }) as ContactService;

  return {
    service,
    rows,
    created,
    updated,
    deleted,
    tagSets,
    /** Another request is creating the contact: only the locked write sees it. */
    raceWith(winner: Row) {
      racing = winner;
    },
    /** Something changes the store right after the next look-up. */
    afterNextLookup(change: () => void) {
      afterLookup = change;
    },
  };
}

function stripUndefined(data: Row): Row {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined),
  );
}

const ADA = {
  id: "contact-ada",
  phoneNumber: "+14155550100",
  name: "Ada Lovelace",
  email: "ada@example.com",
  company: "Analytical Engines",
};

describe("ContactService.upsertContact (HOOK-009)", () => {
  it("creates the contact when the number is new", async () => {
    const { service, created } = setup();

    const { contact, created: wasCreated } = await service.upsertContact(CTX, {
      phoneNumber: "+14155550100",
      name: "Ada Lovelace",
      note: "Met at expo",
    });

    assert.equal(wasCreated, true);
    assert.equal(contact.phoneNumber, "+14155550100");
    assert.equal(created.length, 1);
    assert.equal(created[0]!.notes.create.content, "Met at expo");
  });

  it("updates the contact that already has the number instead of failing", async () => {
    const { service, created, updated } = setup([ADA]);

    const { contact, created: wasCreated } = await service.upsertContact(CTX, {
      phoneNumber: "+14155550100",
      jobTitle: "Founder",
    });

    assert.equal(wasCreated, false);
    assert.equal(contact.id, "contact-ada");
    assert.equal(created.length, 0);
    assert.equal(updated.length, 1);
    assert.equal(updated[0]!.data.jobTitle, "Founder");
  });

  it("never erases a stored value with a blank one", async () => {
    const { service, rows } = setup([ADA]);

    await service.upsertContact(CTX, {
      phoneNumber: "+14155550100",
      name: "",
      email: "   ",
      organization: "Babbage & Co",
    });

    const stored = rows.get("contact-ada")!;
    assert.equal(stored.name, "Ada Lovelace");
    assert.equal(stored.email, "ada@example.com");
    assert.equal(stored.company, "Babbage & Co");
  });

  it("does not stack the note again when the same request is repeated", async () => {
    const { service, created, updated } = setup();
    const request = {
      phoneNumber: "+14155550100",
      name: "Ada Lovelace",
      note: "Met at expo",
    };

    await service.upsertContact(CTX, request);
    await service.upsertContact(CTX, request);

    assert.equal(created.length, 1);
    assert.equal(updated.length, 1);
    assert.equal("notes" in updated[0]!.data, false);
  });

  it("leaves the tags alone unless the request names some", async () => {
    const { service, tagSets } = setup([ADA]);

    await service.upsertContact(CTX, { phoneNumber: "+14155550100" });
    assert.deepEqual(tagSets, []);

    await service.upsertContact(CTX, {
      phoneNumber: "+14155550100",
      tagIds: ["tag-1"],
    });
    assert.deepEqual(tagSets, [{ id: "contact-ada", tagIds: ["tag-1"] }]);
  });

  it("settles a race with the request that created the contact first", async () => {
    const { service, raceWith, updated } = setup();
    raceWith(ADA);

    const { contact, created } = await service.upsertContact(CTX, {
      phoneNumber: "+14155550100",
      jobTitle: "Founder",
    });

    // The find-or-create saw the winner's contact instead of writing a second.
    assert.equal(created, false);
    assert.equal(contact.id, "contact-ada");
    assert.equal(updated.length, 1);
  });

  it("never writes a null or an absent value over what is stored", async () => {
    const { service, rows } = setup([ADA]);

    await service.upsertContact(CTX, {
      phoneNumber: "+14155550100",
      email: null as never,
      name: undefined,
      jobTitle: "Founder",
    });

    const stored = rows.get("contact-ada")!;
    assert.equal(stored.email, "ada@example.com");
    assert.equal(stored.name, "Ada Lovelace");
    assert.equal(stored.jobTitle, "Founder");
  });

  it("does not undo a number edited after the look-up: it resolves the number again", async () => {
    const { service, rows, created, tagSets, afterNextLookup } = setup([ADA]);
    // Someone moves Ada to a new number between the find and the update.
    afterNextLookup(() => {
      rows.set("contact-ada", { ...ADA, phoneNumber: "+14155550199" });
    });

    const { contact, created: wasCreated } = await service.upsertContact(CTX, {
      phoneNumber: "+14155550100",
      jobTitle: "Founder",
      tagIds: ["tag-1"],
    });

    // Ada keeps the number she was moved to, untouched by this request —
    // her fields and her tags alike...
    assert.equal(rows.get("contact-ada")!.phoneNumber, "+14155550199");
    assert.equal(rows.get("contact-ada")!.jobTitle, undefined);
    assert.deepEqual(tagSets, []);
    // ...and the number, now free, gets a contact of its own.
    assert.equal(wasCreated, true);
    assert.equal(created.length, 1);
    assert.equal(contact.phoneNumber, "+14155550100");
  });

  it("gives a created contact the default source and leaves an existing one's alone", async () => {
    const fresh = setup();
    await fresh.service.upsertContact(
      CTX,
      { phoneNumber: "+14155550100" },
      { defaultSource: "api" },
    );
    assert.equal(fresh.created[0]!.source, "api");

    const existing = setup([{ ...ADA, source: "csv_import" }]);
    await existing.service.upsertContact(
      CTX,
      { phoneNumber: "+14155550100", jobTitle: "Founder" },
      { defaultSource: "api" },
    );
    assert.equal(existing.updated[0]!.data.source, undefined);
    assert.equal(existing.rows.get("contact-ada")!.source, "csv_import");
  });
});

describe("ContactService.createContact", () => {
  it("refuses a number another request is creating, through the same locked write", async () => {
    const { service, raceWith, created } = setup();
    // The other request has not committed when this one looks the number up.
    raceWith(ADA);

    await assert.rejects(
      service.createContact(CTX, { phoneNumber: "+14155550100" }),
      BadRequestException,
    );
    assert.deepEqual(created, [], "no second live contact for the number");
  });

  it("creates the contact when the number is free", async () => {
    const { service, created } = setup();
    const contact = await service.createContact(CTX, {
      phoneNumber: "+14155550100",
      name: "Ada Lovelace",
    });
    assert.equal(contact.phoneNumber, "+14155550100");
    assert.equal(created.length, 1);
  });
});

describe("ContactService.updateContact", () => {
  it("refuses a new number another request is giving a contact, through the locked write", async () => {
    const { service, rows, raceWith, updated, tagSets } = setup([ADA]);
    // Another request is creating a contact for the number and has not
    // committed when this one looks the number up.
    raceWith({ id: "contact-grace", phoneNumber: "+14155550199" });

    await assert.rejects(
      service.updateContact(CTX, "contact-ada", {
        phoneNumber: "+14155550199",
        tagIds: ["tag-1"],
      }),
      BadRequestException,
    );
    assert.equal(rows.get("contact-ada")!.phoneNumber, "+14155550100");
    assert.deepEqual(updated, [], "nothing of the refused change was written");
    assert.deepEqual(tagSets, []);
  });

  it("moves the contact to a free number, its tags in the same write", async () => {
    const { service, rows, tagSets } = setup([ADA]);

    const moved = await service.updateContact(CTX, "contact-ada", {
      phoneNumber: "+14155550199",
      tagIds: ["tag-1"],
    });

    assert.equal(moved.phoneNumber, "+14155550199");
    assert.equal(rows.get("contact-ada")!.phoneNumber, "+14155550199");
    assert.deepEqual(tagSets, [{ id: "contact-ada", tagIds: ["tag-1"] }]);
  });

  it("refuses the number it read sent back once another contact holds it", async () => {
    const { service, rows, updated, tagSets, afterNextLookup } = setup([ADA]);
    // Between the read and the write, Ada moves to a new number and another
    // contact is given the one she had.
    afterNextLookup(() => {
      rows.set("contact-ada", { ...ADA, phoneNumber: "+14155550199" });
      rows.set("contact-grace", {
        id: "contact-grace",
        phoneNumber: ADA.phoneNumber,
      });
    });

    await assert.rejects(
      service.updateContact(CTX, "contact-ada", {
        phoneNumber: ADA.phoneNumber,
        jobTitle: "Founder",
        tagIds: ["tag-1"],
      }),
      BadRequestException,
    );
    assert.equal(rows.get("contact-ada")!.phoneNumber, "+14155550199");
    assert.deepEqual(updated, [], "nothing of the refused change was written");
    assert.deepEqual(tagSets, []);
  });

  it("saves an edit that sends the contact's own number back", async () => {
    const { service, rows, tagSets } = setup([ADA]);

    const saved = await service.updateContact(CTX, "contact-ada", {
      phoneNumber: ADA.phoneNumber,
      jobTitle: "Founder",
      tagIds: ["tag-1"],
    });

    assert.equal(saved.jobTitle, "Founder");
    assert.equal(rows.get("contact-ada")!.phoneNumber, ADA.phoneNumber);
    assert.deepEqual(tagSets, [{ id: "contact-ada", tagIds: ["tag-1"] }]);
  });
});

describe("ContactService.deleteConfirmed (HOOK-009)", () => {
  it("deletes once the contact's own number is sent back", async () => {
    const { service, deleted } = setup([ADA]);

    const result = await service.deleteConfirmed(
      CTX,
      "contact-ada",
      "+14155550100",
    );

    assert.equal(result.id, "contact-ada");
    assert.deepEqual(deleted, ["contact-ada"]);
  });

  it("refuses without the confirmation, and with the wrong one", async () => {
    const { service, deleted } = setup([ADA]);

    for (const confirmation of [
      undefined,
      "",
      "+14155550199",
      " +14155550100",
    ]) {
      await assert.rejects(
        service.deleteConfirmed(CTX, "contact-ada", confirmation),
        BadRequestException,
      );
    }
    assert.deepEqual(deleted, []);
  });

  it("answers an id from another workspace as not found, before comparing numbers", async () => {
    const { service, deleted } = setup();

    await assert.rejects(
      service.deleteConfirmed(CTX, "contact-elsewhere", "+14155550100"),
      NotFoundException,
    );
    assert.deepEqual(deleted, []);
  });

  it("deletes nothing when the number changed after it was read and confirmed", async () => {
    const { service, rows, deleted, afterNextLookup } = setup([ADA]);
    afterNextLookup(() => {
      rows.set("contact-ada", { ...ADA, phoneNumber: "+14155550199" });
    });

    await assert.rejects(
      service.deleteConfirmed(CTX, "contact-ada", "+14155550100"),
      BadRequestException,
    );
    assert.deepEqual(deleted, []);
    assert.equal(rows.get("contact-ada")!.deletedAt, undefined);
  });
});
