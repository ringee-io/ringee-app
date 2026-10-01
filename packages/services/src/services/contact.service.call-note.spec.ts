import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ContactService } from "./contact.service";

type Row = Record<string, any>;

function setup(contact: Row = { organizationId: "org-1", userId: "creator" }) {
  const notes: Row[] = [];
  const events: Row[] = [];
  let failNextAdd = false;
  const service = Object.assign(Object.create(ContactService.prototype), {
    repo: {
      findById: async (id: string) =>
        id === "contact-1"
          ? {
              id,
              phoneNumber: "+18495322320",
              fullName: "Pedro Pica Piedra",
              email: null,
              ...contact,
            }
          : null,
      hasNoteSince: async (
        contactId: string,
        userId: string,
        content: string,
        since: Date,
      ) =>
        notes.some(
          (n) =>
            n.contactId === contactId &&
            n.userId === userId &&
            n.content === content &&
            n.createdAt >= since,
        ),
      addNote: async (contactId: string, userId: string, content: string) => {
        if (failNextAdd) {
          failNextAdd = false;
          throw new Error("database is down");
        }
        const note = {
          id: `note-${notes.length + 1}`,
          contactId,
          userId,
          content,
          createdAt: new Date("2026-10-01T15:00:00.000Z"),
        };
        notes.push(note);
        return note;
      },
    },
    customIntegrationOutbound: {
      enqueue: async (event: Row) => {
        events.push(event);
      },
    },
  }) as ContactService;
  return {
    service,
    notes,
    events,
    failNextAdd: () => {
      failNextAdd = true;
    },
  };
}

/** The call began before its wrap-up note was written. */
const CALL = {
  contactId: "contact-1",
  createdAt: new Date("2026-10-01T14:55:00.000Z"),
};

describe("ContactService call notes", () => {
  it("adds an agent's call note to the contact and publishes note.created", async () => {
    const s = setup();
    const note = await s.service.addCallNote(
      "agent-1",
      CALL,
      "  Reunion agendada!  ",
    );
    assert.equal(note?.content, "Reunion agendada!");
    assert.deepEqual(
      s.notes.map((n) => [n.contactId, n.userId, n.content]),
      [["contact-1", "agent-1", "Reunion agendada!"]],
    );
    assert.equal(s.events.length, 1);
    assert.equal(s.events[0].eventEnum, "note_created");
    assert.equal(s.events[0].subjectId, "note-1");
    assert.equal(s.events[0].data.content, "Reunion agendada!");
    // Delivered to the contact's organization, naming the agent who wrote it
    // rather than whoever created the contact.
    assert.deepEqual(s.events[0].ctx, {
      userId: "agent-1",
      organizationId: "org-1",
    });
  });

  it("keeps a personal contact's note in its owner's workspace", async () => {
    const s = setup({ organizationId: null, userId: "owner-1" });
    await s.service.addCallNote("owner-1", CALL, "Call back Friday");
    assert.deepEqual(s.events[0].ctx, {
      userId: "owner-1",
      organizationId: null,
    });
  });

  it("adds the note on a retry after a failed attempt", async () => {
    const s = setup();
    s.failNextAdd();
    // The call already holds this note by now: the outcome was written first.
    await assert.rejects(
      s.service.addCallNote("agent-1", CALL, "Reunion agendada!"),
    );
    assert.deepEqual(s.notes, []);
    const note = await s.service.addCallNote(
      "agent-1",
      CALL,
      "Reunion agendada!",
    );
    assert.equal(note?.content, "Reunion agendada!");
    assert.equal(s.events.length, 1);
  });

  it("adds nothing for an empty note, one already added for this call, or a call with no contact", async () => {
    const s = setup();
    assert.equal(await s.service.addCallNote("agent-1", CALL, "  "), null);
    assert.equal(await s.service.addCallNote("agent-1", CALL, undefined), null);
    assert.equal(
      await s.service.addCallNote(
        "agent-1",
        { contactId: null, createdAt: CALL.createdAt },
        "Wrong person",
      ),
      null,
    );
    // Saving the same disposition again is not a new note.
    await s.service.addCallNote("agent-1", CALL, "Reunion agendada!");
    assert.equal(
      await s.service.addCallNote("agent-1", CALL, "Reunion agendada! "),
      null,
    );
    assert.equal(s.notes.length, 1);
    assert.equal(s.events.length, 1);
  });

  it("still adds the same words on a later call", async () => {
    const s = setup();
    await s.service.addCallNote("agent-1", CALL, "No contesta");
    const later = {
      contactId: "contact-1",
      createdAt: new Date("2026-10-02T09:00:00.000Z"),
    };
    assert.ok(await s.service.addCallNote("agent-1", later, "No contesta"));
    assert.equal(s.notes.length, 2);
  });
});
