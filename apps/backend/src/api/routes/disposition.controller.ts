import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from "@nestjs/common";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";
import {
  AllowOrgMember,
  CurrentUser,
  CurrentUserData,
  OrgAdminOnly,
  createOwnershipContext,
} from "@ringee/platform";
import {
  DISPOSITION_DESCRIPTION_MAX,
  DISPOSITION_NAME_MAX,
  DispositionService,
} from "@ringee/services";

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

// `@IsOptional()` also lets `null` through: that is how a client clears a
// disposition's color or description.

class CreateDispositionDto {
  @IsString() @MinLength(1) @MaxLength(DISPOSITION_NAME_MAX) name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(DISPOSITION_DESCRIPTION_MAX)
  description?: string | null;

  @IsOptional()
  @Matches(HEX_COLOR, { message: "color must be a hex color like #3B82F6" })
  color?: string | null;

  /** A `CallOutcome`. The service checks it against the enum. */
  @IsString() canonicalOutcome!: string;

  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class UpdateDispositionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(DISPOSITION_NAME_MAX)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(DISPOSITION_DESCRIPTION_MAX)
  description?: string | null;

  @IsOptional()
  @Matches(HEX_COLOR, { message: "color must be a hex color like #3B82F6" })
  color?: string | null;

  @IsOptional() @IsString() canonicalOutcome?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class ReorderDispositionsDto {
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID("all", { each: true })
  ids!: string[];
}

/**
 * The workspace's dispositions (DISP-001). Reading them is a member operation —
 * every agent's post-call view needs the list — while changing them is
 * workspace configuration and stays with admins (freelancers own theirs).
 */
@OrgAdminOnly()
@Controller("dispositions")
export class DispositionController {
  constructor(private readonly dispositions: DispositionService) {}

  /** Every disposition, active or not, with whether it can still be deleted. */
  @AllowOrgMember()
  @Get()
  list(@CurrentUser() user: CurrentUserData) {
    return this.dispositions.list(createOwnershipContext(user));
  }

  /** The default set the manual dialer's post-call view offers. */
  @AllowOrgMember()
  @Get("defaults")
  listDefaults(@CurrentUser() user: CurrentUserData) {
    return this.dispositions.listDefaults(createOwnershipContext(user));
  }

  /** The canonical outcomes a disposition can map to — straight from the enum. */
  @AllowOrgMember()
  @Get("outcomes")
  outcomes() {
    return this.dispositions.outcomes();
  }

  @Post()
  create(
    @CurrentUser() user: CurrentUserData,
    @Body() body: CreateDispositionDto,
  ) {
    return this.dispositions.create(createOwnershipContext(user), body);
  }

  @Put("order")
  reorder(
    @CurrentUser() user: CurrentUserData,
    @Body() body: ReorderDispositionsDto,
  ) {
    return this.dispositions.reorder(createOwnershipContext(user), body.ids);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: CurrentUserData,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: UpdateDispositionDto,
  ) {
    return this.dispositions.update(createOwnershipContext(user), id, body);
  }

  @Delete(":id")
  remove(
    @CurrentUser() user: CurrentUserData,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.dispositions.remove(createOwnershipContext(user), id);
  }
}
