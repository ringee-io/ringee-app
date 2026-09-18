import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";
import {
  CurrentUser,
  OrgAdminOnly,
  createOwnershipContext,
} from "@ringee/platform";
import {
  CallerIdRotationService,
  ConcurrentCallGuardService,
  CallService,
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

class ResolveCallerIdDto {
  @IsString()
  @IsNotEmpty()
  destination!: string;
  /** The caller ID the client would otherwise use (rotation-off fallback). */
  @IsOptional()
  @IsString()
  fallbackPhoneNumber?: string | null;
  /** Required when `source` is `external_carrier`: the external number to call from. */
  @ValidateIf(
    (object: ResolveCallerIdDto, value) =>
      object.source === "external_carrier" || value != null,
  )
  @IsUUID()
  fallbackNumberId?: string | null;
  /** Omitted for Ringee numbers; `external_carrier` dials through the workspace's own carrier. */
  @IsOptional()
  @IsIn(["external_carrier"])
  source?: "external_carrier";
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  allowOverCap?: boolean;
}

class UpdateSettingsDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  enabled?: boolean;
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(["local_presence", "balanced"])
  strategy?: string;
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(2147483647)
  defaultDailyCap?: number;
}

class AbandonDialDto {
  /** The external carrier pre-dial token, when the abandoned dial had one. */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  callToken?: string;
}

class UpdatePoolMemberDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  participating?: boolean;
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2147483647)
  dailyCap?: number | null;
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(["active", "disabled"])
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
    private readonly callService: CallService,
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
      organizationId: ctx.organizationId,
    });
    if (!decision.allowed) {
      throw new ConflictException({
        code: "CONCURRENT_CALL",
        message: decision.message,
      });
    }

    // From here on the slot is reserved. Anything that stops this request from
    // becoming a call has to hand it straight back — a caller ID we could not
    // resolve leaves the browser with nothing to dial, and a lease nobody is
    // using would refuse the user's next attempt from any other surface.
    try {
      // An external number is not rotated: the pre-flight authorizes that
      // number's carrier route and pre-creates the call the leg will adopt.
      if (body.source === "external_carrier") {
        const prepared = await this.callService.prepareExternalOutbound(
          ctx,
          body.fallbackNumberId!,
          body.destination,
        );
        await this.concurrentCallGuard.tagPending(
          user.id,
          device.deviceId,
          prepared.callToken,
        );
        return prepared;
      }
      const selection = await this.rotationService.selectForDial(
        ctx,
        (body?.destination ?? "").trim(),
        {
          phoneNumber: body?.fallbackPhoneNumber ?? null,
          numberId: body?.fallbackNumberId ?? null,
        },
        { allowOverCap: body?.allowOverCap === true },
      );

      if (!selection?.phoneNumber) {
        await this.concurrentCallGuard.releasePending(user.id, device.deviceId);
      }

      return selection;
    } catch (error) {
      await this.concurrentCallGuard.releasePending(user.id, device.deviceId);
      throw error;
    }
  }

  /**
   * The web dialer calls this when a pre-flight it already passed does not turn
   * into a call — the WebRTC leg failed to start, or the user cancelled before
   * it connected. Without it the reserved slot sits unused until its TTL and
   * the next dial from the extension or a desk phone is refused for no reason.
   */
  @Post("abandon")
  @HttpCode(HttpStatus.NO_CONTENT)
  async abandon(
    @CurrentUser() user: CurrentUserData,
    @DialDevice() device: DialDeviceInfo,
    @Body() body: AbandonDialDto,
  ): Promise<void> {
    if (body?.callToken) {
      await this.callService.abandonExternalOutbound(
        createOwnershipContext(user),
        body.callToken,
      );
      // Only this pre-dial's own reservation: a late abandon must not free the
      // lease of a dial the same device has placed since.
      await this.concurrentCallGuard.releasePendingReservation(
        user.id,
        device.deviceId,
        body.callToken,
      );
      return;
    }
    await this.concurrentCallGuard.releasePending(user.id, device.deviceId);
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
