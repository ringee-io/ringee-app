/// <reference types="node" />

import "reflect-metadata";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { apiConfiguration } from "@ringee/configuration";
import {
  MeetingEmailService,
  composeMeetingEmail,
} from "./meeting-email.service";

/**
 * The shared attendance email (AGENT-020): one email, lead and member in To,
 * admins in CC, Reply-To the member — resolved at send time, durable, and
 * never claimed as sent before the provider accepted it.
 */

type Row = Record<string, any>;

const MEETING_AT = new Date("2026-10-14T19:00:00Z");

// `build()` and the pilot-disabled test change the shared configuration.
const PILOT_ORG_IDS = apiConfiguration.AI_VOICE_AGENT_AUTOMATIONS_ORG_IDS;
afterEach(() => {
  apiConfiguration.AI_VOICE_AGENT_AUTOMATIONS_ORG_IDS = PILOT_ORG_IDS;
});

const user = (id: string, email: string, firstName = id) => ({
  id,
  firstName,
  lastName: null,
  emails: [{ email, isPrimary: true }],
});

function build(
  over: {
    meeting?: Row;
    members?: string[];
    admins?: Row[];
    sendResult?: Row;
    previous?: Row | null;
    bookingCall?: Row | null;
    /** The agent call a delivery names, and the handoff on it, if any. */
    agentCall?: Row | null;
    takenOver?: Row | null;
    agents?: Record<string, Row>;
  } = {},
) {
  apiConfiguration.AI_VOICE_AGENT_AUTOMATIONS_ORG_IDS = ["org-1"];
  const delivery: Row = {
    id: "delivery-1",
    organizationId: "org-1",
    meetingId: "meeting-1",
    kind: "attendance_confirmed",
    scheduleVersion: 1,
    claimToken: "email-claim-1",
    firstAttemptAt: null,
    sendPayload: null,
    attempts: 1,
  };
  const released: Row[] = [];
  const sentRows: Row[] = [];
  const sends: Row[] = [];
  const members = new Set(over.members ?? ["member-1", "creator-1"]);
  const users: Record<string, Row> = {
    "member-1": user("member-1", "carlos@acme.test", "Carlos"),
    "creator-1": user("creator-1", "ana@acme.test", "Ana"),
  };

  const service = new MeetingEmailService(
    {
      requeueAvailableAddresses: async () => undefined,
      claimDue: async () => [delivery],
      prepareSend: async (
        claimed: Row,
        _version: number,
        now: Date,
        payload: Row,
      ) => {
        claimed.firstAttemptAt ??= now;
        claimed.sendPayload ??= payload;
        return claimed;
      },
      listMissingMessageId: async () => [],
      findLatestSentForMeeting: async () => over.previous ?? null,
      markSent: async (_id: string, data: Row) => {
        sentRows.push(data);
        return true;
      },
      release: async (_id: string, status: string, error: string | null) => {
        released.push({ status, error });
        return true;
      },
    } as never,
    {
      findById: async () => ({
        id: "meeting-1",
        organizationId: "org-1",
        userId: "creator-1",
        status: "scheduled",
        scheduleVersion: 1,
        attendanceScheduleVersion: 1,
        attendanceStatus: "confirmed",
        title: "Demo",
        scheduledAt: MEETING_AT,
        location: "https://meet.example/abc",
        calendarId: "calendar-1",
        responsibleUserId: "member-1",
        leadEmail: "elena@lead.test",
        attendanceAgentCallId: null,
        attendanceNote: null,
        contact: {
          name: "Elena Ruiz",
          phoneNumber: "+13055550123",
          email: null,
        },
        ...over.meeting,
      }),
    } as never,
    { findById: async (id: string) => users[id] ?? null } as never,
    {
      isMember: async (id: string) => members.has(id),
      isWorkspaceMember: async (
        ctx: { userId: string; organizationId?: string | null },
        id: string,
      ) => (ctx.organizationId ? members.has(id) : id === ctx.userId),
      findAdminMembersWithEmails: async () =>
        over.admins ?? [
          user("admin-1", "boss@acme.test"),
          // An admin who is also the member: CC never repeats a To.
          user("member-1", "carlos@acme.test"),
        ],
      findById: async () => ({ name: "Acme" }),
    } as never,
    {
      findByMeetingId: async () => over.bookingCall ?? null,
      findById: async () => over.agentCall ?? null,
    } as never,
    {
      findByIdForOwner: async (_ctx: Row, id: string) =>
        over.agents?.[id] ?? null,
    } as never,
    {
      findByIdForOwner: async () => ({ timezone: "America/New_York" }),
      findDefault: async () => null,
    } as never,
    { resolveForAgent: async () => ({ name: "Acme" }) } as never,
    {
      idempotencyWindowMs: 24 * 60 * 60_000,
      send: async (message: Row) => {
        sends.push(message);
        return over.sendResult ?? { accepted: true, providerEmailId: "re_1" };
      },
      getMessageId: async () => "<msg-1@resend.test>",
    } as never,
    { findForAgentCall: async () => over.takenOver ?? null } as never,
  );
  (service as unknown as { now: () => Date }).now = () =>
    new Date("2026-10-13T19:00:00Z");
  return { service, released, sentRows, sends, delivery };
}

