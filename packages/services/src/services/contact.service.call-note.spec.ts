import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ContactService } from "./contact.service";

type Row = Record<string, any>;

function setup(contact: Row = { organizationId: "org-1", userId: "creator" }) {
  const notes: Row[] = [];
  const events: Row[] = [];
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
      addNote: async (contactId: string, userId: string, content: string) => {
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
  return { service, notes, events };
}

const CALL = { contactId: "contact-1" };

describe("ContactService call notes", () => {
  it("adds an agent's call note to the contact and publishes note.created", async () => {
    const s = setup();
    const note = await s.service.addCallNote(
      "agent-1",
      CALL,
      "  Reunion agendada!  ",
      null,
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
    await s.service.addCallNote("owner-1", CALL, "Call back Friday", null);
    assert.deepEqual(s.events[0].ctx, {
      userId: "owner-1",
      organizationId: null,
    });
  });

  it("adds nothing for an empty note, an unchanged note, or a call with no contact", async () => {
    const s = setup();
    assert.equal(
      await s.service.addCallNote("agent-1", CALL, "  ", null),
      null,
    );
    assert.equal(await s.service.addCallNote("agent-1", CALL, undefined), null);
    // Saving the same disposition again is not a new note.
    assert.equal(
      await s.service.addCallNote(
        "agent-1",
        CALL,
        "Reunion agendada!",
        "Reunion agendada! ",
      ),
      null,
    );
    assert.equal(
      await s.service.addCallNote(
        "agent-1",
        { contactId: null },
        "Wrong person",
        null,
      ),
      null,
    );
    assert.deepEqual(s.notes, []);
    assert.deepEqual(s.events, []);
  });
});
