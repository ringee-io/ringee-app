import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import {
  IsArray,
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import { AiVoiceAgentCallDispatchState } from "@ringee/database";
import {
  CurrentUser,
  TRAFFIC_CLASSES,
  isTrafficClass,
  type CurrentUserData,
} from "@ringee/platform";
import {
  DispatchQueueService,
  DispatchSettingsService,
  DispatchStatsService,
} from "@ringee/services";
import { SuperAdminOnly } from "../guards/super-admin.guard";

class UpdateDispatchSettingsDto {
  /** Checked key by key by the service; nothing here reaches a query. */
  @IsObject()
  settings!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  /** The administrator has read what a ceiling above the free CPS costs. */
  @IsOptional()
  @IsBoolean()
  confirmCeilingIncrease?: boolean;
}

class ResetDispatchSettingsDto {
  @IsArray()
  @IsString({ each: true })
  keys!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsBoolean()
  confirmCeilingIncrease?: boolean;
}

class PauseDispatchDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  classes?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

const QUEUE_STATES = Object.values(AiVoiceAgentCallDispatchState);

/**
 * Staff controls over Ringee's outbound call pacing (CPS-010): what is happening
 * now, what it would cost, the limits, the pause switch, and the calls waiting
 * for capacity. Reuses the backoffice allowlist (`@SuperAdminOnly()`), which is
 * the real access boundary; there is no customer-facing counterpart.
 */
@Controller("backoffice/dispatch")
@SuperAdminOnly()
export class BackofficeDispatchController {
  constructor(
    private readonly settings: DispatchSettingsService,
    private readonly stats: DispatchStatsService,
    private readonly queue: DispatchQueueService,
  ) {}

  /** Live CPS, this hour's counters, the queue, coordination and the month so far. */
  @Get("status")
  status() {
    return this.stats.snapshot();
  }

  /** The estimated Telnyx surcharge of a month, with what the estimate cannot know. */
  @Get("estimate")
  estimate(@Query("month") month?: string) {
    const now = new Date();
    let year = now.getUTCFullYear();
    let index = now.getUTCMonth() + 1;
    if (month) {
      const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
      if (!match) throw new BadRequestException("month must be YYYY-MM");
      year = Number(match[1]);
      index = Number(match[2]);
    }
    return this.stats.estimateMonth(year, index);
  }

  @Get("settings")
  getSettings() {
    return this.settings.getState();
  }

  /**
   * Changes pacing limits. Raising the ceiling above the free 5 CPS needs
   * `confirmCeilingIncrease` and a reason: it is a spending decision.
   */
  @Put("settings")
  updateSettings(
    @CurrentUser() user: CurrentUserData,
    @Body() body: UpdateDispatchSettingsDto,
  ) {
    return this.settings.update(body.settings, {
      userId: user.id,
      reason: body.reason,
      confirmCeilingIncrease: body.confirmCeilingIncrease,
    });
  }

  /** Removes overrides, so those settings fall back to the environment. */
  @Post("settings/reset")
  resetSettings(
    @CurrentUser() user: CurrentUserData,
    @Body() body: ResetDispatchSettingsDto,
  ) {
    return this.settings.reset(body.keys, {
      userId: user.id,
      reason: body.reason,
      confirmCeilingIncrease: body.confirmCeilingIncrease,
    });
  }

  /**
   * Stops dispatching background and automated work (scheduled, automation,
   * background); with `classes`, only those. People's calls are never paused.
   */
  @Post("pause")
  async pause(
    @CurrentUser() user: CurrentUserData,
    @Body() body: PauseDispatchDto,
  ) {
    const pausable = TRAFFIC_CLASSES.filter((cls) => cls !== "interactive");
    const requested = body.classes ?? [...pausable];
    if (!requested.every(isTrafficClass) || requested.includes("interactive")) {
      throw new BadRequestException(
        `classes must be among ${pausable.join(", ")}: interactive calls cannot be paused.`,
      );
    }
    const current = (await this.settings.getState()).settings.pausedClasses;
    return this.settings.update(
      { pausedClasses: [...new Set([...current, ...requested])] },
      { userId: user.id, reason: body.reason ?? "paused from the backoffice" },
    );
  }

  /** Resumes the classes named, or every paused class. */
  @Post("resume")
  async resume(
    @CurrentUser() user: CurrentUserData,
    @Body() body: PauseDispatchDto,
  ) {
    const current = (await this.settings.getState()).settings.pausedClasses;
    const remaining = body.classes
      ? current.filter((cls) => !body.classes!.includes(cls))
      : [];
    return this.settings.update(
      { pausedClasses: remaining },
      { userId: user.id, reason: body.reason ?? "resumed from the backoffice" },
    );
  }

  /** The calls waiting for capacity (numbers masked), paged. */
  @Get("queue")
  listQueue(
    @Query("state") state?: string,
    @Query("workspace") workspace?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    if (
      state &&
      !QUEUE_STATES.includes(state as AiVoiceAgentCallDispatchState)
    ) {
      throw new BadRequestException(
        `state must be one of ${QUEUE_STATES.join(", ")}`,
      );
    }
    const take = Math.min(200, Math.max(1, Math.trunc(Number(limit) || 50)));
    return this.queue.listQueue({
      state: state as AiVoiceAgentCallDispatchState | undefined,
      workspaceKey: workspace || undefined,
      limit: take,
      offset: Math.min(1_000_000, Math.max(0, Math.trunc(Number(offset) || 0))),
    });
  }

  /** Cancels a waiting call. A call already dialing answers 409. */
  @Post("queue/:id/cancel")
  cancel(@Param("id", ParseUUIDPipe) id: string) {
    return this.queue.cancelAsStaff(id);
  }
}