describe("MeetingEmailService.drain", () => {
  it("sends one email: lead and member in To, admins in CC, Reply-To the member", async () => {
    const { service, sends, sentRows } = build();

    const sent = await service.drain(new Date("2026-10-13T19:00:00Z"));

    assert.equal(sent, 1);
    assert.equal(sends.length, 1);
    assert.deepEqual(sends[0]!.to, [
      "elena@lead.test",
      "carlos@acme.test",
      "ana@acme.test",
    ]);
    assert.deepEqual(sends[0]!.cc, ["boss@acme.test"]);
    assert.equal(sends[0]!.replyTo, "carlos@acme.test");
    // The provider de-duplicates on the delivery's own id.
    assert.equal(sends[0]!.idempotencyKey, "delivery-1");
    assert.equal(sentRows[0]!.messageId, null);
  });

  it("waits for the lead's address instead of sending without them", async () => {
    const { service, sends, released } = build({
      meeting: { leadEmail: null },
    });
    await service.drain();
    assert.equal(sends.length, 0);
    assert.equal(released[0]!.status, "needs_email");
  });

  it("never writes to a member who left — the meeting needs reassigning first", async () => {
    const { service, sends, released } = build({ members: ["creator-1"] });
    await service.drain();
    assert.equal(sends.length, 0);
    assert.equal(released[0]!.status, "needs_member");
  });

  it("keeps a refused email for a retry only when retrying can help", async () => {
    const retryable = build({
      sendResult: { accepted: false, error: "rate limited", retryable: true },
    });
    await retryable.service.drain();
    assert.equal(retryable.released[0]!.status, "pending");

    const fatal = build({
      sendResult: { accepted: false, error: "bad address", retryable: false },
    });
    await fatal.service.drain();
    assert.equal(fatal.released[0]!.status, "failed");
  });

  it("threads a later email under the previous one", async () => {
    const { service, sends } = build({
      previous: {
        messageId: "<first@resend.test>",
        subject: "Confirmed: Demo — Oct 14, 3:00 PM",
      },
    });
    await service.drain();
    assert.equal(sends[0]!.headers["In-Reply-To"], "<first@resend.test>");
    assert.equal(sends[0]!.headers.References, "<first@resend.test>");
    assert.equal(sends[0]!.subject, "Re: Confirmed: Demo — Oct 14, 3:00 PM");
  });

  it("tells the member, not the lead, when the lead cannot attend", async () => {
    const { service, sends } = build({
      meeting: { attendanceStatus: "declined" },
    });
    // The delivery the claim returns, as a declined answer.
    (service as unknown as { deliveries: Row }).deliveries.claimDue =
      async () => [
        {
          id: "delivery-2",
          organizationId: "org-1",
          meetingId: "meeting-1",
          kind: "attendance_declined",
          scheduleVersion: 1,
          claimToken: "declined-claim",
          firstAttemptAt: null,
          attempts: 1,
        },
      ];
    await service.drain();
    assert.deepEqual(sends[0]!.to, ["carlos@acme.test", "ana@acme.test"]);
  });
});

