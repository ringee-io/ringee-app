import { Injectable, Logger } from "@nestjs/common";
import {
  CryptoService,
  ProcessCallRecordingInput,
  TelephonyService,
  UploadFactory,
} from "@ringee/platform";
import {
  OrganizationRepository,
  PublicRecordingRepository,
  UserRepository,
} from "@ringee/database";
import { CallService } from "./call.service";
import { RecordingService } from "./recording.service";
import { CrmCallLogService } from "./crm/crm-call-log.service";
import { CrmRecordingUploadService } from "./crm/crm-recording-upload.service";
import { TranscriptionService } from "./transcription/transcription.service";
import { CallRecordingSettingsService } from "./transcription/call-recording-settings.service";

/**
 * Downloads a finished call recording from Telnyx, stores a public mp3 copy,
 * encrypts and stores the private copy, links everything to the Call, and
 * kicks off CRM sync + optional auto-transcription.
 *
 * Runs as a Temporal activity (apps/orchestrator), so it may be retried after
 * a partial failure — the public-recording step is guarded to stay idempotent.
 */
@Injectable()
export class RecordingProcessingService {
  private readonly logger = new Logger(RecordingProcessingService.name);
  private readonly uploadService = UploadFactory.createStorage();

  constructor(
    private readonly cryptoService: CryptoService,
    private readonly telephonyService: TelephonyService,
    private readonly callService: CallService,
    private readonly recordingService: RecordingService,
    private readonly userRepository: UserRepository,
    private readonly organizationRepository: OrganizationRepository,
    private readonly publicRecordingRepo: PublicRecordingRepository,
    private readonly crmLogService: CrmCallLogService,
    private readonly crmRecordingUpload: CrmRecordingUploadService,
    private readonly transcriptionService: TranscriptionService,
    private readonly recordingSettingsService: CallRecordingSettingsService,
  ) {}

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
      const org = await this.organizationRepository.findById(
        call.organizationId,
      );
      if (org?.encryptionKey) {
        return org.encryptionKey;
      }
      this.logger.warn(
        `Organization ${call.organizationId} has no encryption key`,
      );
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

  async processCallRecording(data: ProcessCallRecordingInput): Promise<void> {
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

      const buffer = Buffer.from(arrayBuffer);

      // Store recordings in organization or user folder based on ownership
      const ownerFolder = call.organizationId
        ? `organizations/${call.organizationId}`
        : `users/${call.userId}`;
      const timestamp = Date.now();

      // Idempotency guard: a Temporal retry after a partial failure must not
      // duplicate the public recording row or the CRM note. If a public
      // recording for this call was already created after this recording
      // ended, a previous attempt got that far — reuse its URL.
      const existingPublic = await this.publicRecordingRepo.findLatestByCallId(
        call.id,
      );
      const recordingEndedAt = new Date(data.recording.recordingEndedAt);
      let publicUrl: string;

      if (existingPublic && existingPublic.createdAt >= recordingEndedAt) {
        publicUrl = existingPublic.url;
        this.logger.debug(
          `Public recording already exists for call ${call.id} — skipping re-create`,
        );
      } else {
        publicUrl = await this.uploadService.uploadBuffer(
          `${ownerFolder}/recordings/${call.id}/public-${timestamp}.mp3`,
          buffer,
          "audio/mpeg",
          "mp3",
        );

        await this.publicRecordingRepo.create({
          callId: call.id,
          url: publicUrl,
        });

        await this.crmLogService.enqueueRecordingNote(call.id, publicUrl);
      }

      const encryptionKey = await this.getEncryptionKey({
        userId: call.userId,
        organizationId: call.organizationId,
      });
      const encryptedBuffer = this.cryptoService.encryptBuffer(
        buffer,
        encryptionKey,
      );

      const filename = `${ownerFolder}/recordings/${call.id}/${timestamp}.bin`;

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

      // Best-effort: upload recording file to CRM
      try {
        const recId = processingRecording?.id ?? recordings[0]?.id ?? call.id;
        await this.crmRecordingUpload.enqueueRecordingUpload(
          call.id,
          recId,
          publicUrl,
        );
      } catch (uploadErr) {
        this.logger.debug(
          `Skipped CRM recording upload for call ${call.id}: ${(uploadErr as Error).message}`,
        );
      }

      this.logger.log(`Recording saved for call ${call.id} with encryption`);

      // Automatic transcription from recording: once recordingUrl exists, kick
      // off Deepgram pre-recorded transcription if the owner's settings ask for
      // it. transcribeFromRecording dedups against an existing realtime
      // transcript, so we never duplicate.
      try {
        const ctx = {
          userId: call.userId!,
          organizationId: call.organizationId,
        };
        const settings = await this.recordingSettingsService.resolve(ctx);
        if (settings.transcribeRecordings) {
          await this.transcriptionService.transcribeFromRecording(call, {
            manual: false,
          });
        }
      } catch (transcribeErr) {
        this.logger.warn(
          `Auto transcription enqueue failed for call ${call.id}: ${(transcribeErr as Error).message}`,
        );
      }
    } catch (error) {
      this.logger.error("Error processing recording:", error);
      throw error;
    }
  }
}
