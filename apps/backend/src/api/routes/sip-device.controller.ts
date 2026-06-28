import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";
import {
  CurrentUser,
  CurrentUserData,
  OrgAdminOnly,
  createOwnershipContext,
} from "@ringee/platform";
import { SipDeviceService } from "@ringee/services";

class CreateSipDeviceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  label!: string;

  @IsOptional()
  @IsIn(["yealink", "grandstream", "cisco", "zoiper", "other"])
  deviceType?: string;

  @IsOptional()
  @IsUUID()
  assignedUserId?: string;

  @IsOptional()
  @IsBoolean()
  allowInbound?: boolean;

  @IsOptional()
  @IsBoolean()
  allowOutbound?: boolean;

  @IsOptional()
  @IsUUID()
  numberId?: string;
}

class ChangeNumberDto {
  // null clears the assigned number.
  @IsOptional()
  @IsUUID()
  numberId?: string | null;

  @IsOptional()
  @IsBoolean()
  allowInbound?: boolean;
}

class SetEnabledDto {
  @IsBoolean()
  enabled!: boolean;
}

class DeleteSipDeviceDto {
  @IsOptional()
  @IsIn(["ringee", "device"])
  reroute?: "ringee" | "device";

  @IsOptional()
  @IsUUID()
  targetDeviceId?: string | null;
}

/**
 * Desk Phones (SIP Devices) management. Admin-only inside an organization
 * (freelancers without an org are unrestricted), matching the rest of the
 * calling-infrastructure surface (numbers, caller-ID rotation).
 */
@OrgAdminOnly()
@Controller("sip-devices")
export class SipDeviceController {
  constructor(private readonly sipDeviceService: SipDeviceService) {}

  @Get()
  async list(@CurrentUser() user: CurrentUserData) {
    return this.sipDeviceService.list(createOwnershipContext(user));
  }

  // Must be declared before `@Get(":id")` so it isn't captured as an id.
  @Get("assignable-numbers")
  async assignableNumbers(@CurrentUser() user: CurrentUserData) {
    return this.sipDeviceService.listAssignableNumbers(
      createOwnershipContext(user),
    );
  }

  @Post()
  async create(
    @Body() body: CreateSipDeviceDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.sipDeviceService.create(createOwnershipContext(user), user.id, {
      label: body.label,
      deviceType: body.deviceType ?? null,
      assignedUserId: body.assignedUserId ?? null,
      allowInbound: body.allowInbound,
      allowOutbound: body.allowOutbound,
      numberId: body.numberId ?? null,
    });
  }

  @Get(":id")
  async get(@Param("id") id: string, @CurrentUser() user: CurrentUserData) {
    return this.sipDeviceService.get(createOwnershipContext(user), id);
  }

  /** Rotate the SIP password; returns fresh one-time credentials. */
  @Post(":id/regenerate-password")
  async regeneratePassword(
    @Param("id") id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.sipDeviceService.regeneratePassword(
      createOwnershipContext(user),
      id,
    );
  }

  @Post(":id/check-registration")
  async checkRegistration(
    @Param("id") id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.sipDeviceService.checkRegistration(
      createOwnershipContext(user),
      id,
    );
  }

  @Patch(":id/enabled")
  async setEnabled(
    @Param("id") id: string,
    @Body() body: SetEnabledDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.sipDeviceService.setEnabled(
      createOwnershipContext(user),
      id,
      body.enabled,
    );
  }

  @Patch(":id/number")
  async changeNumber(
    @Param("id") id: string,
    @Body() body: ChangeNumberDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.sipDeviceService.changeNumber(
      createOwnershipContext(user),
      id,
      {
        numberId: body.numberId ?? null,
        allowInbound: body.allowInbound,
      },
    );
  }

  @Delete(":id")
  async remove(
    @Param("id") id: string,
    @Body() body: DeleteSipDeviceDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.sipDeviceService.delete(createOwnershipContext(user), id, {
      reroute: body?.reroute,
      targetDeviceId: body?.targetDeviceId ?? null,
    });
  }
}
