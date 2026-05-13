import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  BadRequestException,
} from "@nestjs/common";
import {
  CurrentUser,
  CurrentUserData,
  createOwnershipContext,
} from "@ringee/platform";
import { ReminderService } from "@ringee/services";
import { ReminderSubjectType } from "@ringee/database";

@Controller("reminders")
export class ReminderController {
  constructor(private readonly reminderService: ReminderService) {}

  /**
   * List upcoming (pending + snoozed) reminders for the current scope.
   * Sent / failed / cancelled reminders are excluded — this is the
   * agenda view, not an audit log.
   */
  @Get()
  async listUpcoming(
    @CurrentUser() user: CurrentUserData,
    @Query("subjectType") subjectType?: string,
    @Query("page") page = "1",
    @Query("limit") limit = "20"
  ) {
    const ctx = createOwnershipContext(user);

    let typed: ReminderSubjectType | undefined;
    if (subjectType) {
      const allowed = Object.values(ReminderSubjectType) as string[];
      if (!allowed.includes(subjectType)) {
        throw new BadRequestException(
          `subjectType must be one of: ${allowed.join(", ")}`
        );
      }
      typed = subjectType as ReminderSubjectType;
    }

    return this.reminderService.listUpcomingForOwner(ctx, {
      subjectType: typed,
      page: Number(page),
      limit: Number(limit),
    });
  }

  @Patch(":id/snooze")
  async snooze(
    @Param("id") id: string,
    @Body() body: { minutes?: number }
  ) {
    const minutes = Number.isFinite(body.minutes) ? Number(body.minutes) : 10;
    if (minutes <= 0 || minutes > 24 * 60) {
      throw new BadRequestException("minutes must be in (0, 1440]");
    }
    return this.reminderService.snooze(id, minutes);
  }
}
