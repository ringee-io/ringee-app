/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { MeetingService } from "./meeting.service";

const STORED_MEETING = {
  id: "meeting-1",
  userId: "user-1",
  organizationId: "org-1",
  contactId: "contact-1",
  callId: null,
  title: "Product demo",
  scheduledAt: new Date("2099-01-05T15:00:00.000Z"),
  duration: 30,
  location: null,
  notes: null,
  status: "scheduled",
  externalEventId: null,
  cancelledAt: null,
  createdAt: new Date("2099-01-01T00:00:00.000Z"),
  updatedAt: new Date("2099-01-01T00:00:00.000Z"),
};

const RESOLVED_CALENDAR = {
  calendar: {
    id: "cal-global",
    name: "Global calendar",
    timezone: "UTC",
    isDefault: true,
    archivedAt: null,
  },
  scope: { calendarId: "cal-global", isDefault: true },
  timezone: "UTC",
  destination: { integrationId: "calendar-1", externalCalendarId: null },
};

function build(
  options: {
    syncError?: Error;
    slotAvailable?: boolean;
    bookableSlots?: Array<{
      start: string;
      availabilityRuleId: string | null;
    }>;
    resolvedCalendar?: Record<string, unknown>;
    storedMeeting?: Record<string, unknown>;
  } = {},
) {
  const events: string[] = [];
  const calendarRequests: Array<Record<string, unknown>> = [];
  const bookingRuleIds: Array<string | null> = [];
  const bookingScopes: Array<Record<string, unknown>> = [];
  const createdMeetings: Array<Record<string, unknown>> = [];
  const resolveCalls: Array<Record<string, unknown>> = [];
  const slotLookups: Array<Record<string, unknown>> = [];

  const service = new MeetingService(
    {
      create: async (_ctx: unknown, data: Record<string, unknown>) => {
        events.push("ringee:create");
        createdMeetings.push(data);
        return STORED_MEETING;
      },
      createIfAvailable: async (
        _ctx: unknown,
        data: Record<string, unknown>,
        scope: Record<string, unknown>,
        availabilityRuleId: string | null,
      ) => {
        events.push("ringee:create-protected");
        createdMeetings.push(data);
        bookingScopes.push(scope);
        bookingRuleIds.push(availabilityRuleId);
        return options.slotAvailable === false ? null : STORED_MEETING;
      },
      findById: async () => options.storedMeeting ?? STORED_MEETING,
    } as never,
    {} as never,
    {
      resolveCalendar: async (
        _ctx: unknown,
        opts: Record<string, unknown> = {},
      ) => {
        resolveCalls.push(opts);
        return options.resolvedCalendar ?? RESOLVED_CALENDAR;
      },
      syncMeetingToExternalCalendar: async (
        _ctx: unknown,
        _meeting: unknown,
        dto: Record<string, unknown>,
      ) => {
        events.push("google:sync");
        calendarRequests.push(dto);
        if (options.syncError) {
          return { status: "failed", error: options.syncError.message };
        }
        if (!dto.destination) return { status: "not_required" };
        return {
          status: "synced",
          externalEventId: "google-event-1",
          meetLink: "https://meet.google.com/abc-defg-hij",
        };
      },
      getBookableSlotsForCalendar: async (
        _ctx: unknown,
        _calendar: unknown,
        opts: Record<string, unknown>,
      ) => {
        slotLookups.push(opts);
        return (
          options.bookableSlots ?? [
            {
              start: STORED_MEETING.scheduledAt.toISOString(),
              availabilityRuleId: "rule-1",
            },
          ]
        );
      },
    } as never,
    { enqueueMeetingSync: async () => undefined } as never,
    { scheduleForSubject: async () => undefined } as never,
    { findById: async () => null } as never,
    { enqueue: async () => undefined } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  return {
    service,
    events,
    calendarRequests,
    bookingRuleIds,
    bookingScopes,
    createdMeetings,
    resolveCalls,
    slotLookups,
  };
}

describe("MeetingService Ringee-first calendar sync", () => {
  it("stores in Ringee before syncing the configured external calendar", async () => {
    const { service, events, calendarRequests } = build();

    const meeting = await service.createMeeting(
      { userId: "user-1", organizationId: "org-1" },
      {
        contactId: "contact-1",
        title: "Product demo",
        scheduledAt: "2099-01-05T15:00:00.000Z",
        duration: 30,
        attendeeEmail: "prospect@example.com",
        calendarIntegrationId: "calendar-1",
      },
    );

    assert.deepEqual(events, ["ringee:create", "google:sync"]);
    assert.deepEqual(calendarRequests[0]?.destination, {
      integrationId: "calendar-1",
      externalCalendarId: null,
    });
    assert.equal(meeting.externalEventId, "google-event-1");
    assert.equal(meeting.location, "https://meet.google.com/abc-defg-hij");
  });

  it("keeps the Ringee booking when external sync fails", async () => {
    const { service, events } = build({
      syncError: new Error("Google Calendar API error: 503"),
    });

    const meeting = await service.createMeeting(
      { userId: "user-1", organizationId: "org-1" },
      {
        contactId: "contact-1",
        scheduledAt: "2099-01-05T15:00:00.000Z",
        calendarIntegrationId: "calendar-1",
      },
    );

    assert.deepEqual(events, ["ringee:create", "google:sync"]);
    assert.equal(meeting.id, "meeting-1");
    assert.equal(meeting.externalEventId, null);
    assert.equal(meeting.location, null);
  });

  it("does not sync externally when the protected Ringee slot was taken", async () => {
    const { service, events, bookingRuleIds } = build({
      slotAvailable: false,
    });

    await assert.rejects(
      () =>
        service.createMeeting(
          { userId: "user-1", organizationId: "org-1" },
          {
            contactId: "contact-1",
            scheduledAt: "2099-01-05T15:00:00.000Z",
            requireAvailableSlot: true,
            bookingTimeZone: "UTC",
          },
        ),
      /no longer available/,
    );

    assert.deepEqual(events, ["ringee:create-protected"]);
    assert.deepEqual(bookingRuleIds, ["rule-1"]);
  });

  it("validates a protected slot in the calendar's own time zone by default", async () => {
    const { service, slotLookups } = build({
      resolvedCalendar: {
        ...RESOLVED_CALENDAR,
        calendar: { ...RESOLVED_CALENDAR.calendar, timezone: "Europe/Madrid" },
        timezone: "Europe/Madrid",
      },
    });

    await service.createMeeting(
      { userId: "user-1", organizationId: "org-1" },
      {
        contactId: "contact-1",
        scheduledAt: "2099-01-05T15:00:00.000Z",
        requireAvailableSlot: true,
      },
    );

    assert.equal(slotLookups[0]?.timeZone, "Europe/Madrid");
  });

  it("maps invalid dates and time zones to bad requests", async () => {
    const { service, events } = build();
    const ctx = { userId: "user-1", organizationId: "org-1" };

    await assert.rejects(
      () =>
        service.createMeeting(ctx, {
          contactId: "contact-1",
          scheduledAt: "not-a-date",
        }),
      (error: unknown) =>
        error instanceof Error &&
        error.name === "BadRequestException" &&
        /scheduledAt/.test(error.message),
    );
    await assert.rejects(
      () =>
        service.createMeeting(ctx, {
          contactId: "contact-1",
          scheduledAt: null,
        } as never),
      (error: unknown) =>
        error instanceof Error &&
        error.name === "BadRequestException" &&
        /scheduledAt/.test(error.message),
    );
    await assert.rejects(
      () =>
        service.createMeeting(ctx, {
          contactId: "contact-1",
          scheduledAt: "2099-01-05T15:00:00.000Z",
          requireAvailableSlot: true,
          bookingTimeZone: "Not/A_Real_Zone",
        }),
      (error: unknown) =>
        error instanceof Error &&
        error.name === "BadRequestException" &&
        /time zone/.test(error.message),
    );
    assert.deepEqual(events, []);
  });

  it("uses only the rule marker returned by CalendarService", async () => {
    const { service, bookingRuleIds } = build();

    await service.createMeeting({ userId: "user-1", organizationId: "org-1" }, {
      contactId: "contact-1",
      scheduledAt: "2099-01-05T15:00:00.000Z",
      requireAvailableSlot: true,
      bookingTimeZone: "UTC",
      slotCapacity: null,
    } as never);

    assert.deepEqual(bookingRuleIds, ["rule-1"]);
  });

  it("books the workspace's global calendar when the caller names none", async () => {
    const { service, resolveCalls, createdMeetings } = build();

    await service.createMeeting(
      { userId: "user-1", organizationId: "org-1" },
      { contactId: "contact-1", scheduledAt: "2099-01-05T15:00:00.000Z" },
    );

    assert.equal(resolveCalls[0]?.calendarId, undefined);
    assert.equal(createdMeetings[0]?.calendarId, "cal-global");
  });

  it("books the calendar the caller named", async () => {
    const salesCalendar = {
      calendar: {
        id: "cal-sales",
        name: "Sales",
        timezone: "UTC",
        isDefault: false,
        archivedAt: null,
      },
      scope: { calendarId: "cal-sales", isDefault: false },
      timezone: "UTC",
      destination: null,
    };
    const { service, createdMeetings, bookingScopes, resolveCalls } = build({
      resolvedCalendar: salesCalendar,
    });

    await service.createMeeting(
      { userId: "user-1", organizationId: "org-1" },
      {
        contactId: "contact-1",
        scheduledAt: "2099-01-05T15:00:00.000Z",
        calendarId: "cal-sales",
        requireAvailableSlot: true,
      },
    );

    assert.equal(resolveCalls[0]?.calendarId, "cal-sales");
    assert.equal(createdMeetings[0]?.calendarId, "cal-sales");
    // Capacity is checked against that calendar only.
    assert.deepEqual(bookingScopes, [
      { calendarId: "cal-sales", isDefault: false },
    ]);
  });

  it("books normally when the calendar has no external connection", async () => {
    const { service, events } = build({
      resolvedCalendar: { ...RESOLVED_CALENDAR, destination: null },
    });

    const meeting = await service.createMeeting(
      { userId: "user-1", organizationId: "org-1" },
      { contactId: "contact-1", scheduledAt: "2099-01-05T15:00:00.000Z" },
    );

    assert.equal(meeting.id, "meeting-1");
    assert.deepEqual(events, ["ringee:create", "google:sync"]);
    assert.equal(meeting.externalSyncStatus, "not_required");
  });

  it("reports a failed external event without losing the Ringee booking", async () => {
    const { service } = build({
      syncError: new Error("Google Calendar create event error: 503"),
    });

    const meeting = await service.createMeeting(
      { userId: "user-1", organizationId: "org-1" },
      { contactId: "contact-1", scheduledAt: "2099-01-05T15:00:00.000Z" },
    );

    assert.equal(meeting.id, "meeting-1");
    assert.equal(meeting.externalSyncStatus, "failed");
  });

  it("retries against the destination the failed attempt recorded", async () => {
    const { service, calendarRequests, resolveCalls } = build({
      storedMeeting: {
        ...STORED_MEETING,
        calendarId: "cal-global",
        externalEventId: null,
        externalSyncStatus: "failed",
        externalCalendarIntegrationId: "calendar-old",
        externalCalendarTargetId: "team@group.calendar.google.com",
      },
    });

    await service.retryExternalSync(
      { userId: "user-1", organizationId: "org-1" },
      "meeting-1",
    );

    // Re-resolving could name the account the calendar points at *now*; the
    // retry only converges on a duplicate-free event at the calendar the first
    // attempt reached.
    assert.deepEqual(resolveCalls, []);
    assert.deepEqual(calendarRequests[0]?.destination, {
      integrationId: "calendar-old",
      externalCalendarId: "team@group.calendar.google.com",
    });
  });

  it("resolves the calendar to retry a booking that never recorded a destination", async () => {
    const { service, calendarRequests, resolveCalls } = build({
      storedMeeting: {
        ...STORED_MEETING,
        calendarId: "cal-global",
        externalEventId: null,
        externalSyncStatus: "failed",
        externalCalendarIntegrationId: null,
        externalCalendarTargetId: null,
      },
    });

    await service.retryExternalSync(
      { userId: "user-1", organizationId: "org-1" },
      "meeting-1",
    );

    assert.equal(resolveCalls[0]?.calendarId, "cal-global");
    assert.equal(resolveCalls[0]?.allowArchived, true);
    assert.deepEqual(
      calendarRequests[0]?.destination,
      RESOLVED_CALENDAR.destination,
    );
  });

  it("uses a calendar the booking path already resolved, without resolving again", async () => {
    const pinned = {
      calendar: {
        id: "cal-pinned",
        name: "Pinned",
        timezone: "UTC",
        isDefault: false,
        archivedAt: null,
      },
      scope: { calendarId: "cal-pinned", isDefault: false },
      timezone: "UTC",
      destination: null,
    };
    const { service, resolveCalls, createdMeetings } = build();

    await service.createMeeting(
      { userId: "user-1", organizationId: "org-1" },
      {
        contactId: "contact-1",
        scheduledAt: "2099-01-05T15:00:00.000Z",
        resolvedCalendar: pinned as never,
      },
    );

    assert.deepEqual(resolveCalls, []);
    assert.equal(createdMeetings[0]?.calendarId, "cal-pinned");
  });
});

describe("MeetingService.updateCallOutcome", () => {
  function setup() {
    const call = {
      id: "call-1",
      userId: "user-1",
      organizationId: "org-1",
      contactId: "contact-1",
      outcome: null as string | null,
      outcomeNote: null as string | null,
      dispositionId: null as string | null,
      dispositionName: null as string | null,
      createdAt: new Date("2026-10-01T14:55:00.000Z"),
      updatedAt: new Date("2026-10-01T14:56:00.000Z"),
    };
    const published: Array<Record<string, unknown>> = [];
    const notes: Array<unknown[]> = [];
    /** The workspace's dispositions, as `DispositionService` resolves them. */
    const dispositions: Record<string, Record<string, unknown>> = {
      "demo-booked": {
        id: "demo-booked",
        label: "Demo booked",
        canonicalOutcome: "meeting_booked",
        isActive: true,
      },
      retired: {
        id: "retired",
        label: "Old status",
        canonicalOutcome: "follow_up",
        isActive: false,
      },
    };
    const service = Object.assign(Object.create(MeetingService.prototype), {
      logger: { warn: () => {} },
      callRepo: {
        findById: async () => ({ ...call }),
        // The repository writes only a change, and says so. An outcome
        // written without a disposition clears one only when it moves.
        recordOutcome: async (
          _id: string,
          outcome: string,
          note?: string,
          disposition?: { id: string; name: string },
        ) => {
          const changed =
            call.outcome !== outcome ||
            (disposition !== undefined &&
              call.dispositionId !== disposition.id) ||
            (note !== undefined && call.outcomeNote !== note);
          if (changed) {
            const keepsDisposition = !disposition && call.outcome === outcome;
            Object.assign(call, {
              outcome,
              ...(note !== undefined ? { outcomeNote: note } : {}),
              ...(keepsDisposition
                ? {}
                : {
                    dispositionId: disposition?.id ?? null,
                    dispositionName: disposition?.name ?? null,
                  }),
              updatedAt: new Date(call.updatedAt.getTime() + 1_000),
            });
          }
          return { call: { ...call }, changed };
        },
      },
      dispositions: {
        resolveSelectable: async (_ctx: unknown, id: string) => {
          const disposition = dispositions[id];
          if (!disposition)
            throw new NotFoundException("Disposition not found");
          if (!disposition.isActive) {
            throw new BadRequestException("This disposition is inactive");
          }
          return { disposition, outcome: disposition.canonicalOutcome };
        },
      },
      pipelineFanout: { handleCallFinalized: () => undefined },
      crmCallLog: { enqueueOutcomeUpdate: async () => undefined },
      customIntegrationOutbound: {
        enqueueCallOutcomeUpdated: async (row: Record<string, unknown>) => {
          published.push(row);
        },
      },
      contactService: {
        addCallNote: async (...args: unknown[]) => {
          notes.push(args);
          return null;
        },
      },
    }) as MeetingService;
    return { service, published, notes };
  }
  const ctx = { userId: "user-1", organizationId: "org-1" };

  it("publishes an outcome once however often the same one is saved", async () => {
    const s = setup();
    const save = { outcome: "meeting_booked" as never, outcomeNote: "Demo" };
    await s.service.updateCallOutcome(ctx, "call-1", save);
    // A retried request: same outcome, same note.
    await s.service.updateCallOutcome(ctx, "call-1", save);
    assert.equal(s.published.length, 1);
    // A real change is a new event.
    await s.service.updateCallOutcome(ctx, "call-1", {
      ...save,
      outcomeNote: "Demo on Tuesday",
    });
    assert.equal(s.published.length, 2);
    // The note goes to the contact on every save: it is idempotent itself,
    // and that is what lets a retry add one a failed save left out.
    assert.equal(s.notes.length, 3);
  });

  it("records the disposition and the outcome it maps to, whatever outcome the client sent", async () => {
    const s = setup();
    const updated = await s.service.updateCallOutcome(ctx, "call-1", {
      dispositionId: "demo-booked",
      // A client that also sends an outcome does not get to contradict it.
      outcome: "not_interested",
      outcomeNote: "Demo on Friday",
    });
    assert.equal(updated.outcome, "meeting_booked");
    assert.equal(updated.dispositionId, "demo-booked");
    assert.equal(updated.dispositionName, "Demo booked");
    assert.equal(s.published.length, 1);
  });

  it("still records a bare outcome, as clients did before dispositions", async () => {
    const s = setup();
    const updated = await s.service.updateCallOutcome(ctx, "call-1", {
      outcome: "voicemail",
    });
    assert.equal(updated.outcome, "voicemail");
    assert.equal(updated.dispositionId, null);
    assert.equal(s.published.length, 1);
  });

  it("keeps a disposition the same outcome confirms, and drops one a new outcome replaces", async () => {
    const s = setup();
    await s.service.updateCallOutcome(ctx, "call-1", {
      dispositionId: "demo-booked",
    });
    // A meeting booked on the same call writes the outcome it already has.
    const kept = await s.service.updateCallOutcome(ctx, "call-1", {
      outcome: "meeting_booked",
    });
    assert.equal(kept.dispositionId, "demo-booked");

    const replaced = await s.service.updateCallOutcome(ctx, "call-1", {
      outcome: "not_interested",
    });
    assert.equal(replaced.outcome, "not_interested");
    assert.equal(replaced.dispositionId, null);
  });

  it("refuses an unknown outcome, and a save with neither outcome nor disposition", async () => {
    const s = setup();
    await assert.rejects(
      s.service.updateCallOutcome(ctx, "call-1", { outcome: "converted" }),
      BadRequestException,
    );
    await assert.rejects(
      s.service.updateCallOutcome(ctx, "call-1", {
        outcomeNote: "just a note",
      }),
      BadRequestException,
    );
    assert.equal(s.published.length, 0);
  });

  it("refuses an inactive or unknown disposition without writing anything", async () => {
    const s = setup();
    await assert.rejects(
      s.service.updateCallOutcome(ctx, "call-1", { dispositionId: "retired" }),
      BadRequestException,
    );
    await assert.rejects(
      s.service.updateCallOutcome(ctx, "call-1", {
        dispositionId: "someone-elses",
      }),
      NotFoundException,
    );
    assert.equal(s.published.length, 0);
  });
});
