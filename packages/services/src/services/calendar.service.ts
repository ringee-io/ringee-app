import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import {
  CalendarIntegrationRepository,
  MeetingRepository,
  CalendarIntegration,
  CalendarProvider,
} from "@ringee/database";
import { OwnershipContext } from "@ringee/platform";
import { apiConfiguration } from "@ringee/configuration";

export interface CalendarEvent {
  id: string;
  summary: string;
  start: Date;
  end: Date;
  meetLink?: string;
}

export interface FreeBusySlot {
  start: Date;
  end: Date;
}

export interface AvailabilitySlot {
  time: string; // "09:00"
  available: boolean;
  eventName?: string;
}

/** A slot that can actually be booked, as absolute times. */
export interface BookableSlot {
  /** ISO 8601 instant. */
  start: string;
  end: string;
  /** How the slot reads in its own time zone, e.g. "Friday, 2:30 PM". */
  label: string;
}

/**
 * The UTC offset of `timeZone` at a given instant, in milliseconds.
 *
 * Derived by formatting the instant in that zone and reading the wall-clock
 * time back — the standard way to do this without a date library.
 */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");

  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );
  return asUtc - instant.getTime();
}

/**
 * The instant at which the wall clock in `timeZone` reads the given date and
 * time. Applied twice so a slot that straddles a daylight-saving change still
 * lands on the right instant.
 */
function zonedTimeToUtc(
  dateStr: string,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const pad = (n: number) => n.toString().padStart(2, "0");
  const naive = new Date(`${dateStr}T${pad(hour)}:${pad(minute)}:00Z`);
  if (Number.isNaN(naive.getTime())) {
    throw new BadRequestException(`"${dateStr}" is not a valid date.`);
  }
  const firstPass = new Date(naive.getTime() - zoneOffsetMs(naive, timeZone));
  return new Date(naive.getTime() - zoneOffsetMs(firstPass, timeZone));
}

/** "Friday, 2:30 PM" — how the agent says a slot out loud. */
function formatInZone(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(instant);
}

@Injectable()
export class CalendarService {
  constructor(
    private readonly calendarRepo: CalendarIntegrationRepository,
    private readonly meetingRepo: MeetingRepository,
  ) {}

  // --- OAuth Flow Methods ---