describe("The email an agent's move owes (AGENT-021)", () => {
  const WAS = new Date("2026-10-13T21:00:00Z");

  /** A meeting an agent moved to version 2, and the email that move owes. */
  function moved(over: Parameters<typeof build>[0] = {}) {
    const built = build({
      ...over,
      meeting: {
        scheduleVersion: 2,
        // A move resets the answer: it was for another time (CAL-003).
        attendanceStatus: "pending",
        attendanceScheduleVersion: null,
        ...over.meeting,
      },
    });
    Object.assign(built.delivery, {
      kind: "rescheduled",
      scheduleVersion: 2,
      agentCallId: null,
      previousScheduledAt: WAS,
    });
    return built;
  }

  it("goes to the lead and the member with the admins in CC, and says where it moved from", async () => {
    const { service, sends } = moved();
    assert.equal(await service.drain(), 1);
    assert.deepEqual(sends[0]!.to, [
      "elena@lead.test",
      "carlos@acme.test",
      "ana@acme.test",
    ]);
    assert.deepEqual(sends[0]!.cc, ["boss@acme.test"]);
    assert.equal(sends[0]!.replyTo, "carlos@acme.test");
    assert.match(sends[0]!.subject, /^New time: Demo — /);
    assert.match(sends[0]!.text, /moved the meeting to a new time/);
    assert.match(sends[0]!.text, /^Was: /m);
  });

  it("starts its own thread: the lead was never on the one before it", async () => {
    const { service, sends } = moved({
      previous: {
        messageId: "<declined@resend.test>",
        subject: "Can't attend: Demo — Oct 14, 3:00 PM",
      },
    });
    await service.drain();
    assert.equal(sends[0]!.headers, undefined);
    assert.match(sends[0]!.subject, /^New time: /);
  });

  it("still tells the team when there is no address for the lead", async () => {
    const { service, sends, released } = moved({
      meeting: { leadEmail: null },
    });
    await service.drain();
    assert.deepEqual(sends[0]!.to, ["carlos@acme.test", "ana@acme.test"]);
    assert.deepEqual(released, []);
  });

  // AGENT-021: on a call another agent took over, only that agent can have
  // moved the meeting — its voice is the email's, not the caller's.
  it("speaks with the voice of the agent that moved it, not the one that placed the call", async () => {
    const agents = {
      "agent-rem": { id: "agent-rem", voiceLanguage: "es" },
      "agent-sched": { id: "agent-sched", voiceLanguage: "en" },
    };
    const handedOver = moved({
      agentCall: { id: "ac-1", agentId: "agent-rem" },
      takenOver: { status: "completed", destinationAgentId: "agent-sched" },
      agents,
    });
    handedOver.delivery.agentCallId = "ac-1";
    await handedOver.service.drain();
    assert.match(handedOver.sends[0]!.subject, /^New time: /);

    // Its own call — a callback — speaks with its own voice.
    const ownCall = moved({
      agentCall: { id: "ac-2", agentId: "agent-rem" },
      takenOver: null,
      agents,
    });
    ownCall.delivery.agentCallId = "ac-2";
    await ownCall.service.drain();
    assert.match(ownCall.sends[0]!.subject, /^Nuevo horario: /);
  });

  it("is withdrawn when the meeting moved again before it went out", async () => {
    const { service, sends, released } = moved({
      meeting: { scheduleVersion: 3 },
    });
    await service.drain();
    assert.equal(sends.length, 0);
    assert.deepEqual(released, [
      { status: "cancelled", error: "attendance_changed" },
    ]);
  });

  it("speaks the language of the call, with the time it had before", () => {
    const email = composeMeetingEmail({
      kind: "rescheduled" as never,
      language: "es",
      company: "Acme",
      meeting: {
        title: "Demo",
        scheduledAt: MEETING_AT,
        location: null,
        attendanceNote: "No puede el martes",
      },
      previousScheduledAt: WAS,
      leadName: "Elena Ruiz",
      leadPhone: "+13055550123",
      leadEmail: "elena@lead.test",
      memberName: "Carlos",
      timeZone: "America/New_York",
    });
    assert.match(email.subject, /^Nuevo horario: Demo — /);
    assert.match(
      email.text,
      /Elena Ruiz cambió la reunión a un nuevo horario\./,
    );
    assert.match(email.text, /^Cuándo: .*14 de octubre/m);
    assert.match(email.text, /^Antes: .*13 de octubre/m);
    // The lead is in To: their own note and number are not repeated back.
    assert.doesNotMatch(email.text, /No puede el martes|\+13055550123/);
  });
});

