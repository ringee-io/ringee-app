import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  ForbiddenException,
} from "@nestjs/common";
import { CurrentUser, createOwnershipContext } from "@ringee/platform";
import { VoicemailDropService } from "@ringee/services";

interface CurrentUserData {
  id: string;
  activeOrgId?: string | null;
}

@Controller("voicemail-assets")
export class VoicemailAssetController {
  constructor(
    private readonly voicemailDropService: VoicemailDropService
  ) {}

  @Get()
  async list(@CurrentUser() user: CurrentUserData) {
    if (!user.activeOrgId) {
      throw new ForbiddenException("Organization required");
    }
    const ctx = createOwnershipContext(user);
    return this.voicemailDropService.listAssets(ctx.organizationId!);
  }

  @Post()
  async create(
    @Body() body: { name: string; fileUrl: string; durationSec?: number; isDefault?: boolean },
    @CurrentUser() user: CurrentUserData
  ) {
    if (!user.activeOrgId) {
      throw new ForbiddenException("Organization required");
    }
    const ctx = createOwnershipContext(user);
    return this.voicemailDropService.createAsset(ctx, body);
  }

  @Delete(":id")
  async delete(@Param("id") id: string) {
    return this.voicemailDropService.deleteAsset(id);
  }
}
