import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  BadRequestException,
} from "@nestjs/common";
import {
  CurrentUser,
  CurrentUserData,
  createOwnershipContext,
} from "@ringee/platform";
import { MeetingService, OrganizationService } from "@ringee/services";

@Controller("meetings")
export class MeetingController {
  constructor(
    private readonly orgService: OrganizationService,
    private readonly meetingService: MeetingService,
  ) { }

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

    if (!dto.title) {
      const org = ctx.organizationId && await this.orgService.getOrganizationById(ctx.organizationId!);

      if (org) {
        dto.title = `Meeting with ${org.name}`;
      } else {
        dto.title = `Meeting with ${user.firstName} ${user.lastName}`;
      }
    }

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
    @Body()
    dto: {
      callId?: string;
      callSessionId?: string;
      outcome: string;
      outcomeNote?: string;
    },
    @CurrentUser() user: CurrentUserData,
  ) {
    const ctx = createOwnershipContext(user);

    let callId = dto.callId;

    // Resolve callId from Telnyx session ID if callId was not provided
    if (!callId && dto.callSessionId) {
      const call = await this.meetingService.findCallBySessionId(
        dto.callSessionId,
      );
      callId = call?.id;
    }

    if (!callId) {
      throw new BadRequestException("callId or callSessionId is required");
    }

    return this.meetingService.updateCallOutcome(ctx, callId, {
      outcome: dto.outcome as any,
      outcomeNote: dto.outcomeNote,
    });
  }
}
