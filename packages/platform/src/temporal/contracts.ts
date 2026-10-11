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

/** The automatic review of one demo request (LIFE-004). */
export interface ReviewDemoRequestInput {
  demoRequestId: string;
}

/** A demo request the review could not finish, handed to the team. */
export interface EscalateDemoRequestInput {
  demoRequestId: string;
  reason: string;
}

/**
 * Workflow type names as registered on the task queue. The values MUST match
 * the exported function names in apps/orchestrator/src/temporal/workflows.ts —
 * the orchestrator asserts this at startup.
 */
export const WORKFLOW_NAMES = {
  processCallRecording: "processCallRecordingWorkflow",
  transcribeRecording: "transcribeRecordingWorkflow",
  reviewDemoRequest: "reviewDemoRequestWorkflow",
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
  pipelineScheduler: "pipelineSchedulerWorkflow",
  callerIdHealthRecompute: "callerIdHealthRecomputeWorkflow",
  staleCallSweep: "staleCallSweepWorkflow",
  voiceAgentSweep: "voiceAgentSweepWorkflow",
  mcpUsagePrune: "mcpUsagePruneWorkflow",
} as const;

export type WorkflowName = (typeof WORKFLOW_NAMES)[keyof typeof WORKFLOW_NAMES];
