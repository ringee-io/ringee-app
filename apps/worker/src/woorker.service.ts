import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import {
  UploadFactory,
  CryptoService,
  TelephonyService,
} from "@ringee/platform";
import {
  RecordingService,
  CallService,
  RetryEngine,
  CallbackService,
  AgentSessionService,
  CrmSyncService,
  CrmBulkSyncService,
  CrmCallLogService,
  EnrichmentDrainService,
} from "@ringee/services";
import {
  UserRepository,
  OrganizationRepository,
  CampaignLeadRepository,
  CampaignRepository,
  PublicRecordingRepository,
} from "@ringee/database";

const RETRY_INTERVAL_MS = 30_000; // 30 seconds
const CALLBACK_INTERVAL_MS = 30_000; // 30 seconds
const HEARTBEAT_CHECK_INTERVAL_MS = 15_000; // 15 seconds
const COMPLETION_CHECK_INTERVAL_MS = 60_000; // 60 seconds
const CRM_DRAIN_INTERVAL_MS = 5_000; // 5 seconds
const CRM_DRAIN_BATCH_SIZE = 25;
const CRM_BULK_SYNC_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const ENRICHMENT_DRAIN_INTERVAL_MS = 5_000; // 5 seconds
const ENRICHMENT_DRAIN_BATCH_SIZE = 25;

@Injectable()
export class WorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerService.name);
  private readonly uploadService = UploadFactory.createStorage();
  private schedulerTimers: NodeJS.Timeout[] = [];

  constructor(
    private readonly cryptoService: CryptoService,
    private readonly recordingService: RecordingService,
    private readonly callService: CallService,
    private readonly telephonyService: TelephonyService,
    private readonly userRepository: UserRepository,
    private readonly organizationRepository: OrganizationRepository,
    private readonly retryEngine: RetryEngine,
    private readonly callbackService: CallbackService,
    private readonly agentSessionService: AgentSessionService,
    private readonly campaignLeadRepo: CampaignLeadRepository,
    private readonly campaignRepo: CampaignRepository,
    private readonly crmSyncService: CrmSyncService,
    private readonly crmLogService: CrmCallLogService,
    private readonly crmBulkSyncService: CrmBulkSyncService,
    private readonly publicRecordingRepo: PublicRecordingRepository,
    private readonly enrichmentDrainService: EnrichmentDrainService,
  ) { }

  onModuleInit() {
    this.startSchedulers();
  }

  onModuleDestroy() {
    this.stopSchedulers();
  }

  private startSchedulers() {
    this.schedulerTimers.push(
      setInterval(() => this.runRetryScheduler(), RETRY_INTERVAL_MS),
      setInterval(() => this.runCallbackScheduler(), CALLBACK_INTERVAL_MS),
      setInterval(() => this.runHeartbeatCheck(), HEARTBEAT_CHECK_INTERVAL_MS),
      setInterval(() => this.runCompletionCheck(), COMPLETION_CHECK_INTERVAL_MS),
      setInterval(() => this.runCrmDrain(), CRM_DRAIN_INTERVAL_MS),
      setInterval(() => this.crmBulkSyncService.syncAllActiveConnections(), CRM_BULK_SYNC_INTERVAL_MS),
      setInterval(() => this.runEnrichmentDrain(), ENRICHMENT_DRAIN_INTERVAL_MS),
    );
    this.logger.log("Outbound schedulers started");
  }

  private stopSchedulers() {
    for (const timer of this.schedulerTimers) {
      clearInterval(timer);
    }
    this.schedulerTimers = [];
    this.logger.log("Outbound schedulers stopped");
  }

  private async runRetryScheduler() {
    try {
      const count = await this.retryEngine.processRetryQueue();
      if (count > 0) {
        this.logger.debug(`RetryScheduler: ${count} leads re-queued`);
      }
    } catch (err) {
      this.logger.error("RetryScheduler error:", err);
    }
  }

  private async runCallbackScheduler() {
    try {
      const count = await this.callbackService.processDueCallbacks();
      if (count > 0) {
        this.logger.debug(`CallbackScheduler: ${count} callbacks processed`);
      }
    } catch (err) {
      this.logger.error("CallbackScheduler error:", err);
    }
  }

  private async runHeartbeatCheck() {
    try {
      const count = await this.agentSessionService.cleanupStaleSessions();
      if (count > 0) {
        this.logger.debug(`HeartbeatCheck: ${count} stale sessions cleaned`);
      }
    } catch (err) {
      this.logger.error("HeartbeatCheck error:", err);
    }
  }

  private crmDrainInFlight = false;

  private async runCrmDrain() {
    if (this.crmDrainInFlight) return;
    this.crmDrainInFlight = true;
    try {
      const count = await this.crmSyncService.drain(CRM_DRAIN_BATCH_SIZE);
      if (count > 0) {
        this.logger.debug(`CrmDrain: ${count} outbox events processed`);
      }
    } catch (err) {
      this.logger.error("CrmDrain error:", err);
    } finally {
      this.crmDrainInFlight = false;
    }
  }

  private enrichmentDrainInFlight = false;

  private async runEnrichmentDrain() {
    if (this.enrichmentDrainInFlight) return;
    this.enrichmentDrainInFlight = true;
    try {
      const count = await this.enrichmentDrainService.drain(ENRICHMENT_DRAIN_BATCH_SIZE);
      if (count > 0) {
        this.logger.debug(`EnrichmentDrain: ${count} jobs processed`);
      }
    } catch (err) {
      this.logger.error("EnrichmentDrain error:", err);
    } finally {
      this.enrichmentDrainInFlight = false;
    }
  }

  private async runCompletionCheck() {
    try {
      const activeCampaigns = await this.campaignRepo.findAllActive();
      let count = 0;

      for (const campaign of activeCampaigns) {
        const allTerminal = await this.campaignLeadRepo.allLeadsTerminal(campaign.id);
        if (allTerminal && campaign._count.leads > 0) {
          await this.campaignRepo.updateStatus(campaign.id, "completed");
          count++;
          this.logger.log(`Campaign ${campaign.id} auto-completed — all leads terminal`);
        }
      }

      if (count > 0) {
        this.logger.debug(`CompletionCheck: ${count} campaigns completed`);
      }
    } catch (err) {
      this.logger.error("CompletionCheck error:", err);
    }
  }

  async handleEvent(job: any) {
    this.logger.log(`Handling event type: ${job.type}`);

    switch (job.type) {
      case "process_call_recording":
        await this.processCallRecording(job.data)
        // await this. 
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

      const buffer = Buffer.from(arrayBuffer);

      // Store recordings in organization or user folder based on ownership
      const ownerFolder = call.organizationId
        ? `organizations/${call.organizationId}`
        : `users/${call.userId}`;
      const timestamp = Date.now();

      const publicUrl = await this.uploadService.uploadBuffer(
        `${ownerFolder}/recordings/${call.id}/public-${timestamp}.mp3`,
        buffer,
        "audio/mpeg",
        "mp3",
      );

      await this.publicRecordingRepo.create({ callId: call.id, url: publicUrl });

      await this.crmLogService.enqueueRecordingNote(call.id, publicUrl);

      const encryptionKey = await this.getEncryptionKey({
        userId: call.userId,
        organizationId: call.organizationId,
      });
      const encryptedBuffer = this.cryptoService.encryptBuffer(buffer, encryptionKey);

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

      this.logger.log(`Recording saved for call ${call.id} with encryption`);
    } catch (error) {
      this.logger.error("Error processing recording:", error);
      throw error;
    }
  }
}