  getGoogleOAuthUrl(redirectUri: string, state: string): string {
    const clientId = apiConfiguration.GOOGLE_CALENDAR_CLIENT_ID;
    if (!clientId)
      throw new BadRequestException("Google Calendar not configured");

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/calendar.events email profile",
      access_type: "offline",
      prompt: "consent",
      state,
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  getMicrosoftOAuthUrl(redirectUri: string, state: string): string {
    const clientId = apiConfiguration.MICROSOFT_CALENDAR_CLIENT_ID;
    if (!clientId)
      throw new BadRequestException("Microsoft Calendar not configured");

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope:
        "offline_access Calendars.ReadWrite OnlineMeetings.ReadWrite User.Read",
      state,
    });

    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
  }

  async exchangeGoogleCode(
    code: string,
    redirectUri: string,
  ): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresAt?: Date;
    email?: string;
  }> {
    const clientId = apiConfiguration.GOOGLE_CALENDAR_CLIENT_ID;
    const clientSecret = apiConfiguration.GOOGLE_CALENDAR_CLIENT_SECRET;
    if (!clientId || !clientSecret)
      throw new BadRequestException("Google Calendar not configured");

    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      throw new BadRequestException(
        `Google token exchange failed: ${errorBody}`,
      );
    }

    const data = await res.json();

    // Fetch user email
    let email: string | undefined;
    try {
      const userRes = await fetch(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        {
          headers: { Authorization: `Bearer ${data.access_token}` },
        },
      );
      if (userRes.ok) {
        const userData = await userRes.json();
        email = userData.email;
      }
    } catch {
      /* ignore */
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000)
        : undefined,
      email,
    };
  }

  async exchangeMicrosoftCode(
    code: string,
    redirectUri: string,
  ): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresAt?: Date;
    email?: string;
  }> {
    const clientId = apiConfiguration.MICROSOFT_CALENDAR_CLIENT_ID;
    const clientSecret = apiConfiguration.MICROSOFT_CALENDAR_CLIENT_SECRET;
    if (!clientId || !clientSecret)
      throw new BadRequestException("Microsoft Calendar not configured");

    const res = await fetch(
      "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
          scope:
            "offline_access Calendars.ReadWrite OnlineMeetings.ReadWrite User.Read",
        }),
      },
    );

    if (!res.ok) {
      const errorBody = await res.text();
      throw new BadRequestException(
        `Microsoft token exchange failed: ${errorBody}`,
      );
    }

    const data = await res.json();

    // Fetch user email
    let email: string | undefined;
    try {
      const userRes = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: { Authorization: `Bearer ${data.access_token}` },
      });
      if (userRes.ok) {
        const userData = await userRes.json();
        email = userData.mail || userData.userPrincipalName;
      }
    } catch {
      /* ignore */
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000)
        : undefined,
      email,
    };
  }

  async connectCalendar(
    ctx: OwnershipContext,
    dto: {
      provider: CalendarProvider;
      accessToken: string;
      refreshToken?: string;
      expiresAt?: string;
      calendarId?: string;
      email?: string;
    },
  ): Promise<CalendarIntegration> {
    return this.calendarRepo.upsert(ctx.userId, dto.provider, {
      accessToken: dto.accessToken,
      refreshToken: dto.refreshToken,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      calendarId: dto.calendarId,
      email: dto.email,
      organizationId: ctx.organizationId,
    });
  }

  async getIntegrations(ctx: OwnershipContext): Promise<CalendarIntegration[]> {
    return this.calendarRepo.findByUserOrOrg(ctx.userId, ctx.organizationId);
  }

  async disconnectCalendar(
    ctx: OwnershipContext,
    integrationId: string,
  ): Promise<void> {
    await this.calendarRepo.deactivate(integrationId);
  }

  /**
   * Get free/busy information for a given date range.
   * Calls the provider API (Google or Microsoft) to fetch busy slots,
   * then computes available 30-minute slots.
   */
  async getAvailability(
    ctx: OwnershipContext,
    dto: {
      date: string; // ISO date string, e.g. "2026-04-01"
      provider?: CalendarProvider;
    },
  ): Promise<AvailabilitySlot[]> {
    const integrations = await this.calendarRepo.findByUserOrOrg(
      ctx.userId,
      ctx.organizationId,
    );
    const integration = dto.provider
      ? integrations.find((i) => i.provider === dto.provider)
      : integrations[0];

    if (!integration) {
      // No calendar connected - return all slots as available
      return this.generateAllAvailableSlots(dto.date);
    }

    try {
      const busySlots = await this.fetchFreeBusy(integration, dto.date);
      return this.computeAvailability(dto.date, busySlots);
    } catch {
      // If API call fails, return all available
      return this.generateAllAvailableSlots(dto.date);
    }
  }

  /**
   * Real, bookable slots for one day, as absolute times.
   *
   * `getAvailability` above is the human picker: it works in server-local time
   * and, when a calendar is missing or the provider errors, deliberately falls
   * back to "everything is free" so the UI still renders something. Neither
   * behaviour is safe for an AI agent, which offers these times out loud and
   * then books one — a fabricated slot double-books a real meeting. So this
   * variant works in an explicit time zone and **fails** rather than guessing.
   */
  async getBookableSlots(
    ctx: OwnershipContext,
    opts: {
      /** Day to check, as YYYY-MM-DD in `timeZone`. */
      date: string;
      /** IANA zone the day and the returned times are expressed in. */
      timeZone: string;
      durationMinutes: number;
      /** The specific connected calendar to read, when one was chosen. */
      integrationId?: string | null;
      provider?: CalendarProvider;
      /** Business hours in `timeZone`. Defaults to 09:00–18:00. */
      dayStartHour?: number;
      dayEndHour?: number;
    },
  ): Promise<BookableSlot[]> {
    const integration = await this.requireIntegration(
      ctx,
      opts.provider,
      opts.integrationId,
    );

    const dayStart = zonedTimeToUtc(
      opts.date,
      opts.dayStartHour ?? 9,
      0,
      opts.timeZone,
    );
    const dayEnd = zonedTimeToUtc(
      opts.date,
      opts.dayEndHour ?? 18,
      0,
      opts.timeZone,
    );
    if (!(dayStart.getTime() < dayEnd.getTime())) {
      throw new BadRequestException(`"${opts.date}" is not a valid date.`);
    }

    // A step that is not a positive number never advances the loop below, so
    // an invalid duration is a hang rather than a wrong answer.
    const stepMs = opts.durationMinutes * 60_000;
    if (!Number.isFinite(stepMs) || stepMs <= 0) {
      throw new BadRequestException(
        `"${opts.durationMinutes}" is not a valid meeting length.`,
      );
    }

    // No catch: an unreachable calendar means "unknown", and an agent must not
    // turn unknown into "free".
    const busy = await this.fetchFreeBusyWindow(integration, dayStart, dayEnd);

    const slots: BookableSlot[] = [];
    const now = Date.now();

    for (
      let startMs = dayStart.getTime();
      startMs + stepMs <= dayEnd.getTime();
      startMs += stepMs
    ) {
      const start = new Date(startMs);
      const end = new Date(startMs + stepMs);
      if (startMs <= now) continue;
      if (busy.some((b) => b.start < end && b.end > start)) continue;

      slots.push({
        start: start.toISOString(),
        end: end.toISOString(),
        label: formatInZone(start, opts.timeZone),
      });
    }
    return slots;
  }

  /**
   * The workspace's calendar, or a clear failure. Used by paths where silently
   * proceeding without one would produce a wrong answer rather than a degraded
   * one.
   */
  private async requireIntegration(
    ctx: OwnershipContext,
    provider?: CalendarProvider,
    integrationId?: string | null,
  ): Promise<CalendarIntegration> {
    const integrations = await this.calendarRepo.findByUserOrOrg(
      ctx.userId,
      ctx.organizationId,
    );
    const integration = integrationId
      ? integrations.find((i) => i.id === integrationId)
      : provider
        ? integrations.find((i) => i.provider === provider)
        : integrations[0];
    if (!integration) {
      throw new BadRequestException("No calendar connected");
    }
    return integration;
  }

  /**
   * Create a calendar event via the provider API and return the external event ID + meet link.
   */
  async createCalendarEvent(
    ctx: OwnershipContext,
    dto: {
      meetingId: string;
      title: string;
      scheduledAt: string;
      duration: number;
      attendeeEmail?: string;
      provider?: CalendarProvider;
    },
  ): Promise<{ externalEventId: string; meetLink?: string }> {
    const integrations = await this.calendarRepo.findByUserOrOrg(
      ctx.userId,
      ctx.organizationId,
    );
    const integration = dto.provider
      ? integrations.find((i) => i.provider === dto.provider)
      : integrations[0];

    if (!integration) {
      throw new BadRequestException("No calendar connected");
    }

    const event = await this.createEvent(integration, {
      summary: dto.title || "Meeting via Ringee",
      start: new Date(dto.scheduledAt),
      durationMinutes: dto.duration,
      attendeeEmail: dto.attendeeEmail,
    });

    // Update meeting with external event ID and meet link
    await this.meetingRepo.update(dto.meetingId, {
      externalEventId: event.id,
      location: event.meetLink || undefined,
    });

    return { externalEventId: event.id, meetLink: event.meetLink };
  }

  // --- Provider-specific API calls ---

  private async fetchFreeBusy(
    integration: CalendarIntegration,
    dateStr: string,
  ): Promise<FreeBusySlot[]> {
    const date = new Date(dateStr);
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    return this.fetchFreeBusyWindow(integration, startOfDay, endOfDay);
  }

  private async fetchFreeBusyWindow(
    integration: CalendarIntegration,
    start: Date,
    end: Date,
  ): Promise<FreeBusySlot[]> {
    const accessToken = await this.ensureValidToken(integration);

    if (integration.provider === "google") {
      return this.googleFreeBusy(
        accessToken,
        integration.calendarId || "primary",
        start,
        end,
      );
    } else {
      return this.microsoftFreeBusy(accessToken, start, end);
    }
  }

  private async googleFreeBusy(
    accessToken: string,
    calendarId: string,
    timeMin: Date,
    timeMax: Date,
  ): Promise<FreeBusySlot[]> {
    const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        items: [{ id: calendarId }],
      }),
    });

    if (!res.ok) throw new Error(`Google Calendar API error: ${res.status}`);
    const data = await res.json();
    const busy = data.calendars?.[calendarId]?.busy || [];
    return busy.map((b: { start: string; end: string }) => ({
      start: new Date(b.start),
      end: new Date(b.end),
    }));
  }

  private async microsoftFreeBusy(
    accessToken: string,
    startTime: Date,
    endTime: Date,
  ): Promise<FreeBusySlot[]> {
    const res = await fetch(
      "https://graph.microsoft.com/v1.0/me/calendar/getSchedule",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          schedules: ["me"],
          startTime: {
            dateTime: startTime.toISOString(),
            timeZone: "UTC",
          },
          endTime: {
            dateTime: endTime.toISOString(),
            timeZone: "UTC",
          },
        }),
      },
    );

    if (!res.ok) throw new Error(`Microsoft Graph API error: ${res.status}`);
    const data = await res.json();
    const items = data.value?.[0]?.scheduleItems || [];
    return items.map(
      (item: { start: { dateTime: string }; end: { dateTime: string } }) => ({
        start: new Date(item.start.dateTime),
        end: new Date(item.end.dateTime),
      }),
    );
  }

  private async createEvent(
    integration: CalendarIntegration,
    dto: {
      summary: string;
      start: Date;
      durationMinutes: number;
      attendeeEmail?: string;
    },
  ): Promise<CalendarEvent> {
    const accessToken = await this.ensureValidToken(integration);
    const end = new Date(dto.start.getTime() + dto.durationMinutes * 60 * 1000);

    if (integration.provider === "google") {
      return this.googleCreateEvent(
        accessToken,
        integration.calendarId || "primary",
        dto,
        end,
      );
    } else {
      return this.microsoftCreateEvent(accessToken, dto, end);
    }
  }

  private async googleCreateEvent(
    accessToken: string,
    calendarId: string,
    dto: { summary: string; start: Date; attendeeEmail?: string },
    end: Date,
  ): Promise<CalendarEvent> {
    const body: Record<string, unknown> = {
      summary: dto.summary,
      start: { dateTime: dto.start.toISOString() },
      end: { dateTime: end.toISOString() },
      conferenceData: {
        createRequest: {
          requestId: `ringee-${Date.now()}`,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
    };

    if (dto.attendeeEmail) {
      body.attendees = [{ email: dto.attendeeEmail }];
    }

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1&sendUpdates=all`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );

    if (!res.ok)
      throw new Error(`Google Calendar create event error: ${res.status}`);
    const data = await res.json();
    return {
      id: data.id,
      summary: data.summary,
      start: new Date(data.start.dateTime),
      end: new Date(data.end.dateTime),
      meetLink: data.hangoutLink || data.conferenceData?.entryPoints?.[0]?.uri,
    };
  }

  private async microsoftCreateEvent(
    accessToken: string,
    dto: { summary: string; start: Date; attendeeEmail?: string },
    end: Date,
  ): Promise<CalendarEvent> {
    const body: Record<string, unknown> = {
      subject: dto.summary,
      start: { dateTime: dto.start.toISOString(), timeZone: "UTC" },
      end: { dateTime: end.toISOString(), timeZone: "UTC" },
      isOnlineMeeting: true,
      onlineMeetingProvider: "teamsForBusiness",
    };

    if (dto.attendeeEmail) {
      body.attendees = [
        {
          emailAddress: { address: dto.attendeeEmail },
          type: "required",
        },
      ];
    }

    const res = await fetch("https://graph.microsoft.com/v1.0/me/events", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok)
      throw new Error(`Microsoft Graph create event error: ${res.status}`);
    const data = await res.json();
    return {
      id: data.id,
      summary: data.subject,
      start: new Date(data.start.dateTime),
      end: new Date(data.end.dateTime),
      meetLink: data.onlineMeeting?.joinUrl,
    };
  }

  private async ensureValidToken(
    integration: CalendarIntegration,
  ): Promise<string> {
    // If token hasn't expired, return it
    if (!integration.expiresAt || integration.expiresAt > new Date()) {
      return integration.accessToken;
    }

    // Token expired - try to refresh
    if (!integration.refreshToken) {
      throw new BadRequestException(
        "Calendar token expired. Please reconnect your calendar.",
      );
    }

    if (integration.provider === "google") {
      return this.refreshGoogleToken(integration);
    } else {
      return this.refreshMicrosoftToken(integration);
    }
  }

  private async refreshGoogleToken(
    integration: CalendarIntegration,
  ): Promise<string> {
    const clientId = apiConfiguration.GOOGLE_CALENDAR_CLIENT_ID;
    const clientSecret = apiConfiguration.GOOGLE_CALENDAR_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new BadRequestException("Google Calendar not configured");
    }

    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: integration.refreshToken!,
        grant_type: "refresh_token",
      }),
    });

    if (!res.ok) throw new Error("Failed to refresh Google token");
    const data = await res.json();

    await this.calendarRepo.updateTokens(integration.id, {
      accessToken: data.access_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    });

    return data.access_token;
  }

  private async refreshMicrosoftToken(
    integration: CalendarIntegration,
  ): Promise<string> {
    const clientId = apiConfiguration.MICROSOFT_CALENDAR_CLIENT_ID;
    const clientSecret = apiConfiguration.MICROSOFT_CALENDAR_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new BadRequestException("Microsoft Calendar not configured");
    }

    const res = await fetch(
      "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: integration.refreshToken!,
          grant_type: "refresh_token",
          scope: "Calendars.ReadWrite OnlineMeetings.ReadWrite",
        }),
      },
    );

    if (!res.ok) throw new Error("Failed to refresh Microsoft token");
    const data = await res.json();

    await this.calendarRepo.updateTokens(integration.id, {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || integration.refreshToken!,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    });

    return data.access_token;
  }

  private computeAvailability(
    dateStr: string,
    busySlots: FreeBusySlot[],
  ): AvailabilitySlot[] {
    const date = new Date(dateStr);
    const slots: AvailabilitySlot[] = [];
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    // Generate 30-min slots from 8:00 to 20:00
    for (let h = 8; h < 20; h++) {
      for (const m of [0, 30]) {
        const slotStart = new Date(date);
        slotStart.setHours(h, m, 0, 0);
        const slotEnd = new Date(slotStart);
        slotEnd.setMinutes(slotEnd.getMinutes() + 30);

        // Skip past slots for today
        if (isToday && slotStart <= now) continue;

        const isBusy = busySlots.some(
          (busy) => busy.start < slotEnd && busy.end > slotStart,
        );

        slots.push({
          time: `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`,
          available: !isBusy,
        });
      }
    }

    return slots;
  }

  generateAllAvailableSlots(dateStr: string): AvailabilitySlot[] {
    const date = new Date(dateStr);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const slots: AvailabilitySlot[] = [];

    for (let h = 8; h < 20; h++) {
      for (const m of [0, 30]) {
        const slotStart = new Date(date);
        slotStart.setHours(h, m, 0, 0);

        if (isToday && slotStart <= now) continue;

        slots.push({
          time: `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`,
          available: true,
        });
      }
    }

    return slots;
  }
}
