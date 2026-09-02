/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createHash } from "node:crypto";
import { VoiceAgentToolService } from "./voice-agent-tool.service";

const SECRET = "rva_test_secret";
const SECRET_HASH = createHash("sha256").update(SECRET).digest("hex");

const AGENT = {
  id: "agent-1",
  userId: "user-1",
  organizationId: "org-1",
  toolSecretHash: SECRET_HASH,
  deletedAt: null,
  timezone: "America/New_York",
  meetingDurationMinutes: 30,
  meetingTitle: "Product Demo",
  calendarIntegrationId: "cal-1",
};

function build(
  over: {
    agent?: Record<string, unknown> | null;
    slots?: Array<{ start: string; end: string; label: string }>;
    slotsError?: Error;
    agentCall?: Record<string, unknown> | null;
    meeting?: Record<string, unknown>;
    meetingError?: Error;
    bookedMeeting?: Record<string, unknown>;
  } = {},
) {
  const updates: Array<Record<string, unknown>> = [];
  const created: Array<Record<string, unknown>> = [];
  const lookups: string[] = [];

  const service = new VoiceAgentToolService(
    {
      findByIdForToolCallback: async () =>
        over.agent === undefined ? AGENT : over.agent,
    } as never,
    {
      findByCallControlId: async () =>
        over.agentCall === undefined
          ? {
              id: "call-1",
              agentId: "agent-1",
              contactId: "contact-1",
              callId: "c-1",
              toNumber: "+13055550123",
            }
          : over.agentCall,
      update: async (_id: string, data: Record<string, unknown>) => {
        updates.push(data);
        return {};
      },
    } as never,
    {
      getBookableSlots: async () => {
        if (over.slotsError) throw over.slotsError;
        return over.slots ?? [];
      },
    } as never,
    {
      createMeeting: async (_ctx: unknown, dto: Record<string, unknown>) => {
        if (over.meetingError) throw over.meetingError;
        created.push(dto);
        return (
          over.meeting ?? { id: "meeting-1", location: "https://meet.test/x" }
        );
      },
      getMeetingById: async (_ctx: unknown, id: string) => {
        lookups.push(id);
        return (
          over.bookedMeeting ?? {
            id: "meeting-1",
            scheduledAt: new Date(FUTURE),
            duration: 30,
            location: "https://meet.test/x",
          }
        );
      },
    } as never,
    { findOrCreateByPhone: async () => ({ id: "contact-2" }) } as never,
  );

  return { service, updates, created, lookups };
}

const FUTURE = new Date(Date.now() + 3 * 24 * 3600_000).toISOString();

describe("VoiceAgentToolService authorization", () => {
  it("refuses a tool call with the wrong secret", async () => {
    const { service } = build();
    await assert.rejects(
      () =>
        service.getAvailableSlots("agent-1", "not-the-secret", {
          date: "2026-09-04",
        }),
      /Invalid tool credentials/,
    );
  });

  it("refuses a tool call for an agent that does not exist", async () => {
    const { service } = build({ agent: null });
    await assert.rejects(
      () =>
        service.getAvailableSlots("agent-1", SECRET, { date: "2026-09-04" }),
      /Unknown agent/,
    );
  });

  it("refuses to book against another agent's call", async () => {
    const { service } = build({
      agentCall: { id: "call-9", agentId: "another-agent" },
    });
    await assert.rejects(
      () =>
        service.bookAppointment("agent-1", SECRET, "cc-1", { start: FUTURE }),
      /does not belong to this agent/,
    );
  });
});

