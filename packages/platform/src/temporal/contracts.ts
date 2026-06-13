/**
 * Shared Temporal contracts between the backend (client side, via
 * OrchestratorService) and apps/orchestrator (worker side).
 *
 * IMPORTANT: this file must stay dependency-free (no imports at all). The
 * orchestrator's deterministic workflow bundle pulls these types/constants in
 * via type-only imports, so nothing here may drag NestJS, reflect-metadata or
 * any other runtime dependency into the workflow sandbox.
 */

export interface ProcessCallRecordingInput {
  callControlId: string;
  recording: {
    publicUrl: string;
    privateUrl: string;
    recordingStartedAt: string;
    recordingEndedAt: string;
  };
}

export interface TranscribeRecordingInput {
  callId: string;
  manual?: boolean;
}

/**
 * Workflow type names as registered on the task queue. The values MUST match
 * the exported function names in apps/orchestrator/src/temporal/workflows.ts —
 * the orchestrator asserts this at startup.
 */
export const WORKFLOW_NAMES = {
  processCallRecording: "processCallRecordingWorkflow",
  transcribeRecording: "transcribeRecordingWorkflow",
  retryScheduler: "retrySchedulerWorkflow",
  callbackScheduler: "callbackSchedulerWorkflow",
  heartbeatCheck: "heartbeatCheckWorkflow",
  campaignCompletionCheck: "campaignCompletionCheckWorkflow",
  crmDrain: "crmDrainWorkflow",
  crmBulkSync: "crmBulkSyncWorkflow",
  enrichmentDrain: "enrichmentDrainWorkflow",
  reminderScheduler: "reminderSchedulerWorkflow",
  customIntegrationsDrain: "customIntegrationsDrainWorkflow",
  numberVerificationCheck: "numberVerificationCheckWorkflow",
} as const;

export type WorkflowName = (typeof WORKFLOW_NAMES)[keyof typeof WORKFLOW_NAMES];
