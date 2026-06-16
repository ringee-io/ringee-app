import { Body, Controller, Get, Put } from "@nestjs/common";
import { IsBoolean, IsOptional } from "class-validator";
import {
  CurrentUser,
  createOwnershipContext,
  OrgAdminOnly,
} from "@ringee/platform";
import {
  CallRecordingSettingsService,
  EffectiveRecordingSettings,
} from "@ringee/services";

interface CurrentUserData {
  id: string;
  activeOrgId?: string | null;
  activeOrgRole?: string | null;
}

class UpdateRecordingSettingsDto {
  @IsOptional()
  @IsBoolean()
  recordAllCalls?: boolean;

  @IsOptional()
  @IsBoolean()
  transcribeRealtime?: boolean;

  @IsOptional()
  @IsBoolean()
  transcribeRecordings?: boolean;
}

/**
 * Call Recording & Transcription settings. The resolved settings always follow
 * the active context: organization settings when acting in an org, personal
 * settings otherwise (no override/merge between the two).
 */
@Controller("call-recording-settings")
export class CallRecordingSettingsController {
  constructor(private readonly settingsService: CallRecordingSettingsService) {}

  @Get()
  async get(
    @CurrentUser() user: CurrentUserData,
  ): Promise<EffectiveRecordingSettings> {
    const ctx = createOwnershipContext(user);
    return this.settingsService.getForContext(ctx);
  }

  @Put()
  @OrgAdminOnly()
  async update(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: UpdateRecordingSettingsDto,
  ): Promise<EffectiveRecordingSettings> {
    const ctx = createOwnershipContext(user);
    return this.settingsService.update(ctx, dto, {
      isOrgAdmin: user.activeOrgRole === "org:admin",
    });
  }
}
