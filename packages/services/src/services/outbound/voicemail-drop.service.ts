import {
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { VoicemailDropAssetRepository } from "@ringee/database";
import { TelephonyService } from "@ringee/platform";
import { OwnershipContext } from "@ringee/platform";

@Injectable()
export class VoicemailDropService {
  private readonly logger = new Logger(VoicemailDropService.name);

  constructor(
    private readonly assetRepo: VoicemailDropAssetRepository,
    private readonly telephonyService: TelephonyService
  ) {}

  async createAsset(
    ctx: OwnershipContext,
    data: { name: string; fileUrl: string; durationSec?: number; isDefault?: boolean }
  ) {
    if (!ctx.organizationId) {
      throw new NotFoundException("Organization required");
    }
    return this.assetRepo.create({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      ...data,
    });
  }

  async listAssets(organizationId: string) {
    return this.assetRepo.findByOrganization(organizationId);
  }

  async deleteAsset(id: string) {
    return this.assetRepo.delete(id);
  }

  /**
   * Drop a voicemail on an active call.
   * Initiates audio playback via Telnyx and the call will be hung up
   * after playback completes (handled by webhook).
   */
  async dropVoicemail(
    callControlId: string,
    assetId: string
  ): Promise<void> {
    const asset = await this.assetRepo.findById(assetId);
    if (!asset) {
      throw new NotFoundException("Voicemail asset not found");
    }

    await this.telephonyService.playbackStart(callControlId, asset.fileUrl);
    this.logger.log(
      `Voicemail drop initiated on call ${callControlId} with asset ${assetId}`
    );
  }
}