describe("composeMeetingEmail", () => {
  it("says what was answered, in the language of the call, and nothing internal", () => {
    const email = composeMeetingEmail({
      kind: "attendance_confirmed" as never,
      language: "es",
      company: "Acme",
      meeting: {
        title: "Demo",
        scheduledAt: MEETING_AT,
        location: "https://meet.example/abc",
        attendanceNote: null,
      },
      leadName: "Elena Ruiz",
      leadPhone: "+13055550123",
      leadEmail: "elena@lead.test",
      memberName: "Carlos",
      timeZone: "America/New_York",
    });
    assert.match(email.subject, /^Confirmada: Demo/);
    assert.match(email.text, /Elena Ruiz confirmó su asistencia\./);
    assert.match(email.text, /Responde a este correo para escribir a Carlos\./);
    assert.match(email.html, /href="https:\/\/meet\.example\/abc"/);
    // The lead's phone is not repeated back to them in a confirmation.
    assert.doesNotMatch(email.text, /\+13055550123/);
  });

  it("escapes what came from people before it reaches the HTML", () => {
    const email = composeMeetingEmail({
      kind: "attendance_declined" as never,
      language: "en",
      company: null,
      meeting: {
        title: "<b>Demo</b>",
        scheduledAt: MEETING_AT,
        location: null,
        attendanceNote: "<script>x</script>",
      },
      leadName: "Elena",
      leadPhone: null,
      leadEmail: null,
      memberName: "Carlos",
      timeZone: "UTC",
    });
    assert.doesNotMatch(email.html, /<script/i);
    assert.doesNotMatch(email.html, /&lt;script&gt;/);
    assert.match(email.html, /&lt;b&gt;Demo&lt;\/b&gt;/);
  });
});

describe("durable attendance email regressions", () => {
  it("does not send with the pilot disabled", async () => {
    const { service, sends } = build();
    apiConfiguration.AI_VOICE_AGENT_AUTOMATIONS_ORG_IDS = [];
    await service.drain();
    assert.equal(sends.length, 0);
  });
  it("cancels an old confirmation after the meeting was rescheduled", async () => {
    const { service, sends, released } = build({
      meeting: {
        scheduleVersion: 2,
        attendanceScheduleVersion: null,
        attendanceStatus: "pending",
      },
    });
    await service.drain();
    assert.equal(sends.length, 0);
    assert.equal(released[0]!.status, "cancelled");
  });
  it("rechecks the meeting and claim at the send boundary", async () => {
    const { service, sends } = build();
    (service as unknown as Row).deliveries.prepareSend = async () => null;
    await service.drain();
    assert.equal(sends.length, 0);
  });
  it("does not replay an uncertain send after the provider key expires", async () => {
    const { service, sends, released, delivery } = build();
    const internal = service as unknown as Row;
    internal.deliveries.markSent = async () => {
      throw new Error("database unavailable after acceptance");
    };
    await service.drain();
    assert.equal(sends.length, 1);
    assert(delivery.firstAttemptAt);
    internal.now = () => new Date("2026-10-14T20:00:00Z");
    await service.drain();
    assert.equal(sends.length, 1);
    assert.equal(released.at(-1)!.status, "failed");
  });
  it("replays the frozen payload inside the provider window", async () => {
    const { service, sends } = build({
      sendResult: { accepted: false, retryable: true, error: "timeout" },
    });
    await service.drain();
    const internal = service as unknown as Row;
    const original = internal.meetings.findById;
    internal.meetings.findById = async () => ({
      ...(await original()),
      title: "Edited after first send",
    });
    await service.drain();
    assert.equal(sends.length, 2);
    assert.deepEqual(sends[1], sends[0]);
  });
  it("allows a member reassignment that preserves the recorded attendance", async () => {
    const { service, sends } = build({
      meeting: { scheduleVersion: 2, attendanceScheduleVersion: 1 },
    });
    await service.drain();
    assert.equal(sends.length, 1);
  });
});
