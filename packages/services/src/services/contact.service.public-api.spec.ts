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
  let racing: Row | null = null;

  const service = Object.assign(Object.create(ContactService.prototype), {
    repo: {
      findByPhone: async (_ctx: unknown, phone: string) =>
        [...rows.values()].find((row) => row.phoneNumber === phone) ??
        racing ??
        null,
      findByIdForOwner: async (_ctx: unknown, id: string) =>
        rows.get(id) ?? null,
      create: async (_ctx: unknown, data: Row) => {
        if (racing) throw new Error("Unique constraint failed");
        const row = { id: `contact-${created.length + 1}`, ...data };
        created.push(data);
        rows.set(row.id, row);
        return row;
      },
      // The atomic find-or-create `upsertContact` writes through: the
      // repository serialises callers per workspace and number, so a caller
      // that loses a race simply finds the winner's contact.
      createUnlessPhoneTaken: async (
        _ctx: unknown,
        phone: string,
        data: Row,
      ) => {
        const existing =
          [...rows.values()].find((row) => row.phoneNumber === phone) ?? racing;
        if (existing) return { contact: existing, created: false };
        const row = { id: `contact-${created.length + 1}`, ...data };
        created.push(data);
        rows.set(row.id, row);
        return { contact: row, created: true };
      },
      update: async (id: string, data: Row) => {
        updated.push({ id, data });
        const merged = { ...rows.get(id), ...stripUndefined(data) };
        rows.set(id, merged);
        return merged;
      },
      deleteContact: async (id: string) => {
        deleted.push(id);
        return rows.get(id);
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
    /** Another request created the contact first: the lookup finds it. */
    raceWith(winner: Row) {
      racing = winner;
      rows.set(winner.id, winner);
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
});
