/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
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

function build(
  options: {
    syncError?: Error;
    slotAvailable?: boolean;
    bookableSlots?: Array<{
      start: string;
      availabilityRuleId: string | null;
    }>;
  } = {},
) {
  const events: string[] = [];
  const calendarRequests: Array<Record<string, unknown>> = [];
  const bookingRuleIds: Array<string | null> = [];

  const service = new MeetingService(
    {
      create: async () => {
        events.push("ringee:create");
        return STORED_MEETING;
      },
      createIfAvailable: async (
        _ctx: unknown,
        _data: unknown,
        availabilityRuleId: string | null,
      ) => {
        events.push("ringee:create-protected");
        bookingRuleIds.push(availabilityRuleId);
        return options.slotAvailable === false ? null : STORED_MEETING;
      },
    } as never,
    {} as never,
    {
      createCalendarEvent: async (
        _ctx: unknown,
        dto: Record<string, unknown>,
      ) => {
        events.push("google:sync");
        calendarRequests.push(dto);
        if (options.syncError) throw options.syncError;
        return {
          externalEventId: "google-event-1",
          meetLink: "https://meet.google.com/abc-defg-hij",
        };
      },
      getBookableSlots: async () =>
        options.bookableSlots ?? [
          {
            start: STORED_MEETING.scheduledAt.toISOString(),
            availabilityRuleId: "rule-1",
          },
        ],
    } as never,
    { enqueueMeetingSync: async () => undefined } as never,
    { scheduleForSubject: async () => undefined } as never,
    { findById: async () => null } as never,
    { enqueue: async () => undefined } as never,
    {} as never,
    {} as never,
  );

  return { service, events, calendarRequests, bookingRuleIds };
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
    assert.equal(calendarRequests[0]?.meetingId, "meeting-1");
    assert.equal(calendarRequests[0]?.integrationId, "calendar-1");
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

  it("requires a booking time zone for protected creation", async () => {
    const { service, events } = build();

    await assert.rejects(
      () =>
        service.createMeeting(
          { userId: "user-1", organizationId: "org-1" },
          {
            contactId: "contact-1",
            scheduledAt: "2099-01-05T15:00:00.000Z",
            requireAvailableSlot: true,
          },
        ),
      /bookingTimeZone is required/,
    );
    assert.deepEqual(events, []);
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
});
