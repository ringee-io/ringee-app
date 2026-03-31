import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ForbiddenException,
} from "@nestjs/common";
import {
  CurrentUser,
  CurrentUserData,
  createOwnershipContext,
} from "@ringee/platform";
import { MeetingService } from "@ringee/services";

@Controller("meetings")
export class MeetingController {
  constructor(private readonly meetingService: MeetingService) {}

  @Post()
  async createMeeting(
    @Body()
    dto: {
      contactId: string;
      callId?: string;
      title?: string;
      scheduledAt: string;
      duration?: number;
      location?: string;
      notes?: string;
      attendeeEmail?: string;
      provider?: string;
    },
    @CurrentUser() user: CurrentUserData,
  ) {
    const ctx = createOwnershipContext(user);
    return this.meetingService.createMeeting(ctx, {
      ...dto,
      calendarProvider: dto.provider as any,
    });
  }

  @Get()
  async listMeetings(
    @CurrentUser() user: CurrentUserData,
    @Query("upcoming") upcoming?: string,
    @Query("status") status?: string,
    @Query("search") search?: string,
    @Query("page") page = "1",
    @Query("limit") limit = "20",
  ) {
    const ctx = createOwnershipContext(user);
    return this.meetingService.listMeetings(ctx, {
      upcoming: upcoming === "true",
      status: status as any,
      search,
      page: Number(page),
      limit: Number(limit),
    });
  }

  @Get("this-week")
  async upcomingThisWeek(@CurrentUser() user: CurrentUserData) {
    const ctx = createOwnershipContext(user);
    return this.meetingService.upcomingThisWeek(ctx);
  }

  @Get(":id")
  async getMeeting(
    @Param("id") id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    const ctx = createOwnershipContext(user);
    return this.meetingService.getMeetingById(ctx, id);
  }

  @Patch(":id")
  async updateMeeting(
    @Param("id") id: string,
    @Body()
    dto: {
      title?: string;
      scheduledAt?: string;
      duration?: number;
      location?: string;
      notes?: string;
    },
    @CurrentUser() user: CurrentUserData,
  ) {
    const ctx = createOwnershipContext(user);
    return this.meetingService.updateMeeting(ctx, id, dto);
  }

  @Patch(":id/cancel")
  async cancelMeeting(
    @Param("id") id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    const ctx = createOwnershipContext(user);
    return this.meetingService.cancelMeeting(ctx, id);
  }

  @Post("call-outcome")
  async updateCallOutcome(
    @Body() dto: { callId: string; outcome: string; outcomeNote?: string },
    @CurrentUser() user: CurrentUserData,
  ) {
    const ctx = createOwnershipContext(user);
    return this.meetingService.updateCallOutcome(ctx, dto.callId, {
      outcome: dto.outcome as any,
      outcomeNote: dto.outcomeNote,
    });
  }
}
