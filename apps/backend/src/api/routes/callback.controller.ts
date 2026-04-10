import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  ForbiddenException,
} from "@nestjs/common";
import { CurrentUser, createOwnershipContext } from "@ringee/platform";
import { CallbackService } from "@ringee/services";
import { CallbackStatus } from "@ringee/database";

interface CurrentUserData {
  id: string;
  activeOrgId?: string | null;
}

@Controller("callbacks")
export class CallbackController {
  constructor(private readonly callbackService: CallbackService) {}

  @Get()
  async listCallbacks(
    @CurrentUser() user: CurrentUserData,
    @Query("status") status?: string,
    @Query("page") page = "1",
    @Query("limit") limit = "20"
  ) {
    if (!user.activeOrgId) {
      throw new ForbiddenException("Organization required");
    }
    const ctx = createOwnershipContext(user);
    return this.callbackService.listByAgent(ctx.userId, {
      status: status as CallbackStatus | undefined,
      page: Number(page),
      limit: Number(limit),
    });
  }

  @Patch(":id/cancel")
  async cancel(@Param("id") id: string) {
    return this.callbackService.cancel(id);
  }

  @Patch(":id/reschedule")
  async reschedule(
    @Param("id") id: string,
    @Body() body: { scheduledAt: string }
  ) {
    return this.callbackService.reschedule(id, new Date(body.scheduledAt));
  }
}
