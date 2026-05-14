import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  BadRequestException,
} from "@nestjs/common";
import {
  CurrentUser,
  CurrentUserData,
  createOwnershipContext,
} from "@ringee/platform";
import { CallbackService } from "@ringee/services";
import { CallbackStatus } from "@ringee/database";

interface CreateCallbackBody {
  contactId: string;
  scheduledAt: string;
  note?: string;
  callId?: string;
}

@Controller("callbacks")
export class CallbackController {
  constructor(private readonly callbackService: CallbackService) {}

  /**
   * List callbacks visible to the current ownership context.
   * - Freelancer (no activeOrgId): personal callbacks only.
   * - Organization: all callbacks within the organization.
   */
  @Get()
  async listCallbacks(
    @CurrentUser() user: CurrentUserData,
    @Query("status") status?: string,
    @Query("page") page = "1",
    @Query("limit") limit = "20",
  ) {
    const ctx = createOwnershipContext(user);
    return this.callbackService.listForOwner(ctx, {
      status: status as CallbackStatus | undefined,
      page: Number(page),
      limit: Number(limit),
    });
  }

  /**
   * Schedule a standalone callback against a contact (optionally from a call).
   * Campaign-bound callbacks are created from the dialer's disposition flow,
   * not this endpoint.
   */
  @Post()
  async create(
    @CurrentUser() user: CurrentUserData,
    @Body() body: CreateCallbackBody,
  ) {
    if (!body.contactId) {
      throw new BadRequestException("contactId is required");
    }
    if (!body.scheduledAt) {
      throw new BadRequestException("scheduledAt is required");
    }

    const scheduledAt = new Date(body.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException("scheduledAt must be a valid ISO date");
    }
    if (scheduledAt.getTime() <= Date.now()) {
      throw new BadRequestException("scheduledAt must be in the future");
    }

    const ctx = createOwnershipContext(user);
    return this.callbackService.scheduleFromContact({
      userId: ctx.userId,
      organizationId: ctx.organizationId ?? null,
      contactId: body.contactId,
      callId: body.callId ?? null,
      scheduledAt,
      note: body.note,
    });
  }

  @Patch(":id/cancel")
  async cancel(@CurrentUser() user: CurrentUserData, @Param("id") id: string) {
    await this.callbackService.findOwnedById(id, createOwnershipContext(user));
    return this.callbackService.cancel(id);
  }

  @Patch(":id/complete")
  async complete(
    @CurrentUser() user: CurrentUserData,
    @Param("id") id: string,
  ) {
    await this.callbackService.findOwnedById(id, createOwnershipContext(user));
    return this.callbackService.markCompleted(id);
  }

  @Patch(":id/reschedule")
  async reschedule(
    @CurrentUser() user: CurrentUserData,
    @Param("id") id: string,
    @Body() body: { scheduledAt: string },
  ) {
    await this.callbackService.findOwnedById(id, createOwnershipContext(user));

    const scheduledAt = new Date(body.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException("scheduledAt must be a valid ISO date");
    }
    if (scheduledAt.getTime() <= Date.now()) {
      throw new BadRequestException("scheduledAt must be in the future");
    }

    return this.callbackService.reschedule(id, scheduledAt);
  }
}
