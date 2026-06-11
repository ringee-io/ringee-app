import { Injectable, Logger } from "@nestjs/common";
import {
  WorkflowExecutionAlreadyStartedError,
  WorkflowIdConflictPolicy,
  WorkflowIdReusePolicy,
} from "@temporalio/client";
import { apiConfiguration } from "@ringee/configuration";
import { TemporalClientService } from "./temporal-client.service";
import {
  ProcessCallRecordingInput,
  TranscribeRecordingInput,
  WORKFLOW_NAMES,
  WorkflowName,
} from "./contracts";

/**
 * Durable replacement for the old fire-and-forget Redis pub/sub WorkerService.
 * Starting a workflow persists it on the Temporal server before returning, so
 * jobs survive orchestrator downtime and execute when workers come back.
 *
 * Deterministic workflowIds dedupe webhook redeliveries:
 * - a redelivery while the workflow runs attaches to the existing run
 *   (USE_EXISTING conflict policy),
 * - a redelivery after success is rejected (ALLOW_DUPLICATE_FAILED_ONLY),
 * - a redelivery after a final failure starts a fresh attempt.
 */
@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger(OrchestratorService.name);

  constructor(private readonly temporalClient: TemporalClientService) {}

  async processCallRecording(data: ProcessCallRecordingInput): Promise<string> {
    return this.startWorkflow(
      WORKFLOW_NAMES.processCallRecording,
      `recording:${data.callControlId}:${data.recording.recordingEndedAt}`,
      [data],
    );
  }

  /**
   * Enqueue transcription of a finished call's recording. `manual`
   * distinguishes a user-triggered "Retranscribe from recording" (always runs,
   * unique workflowId) from the automatic path (deduped per call).
   */
  async processTranscribeRecording(
    data: TranscribeRecordingInput,
  ): Promise<string> {
    const workflowId = data.manual
      ? `transcribe:${data.callId}:manual:${Date.now()}`
      : `transcribe:${data.callId}`;
    return this.startWorkflow(WORKFLOW_NAMES.transcribeRecording, workflowId, [
      data,
    ]);
  }

  private async startWorkflow(
    workflowType: WorkflowName,
    workflowId: string,
    args: unknown[],
  ): Promise<string> {
    const client = await this.temporalClient.getClient();
    try {
      const handle = await client.workflow.start(workflowType, {
        workflowId,
        taskQueue: apiConfiguration.TEMPORAL_TASK_QUEUE,
        args,
        workflowIdReusePolicy:
          WorkflowIdReusePolicy.ALLOW_DUPLICATE_FAILED_ONLY,
        workflowIdConflictPolicy: WorkflowIdConflictPolicy.USE_EXISTING,
      });
      this.logger.debug(
        `Workflow started: ${workflowType} - ID: ${handle.workflowId}`,
      );
      return handle.workflowId;
    } catch (error) {
      if (error instanceof WorkflowExecutionAlreadyStartedError) {
        this.logger.debug(
          `Workflow deduped (already completed): ${workflowType} - ID: ${workflowId}`,
        );
        return workflowId;
      }
      this.logger.error(`Error starting workflow ${workflowType}:`, error);
      throw error;
    }
  }
}