describe("VoiceAgentToolService availability", () => {
  it("offers at most three real slots", async () => {
    const slots = Array.from({ length: 8 }, (_, i) => ({
      start: new Date(Date.now() + (i + 1) * 3600_000).toISOString(),
      end: new Date(Date.now() + (i + 2) * 3600_000).toISOString(),
      label: `Slot ${i}`,
    }));
    const { service } = build({ slots });

    const result = await service.getAvailableSlots("agent-1", SECRET, {
      date: "2026-09-04",
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.slots.length, 3);
    assert.equal(result.timezone, "America/New_York");
    assert.equal(result.duration_minutes, 30);
  });

  it("reports a calendar failure instead of claiming the day is free", async () => {
    const { service } = build({
      slotsError: new Error("Ringee calendar unavailable"),
    });

    const result = await service.getAvailableSlots("agent-1", SECRET, {
      date: "2026-09-04",
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.error, /could not be reached/);
  });

  it("rejects a malformed date rather than guessing a day", async () => {
    const { service } = build();
    await assert.rejects(
      () =>
        service.getAvailableSlots("agent-1", SECRET, { date: "next tuesday" }),
      /YYYY-MM-DD/,
    );
  });
});

describe("VoiceAgentToolService booking", () => {
  it("books the meeting and records the outcome on the call", async () => {
    const { service, updates, created } = build();

    const result = await service.bookAppointment("agent-1", SECRET, "cc-1", {
      start: FUTURE,
      attendee_email: "carlos@acme.test",
      notes: "Asked about pricing",
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.appointment.id, "meeting-1");
    assert.equal(result.appointment.link, "https://meet.test/x");

    assert.equal(created[0]?.contactId, "contact-1");
    assert.equal(created[0]?.title, "Product Demo");
    assert.equal(created[0]?.duration, 30);
    assert.equal(created[0]?.calendarIntegrationId, "cal-1");
    // The tool knows a meeting exists; the later transcript analysis must not
    // be the thing that decides this.
    assert.deepEqual(updates, [
      { meetingId: "meeting-1", outcome: "appointment_booked" },
    ]);
  });

  it("returns the existing appointment instead of booking a second one", async () => {
    // The agent re-asks after a garbled reply, and the provider retries a
    // tool call it thinks timed out. Neither may put a second meeting on the
    // user's calendar.
    const { service, updates, created, lookups } = build({
      agentCall: {
        id: "call-1",
        agentId: "agent-1",
        contactId: "contact-1",
        callId: "c-1",
        toNumber: "+13055550123",
        meetingId: "meeting-1",
      },
    });

    const result = await service.bookAppointment("agent-1", SECRET, "cc-1", {
      start: FUTURE,
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.appointment.id, "meeting-1");
    assert.equal(result.appointment.start, FUTURE);
    assert.equal(result.appointment.link, "https://meet.test/x");
    // Nothing new was created, and nothing was re-recorded on the call.
    assert.deepEqual(created, []);
    assert.deepEqual(updates, []);
    assert.deepEqual(lookups, ["meeting-1"]);
  });

  it("refuses a time in the past", async () => {
    const { service } = build();
    const result = await service.bookAppointment("agent-1", SECRET, "cc-1", {
      start: new Date(Date.now() - 3600_000).toISOString(),
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.error, /in the past/);
  });

  it("refuses an unparseable time", async () => {
    const { service } = build();
    const result = await service.bookAppointment("agent-1", SECRET, "cc-1", {
      start: "tomorrow afternoon",
    });
    assert.equal(result.ok, false);
  });

  it("tells the agent to offer another time when the booking fails", async () => {
    const { service, updates } = build({
      meetingError: new Error("calendar rejected the event"),
    });

    const result = await service.bookAppointment("agent-1", SECRET, "cc-1", {
      start: FUTURE,
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.error, /Offer another time/);
    // Nothing was booked, so nothing may claim it was.
    assert.deepEqual(updates, []);
  });

  it("falls back to the dialed number when the call has no contact yet", async () => {
    const { service, updates, created } = build({
      agentCall: {
        id: "call-1",
        agentId: "agent-1",
        contactId: null,
        callId: "c-1",
        toNumber: "+13055550123",
      },
    });

    const result = await service.bookAppointment("agent-1", SECRET, "cc-1", {
      start: FUTURE,
    });

    assert.equal(result.ok, true);
    assert.equal(created[0]?.contactId, "contact-2");
    assert.deepEqual(updates[0], { contactId: "contact-2" });
  });
});
