import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
} from "@nestjs/common";
import {
  CurrentUser,
  CurrentUserData,
  createOwnershipContext,
} from "@ringee/platform";
import { CalendarService } from "@ringee/services";
import { CalendarProvider } from "@ringee/database";

@Controller("calendar")
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

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

  @Get("availability")
  async getAvailability(
    @Query("date") date: string,
    @Query("provider") provider?: CalendarProvider,
    @CurrentUser() user?: CurrentUserData,
  ) {
    const ctx = createOwnershipContext(user!);
    return this.calendarService.getAvailability(ctx, { date, provider });
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
