import { Logger, type INestApplicationContext } from "@nestjs/common";
import {
  AgentSessionService,
  CallbackService,
  CallerIdRotationService,
  CrmBulkSyncService,
  CrmSyncService,
  CustomIntegrationDeliveryService,
  EnrichmentDrainService,
  NumberPurchasedService,
  PipelineRunService,
  RecordingProcessingService,
  ReminderService,
  RetryEngine,
  StaleCallSweeperService,
  TranscriptionService,
} from "@ringee/services";
import { CampaignLeadRepository, CampaignRepository } from "@ringee/database";
import type {
  ProcessCallRecordingInput,
  TranscribeRecordingInput,
} from "@ringee/platform";

const CRM_DRAIN_BATCH_SIZE = 25;
const ENRICHMENT_DRAIN_BATCH_SIZE = 25;
const CUSTOM_INTEGRATIONS_DRAIN_BATCH_SIZE = 25;

/**
 * Builds the Temporal activities object, closing over services resolved from
 * the NestJS application context. Activities run in the normal Node runtime
 * (no determinism constraints) — all durability/retry semantics come from the
 * workflows that invoke them.
 */
export function createActivities(app: INestApplicationContext) {
  const logger = new Logger("TemporalActivities");

  const recordingProcessor = app.get(RecordingProcessingService);
  const transcriptionService = app.get(TranscriptionService);
  const retryEngine = app.get(RetryEngine);
  const callbackService = app.get(CallbackService);
  const agentSessionService = app.get(AgentSessionService);
  const campaignRepo = app.get(CampaignRepository);
  const campaignLeadRepo = app.get(CampaignLeadRepository);
  const crmSyncService = app.get(CrmSyncService);
  const crmBulkSyncService = app.get(CrmBulkSyncService);
  const enrichmentDrainService = app.get(EnrichmentDrainService);
  const reminderService = app.get(ReminderService);
  const customIntegrationsDelivery = app.get(CustomIntegrationDeliveryService);
  const numberPurchasedService = app.get(NumberPurchasedService);
  const pipelineRunService = app.get(PipelineRunService);
  const callerIdRotationService = app.get(CallerIdRotationService);
  const staleCallSweeper = app.get(StaleCallSweeperService);

  return {
    // ── Event-driven jobs (started by the backend via OrchestratorService) ──

    async processCallRecording(input: ProcessCallRecordingInput) {
      await recordingProcessor.processCallRecording(input);
    },

    async transcribeRecording(input: TranscribeRecordingInput) {
      await transcriptionService.runRecordingTranscription(input.callId);
    },

    // ── Periodic jobs (fired by Temporal Schedules — see schedules.ts) ──

    async runRetryQueue() {
      const count = await retryEngine.processRetryQueue();
      if (count > 0) logger.debug(`RetryScheduler: ${count} leads re-queued`);
    },

    async processDueCallbacks() {
      const count = await callbackService.processDueCallbacks();
      if (count > 0)
        logger.debug(`CallbackScheduler: ${count} callbacks processed`);
    },

    async cleanupStaleSessions() {
      const count = await agentSessionService.cleanupStaleSessions();
      if (count > 0)
        logger.debug(`HeartbeatCheck: ${count} stale sessions cleaned`);
    },

    async checkCampaignCompletion() {
      const activeCampaigns = await campaignRepo.findAllActive();
      let count = 0;

      for (const campaign of activeCampaigns) {
        const allTerminal = await campaignLeadRepo.allLeadsTerminal(
          campaign.id,
        );
        if (allTerminal && campaign._count.leads > 0) {
          await campaignRepo.updateStatus(campaign.id, "completed");
          count++;
          logger.log(
            `Campaign ${campaign.id} auto-completed — all leads terminal`,
          );
        }
      }

      if (count > 0)
        logger.debug(`CompletionCheck: ${count} campaigns completed`);
    },

    async drainCrm() {
      const count = await crmSyncService.drain(CRM_DRAIN_BATCH_SIZE);
      if (count > 0) logger.debug(`CrmDrain: ${count} outbox events processed`);
    },

    async crmBulkSync() {
      await crmBulkSyncService.syncAllActiveConnections();
    },

    async drainEnrichment() {
      const count = await enrichmentDrainService.drain(
        ENRICHMENT_DRAIN_BATCH_SIZE,
      );
      if (count > 0) logger.debug(`EnrichmentDrain: ${count} jobs processed`);
    },

    async processDueReminders() {
      const count = await reminderService.processDuePending();
      if (count > 0)
        logger.debug(`ReminderScheduler: ${count} reminders dispatched`);
    },

    async drainCustomIntegrations() {
      const count = await customIntegrationsDelivery.drain(
        CUSTOM_INTEGRATIONS_DRAIN_BATCH_SIZE,
      );
      if (count > 0)
        logger.debug(`CustomIntegrationsDrain: ${count} deliveries processed`);
    },

    async reconcileNumberVerifications() {
      const count =
        await numberPurchasedService.reconcilePendingVerifications();
      if (count > 0)
        logger.debug(`NumberVerification: ${count} numbers transitioned`);
    },

    async runDuePipelines() {
      const count = await pipelineRunService.runDueScheduled();
      if (count > 0)
        logger.debug(`PipelineScheduler: ${count} pipeline runs triggered`);
    },

    async sweepStaleCalls() {
      const closed = await staleCallSweeper.sweep();
      if (closed > 0)
        logger.warn(
          `StaleCallSweep: closed ${closed} calls with no hangup event — their owners were blocked from dialing`,
        );
    },

    async recomputeCallerIdHealth() {
      const { evaluated, cooled, recovered } =
        await callerIdRotationService.recomputeHealth();
      if (cooled > 0 || recovered > 0)
        logger.debug(
          `CallerIdHealth: evaluated ${evaluated}, cooled ${cooled}, recovered ${recovered}`,
        );
    },
  };
}

export type Activities = ReturnType<typeof createActivities>;
