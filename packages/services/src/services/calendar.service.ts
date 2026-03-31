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

@Injectable()
export class CalendarService {
  constructor(
    private readonly calendarRepo: CalendarIntegrationRepository,
    private readonly meetingRepo: MeetingRepository,
  ) {}

  // --- OAuth Flow Methods ---

  getGoogleOAuthUrl(redirectUri: string, state: string): string {
    const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
    if (!clientId) throw new BadRequestException("Google Calendar not configured");

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events",
      access_type: "offline",
      prompt: "consent",
      state,
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  getMicrosoftOAuthUrl(redirectUri: string, state: string): string {
    const clientId = process.env.MICROSOFT_CALENDAR_CLIENT_ID;
    if (!clientId) throw new BadRequestException("Microsoft Calendar not configured");

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "offline_access Calendars.ReadWrite OnlineMeetings.ReadWrite User.Read",
      state,
    });

    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
  }

  async exchangeGoogleCode(
    code: string,
    redirectUri: string,
  ): Promise<{ accessToken: string; refreshToken?: string; expiresAt?: Date; email?: string }> {
    const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new BadRequestException("Google Calendar not configured");

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
      throw new BadRequestException(`Google token exchange failed: ${errorBody}`);
    }

    const data = await res.json();

    // Fetch user email
    let email: string | undefined;
    try {
      const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${data.access_token}` },
      });
      if (userRes.ok) {
        const userData = await userRes.json();
        email = userData.email;
      }
    } catch { /* ignore */ }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
      email,
    };
  }

  async exchangeMicrosoftCode(
    code: string,
    redirectUri: string,
  ): Promise<{ accessToken: string; refreshToken?: string; expiresAt?: Date; email?: string }> {
    const clientId = process.env.MICROSOFT_CALENDAR_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CALENDAR_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new BadRequestException("Microsoft Calendar not configured");

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
          scope: "offline_access Calendars.ReadWrite OnlineMeetings.ReadWrite User.Read",
        }),
      },
    );

    if (!res.ok) {
      const errorBody = await res.text();
      throw new BadRequestException(`Microsoft token exchange failed: ${errorBody}`);
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
    } catch { /* ignore */ }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
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

  async getIntegrations(
    ctx: OwnershipContext,
  ): Promise<CalendarIntegration[]> {
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
    const accessToken = await this.ensureValidToken(integration);
    const date = new Date(dateStr);
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    if (integration.provider === "google") {
      return this.googleFreeBusy(accessToken, integration.calendarId || "primary", startOfDay, endOfDay);
    } else {
      return this.microsoftFreeBusy(accessToken, startOfDay, endOfDay);
    }
  }

  private async googleFreeBusy(
    accessToken: string,
    calendarId: string,
    timeMin: Date,
    timeMax: Date,
  ): Promise<FreeBusySlot[]> {
    const res = await fetch(
      "https://www.googleapis.com/calendar/v3/freeBusy",
      {
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
      },
    );

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
    const end = new Date(
      dto.start.getTime() + dto.durationMinutes * 60 * 1000,
    );

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

    if (!res.ok) throw new Error(`Google Calendar create event error: ${res.status}`);
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

    const res = await fetch(
      "https://graph.microsoft.com/v1.0/me/events",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );

    if (!res.ok) throw new Error(`Microsoft Graph create event error: ${res.status}`);
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
    const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;

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
    const clientId = process.env.MICROSOFT_CALENDAR_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CALENDAR_CLIENT_SECRET;

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

  private generateAllAvailableSlots(dateStr: string): AvailabilitySlot[] {
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
