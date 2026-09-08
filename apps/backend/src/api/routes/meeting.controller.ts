import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  BadRequestException,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import {
  IsBoolean,
  IsEmail,
  IsISO8601,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import {
  CurrentUser,
  CurrentUserData,
  createOwnershipContext,
} from "@ringee/platform";
import {
  MAX_MEETING_DURATION_MINUTES,
  MIN_MEETING_DURATION_MINUTES,
  MeetingService,
  OrganizationService,
} from "@ringee/services";
import { validationExceptionFactory } from "../validation-error";

class CreateMeetingDto {
  @IsUUID()
  contactId!: string;

  @IsOptional()
  @IsUUID()
  callId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsISO8601({ strict: true })
  scheduledAt!: string;

  @IsOptional()
  @IsInt()
  @Min(MIN_MEETING_DURATION_MINUTES)
  @Max(MAX_MEETING_DURATION_MINUTES)
  duration?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  attendeeEmail?: string;

  @IsOptional()
  @IsIn(["google", "microsoft"])
  provider?: "google" | "microsoft";

  @IsOptional()
  @IsBoolean()
  requireAvailableSlot?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  bookingTimeZone?: string;
}

@Controller("meetings")
export class MeetingController {
  constructor(
    private readonly orgService: OrganizationService,
    private readonly meetingService: MeetingService,
  ) {}

  @Post()
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: validationExceptionFactory,
    }),
  )
  async createMeeting(
    @Body() dto: CreateMeetingDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const ctx = createOwnershipContext(user);
    let title = dto.title;

    if (!title) {
      const org =
        ctx.organizationId &&
        (await this.orgService.getOrganizationById(ctx.organizationId!));

      if (org) {
        title = `Meeting with ${org.name}`;
      } else {
        title = `Meeting with ${user.firstName} ${user.lastName}`;
      }
    }

    return this.meetingService.createMeeting(ctx, {
      contactId: dto.contactId,
      callId: dto.callId,
      title,
      scheduledAt: dto.scheduledAt,
      duration: dto.duration,
      location: dto.location,
      notes: dto.notes,
      attendeeEmail: dto.attendeeEmail,
      calendarProvider: dto.provider,
      requireAvailableSlot: dto.requireAvailableSlot,
      bookingTimeZone: dto.bookingTimeZone,
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

  /**
   * Post-call disposition. `outcome` is optional: skip/close send the same
   * request without one, which still pushes the CRM call-log note immediately.
   */
  @Post("call-outcome")
  async updateCallOutcome(
    @Body()
    dto: {
      callId?: string;
      callSessionId?: string;
      outcome?: string;
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

    if (!dto.outcome) {
      return this.meetingService.finalizeCall(ctx, callId);
    }

    return this.meetingService.updateCallOutcome(ctx, callId, {
      outcome: dto.outcome as any,
      outcomeNote: dto.outcomeNote,
    });
  }
}
