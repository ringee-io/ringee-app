import { Injectable, Logger } from "@nestjs/common";
import {
  UploadFactory,
  CryptoService,
  TelephonyService,
} from "@ringee/platform";
import { RecordingService, CallService } from "@ringee/services";
import { UserRepository, OrganizationRepository } from "@ringee/database";

@Injectable()
export class WorkerService {
  private readonly logger = new Logger(WorkerService.name);
  private readonly uploadService = UploadFactory.createStorage();

  constructor(
    private readonly cryptoService: CryptoService,
    private readonly recordingService: RecordingService,
    private readonly callService: CallService,
    private readonly telephonyService: TelephonyService,
    private readonly userRepository: UserRepository,
    private readonly organizationRepository: OrganizationRepository,
  ) { }

  async handleEvent(job: any) {
    this.logger.log(`Handling event type: ${job.type}`);

    switch (job.type) {
      case "process_call_recording":
        await this.processCallRecording(job.data)
        break;
      default:
        this.logger.warn(`Unknown job type: ${job.type}`);
    }
  }

  /**
   * Get the encryption key for a call based on its ownership.
   * If the call belongs to an organization, use the organization's key.
   * Otherwise, use the user's personal key.
   */
  private async getEncryptionKey(call: {
    userId: string | null;
    organizationId: string | null;
  }): Promise<string> {
    // If call has an organization, use the organization's key
    if (call.organizationId) {
      const org = await this.organizationRepository.findById(call.organizationId);
      if (org?.encryptionKey) {
        return org.encryptionKey;
      }
      this.logger.warn(`Organization ${call.organizationId} has no encryption key`);
    }

    // Otherwise, use the user's personal key
    if (call.userId) {
      const user = await this.userRepository.findById(call.userId);
      if (user?.encryptionKey) {
        return user.encryptionKey;
      }
      this.logger.warn(`User ${call.userId} has no encryption key`);
    }

    // Fallback: This should not happen in production
    throw new Error("No encryption key found for call");
  }

  private async processCallRecording(data: {
    callControlId: string;
    recording: {
      publicUrl: string;
      privateUrl: string;
      recordingStartedAt: string;
      recordingEndedAt: string;
    };
  }) {
    try {
      const call = await this.callService.findByControlId(data.callControlId);

      if (!call) {
        this.logger.error(
          `Call not found for control ID: ${data.callControlId}`,
        );
        return;
      }

      const arrayBuffer = await this.telephonyService.downloadRecording(
        data.recording.publicUrl || data.recording.privateUrl,
      );

      if (!arrayBuffer) {
        this.logger.error("Failed to download recording");
        return;
      }

      // Get the appropriate encryption key
      const encryptionKey = await this.getEncryptionKey({
        userId: call.userId,
        organizationId: call.organizationId,
      });

      const buffer = Buffer.from(arrayBuffer);
      const encryptedBuffer = this.cryptoService.encryptBuffer(buffer, encryptionKey);

      // Store recordings in organization or user folder based on ownership
      const ownerFolder = call.organizationId
        ? `organizations/${call.organizationId}`
        : `users/${call.userId}`;
      const filename = `${ownerFolder}/recordings/${call.id}/${Date.now()}.bin`;

      const newUrl = await this.uploadService.uploadBuffer(
        filename,
        encryptedBuffer,
        "application/octet-stream",
        "bin",
      );

      const recordings = await this.recordingService.findRecordingsByCallId(
        call.id,
      );

      const processingRecording = recordings.find(
        (recording) => recording.status !== "completed",
      );

      if (processingRecording) {
        await this.recordingService.updateRecording(processingRecording.id, {
          url: newUrl,
          format: "mp3",
          status: "completed",
        });
      } else {
        await this.recordingService.createRecording({
          callId: call.id,
          url: newUrl,
          format: "mp3",
          status: "completed",
        });
      }

      this.logger.log(`Recording saved for call ${call.id} with encryption`);
    } catch (error) {
      this.logger.error("Error processing recording:", error);
      throw error;
    }
  }
}
