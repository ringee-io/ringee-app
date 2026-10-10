/**
 * Temporal workflow definitions. This file is bundled into Temporal's
 * deterministic sandbox (see workflowsPath in main.ts), so it must only use
 * `@temporalio/workflow` plus TYPE-ONLY imports — type imports are erased at
 * compile time and never reach the bundle. Do NOT add runtime imports of
 * NestJS, @ringee/* values, or any Node API here.
 *
 * Exported function names MUST match WORKFLOW_NAMES in
 * packages/platform/src/temporal/contracts.ts — main.ts asserts this on boot.
 */
import { proxyActivities } from "@temporalio/workflow";
import type { Activities } from "./activities";
import type {
  ProcessCallRecordingInput,
  ReviewDemoRequestInput,
  TranscribeRecordingInput,
} from "@ringee/platform";

/** Recording pipeline: download + upload can take a while; retry transient failures. */
const recordingJobs = proxyActivities<Activities>({
  startToCloseTimeout: "5 minutes",
  retry: {
    initialInterval: "5s",
    backoffCoefficient: 2,
    maximumInterval: "1 minute",
    maximumAttempts: 5,
  },
});

/** Deepgram pre-recorded transcription of long calls can be slow. */
const transcriptionJobs = proxyActivities<Activities>({
  startToCloseTimeout: "10 minutes",
  retry: { maximumAttempts: 3 },
});

/**
 * Periodic drains/pollers: a single attempt per schedule tick — the next tick
 * is the retry (combined with the schedules' SKIP overlap policy this also
 * replaces the old in-flight guards).
 *
 * The timeout must cover the drains' real worst case: outbox drains deliver
 * HTTP webhooks/API calls with a 15s per-request timeout over batches of up to
 * 100, so a batch full of dead endpoints can legitimately take several minutes.
 */
const periodicJobs = proxyActivities<Activities>({
  startToCloseTimeout: "8 minutes",
  retry: { maximumAttempts: 1 },
});

/**
 * AI pipeline runs may need to semantically analyze a historical backlog of
 * complete call transcripts. Keep this separate from the short pollers so the
 * durable per-call claims are not interrupted by their eight-minute timeout.
 */
const intelligenceJobs = proxyActivities<Activities>({
  startToCloseTimeout: "1 hour",
  retry: { maximumAttempts: 1 },
});

/** Full CRM bulk sync iterates every active connection. */
const bulkJobs = proxyActivities<Activities>({
  startToCloseTimeout: "25 minutes",
  retry: { maximumAttempts: 1 },
});

/**
 * Handing work to a person is the last resort, so it must eventually happen:
 * no attempt cap, at most an hour apart. An email or database outage delays
 * the alert instead of losing it — the step is idempotent, so retrying it for
 * as long as the outage lasts costs nothing.
 */
const handoffJobs = proxyActivities<Activities>({
  startToCloseTimeout: "2 minutes",
  retry: {
    initialInterval: "30s",
    backoffCoefficient: 2,
    maximumInterval: "1 hour",
  },
});

// ── Event-driven workflows (started by the backend) ──

export async function processCallRecordingWorkflow(
  input: ProcessCallRecordingInput,
): Promise<void> {
  await recordingJobs.processCallRecording(input);
}

export async function transcribeRecordingWorkflow(
  input: TranscribeRecordingInput,
): Promise<void> {
  await transcriptionJobs.transcribeRecording(input);
}

/**
 * Demo-request review (LIFE-004). Its steps are short calls to the AI
 * provider, the requester's website, Clerk and the email provider, so it takes
 * the recording pipeline's retry policy for transient failures. Each step is
 * guarded by the request's own state, so a retry resumes instead of repeating.
 * When retries run out, the request is handed to the team — retried until it
 * is (`handoffJobs`).
 */
export async function reviewDemoRequestWorkflow(
  input: ReviewDemoRequestInput,
): Promise<void> {
  try {
    await recordingJobs.reviewDemoRequest(input);
  } catch (error) {
    await handoffJobs.escalateDemoRequest({
      demoRequestId: input.demoRequestId,
      reason: activityFailureReason(error),
    });
  }
}

/** The activity's own error, rather than Temporal's "Activity task failed". */
function activityFailureReason(error: unknown): string {
  const failure = error as { message?: string; cause?: { message?: string } };
  return failure.cause?.message || failure.message || "Unknown error";
}

// ── Scheduled workflows (fired by Temporal Schedules) ──

export async function retrySchedulerWorkflow(): Promise<void> {
  await periodicJobs.runRetryQueue();
}

export async function callbackSchedulerWorkflow(): Promise<void> {
  await periodicJobs.processDueCallbacks();
}

export async function heartbeatCheckWorkflow(): Promise<void> {
  await periodicJobs.cleanupStaleSessions();
}

export async function campaignCompletionCheckWorkflow(): Promise<void> {
  await periodicJobs.checkCampaignCompletion();
}

export async function crmDrainWorkflow(): Promise<void> {
  await periodicJobs.drainCrm();
}

export async function crmBulkSyncWorkflow(): Promise<void> {
  await bulkJobs.crmBulkSync();
}

export async function enrichmentDrainWorkflow(): Promise<void> {
  await periodicJobs.drainEnrichment();
}

export async function reminderSchedulerWorkflow(): Promise<void> {
  await periodicJobs.processDueReminders();
}

export async function customIntegrationsDrainWorkflow(): Promise<void> {
  await periodicJobs.drainCustomIntegrations();
}

export async function numberVerificationCheckWorkflow(): Promise<void> {
  await periodicJobs.reconcileNumberVerifications();
}

export async function pipelineSchedulerWorkflow(): Promise<void> {
  await intelligenceJobs.runDuePipelines();
}

export async function callerIdHealthRecomputeWorkflow(): Promise<void> {
  await periodicJobs.recomputeCallerIdHealth();
}

export async function staleCallSweepWorkflow(): Promise<void> {
  await periodicJobs.sweepStaleCalls();
}

export async function voiceAgentSweepWorkflow(): Promise<void> {
  await periodicJobs.sweepVoiceAgents();
}

export async function mcpUsagePruneWorkflow(): Promise<void> {
  await periodicJobs.pruneMcpUsage();
}
