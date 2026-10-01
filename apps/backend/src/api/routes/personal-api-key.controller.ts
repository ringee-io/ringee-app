import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from "@nestjs/common";
import { IsString, MaxLength, MinLength } from "class-validator";
import { CurrentUser, CurrentUserData } from "@ringee/platform";
import { PersonalApiKeyService } from "@ringee/services";

class CreatePersonalApiKeyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;
}

/**
 * The signed-in user's personal API keys (MCP + CLI). Keys belong to the user,
 * not to the active workspace, so every handler scopes by the user id from the
 * Clerk session and nothing else.
 */
@Controller("api-keys")
export class PersonalApiKeyController {
  constructor(private readonly apiKeys: PersonalApiKeyService) {}

  @Get()
  list(@CurrentUser() user: CurrentUserData) {
    return this.apiKeys.list(user.id);
  }

  /** The response carries the full key — the only time it is ever shown. */
  @Post()
  create(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: CreatePersonalApiKeyDto,
  ) {
    return this.apiKeys.create(user.id, dto.name, "dashboard");
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(
    @CurrentUser() user: CurrentUserData,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.apiKeys.revoke(user.id, id);
  }
}
