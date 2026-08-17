import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { CurrentUser, createOwnershipContext } from "@ringee/platform";
import { VoicemailDropService } from "@ringee/services";

interface CurrentUserData {
  id: string;
  activeOrgId?: string | null;
}

/** Voicemail greetings are short; 15 MB is generous for a 3-minute recording. */
const MAX_AUDIO_BYTES = 15 * 1024 * 1024;
const ALLOWED_AUDIO_TYPES = /^audio\//;

@Controller("voicemail-assets")
export class VoicemailAssetController {
  constructor(private readonly voicemailDropService: VoicemailDropService) {}

  @Get()
  async list(@CurrentUser() user: CurrentUserData) {
    if (!user.activeOrgId) {
      throw new ForbiddenException("Organization required");
    }
    const ctx = createOwnershipContext(user);
    return this.voicemailDropService.listAssets(ctx.organizationId!);
  }

  /**
   * Stores a recorded/uploaded greeting and returns its public URL. The
   * caller then POSTs that URL back with a name and description to add it to
   * the workspace bucket.
   */
  @Post("upload")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: MAX_AUDIO_BYTES },
      fileFilter: (_req, file, cb) => {
        if (ALLOWED_AUDIO_TYPES.test(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException("Only audio files are allowed"), false);
        }
      },
    }),
  )
  async upload(
    @CurrentUser() user: CurrentUserData,
    @UploadedFile()
    file: { buffer: Buffer; originalname: string; mimetype: string },
  ) {
    if (!user.activeOrgId) {
      throw new ForbiddenException("Organization required");
    }
    if (!file) {
      throw new BadRequestException("No file uploaded");
    }
    return this.voicemailDropService.uploadAudio({
      buffer: file.buffer,
      contentType: file.mimetype,
      filename: file.originalname,
    });
  }

  @Post()
  async create(
    @Body()
    body: {
      name?: string;
      description?: string;
      fileUrl: string;
      durationSec?: number;
      isDefault?: boolean;
    },
    @CurrentUser() user: CurrentUserData,
  ) {
    if (!user.activeOrgId) {
      throw new ForbiddenException("Organization required");
    }
    const ctx = createOwnershipContext(user);
    return this.voicemailDropService.createAsset(ctx, body);
  }

  /** Sends a stored voicemail to a number as its own outbound drop call. */
  @Post("send")
  async send(
    @Body()
    body: {
      assetId: string;
      toNumber: string;
      fromNumber?: string;
      contactId?: string;
      callId?: string;
      source?: string;
    },
    @CurrentUser() user: CurrentUserData,
  ) {
    if (!user.activeOrgId) {
      throw new ForbiddenException("Organization required");
    }
    if (!body?.assetId || !body?.toNumber) {
      throw new BadRequestException("assetId and toNumber are required");
    }
    const ctx = createOwnershipContext(user);
    return this.voicemailDropService.sendVoicemail(ctx, body);
  }

  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body()
    body: { name?: string; description?: string; isDefault?: boolean },
    @CurrentUser() user: CurrentUserData,
  ) {
    if (!user.activeOrgId) {
      throw new ForbiddenException("Organization required");
    }
    const ctx = createOwnershipContext(user);
    return this.voicemailDropService.updateAsset(ctx, id, body);
  }

  @Delete(":id")
  async delete(@Param("id") id: string, @CurrentUser() user: CurrentUserData) {
    if (!user.activeOrgId) {
      throw new ForbiddenException("Organization required");
    }
    const ctx = createOwnershipContext(user);
    return this.voicemailDropService.deleteAsset(ctx, id);
  }
}
