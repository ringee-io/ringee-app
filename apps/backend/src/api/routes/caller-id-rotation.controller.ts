import {
  Body,
  ConflictException,
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
import {
  CallerIdRotationService,
  ConcurrentCallGuardService,
} from "@ringee/services";
import {
  DialDevice,
  type DialDeviceInfo,
} from "../decorators/dial-device.decorator";

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
  constructor(
    private readonly rotationService: CallerIdRotationService,
    private readonly concurrentCallGuard: ConcurrentCallGuardService,
  ) {}

  /**
   * Decide which caller ID the web manual dialer should present for a
   * destination. The client passes its currently-selected number as the
   * fallback so behavior is unchanged when rotation is off.
   *
   * This is also the web dialer's ONLY pre-dial round trip, so it doubles as
   * its pre-flight: the one-call-at-a-time rule is checked here, before a
   * caller ID is handed out. Refusing here means the browser never places the
   * WebRTC leg at all, which is a much better experience than connecting a call
   * and having the `call.initiated` backstop tear it down.
   */
  @Post("resolve")
  async resolve(
    @Body() body: ResolveCallerIdDto,
    @CurrentUser() user: CurrentUserData,
    @DialDevice() device: DialDeviceInfo,
  ) {
    const ctx = createOwnershipContext(user);

    const decision = await this.concurrentCallGuard.requestDial(user.id, {
      deviceId: device.deviceId,
      deviceLabel: device.deviceLabel,
      source: "web",
    });
    if (!decision.allowed) {
      throw new ConflictException({
        code: "CONCURRENT_CALL",
        message: decision.message,
      });
    }

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
