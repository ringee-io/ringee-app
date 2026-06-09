import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Res,
  Req,
} from "@nestjs/common";
import {
  CurrentUser,
  CurrentUserData,
  Public,
  createOwnershipContext,
} from "@ringee/platform";
import { CalendarService } from "@ringee/services";
import { CalendarProvider } from "@ringee/database";
import { Response, Request } from "express";

@Controller("calendar")
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  // --- OAuth Flow ---

  @Get("oauth/google")
  async googleOAuthRedirect(
    @CurrentUser() user: CurrentUserData,
    @Res() res: Response,
  ) {
    const redirectUri = `${process.env.BACKEND_URL}/api/calendar/oauth/google/callback`;
    const state = Buffer.from(JSON.stringify({ userId: user.id, orgId: user.activeOrgId })).toString("base64");
    const url = this.calendarService.getGoogleOAuthUrl(redirectUri, state);
    res.redirect(url);
  }

  @Public()
  @Get("oauth/google/callback")
  async googleOAuthCallback(
    @Query("code") code: string,
    @Query("state") state: string,
    @Res() res: Response,
  ) {
    try {
      const redirectUri = `${process.env.BACKEND_URL}/api/calendar/oauth/google/callback`;
      
      const stateData = JSON.parse(Buffer.from(state, "base64").toString());
      const ctx = { userId: stateData.userId, organizationId: stateData.orgId };

      const tokens = await this.calendarService.exchangeGoogleCode(code, redirectUri);
      
      await this.calendarService.connectCalendar(ctx, {
        provider: "google" as CalendarProvider,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt?.toISOString(),
        email: tokens.email,
      });

      // Redirect to frontend meetings page with success param
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
      res.redirect(`${frontendUrl}/dashboard/meetings?calendar=connected&provider=google`);
    } catch (err) {
      console.log(JSON.stringify(err));
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
      res.redirect(`${frontendUrl}/dashboard/meetings?calendar=error&provider=google`);
    }
  }

  @Public()
  @Get("oauth/microsoft")
  async microsoftOAuthRedirect(
    @CurrentUser() user: CurrentUserData,
    @Res() res: Response,
  ) {
    const redirectUri = `${process.env.BACKEND_URL}/api/calendar/oauth/microsoft/callback`;
    const state = Buffer.from(JSON.stringify({ userId: user.id, orgId: user.activeOrgId })).toString("base64");
    const url = this.calendarService.getMicrosoftOAuthUrl(redirectUri, state);
    res.redirect(url);
  }

  @Get("oauth/microsoft/callback")
  async microsoftOAuthCallback(
    @Query("code") code: string,
    @Query("state") state: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    try {
      const protocol = req.headers["x-forwarded-proto"] || req.protocol;
      const host = req.headers["x-forwarded-host"] || req.get("host");
      const redirectUri = `${protocol}://${host}/api/calendar/oauth/microsoft/callback`;
      
      const stateData = JSON.parse(Buffer.from(state, "base64").toString());
      const ctx = { userId: stateData.userId, organizationId: stateData.orgId };

      const tokens = await this.calendarService.exchangeMicrosoftCode(code, redirectUri);
      
      await this.calendarService.connectCalendar(ctx, {
        provider: "microsoft" as CalendarProvider,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt?.toISOString(),
        email: tokens.email,
      });

      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
      res.redirect(`${frontendUrl}/dashboard/meetings?calendar=connected&provider=microsoft`);
    } catch (err) {
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
      res.redirect(`${frontendUrl}/dashboard/meetings?calendar=error&provider=microsoft`);
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
    return this.calendarService.connectCalendar(ctx, dto);
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

  // TEMPORAL: por ahora siempre devolvemos todos los slots como disponibles,
  // ignorando la disponibilidad real del calendario conectado. Lo dejamos así
  // de momento; revertir a calendarService.getAvailability cuando se quiera
  // volver a consultar el free/busy real del proveedor.
  @Get("availability")
  async getAvailability(
    @Query("date") date: string,
    @Query("provider") provider?: CalendarProvider,
    @CurrentUser() user?: CurrentUserData,
  ) {
    return this.calendarService.generateAllAvailableSlots(date);
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
