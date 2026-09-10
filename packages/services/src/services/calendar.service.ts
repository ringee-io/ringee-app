import {
  Injectable,
  BadRequestException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  Calendar,
  CalendarAvailabilityRepository,
  CalendarAvailabilityRule,
  CalendarIntegrationRepository,
  CalendarRepository,
  MeetingRepository,
  CalendarIntegration,
  CalendarProvider,
  Meeting,
  MeetingCalendarScope,
  MeetingExternalSyncStatus,
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

/** A slot that can actually be booked, as absolute times. */
export interface BookableSlot {
  /** ISO 8601 instant. */
  start: string;
  end: string;
  /** How the slot reads in its own time zone, e.g. "Friday, 2:30 PM". */
  label: string;
  /** Maximum simultaneous bookings for this time; null means unlimited. */
  capacity: number | null;
  /** Places still available at lookup time; null means unlimited. */
  remainingCapacity: number | null;
  /** Internal version marker revalidated by the booking transaction. */
  availabilityRuleId: string | null;
}

export interface CalendarAvailabilityWindow {
  id?: string;
  /** Sunday = 0 through Saturday = 6. */
  daysOfWeek: number[];
  /** Local wall-clock time in HH:mm form. */
  startTime: string;
  endTime: string;
  /** Maximum simultaneous bookings; null means unlimited. */
  capacity: number | null;
}

export interface CalendarAvailabilitySettings {
  /** False means Ringee's backwards-compatible 09:00–18:00 schedule applies. */
  configured: boolean;
  windows: CalendarAvailabilityWindow[];
  /** Which calendar these windows belong to. */
  calendarId: string;
  /** The calendar's zone — what the windows are wall-clock times in. */
  timezone: string;
}

/** A Ringee calendar as the API and the UI read it. */
export interface CalendarSummary {
  id: string;
  name: string;
  timezone: string;
  /** The workspace's global calendar. Cannot be archived or deleted. */
  isDefault: boolean;
  archivedAt: string | null;
  /** The connected account events booked here are pushed to, if any. */
  integration: {
    id: string;
    provider: CalendarProvider;
    email: string | null;
  } | null;
  /** The external calendar inside that account. */
  externalCalendarId: string | null;
  /** How many AI voice agents point at this calendar explicitly. */
  agentCount: number;
}

/** One external calendar a connected account can write to. */
export interface ExternalCalendarOption {
  id: string;
  name: string;
  primary: boolean;
}

/**
 * The calendar a request resolved to, plus the external destination its
 * bookings should be pushed to.
 *
 * Resolution happens on the server from the caller's workspace and the stored
 * agent — never from an id a model supplied — so every consumer reads
 * availability and books against the same row.
 */
export interface ResolvedCalendar {
  calendar: Calendar;
  /** Passed to the meeting repository so capacity stays per calendar. */
  scope: MeetingCalendarScope;
  /** The calendar's zone; authoritative over an agent's own `timezone`. */
  timezone: string;
  /** Where an event for a booking here is created, when anywhere. */
  destination: {
    integrationId: string;
    externalCalendarId: string | null;
  } | null;
}

const DEFAULT_START_MINUTE = 9 * 60;
const DEFAULT_END_MINUTE = 18 * 60;
const DEFAULT_CAPACITY = 1;
const MAX_AVAILABILITY_WINDOWS = 50;
const MAX_SLOT_CAPACITY = 10_000;
export const MIN_MEETING_DURATION_MINUTES = 1;
export const MAX_MEETING_DURATION_MINUTES = 480;

export function validateMeetingDurationMinutes(value: number): number {
  if (
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < MIN_MEETING_DURATION_MINUTES ||
    value > MAX_MEETING_DURATION_MINUTES
  ) {
    throw new BadRequestException(
      `Meeting length must be a whole number between ${MIN_MEETING_DURATION_MINUTES} and ${MAX_MEETING_DURATION_MINUTES} minutes.`,
    );
  }
  return value;
}

function parseTime(value: unknown, field: string): number {
  const match =
    typeof value === "string" ? /^(\d{2}):(\d{2})$/.exec(value) : null;
  const hour = Number(match?.[1]);
  const minute = Number(match?.[2]);
  if (!match || hour > 23 || minute > 59) {
    throw new BadRequestException(`${field} must use HH:mm time.`);
  }
  return hour * 60 + minute;
}

function formatTime(minuteOfDay: number): string {
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  return `${hour.toString().padStart(2, "0")}:${minute
    .toString()
    .padStart(2, "0")}`;
}

function dayOfWeek(date: string): number {
  const parsed = new Date(`${date}T12:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  ) {
    throw new BadRequestException(`"${date}" is not a valid date.`);
  }
  return parsed.getUTCDay();
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

function matchesZonedBoundary(
  instant: Date,
  date: string,
  minuteOfDay: number,
  timeZone: string,
): boolean {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(instant);
  const read = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return (
    `${read("year")}-${read("month")}-${read("day")}` === date &&
    Number(read("hour")) * 60 + Number(read("minute")) === minuteOfDay
  );
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

const DEFAULT_CALENDAR_NAME = "Global calendar";
const MAX_CALENDAR_NAME_LENGTH = 80;

function assertTimeZone(timeZone: string): string {
  const value = typeof timeZone === "string" ? timeZone.trim() : "";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
  } catch {
    throw new BadRequestException(`"${timeZone}" is not a valid time zone.`);
  }
  return value;
}

function assertCalendarName(name: unknown): string {
  const value = typeof name === "string" ? name.trim() : "";
  if (!value) throw new BadRequestException("The calendar needs a name.");
  if (value.length > MAX_CALENDAR_NAME_LENGTH) {
    throw new BadRequestException("The calendar name is too long.");
  }
  return value;
}

/**
 * A Google event id Ringee can compute again from the meeting alone.
 *
 * Google accepts a client-supplied id and answers 409 when it already exists,
 * which is what makes a retry safe: the second attempt either creates the event
 * or learns that the first one already did. Ids must be base32hex characters,
 * and a UUID's hex digits already are.
 */
function googleEventIdFor(meetingId: string): string {
  return `ringee${meetingId.replace(/-/g, "").toLowerCase()}`;
}

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);

  constructor(
    private readonly calendarRepo: CalendarIntegrationRepository,
    private readonly meetingRepo: MeetingRepository,
    private readonly availabilityRepo: CalendarAvailabilityRepository,
    private readonly calendars: CalendarRepository,
  ) {}

  // --- Ringee calendars ---

  /**
   * The workspace's global calendar, created on first use.
   *
   * Every consumer that names no calendar — the manual dialer, campaigns, an
   * agent with no selection, an MCP call without a `calendarId` — lands here,
   * which is what keeps their behaviour identical to before calendars existed.
   */
  ensureGlobalCalendar(ctx: OwnershipContext): Promise<Calendar> {
    return this.calendars.ensureDefault(ctx, {
      name: DEFAULT_CALENDAR_NAME,
      timezone: "UTC",
    });
  }

  async listCalendars(
    ctx: OwnershipContext,
    options?: { includeArchived?: boolean },
  ): Promise<CalendarSummary[]> {
    await this.ensureGlobalCalendar(ctx);
    const [calendars, integrations, agentCounts] = await Promise.all([
      this.calendars.list(ctx, options),
      this.calendarRepo.findByUserOrOrg(ctx.userId, ctx.organizationId),
      this.calendars.countAgentsByCalendar(ctx),
    ]);
    return calendars.map((calendar) =>
      this.toSummary(calendar, integrations, agentCounts.get(calendar.id) ?? 0),
    );
  }

  async getCalendar(
    ctx: OwnershipContext,
    calendarId: string,
  ): Promise<CalendarSummary> {
    const calendar = await this.requireCalendar(ctx, calendarId);
    const [integrations, agentCounts] = await Promise.all([
      this.calendarRepo.findByUserOrOrg(ctx.userId, ctx.organizationId),
      this.calendars.countAgentsByCalendar(ctx),
    ]);
    return this.toSummary(
      calendar,
      integrations,
      agentCounts.get(calendar.id) ?? 0,
    );
  }

  /** The agents that book against a calendar, for the management screen. */
  listAgentsUsingCalendar(
    ctx: OwnershipContext,
    calendarId: string,
  ): Promise<Array<{ id: string; name: string }>> {
    return this.calendars.listAgentsUsingCalendar(ctx, calendarId);
  }

  async createCalendar(
    ctx: OwnershipContext,
    dto: { name: string; timezone: string },
  ): Promise<CalendarSummary> {
    // A workspace always has its global calendar before it has a second one.
    await this.ensureGlobalCalendar(ctx);
    const created = await this.calendars.create(ctx, {
      name: assertCalendarName(dto.name),
      timezone: assertTimeZone(dto.timezone),
    });
    return this.toSummary(created, [], 0);
  }

  async updateCalendar(
    ctx: OwnershipContext,
    calendarId: string,
    dto: { name?: string; timezone?: string },
  ): Promise<CalendarSummary> {
    await this.requireCalendar(ctx, calendarId);
    await this.calendars.update(ctx, calendarId, {
      ...(dto.name !== undefined ? { name: assertCalendarName(dto.name) } : {}),
      ...(dto.timezone !== undefined
        ? { timezone: assertTimeZone(dto.timezone) }
        : {}),
    });
    return this.getCalendar(ctx, calendarId);
  }

  /**
   * Archiving keeps the calendar's meetings and history; it only stops new
   * bookings. The global calendar cannot be archived, because the consumers
   * that name no calendar have nowhere else to resolve to.
   */
  async setCalendarArchived(
    ctx: OwnershipContext,
    calendarId: string,
    archived: boolean,
  ): Promise<CalendarSummary> {
    const calendar = await this.requireCalendar(ctx, calendarId);
    if (calendar.isDefault && archived) {
      throw new BadRequestException(
        "The global calendar cannot be archived — other features resolve to it.",
      );
    }
    await this.calendars.update(ctx, calendarId, {
      archivedAt: archived ? new Date() : null,
    });
    return this.getCalendar(ctx, calendarId);
  }

  /**
   * Points a calendar at a connected account and one external calendar inside
   * it, or clears the connection. Google is a destination for events booked
   * here — never a source of availability — so this changes nothing about which
   * times the calendar offers.
   */
  async setCalendarConnection(
    ctx: OwnershipContext,
    calendarId: string,
    dto: { integrationId: string | null; externalCalendarId?: string | null },
  ): Promise<CalendarSummary> {
    await this.requireCalendar(ctx, calendarId);
    if (dto.integrationId) {
      const integration = await this.calendarRepo.findByIdForOwner(
        ctx,
        dto.integrationId,
      );
      if (!integration) {
        throw new NotFoundException("That calendar account is not connected.");
      }
    }
    await this.calendars.update(ctx, calendarId, {
      calendarIntegrationId: dto.integrationId,
      // Clearing the account clears the calendar chosen inside it; they are one
      // destination and half of it would be meaningless.
      externalCalendarId: dto.integrationId
        ? (dto.externalCalendarId ?? null)
        : null,
    });
    return this.getCalendar(ctx, calendarId);
  }

  /**
   * Resolves which calendar a request books against.
   *
   * `calendarId` comes from stored configuration — an agent row, a workspace
   * setting — never from a model's tool arguments; the caller is responsible for
   * that, and the workspace check here is what makes another tenant's id
   * unusable. An explicitly named calendar that is archived is an error rather
   * than a silent fall back to the global one: an agent configured to book
   * somewhere specific must not quietly book somewhere else.
   */
  async resolveCalendar(
    ctx: OwnershipContext,
    options?: {
      calendarId?: string | null;
      /**
       * External destination to use when the resolved calendar has none of its
       * own. This is how an agent that predates calendars keeps pushing events
       * to the Google account it was pointed at.
       */
      fallbackIntegrationId?: string | null;
      /**
       * Reads an archived calendar without complaint. For work on bookings that
       * already exist — archiving preserves a calendar's history, it only stops
       * new bookings.
       */
      allowArchived?: boolean;
    },
  ): Promise<ResolvedCalendar> {
    const calendar = options?.calendarId
      ? await this.requireCalendar(ctx, options.calendarId)
      : await this.ensureGlobalCalendar(ctx);

    if (options?.calendarId && calendar.archivedAt && !options.allowArchived) {
      throw new BadRequestException(
        `The calendar "${calendar.name}" is archived and cannot take new bookings.`,
      );
    }

    return {
      calendar,
      scope: { calendarId: calendar.id, isDefault: calendar.isDefault },
      timezone: calendar.timezone,
      destination: await this.resolveDestination(
        ctx,
        calendar,
        options?.fallbackIntegrationId ?? null,
      ),
    };
  }

  private async resolveDestination(
    ctx: OwnershipContext,
    calendar: Calendar,
    fallbackIntegrationId: string | null,
  ): Promise<ResolvedCalendar["destination"]> {
    // The calendar's own connection wins. A disconnected account leaves the
    // pointer in place but stops being a destination, so reconnecting it
    // restores every calendar that used it at once.
    if (calendar.calendarIntegrationId) {
      const integration = await this.calendarRepo.findByIdForOwner(
        ctx,
        calendar.calendarIntegrationId,
      );
      if (integration) {
        return {
          integrationId: integration.id,
          externalCalendarId:
            calendar.externalCalendarId ?? integration.calendarId ?? null,
        };
      }
    }
    if (fallbackIntegrationId) {
      const integration = await this.calendarRepo.findByIdForOwner(
        ctx,
        fallbackIntegrationId,
      );
      if (integration) {
        return {
          integrationId: integration.id,
          externalCalendarId: integration.calendarId ?? null,
        };
      }
    }
    return null;
  }

  private async requireCalendar(
    ctx: OwnershipContext,
    calendarId: string,
  ): Promise<Calendar> {
    const calendar = await this.calendars.findByIdForOwner(ctx, calendarId);
    if (!calendar) throw new NotFoundException("Calendar not found");
    return calendar;
  }

  private toSummary(
    calendar: Calendar,
    integrations: CalendarIntegration[],
    agentCount: number,
  ): CalendarSummary {
    const integration = calendar.calendarIntegrationId
      ? integrations.find(
          (candidate) => candidate.id === calendar.calendarIntegrationId,
        )
      : undefined;
    return {
      id: calendar.id,
      name: calendar.name,
      timezone: calendar.timezone,
      isDefault: calendar.isDefault,
      archivedAt: calendar.archivedAt?.toISOString() ?? null,
      integration: integration
        ? {
            id: integration.id,
            provider: integration.provider,
            email: integration.email,
          }
        : null,
      externalCalendarId: calendar.externalCalendarId,
      agentCount,
    };
  }

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

  /**
   * Connects an external calendar account.
   *
   * `linkCalendarId` attaches the freshly connected account to one Ringee
   * calendar in the same step, which is what the "connect Google" button on a
   * calendar does. Without it the account is connected but points at nothing —
   * a workspace can hold several accounts and choose per calendar.
   */
  async connectCalendar(
    ctx: OwnershipContext,
    dto: {
      provider: CalendarProvider;
      accessToken: string;
      refreshToken?: string;
      expiresAt?: string;
      calendarId?: string;
      email?: string;
      linkCalendarId?: string | null;
    },
  ): Promise<CalendarIntegration> {
    const integration = await this.calendarRepo.connectAccount(
      ctx.userId,
      dto.provider,
      {
        accessToken: dto.accessToken,
        refreshToken: dto.refreshToken,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        calendarId: dto.calendarId,
        email: dto.email,
        organizationId: ctx.organizationId,
      },
    );

    if (dto.linkCalendarId) {
      const calendar = await this.calendars.findByIdForOwner(
        ctx,
        dto.linkCalendarId,
      );
      // A link request for a calendar this workspace does not own is ignored
      // rather than failing the connection: the account is legitimately
      // connected either way, and the id came back through an OAuth redirect.
      if (calendar) {
        await this.calendars.update(ctx, calendar.id, {
          calendarIntegrationId: integration.id,
          externalCalendarId: null,
        });
      }
    }

    return integration;
  }

  async getIntegrations(ctx: OwnershipContext): Promise<CalendarIntegration[]> {
    return this.calendarRepo.findByUserOrOrg(ctx.userId, ctx.organizationId);
  }

  async disconnectCalendar(
    ctx: OwnershipContext,
    integrationId: string,
  ): Promise<void> {
    const integration = await this.calendarRepo.findByIdForOwner(
      ctx,
      integrationId,
    );
    if (!integration) {
      throw new NotFoundException("That calendar account is not connected.");
    }
    // The calendars pointing at it keep their pointer, so reconnecting the same
    // account restores every one of them at once. Meetings that already reached
    // this account keep their own recorded destination either way.
    await this.calendarRepo.deactivate(integration.id);
  }

  /**
   * The external calendars a connected account can write to, for the picker.
   * Reading this list is not reading availability — nothing here decides which
   * times Ringee offers.
   */
  async listExternalCalendars(
    ctx: OwnershipContext,
    integrationId: string,
  ): Promise<ExternalCalendarOption[]> {
    const integration = await this.calendarRepo.findByIdForOwner(
      ctx,
      integrationId,
    );
    if (!integration) {
      throw new NotFoundException("That calendar account is not connected.");
    }
    const accessToken = await this.ensureValidToken(integration);
    return integration.provider === "google"
      ? this.googleCalendarList(accessToken)
      : this.microsoftCalendarList(accessToken);
  }

  async getAvailabilitySettings(
    ctx: OwnershipContext,
    calendarId?: string | null,
  ): Promise<CalendarAvailabilitySettings> {
    const calendar = calendarId
      ? await this.requireCalendar(ctx, calendarId)
      : await this.ensureGlobalCalendar(ctx);
    const rules = await this.availabilityRepo.list(ctx, calendar.id);
    return {
      configured: rules.length > 0,
      windows: rules.map((rule) => this.toAvailabilityWindow(rule)),
      calendarId: calendar.id,
      timezone: calendar.timezone,
    };
  }

  async updateAvailabilitySettings(
    ctx: OwnershipContext,
    windows: CalendarAvailabilityWindow[],
    calendarId?: string | null,
  ): Promise<CalendarAvailabilitySettings> {
    if (!Array.isArray(windows) || windows.length === 0) {
      throw new BadRequestException("Add at least one availability window.");
    }
    if (windows.length > MAX_AVAILABILITY_WINDOWS) {
      throw new BadRequestException(
        `Use no more than ${MAX_AVAILABILITY_WINDOWS} availability windows.`,
      );
    }

    const normalized = windows.map((window, index) => {
      if (!window || typeof window !== "object") {
        throw new BadRequestException(`windows.${index} is not valid.`);
      }
      const startMinute = parseTime(
        window.startTime,
        `windows.${index}.startTime`,
      );
      const endMinute = parseTime(window.endTime, `windows.${index}.endTime`);
      if (endMinute <= startMinute) {
        throw new BadRequestException(
          `windows.${index}.endTime must be after its start time.`,
        );
      }

      if (!Array.isArray(window.daysOfWeek)) {
        throw new BadRequestException(
          `windows.${index}.daysOfWeek must contain days from 0 to 6.`,
        );
      }
      const daysOfWeek = [...new Set(window.daysOfWeek)].sort((a, b) => a - b);
      if (
        daysOfWeek.length === 0 ||
        daysOfWeek.some((day) => !Number.isInteger(day) || day < 0 || day > 6)
      ) {
        throw new BadRequestException(
          `windows.${index}.daysOfWeek must contain days from 0 to 6.`,
        );
      }

      const capacity = window.capacity;
      if (
        capacity !== null &&
        (!Number.isInteger(capacity) ||
          capacity < 1 ||
          capacity > MAX_SLOT_CAPACITY)
      ) {
        throw new BadRequestException(
          `windows.${index}.capacity must be between 1 and ${MAX_SLOT_CAPACITY}, or null for unlimited.`,
        );
      }

      return { daysOfWeek, startMinute, endMinute, capacity };
    });

    for (let day = 0; day <= 6; day += 1) {
      const onDay = normalized
        .filter((window) => window.daysOfWeek.includes(day))
        .sort((a, b) => a.startMinute - b.startMinute);
      for (let index = 1; index < onDay.length; index += 1) {
        if (onDay[index]!.startMinute < onDay[index - 1]!.endMinute) {
          throw new BadRequestException(
            "Availability windows on the same day cannot overlap.",
          );
        }
      }
    }

    const calendar = calendarId
      ? await this.requireCalendar(ctx, calendarId)
      : await this.ensureGlobalCalendar(ctx);
    const saved = await this.availabilityRepo.replace(
      ctx,
      calendar.id,
      normalized,
    );
    return {
      configured: true,
      windows: saved.map((rule) => this.toAvailabilityWindow(rule)),
      calendarId: calendar.id,
      timezone: calendar.timezone,
    };
  }

  /**
   * Real, bookable slots for one day, as absolute times.
   *
   * This is the single availability lookup: the human picker and the agent's
   * tool both read it. It reads the selected Ringee calendar's windows,
   * capacity and existing meetings, and nothing else. External calendars are an
   * outbound sync target after Ringee owns the booking — Google free/busy is
   * deliberately never consulted, so an external outage can neither hide a real
   * slot nor invent one.
   */
  async getBookableSlots(
    ctx: OwnershipContext,
    opts: {
      /** Day to check, as YYYY-MM-DD in the effective time zone. */
      date: string;
      /**
       * IANA zone the day and the returned times are expressed in. Defaults to
       * the resolved calendar's own zone, which is authoritative — an agent's
       * `timezone` field never overrides the calendar it books against.
       */
      timeZone?: string;
      durationMinutes: number;
      /** Which calendar to read. Omitted means the workspace's global one. */
      calendarId?: string | null;
      /** Business hours in the effective zone. Defaults to 09:00–18:00. */
      dayStartHour?: number;
      dayEndHour?: number;
    },
  ): Promise<BookableSlot[]> {
    const resolved = await this.resolveCalendar(ctx, {
      calendarId: opts.calendarId,
    });
    return this.getBookableSlotsForCalendar(ctx, resolved, opts);
  }

  /**
   * The same lookup against a calendar the caller already resolved.
   *
   * A booking path resolves once and then uses this for both the offer and the
   * re-check, so the times offered and the row written can never come from two
   * different calendars.
   */
  async getBookableSlotsForCalendar(
    ctx: OwnershipContext,
    resolved: ResolvedCalendar,
    opts: {
      date: string;
      timeZone?: string;
      durationMinutes: number;
      dayStartHour?: number;
      dayEndHour?: number;
    },
  ): Promise<BookableSlot[]> {
    const timeZone = opts.timeZone ?? resolved.timezone;
    try {
      new Intl.DateTimeFormat("en-US", { timeZone }).format();
    } catch {
      throw new BadRequestException(`"${timeZone}" is not a valid time zone.`);
    }
    const durationMinutes = validateMeetingDurationMinutes(
      opts.durationMinutes,
    );
    const stepMs = durationMinutes * 60_000;
    const configuredRules = await this.availabilityRepo.list(
      ctx,
      resolved.calendar.id,
    );
    const requestedDay = dayOfWeek(opts.date);
    const rules = configuredRules.length
      ? configuredRules.filter((rule) => rule.daysOfWeek.includes(requestedDay))
      : [
          {
            id: null,
            startMinute:
              opts.dayStartHour === undefined
                ? DEFAULT_START_MINUTE
                : opts.dayStartHour * 60,
            endMinute:
              opts.dayEndHour === undefined
                ? DEFAULT_END_MINUTE
                : opts.dayEndHour * 60,
            capacity: DEFAULT_CAPACITY,
          },
        ];
    if (rules.length === 0) return [];

    const resolvedRules = rules.flatMap((rule) => {
      const windowStart = zonedTimeToUtc(
        opts.date,
        Math.floor(rule.startMinute / 60),
        rule.startMinute % 60,
        timeZone,
      );
      const windowEnd = zonedTimeToUtc(
        opts.date,
        Math.floor(rule.endMinute / 60),
        rule.endMinute % 60,
        timeZone,
      );

      // A DST-forward gap can normalize a nonexistent local boundary to a
      // different wall-clock time. Such a rule has no window on this date.
      if (
        !matchesZonedBoundary(
          windowStart,
          opts.date,
          rule.startMinute,
          timeZone,
        ) ||
        !matchesZonedBoundary(windowEnd, opts.date, rule.endMinute, timeZone)
      ) {
        return [];
      }

      return [{ rule, windowStart, windowEnd }];
    });
    if (resolvedRules.length === 0) return [];

    const dayStart = new Date(
      Math.min(
        ...resolvedRules.map(({ windowStart }) => windowStart.getTime()),
      ),
    );
    const dayEnd = new Date(
      Math.max(...resolvedRules.map(({ windowEnd }) => windowEnd.getTime())),
    );
    if (!(dayStart.getTime() < dayEnd.getTime())) {
      throw new BadRequestException(`"${opts.date}" is not a valid date.`);
    }

    // No provider call belongs here. Ringee is the source of truth for agent
    // bookings; Google/Microsoft receive the event only after it exists here.
    const busy = await this.meetingRepo.findBusySlots(
      ctx,
      resolved.scope,
      dayStart,
      dayEnd,
    );

    const slots: BookableSlot[] = [];
    const now = Date.now();

    for (const { rule, windowStart, windowEnd } of resolvedRules) {
      for (
        let startMs = windowStart.getTime();
        startMs + stepMs <= windowEnd.getTime();
        startMs += stepMs
      ) {
        const start = new Date(startMs);
        const end = new Date(startMs + stepMs);
        if (startMs <= now) continue;

        const occupied = busy.filter(
          (meeting) => meeting.start < end && meeting.end > start,
        ).length;
        if (rule.capacity !== null && occupied >= rule.capacity) continue;

        slots.push({
          start: start.toISOString(),
          end: end.toISOString(),
          label: formatInZone(start, timeZone),
          capacity: rule.capacity,
          remainingCapacity:
            rule.capacity === null ? null : rule.capacity - occupied,
          availabilityRuleId: rule.id,
        });
      }
    }
    return slots.sort((left, right) => left.start.localeCompare(right.start));
  }

  private toAvailabilityWindow(
    rule: CalendarAvailabilityRule,
  ): CalendarAvailabilityWindow {
    return {
      id: rule.id,
      daysOfWeek: rule.daysOfWeek,
      startTime: formatTime(rule.startMinute),
      endTime: formatTime(rule.endMinute),
      capacity: rule.capacity,
    };
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
   * Pushes a Ringee booking to its calendar's external destination.
   *
   * The booking already exists and stays valid whatever happens here: a
   * calendar with no connection reports `not_required`, and a provider failure
   * is recorded on the meeting so the UI can distinguish "confirmed in Ringee,
   * event pending" from "confirmed everywhere". Retrying is safe — Google is
   * given an event id derived from the meeting, so a second attempt after a
   * failure that actually succeeded is rejected as a duplicate rather than
   * creating a second event.
   */
  async syncMeetingToExternalCalendar(
    ctx: OwnershipContext,
    meeting: Meeting,
    options: {
      destination: ResolvedCalendar["destination"];
      title?: string;
      attendeeEmail?: string;
      /** Legacy provider hint from callers that predate calendars. */
      provider?: CalendarProvider;
    },
  ): Promise<{
    status: MeetingExternalSyncStatus;
    externalEventId?: string;
    meetLink?: string;
    error?: string;
  }> {
    // Already there. A retry must not create a second event.
    if (meeting.externalEventId) {
      return {
        status: MeetingExternalSyncStatus.synced,
        externalEventId: meeting.externalEventId,
        meetLink: meeting.location ?? undefined,
      };
    }
    if (!options.destination) {
      return { status: MeetingExternalSyncStatus.not_required };
    }

    const integration = await this.calendarRepo.findByIdForOwner(
      ctx,
      options.destination.integrationId,
    );
    if (!integration) {
      return { status: MeetingExternalSyncStatus.not_required };
    }

    await this.meetingRepo.markExternalSyncPending(meeting.id);
    const targetCalendarId =
      options.destination.externalCalendarId ??
      integration.calendarId ??
      "primary";

    try {
      const event = await this.createEvent(integration, {
        summary: options.title || meeting.title || "Meeting via Ringee",
        start: meeting.scheduledAt,
        durationMinutes: meeting.duration,
        attendeeEmail: options.attendeeEmail,
        targetCalendarId,
        idempotencyId: googleEventIdFor(meeting.id),
      });
      await this.meetingRepo.recordExternalSync(meeting.id, {
        status: "synced",
        externalEventId: event.id,
        integrationId: integration.id,
        targetCalendarId,
        location: event.meetLink || undefined,
      });
      return {
        status: MeetingExternalSyncStatus.synced,
        externalEventId: event.id,
        meetLink: event.meetLink,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.meetingRepo.recordExternalSync(meeting.id, {
        status: "failed",
        integrationId: integration.id,
        targetCalendarId,
        error: message,
      });
      this.logger.warn(
        `External calendar sync failed for meeting ${meeting.id}: ${message}`,
      );
      return { status: MeetingExternalSyncStatus.failed, error: message };
    }
  }

  /**
   * Create a calendar event via the provider API and return the external event ID + meet link.
   *
   * Kept for the direct `POST /calendar/event` route. Bookings made through
   * `MeetingService` go through `syncMeetingToExternalCalendar` instead, which
   * records the destination and the outcome on the meeting.
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
      integrationId?: string | null;
    },
  ): Promise<{ externalEventId: string; meetLink?: string }> {
    const integration = await this.requireIntegration(
      ctx,
      dto.provider,
      dto.integrationId,
    );

    const event = await this.createEvent(integration, {
      summary: dto.title || "Meeting via Ringee",
      start: new Date(dto.scheduledAt),
      durationMinutes: dto.duration,
      attendeeEmail: dto.attendeeEmail,
      idempotencyId: googleEventIdFor(dto.meetingId),
    });

    await this.meetingRepo.recordExternalSync(dto.meetingId, {
      status: "synced",
      externalEventId: event.id,
      integrationId: integration.id,
      targetCalendarId: integration.calendarId ?? "primary",
      location: event.meetLink || undefined,
    });

    return { externalEventId: event.id, meetLink: event.meetLink };
  }

  // --- Provider-specific API calls ---

  private async createEvent(
    integration: CalendarIntegration,
    dto: {
      summary: string;
      start: Date;
      durationMinutes: number;
      attendeeEmail?: string;
      /** External calendar inside the account; defaults to its own setting. */
      targetCalendarId?: string;
      /** Client-supplied event id, so a retry cannot duplicate the event. */
      idempotencyId?: string;
    },
  ): Promise<CalendarEvent> {
    const accessToken = await this.ensureValidToken(integration);
    const end = new Date(dto.start.getTime() + dto.durationMinutes * 60 * 1000);

    if (integration.provider === "google") {
      return this.googleCreateEvent(
        accessToken,
        dto.targetCalendarId || integration.calendarId || "primary",
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
    dto: {
      summary: string;
      start: Date;
      attendeeEmail?: string;
      idempotencyId?: string;
    },
    end: Date,
  ): Promise<CalendarEvent> {
    const body: Record<string, unknown> = {
      summary: dto.summary,
      start: { dateTime: dto.start.toISOString() },
      end: { dateTime: end.toISOString() },
      conferenceData: {
        createRequest: {
          // Derived from the event, not the clock: a retry asks Google for the
          // same conference rather than allocating a second one.
          requestId: dto.idempotencyId ?? `ringee-${Date.now()}`,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
    };
    if (dto.idempotencyId) body.id = dto.idempotencyId;

    if (dto.attendeeEmail) {
      body.attendees = [{ email: dto.attendeeEmail }];
    }

    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
    const res = await fetch(`${url}?conferenceDataVersion=1&sendUpdates=all`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    // 409 means this exact event id already exists — an earlier attempt did
    // reach Google even though Ringee never saw the answer. Read it back
    // instead of failing, so a retry converges rather than duplicating.
    if (res.status === 409 && dto.idempotencyId) {
      const existing = await this.googleGetEvent(
        accessToken,
        calendarId,
        dto.idempotencyId,
      );
      if (existing) return existing;
    }

    if (!res.ok)
      throw new Error(`Google Calendar create event error: ${res.status}`);
    const data = await res.json();
    return this.toGoogleEvent(data);
  }

  private async googleGetEvent(
    accessToken: string,
    calendarId: string,
    eventId: string,
  ): Promise<CalendarEvent | null> {
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) return null;
    return this.toGoogleEvent(await res.json());
  }

  private toGoogleEvent(data: {
    id: string;
    summary?: string;
    start: { dateTime?: string; date?: string };
    end: { dateTime?: string; date?: string };
    hangoutLink?: string;
    conferenceData?: { entryPoints?: Array<{ uri?: string }> };
  }): CalendarEvent {
    return {
      id: data.id,
      summary: data.summary ?? "",
      start: new Date(data.start.dateTime ?? data.start.date!),
      end: new Date(data.end.dateTime ?? data.end.date!),
      meetLink: data.hangoutLink || data.conferenceData?.entryPoints?.[0]?.uri,
    };
  }

  private async googleCalendarList(
    accessToken: string,
  ): Promise<ExternalCalendarOption[]> {
    const res = await fetch(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=writer&maxResults=250",
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) {
      throw new BadRequestException(
        "The connected Google account could not be read. Reconnect it and try again.",
      );
    }
    const data = await res.json();
    return (data.items ?? []).map(
      (item: { id: string; summary?: string; primary?: boolean }) => ({
        id: item.id,
        name: item.summary ?? item.id,
        primary: Boolean(item.primary),
      }),
    );
  }

  private async microsoftCalendarList(
    accessToken: string,
  ): Promise<ExternalCalendarOption[]> {
    const res = await fetch("https://graph.microsoft.com/v1.0/me/calendars", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new BadRequestException(
        "The connected Microsoft account could not be read. Reconnect it and try again.",
      );
    }
    const data = await res.json();
    return (data.value ?? []).map(
      (item: { id: string; name?: string; isDefaultCalendar?: boolean }) => ({
        id: item.id,
        name: item.name ?? item.id,
        primary: Boolean(item.isDefaultCalendar),
      }),
    );
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
}
