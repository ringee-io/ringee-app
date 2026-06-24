import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import {
  CurrentUser,
  OrgAdminOnly,
  createOwnershipContext,
} from "@ringee/platform";
import { CallerIdRotationService } from "@ringee/services";

interface CurrentUserData {
  id: string;
  activeOrgId?: string | null;
  activeOrgRole?: string | null;
}

interface ResolveCallerIdDto {
  destination: string;
  /** The caller ID the client would otherwise use (rotation-off fallback). */
  fallbackPhoneNumber?: string | null;
  fallbackNumberId?: string | null;
  allowOverCap?: boolean;
}

interface UpdateSettingsDto {
  enabled?: boolean;
  strategy?: string;
  defaultDailyCap?: number;
}

interface UpdatePoolMemberDto {
  participating?: boolean;
  dailyCap?: number | null;
  status?: "active" | "disabled";
}

/**
 * Caller-ID rotation (local presence). The management surface is org-admin
 * gated; the per-dial `resolve` endpoint is available to any authenticated
 * caller because every dialer needs a backend-chosen caller ID.
 */
@Controller("caller-id-rotation")
export class CallerIdRotationController {
  constructor(private readonly rotationService: CallerIdRotationService) {}

  /**
   * Decide which caller ID the web manual dialer should present for a
   * destination. The client passes its currently-selected number as the
   * fallback so behavior is unchanged when rotation is off.
   */
  @Post("resolve")
  async resolve(
    @Body() body: ResolveCallerIdDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const ctx = createOwnershipContext(user);
    return this.rotationService.selectForDial(
      ctx,
      (body?.destination ?? "").trim(),
      {
        phoneNumber: body?.fallbackPhoneNumber ?? null,
        numberId: body?.fallbackNumberId ?? null,
      },
      { allowOverCap: body?.allowOverCap === true },
    );
  }

  @Get("settings")
  async getSettings(@CurrentUser() user: CurrentUserData) {
    const ctx = createOwnershipContext(user);
    return this.rotationService.getSettings(ctx);
  }

  @OrgAdminOnly()
  @Put("settings")
  async updateSettings(
    @Body() body: UpdateSettingsDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const ctx = createOwnershipContext(user);
    return this.rotationService.updateSettings(ctx, body);
  }

  @OrgAdminOnly()
  @Get("pool")
  async getPool(@CurrentUser() user: CurrentUserData) {
    const ctx = createOwnershipContext(user);
    return this.rotationService.listPool(ctx);
  }

  @OrgAdminOnly()
  @Patch("pool/:numberId")
  async updatePoolMember(
    @Param("numberId") numberId: string,
    @Body() body: UpdatePoolMemberDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const ctx = createOwnershipContext(user);
    return this.rotationService.updatePoolMember(ctx, numberId, body);
  }

  @OrgAdminOnly()
  @Get("reporting")
  async getReporting(
    @CurrentUser() user: CurrentUserData,
    @Query("windowDays") windowDays?: string,
  ) {
    const ctx = createOwnershipContext(user);
    const days = windowDays ? parseInt(windowDays, 10) : 7;
    return this.rotationService.getReporting(
      ctx,
      Number.isFinite(days) && days > 0 ? days : 7,
    );
  }
}
