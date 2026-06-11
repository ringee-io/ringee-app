import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { VoicemailDropAssetRepository, CallRepository } from "@ringee/database";
import { TelephonyService } from "@ringee/platform";
import { OwnershipContext } from "@ringee/platform";
import { InboxTimelineService } from "../inbox/inbox.timeline.service";

@Injectable()
export class VoicemailDropService {
  private readonly logger = new Logger(VoicemailDropService.name);

  constructor(
    private readonly assetRepo: VoicemailDropAssetRepository,
    private readonly telephonyService: TelephonyService,
    private readonly callRepo: CallRepository,
    private readonly inboxTimelineService: InboxTimelineService,
  ) {}

  async createAsset(
    ctx: OwnershipContext,
    data: {
      name: string;
      fileUrl: string;
      durationSec?: number;
      isDefault?: boolean;
    },
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
  async dropVoicemail(callControlId: string, assetId: string): Promise<void> {
    const asset = await this.assetRepo.findById(assetId);
    if (!asset) {
      throw new NotFoundException("Voicemail asset not found");
    }

    await this.telephonyService.playbackStart(callControlId, asset.fileUrl);
    this.logger.log(
      `Voicemail drop initiated on call ${callControlId} with asset ${assetId}`,
    );

    // Inbox timeline event (best-effort).
    try {
      const call = await this.callRepo.findByControlId(callControlId);
      if (call?.userId) {
        const ringeeNumber =
          call.direction === "outbound" ? call.fromNumber : call.toNumber;
        const participantNumber =
          call.direction === "outbound" ? call.toNumber : call.fromNumber;
        await this.inboxTimelineService.appendVoiceDropEvent({
          ctx: { userId: call.userId, organizationId: call.organizationId },
          callId: call.id,
          voicemailDropAssetId: asset.id,
          ringeeNumber,
          participantNumber,
          contactId: call.contactId ?? null,
          assetName: asset.name,
          audioUrl: asset.fileUrl,
          durationSec: asset.durationSec ?? null,
        });
      }
    } catch (err) {
      this.logger.warn(
        `Inbox appendVoiceDropEvent failed: ${(err as Error).message}`,
      );
    }
  }
}
