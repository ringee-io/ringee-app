/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Logger } from "@nestjs/common";
import { MissedCallNotificationService } from "./missed-call-notification.service";

type Row = Record<string, any>;

const CALL = {
  id: "call-1",
  direction: "inbound",
  answeredAt: null,
  answeredByUserId: null,
  userId: "member-1",
  organizationId: "org-1",
  contactId: "contact-1",
  fromNumber: "+13055550123",
  toNumber: "+14155550100",
};

const THREAD = {
  id: "thread-1",
  organizationId: "org-1",
  assignedToId: null,
  userId: "member-1",
  contactId: "contact-1",
};

const CONTACT = {
  id: "contact-1",
  name: "Carlos <Rivera>",
  firstName: null,
  lastName: null,
  phoneNumber: "+13055550123",
  email: "carlos@acme.test",
  company: "Acme & Co",
  jobTitle: "Head of Ops",
  locationCity: "Miami",
  locationRegion: "FL",
  locationCountry: null,
  tags: [{ tag: { name: "Hot lead" } }],
  notes: [
    {
      content: "Wants a demo <b>Tuesday</b>.\nAsk for the CFO.",
      createdAt: new Date("2026-10-08T14:00:00.000Z"),
      user: { firstName: "Pedro", lastName: "Ruiz" },
    },
  ],
  _count: { notes: 7 },
};

/** The organization's members, as the whole-team fallback reads them. */
const TEAM = [
  { id: "member-1", emails: [{ email: "one@test.dev", isPrimary: true }] },
  {
    id: "member-2",
    emails: [
      { email: "two-old@test.dev", isPrimary: false },
      { email: "Two@Test.dev", isPrimary: true },
    ],
  },
  { id: "member-3", emails: [] },
];

function build(
  over: {
    call?: Row;
    thread?: Row | null;
    contact?: Row | null;
    /** Users who are not (or no longer) members of the organization. */
    notMembers?: string[];
    /** Each user's emails; anyone unlisted has `<id>@test.dev`. */
    emailsOf?: Record<string, Row[]>;
    /** Users with no row at all. */
    missingUsers?: string[];
    team?: Row[];
    preferences?: Row | null;
    first?: boolean;
    /** What the provider answers, attempt by attempt; then it accepts. */
    answers?: unknown[];
  } = {},
) {
  const emails: Array<{
    to: string[];
    subject: string;
    html: string;
    fromName?: string;
    fromAddress?: string;
  }> = [];
  const lookups = { contacts: [] as Row[], users: [] as string[] };
  const answers = [...(over.answers ?? [])];

  const service = new MissedCallNotificationService(
    {
      findById: async () => (over.thread === undefined ? THREAD : over.thread),
    } as never,
    {
      findByPhone: async () => null,
      findWithLatestNotesForOwner: async (ctx: Row, id: string) => {
        lookups.contacts.push({ ctx, id });
        return over.contact === undefined ? CONTACT : over.contact;
      },
    } as never,
    {
      findById: async (id: string) => {
        lookups.users.push(id);
        if (over.missingUsers?.includes(id)) return null;
        return {
          id,
          notificationPreferences: over.preferences ?? null,
          emails: over.emailsOf?.[id] ?? [
            { email: `${id}@test.dev`, isPrimary: true },
          ],
        };
      },
    } as never,
    {
      isMember: async (userId: string) => !over.notMembers?.includes(userId),
      findById: async () => ({ name: "Acme Sales" }),
      findMembersWithEmails: async () => over.team ?? TEAM,
    } as never,
    { setIfAbsent: async () => over.first !== false } as never,
  );
  Object.assign(service, {
    retryDelaysMs: [0, 0],
    logger: Object.assign(new Logger("spec"), {
      log: () => {},
      warn: () => {},
      error: () => {},
    }),
    email: {
      sendEmail: async (
        to: string | string[],
        subject: string,
        html: string,
        fromName?: string,
        fromAddress?: string,
      ) => {
        emails.push({
          to: Array.isArray(to) ? to : [to],
          subject,
          html,
          fromName,
          fromAddress,
        });
        const answer = answers.length
          ? answers.shift()
          : { data: { id: "email-1" }, error: null };
        if (answer instanceof Error) throw answer;
        return answer;
      },
    },
  });

  const notify = () =>
    service.notify({ ...CALL, ...over.call } as never, "thread-1");
  return { service, emails, lookups, notify };
}

