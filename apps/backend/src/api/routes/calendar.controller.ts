import {
  BadRequestException,
  Controller,
  Get,
  Patch,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Res,
  Req,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import { IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { createHash, timingSafeEqual } from "crypto";
import {
  CurrentUser,
  CurrentUserData,
  Public,
  createOwnershipContext,
} from "@ringee/platform";
import {
  CALENDAR_OAUTH_TTL_MS,
  CalendarService,
  toCalendarIntegrationView,
  CalendarAvailabilityWindow,
  MAX_MEETING_DURATION_MINUTES,
  MIN_MEETING_DURATION_MINUTES,
  validateMeetingDurationMinutes,
} from "@ringee/services";
import { CalendarProvider } from "@ringee/database";
import { Response, Request } from "express";
import { validationExceptionFactory } from "../validation-error";

/**
 * The external destination of one Ringee calendar.
 *
 * Both fields are optional rather than required-and-nullable: `null` is the
 * deliberate "disconnect" value and must survive validation, and an omitted
 * `externalCalendarId` means "keep the account's own default calendar".
 */
class SetCalendarConnectionDto {
  @IsOptional()
  @IsUUID()
  integrationId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  externalCalendarId?: string | null;
}

/**
 * Binds a calendar OAuth round-trip to the browser that started it.
 *
 * The `state` names a single-use server-side record of who is connecting
 * (`CalendarService.beginOAuth`), and this cookie carries its hash: a
 * provider callback is only accepted from the browser holding it, so an
 * authorization link started by someone else cannot attach the account that
 * approves it to their workspace.
 */
const CALENDAR_OAUTH_COOKIE = "ringee_calendar_oauth";

function setOAuthCookie(res: Response, state: string): void {
  res.cookie(CALENDAR_OAUTH_COOKIE, oauthStateHash(state), {
    httpOnly: true,
    secure: (process.env.BACKEND_URL ?? "").startsWith("https://"),
    sameSite: "lax",
    path: "/",
    maxAge: CALENDAR_OAUTH_TTL_MS,
  });
}

/** Whether this browser started the round-trip `state` names. Clears the binding. */
function takeOAuthCookie(req: Request, res: Response, state: string): boolean {
  res.clearCookie(CALENDAR_OAUTH_COOKIE, { path: "/" });
  const bound = readCookie(req, CALENDAR_OAUTH_COOKIE);
  if (!bound || !state) return false;
  const a = Buffer.from(bound);
  const b = Buffer.from(oauthStateHash(state));
  return a.length === b.length && timingSafeEqual(a, b);
}

function oauthStateHash(state: string): string {
  return createHash("sha256").update(state).digest("base64url");
}

function readCookie(req: Request, name: string): string | null {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1 || part.slice(0, eq).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Where a calendar OAuth round-trip sends the browser back.
 *
 * Calendars are a pane of the settings dialog, and that dialog addresses itself
 * with a URL fragment — so the fragment is what reopens it on the calendar the
 * flow started from. Without a calendar in the state the account was connected
 * for the workspace at large, which is the providers pane.
 */
function calendarOAuthReturnUrl(
  status: "connected" | "error",
  provider: string,
  calendarId: string | null,
): string {
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
  const pane = calendarId
    ? `calendars/${encodeURIComponent(calendarId)}`
    : "calendar-providers";
  return `${frontendUrl}/dashboard/meetings?calendar=${status}&provider=${provider}#settings/${pane}`;
}

@Controller("calendar")
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  // --- OAuth Flow ---

  @Get("oauth/google")
  async googleOAuthRedirect(
    @CurrentUser() user: CurrentUserData,
    @Res() res: Response,
    @Query("calendarId") calendarId?: string,
  ) {
    const redirectUri = `${process.env.BACKEND_URL}/api/calendar/oauth/google/callback`;
    const state = await this.calendarService.beginOAuth(
      createOwnershipContext(user),
      "google" as CalendarProvider,
      calendarId ?? null,
    );
    const url = this.calendarService.getGoogleOAuthUrl(redirectUri, state);
    setOAuthCookie(res, state);
    res.redirect(url);
  }

  /**
   * Public because the provider redirects here; what authorizes it is the
   * single-use `state` record together with the cookie of the browser that
   * started the round-trip.
   */
  @Public()
  @Get("oauth/google/callback")
  async googleOAuthCallback(
    @Query("code") code: string,
    @Query("state") state: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    let calendarId: string | null = null;
    try {
      const redirectUri = `${process.env.BACKEND_URL}/api/calendar/oauth/google/callback`;

      if (!takeOAuthCookie(req, res, state)) {
        throw new BadRequestException("OAuth state not bound to this browser");
      }
      const transaction = await this.calendarService.consumeOAuth(
        "google" as CalendarProvider,
        state,
      );
      if (!transaction) {
        throw new BadRequestException("OAuth state expired or already used");
      }
      calendarId = transaction.calendarId;
      const ctx = {
        userId: transaction.userId,
        organizationId: transaction.organizationId,
      };

      const tokens = await this.calendarService.exchangeGoogleCode(
        code,
        redirectUri,
      );

      await this.calendarService.connectCalendar(ctx, {
        provider: "google" as CalendarProvider,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt?.toISOString(),
        email: tokens.email,
        linkCalendarId: transaction.calendarId,
      });

      res.redirect(calendarOAuthReturnUrl("connected", "google", calendarId));
    } catch (err) {
      console.log(JSON.stringify(err));
      res.redirect(calendarOAuthReturnUrl("error", "google", calendarId));
    }
  }

  @Get("oauth/microsoft")
  async microsoftOAuthRedirect(
    @CurrentUser() user: CurrentUserData,
    @Res() res: Response,
    @Query("calendarId") calendarId?: string,
  ) {
    const redirectUri = `${process.env.BACKEND_URL}/api/calendar/oauth/microsoft/callback`;
    const state = await this.calendarService.beginOAuth(
      createOwnershipContext(user),
      "microsoft" as CalendarProvider,
      calendarId ?? null,
    );
    const url = this.calendarService.getMicrosoftOAuthUrl(redirectUri, state);
    setOAuthCookie(res, state);
    res.redirect(url);
  }

  @Get("oauth/microsoft/callback")
  async microsoftOAuthCallback(
    @Query("code") code: string,
    @Query("state") state: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    let calendarId: string | null = null;
    try {
      const protocol = req.headers["x-forwarded-proto"] || req.protocol;
      const host = req.headers["x-forwarded-host"] || req.get("host");
      const redirectUri = `${protocol}://${host}/api/calendar/oauth/microsoft/callback`;

      if (!takeOAuthCookie(req, res, state)) {
        throw new BadRequestException("OAuth state not bound to this browser");
      }
      const transaction = await this.calendarService.consumeOAuth(
        "microsoft" as CalendarProvider,
        state,
      );
      if (!transaction) {
        throw new BadRequestException("OAuth state expired or already used");
      }
      calendarId = transaction.calendarId;
      const ctx = {
        userId: transaction.userId,
        organizationId: transaction.organizationId,
      };

      const tokens = await this.calendarService.exchangeMicrosoftCode(
        code,
        redirectUri,
      );

      await this.calendarService.connectCalendar(ctx, {
        provider: "microsoft" as CalendarProvider,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt?.toISOString(),
        email: tokens.email,
        linkCalendarId: transaction.calendarId,
      });

      res.redirect(
        calendarOAuthReturnUrl("connected", "microsoft", calendarId),
      );
    } catch (err) {
      res.redirect(calendarOAuthReturnUrl("error", "microsoft", calendarId));
    }
  }

  // --- Existing Endpoints ---

  @Post("connect")
  async connectCalendar(
    @Body()
    dto: {
      provider: CalendarProvider;
      accessToken: string;
      refreshToken?: string;
      expiresAt?: string;
      calendarId?: string;
      email?: string;
    },
    @CurrentUser() user: CurrentUserData,
  ) {
    const ctx = createOwnershipContext(user);
    return toCalendarIntegrationView(
      await this.calendarService.connectCalendar(ctx, dto),
    );
  }

  @Get("integrations")
  async getIntegrations(@CurrentUser() user: CurrentUserData) {
    const ctx = createOwnershipContext(user);
    return this.calendarService.getIntegrations(ctx);
  }

  @Delete("integrations/:id")
  async disconnectCalendar(
    @Param("id") id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    const ctx = createOwnershipContext(user);
    return this.calendarService.disconnectCalendar(ctx, id);
  }

  @Get("integrations/:id/external-calendars")
  async listExternalCalendars(
    @Param("id") id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.calendarService.listExternalCalendars(
      createOwnershipContext(user),
      id,
    );
  }

  // --- Ringee calendars ---

  @Get("calendars")
  async listCalendars(
    @CurrentUser() user: CurrentUserData,
    @Query("includeArchived") includeArchived?: string,
  ) {
    return this.calendarService.listCalendars(createOwnershipContext(user), {
      includeArchived: includeArchived === "true",
    });
  }

  @Post("calendars")
  async createCalendar(
    @Body() dto: { name: string; timezone: string },
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.calendarService.createCalendar(
      createOwnershipContext(user),
      dto,
    );
  }

  @Get("calendars/:id")
  async getCalendar(
    @Param("id") id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.calendarService.getCalendar(createOwnershipContext(user), id);
  }

  @Patch("calendars/:id")
  async updateCalendar(
    @Param("id") id: string,
    @Body() dto: { name?: string; timezone?: string },
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.calendarService.updateCalendar(
      createOwnershipContext(user),
      id,
      dto,
    );
  }

  @Post("calendars/:id/archive")
  async archiveCalendar(
    @Param("id") id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.calendarService.setCalendarArchived(
      createOwnershipContext(user),
      id,
      true,
    );
  }

  @Post("calendars/:id/restore")
  async restoreCalendar(
    @Param("id") id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.calendarService.setCalendarArchived(
      createOwnershipContext(user),
      id,
      false,
    );
  }

  @Put("calendars/:id/connection")
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: validationExceptionFactory,
    }),
  )
  async setCalendarConnection(
    @Param("id") id: string,
    @Body() dto: SetCalendarConnectionDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.calendarService.setCalendarConnection(
      createOwnershipContext(user),
      id,
      {
        integrationId: dto.integrationId ?? null,
        externalCalendarId: dto.externalCalendarId,
      },
    );
  }

  @Get("calendars/:id/agents")
  async listCalendarAgents(
    @Param("id") id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.calendarService.listAgentsUsingCalendar(
      createOwnershipContext(user),
      id,
    );
  }

  @Get("calendars/:id/availability-settings")
  async getCalendarAvailabilitySettings(
    @Param("id") id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.calendarService.getAvailabilitySettings(
      createOwnershipContext(user),
      id,
    );
  }

  @Put("calendars/:id/availability-settings")
  async updateCalendarAvailabilitySettings(
    @Param("id") id: string,
    @Body() dto: { windows: CalendarAvailabilityWindow[] },
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.calendarService.updateAvailabilitySettings(
      createOwnershipContext(user),
      dto.windows,
      id,
    );
  }

  // The workspace's global calendar, unchanged for the consumers that were
  // reading and writing it before additional calendars existed.
  @Get("availability-settings")
  async getAvailabilitySettings(@CurrentUser() user: CurrentUserData) {
    return this.calendarService.getAvailabilitySettings(
      createOwnershipContext(user),
    );
  }

  @Put("availability-settings")
  async updateAvailabilitySettings(
    @Body() dto: { windows: CalendarAvailabilityWindow[] },
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.calendarService.updateAvailabilitySettings(
      createOwnershipContext(user),
      dto.windows,
    );
  }

  // Ringee availability is authoritative. External providers are optional
  // outbound sync targets and never decide which times this picker may offer.
  @Get("availability")
  async getAvailability(
    @Query("date") date: string,
    @Query("timeZone") timeZone: string | undefined,
    @Query("duration") duration: unknown = "30",
    @CurrentUser() user: CurrentUserData,
    @Query("calendarId") calendarId?: string,
  ) {
    if (typeof duration !== "string") {
      throw new BadRequestException("duration must be a single number.");
    }
    const parsedDuration = Number(duration);
    let durationMinutes: number;
    try {
      durationMinutes = validateMeetingDurationMinutes(parsedDuration);
    } catch {
      throw new BadRequestException(
        `duration must be a whole number between ${MIN_MEETING_DURATION_MINUTES} and ${MAX_MEETING_DURATION_MINUTES}.`,
      );
    }
    // A caller that names no zone gets the calendar's own, which is
    // authoritative for its windows — defaulting to UTC here would read a
    // 09:00-17:00 New York calendar as 09:00-17:00 UTC and answer in UTC too.
    const ctx = createOwnershipContext(user);
    const resolved = await this.calendarService.resolveCalendar(ctx, {
      calendarId,
    });
    const effectiveTimeZone = timeZone ?? resolved.timezone;
    const slots = await this.calendarService.getBookableSlotsForCalendar(
      ctx,
      resolved,
      {
        date,
        timeZone: effectiveTimeZone,
        durationMinutes,
      },
    );
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: effectiveTimeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    return slots.map((slot) => {
      const parts = formatter.formatToParts(new Date(slot.start));
      const read = (type: string) =>
        parts.find((part) => part.type === type)?.value ?? "00";
      return {
        time: `${read("hour")}:${read("minute")}`,
        available: true,
        capacity: slot.capacity,
        remainingCapacity: slot.remainingCapacity,
      };
    });
  }

  @Post("event")
  async createCalendarEvent(
    @Body()
    dto: {
      meetingId: string;
      title: string;
      scheduledAt: string;
      duration: number;
      attendeeEmail?: string;
    },
    @CurrentUser() user: CurrentUserData,
  ) {
    const ctx = createOwnershipContext(user);
    return this.calendarService.createCalendarEvent(ctx, dto);
  }
}
