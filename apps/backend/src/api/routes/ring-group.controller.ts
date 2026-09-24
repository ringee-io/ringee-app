import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from "@nestjs/common";
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import {
  AllowOrgMember,
  CurrentUser,
  CurrentUserData,
  OrgAdminOnly,
  createOwnershipContext,
} from "@ringee/platform";
import { RingGroupService } from "@ringee/services";

class RingGroupDto {
  @IsString() @MinLength(1) @MaxLength(80) name!: string;
  /** How long the group rings before the call is given up on. */
  @IsOptional() @IsInt() @Min(5) @Max(300) ringSeconds?: number;
}

class RingGroupPatchDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) name?: string;
  @IsOptional() @IsInt() @Min(5) @Max(300) ringSeconds?: number;
}

class RingGroupMemberDto {
  @IsUUID() userId!: string;
}

/**
 * Ring groups. Reading one is a member operation — a member needs to know
 * which groups they are rung by — while changing who rings is workspace
 * configuration and stays with admins.
 */
@OrgAdminOnly()
@Controller("ring-groups")
export class RingGroupController {
  constructor(private readonly service: RingGroupService) {}

  @AllowOrgMember()
  @Get()
  list(@CurrentUser() user: CurrentUserData) {
    return this.service.list(createOwnershipContext(user));
  }

  @AllowOrgMember()
  @Get(":id")
  get(
    @CurrentUser() user: CurrentUserData,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.get(createOwnershipContext(user), id);
  }

  @Post()
  create(@CurrentUser() user: CurrentUserData, @Body() body: RingGroupDto) {
    return this.service.create(createOwnershipContext(user), body);
  }

  @Patch(":id")
  rename(
    @CurrentUser() user: CurrentUserData,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: RingGroupPatchDto,
  ) {
    return this.service.rename(createOwnershipContext(user), id, body);
  }

  @Delete(":id")
  remove(
    @CurrentUser() user: CurrentUserData,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.remove(createOwnershipContext(user), id);
  }

  @Post(":id/members")
  addMember(
    @CurrentUser() user: CurrentUserData,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: RingGroupMemberDto,
  ) {
    return this.service.addMember(
      createOwnershipContext(user),
      id,
      body.userId,
    );
  }

  @Delete(":id/members/:userId")
  removeMember(
    @CurrentUser() user: CurrentUserData,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("userId", ParseUUIDPipe) userId: string,
  ) {
    return this.service.removeMember(createOwnershipContext(user), id, userId);
  }
}