describe("MissedCallNotificationService", () => {
  it("emails the line's owner the contact's details and latest notes", async () => {
    const { emails, lookups, notify } = build();
    await notify();

    assert.equal(emails.length, 1);
    const [email] = emails;
    assert.deepEqual(email.to, ["member-1@test.dev"]);
    assert.equal(email.subject, "Missed call from Carlos <Rivera>");
    // Never a reply-to on a notification nobody reads replies to.
    assert.equal(email.fromAddress, "no-reply@notifications.ringee.io");
    // Contact details, escaped.
    assert.match(email.html, /Carlos &lt;Rivera&gt;/);
    assert.match(email.html, /\+1 305 555 0123/);
    assert.match(email.html, /carlos@acme\.test/);
    assert.match(email.html, /Acme &amp; Co/);
    assert.match(email.html, /Head of Ops/);
    assert.match(email.html, /Miami, FL/);
    assert.match(email.html, /Hot lead/);
    // The line it rang on, the workspace, and where the call is waiting.
    assert.match(email.html, /your line \+1 415 555 0100 in Acme Sales/);
    assert.match(email.html, /waiting in Today's queue/);
    // The notes, escaped, with their author and date, and the rest linked.
    assert.match(email.html, /Oct 8, 2026 · Pedro Ruiz/);
    assert.match(email.html, /Wants a demo &lt;b&gt;Tuesday&lt;\/b&gt;\./);
    assert.doesNotMatch(email.html, /<b>Tuesday<\/b>/);
    assert.match(email.html, /See all 7 notes/);
    // One click back to the caller, and to the contact.
    assert.match(email.html, /\/dashboard\/call\?phoneNumber=13055550123"/);
    assert.match(email.html, /\/dashboard\/contact\/contact-1"/);
    // The contact is read inside the call's workspace.
    assert.deepEqual(lookups.contacts, [
      {
        ctx: { userId: "member-1", organizationId: "org-1" },
        id: "contact-1",
      },
    ]);
  });

  it("emails the member the conversation is assigned to", async () => {
    const { emails, notify } = build({
      thread: { ...THREAD, assignedToId: "member-2" },
    });
    await notify();
    assert.deepEqual(emails[0].to, ["member-2@test.dev"]);
  });

  it("emails the whole team when the person it is for has left the workspace", async () => {
    const { emails, notify } = build({
      thread: { ...THREAD, assignedToId: "former-member" },
      notMembers: ["former-member"],
    });
    await notify();

    assert.equal(emails.length, 1);
    // Every member with an address, primary first, never the former member.
    assert.deepEqual(emails[0].to, ["one@test.dev", "two@test.dev"]);
    assert.match(emails[0].html, /went to the whole team/);
    assert.doesNotMatch(emails[0].html, /Today's queue/);
  });

  it("emails the whole team when the person it is for has no address", async () => {
    const { emails, notify } = build({ emailsOf: { "member-1": [] } });
    await notify();
    assert.deepEqual(emails[0].to, ["one@test.dev", "two@test.dev"]);
  });

  it("emails the whole team when the person it is for is gone altogether", async () => {
    const { emails, notify } = build({ missingUsers: ["member-1"] });
    await notify();
    assert.deepEqual(emails[0].to, ["one@test.dev", "two@test.dev"]);
  });

  it("splits a large team across emails the provider accepts", async () => {
    const team = Array.from({ length: 60 }, (_, i) => ({
      id: `member-${i}`,
      emails: [{ email: `m${i}@test.dev`, isPrimary: true }],
    }));
    const { emails, notify } = build({ notMembers: ["member-1"], team });
    await notify();
    assert.deepEqual(
      emails.map((email) => email.to.length),
      [50, 10],
    );
  });

  it("emails a freelancer, the only person in their workspace", async () => {
    const { emails, notify } = build({
      call: { organizationId: null },
      thread: { ...THREAD, organizationId: null },
      notMembers: ["member-1"],
    });
    await notify();
    assert.deepEqual(emails[0].to, ["member-1@test.dev"]);
    assert.doesNotMatch(emails[0].html, / in Acme Sales/);
  });

  it("emails nobody else for a freelancer with no address", async () => {
    const { emails, notify } = build({
      call: { organizationId: null },
      thread: { ...THREAD, organizationId: null },
      emailsOf: { "member-1": [] },
    });
    await notify();
    assert.deepEqual(emails, []);
  });

  it("emails even someone who turned missed-call push notifications off", async () => {
    const { emails, notify } = build({ preferences: { missedCalls: false } });
    await notify();
    assert.equal(emails.length, 1);
  });

  it("sends a call's email once, whatever delivers its hangup twice", async () => {
    const { emails, notify } = build({ first: false });
    await notify();
    assert.deepEqual(emails, []);
  });

  it("tries again when the provider refuses the email", async () => {
    const { emails, notify } = build({
      answers: [{ sent: false }, { data: null, error: { name: "rate_limit" } }],
    });
    await notify();
    // Two refusals, then the third attempt goes through.
    assert.equal(emails.length, 3);
  });

  it("gives up quietly when the provider keeps failing", async () => {
    const { emails, notify } = build({
      answers: [new Error("down"), new Error("down"), new Error("down")],
    });
    await notify();
    assert.equal(emails.length, 3);
  });

  it("names an unknown caller by their number", async () => {
    const { emails, notify } = build({
      call: { contactId: null },
      thread: { ...THREAD, contactId: null },
    });
    await notify();
    assert.equal(emails.length, 1);
    assert.equal(emails[0].subject, "Missed call from +1 305 555 0123");
    assert.match(emails[0].html, /This number is not saved as a contact\./);
    assert.doesNotMatch(emails[0].html, /dashboard\/contact\//);
  });

  it("still announces a caller who hid their number, with no way to call back", async () => {
    const { emails, notify } = build({
      call: { fromNumber: "anonymous", contactId: null },
      thread: { ...THREAD, contactId: null },
    });
    await notify();
    assert.equal(emails.length, 1);
    assert.equal(emails[0].subject, "Missed call from a private number");
    assert.match(emails[0].html, /A caller with a hidden number called/);
    assert.match(emails[0].html, /can't be called back/);
    assert.doesNotMatch(emails[0].html, /dashboard\/call\?/);
    assert.doesNotMatch(emails[0].html, /Today's queue/);
  });

  it("says so when the contact has no notes yet", async () => {
    const { emails, notify } = build({
      contact: { ...CONTACT, notes: [], _count: { notes: 0 } },
    });
    await notify();
    assert.match(emails[0].html, /No notes on this contact yet\./);
    assert.doesNotMatch(emails[0].html, /See all/);
  });

  it("sends nothing for a call somebody answered, or an outbound one", async () => {
    for (const call of [
      { answeredAt: new Date() },
      { answeredByUserId: "member-2" },
      { direction: "outbound" },
    ]) {
      const { emails, notify } = build({ call });
      await notify();
      assert.deepEqual(emails, []);
    }
  });

  it("never throws, whatever fails", async () => {
    const { service } = build();
    Object.assign(service, {
      threads: {
        findById: async () => {
          throw new Error("database is down");
        },
      },
    });
    await service.notify(CALL as never, "thread-1");
  });
});
