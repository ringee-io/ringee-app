import { Logger } from "@nestjs/common";
import {
  Client,
  ScheduleAlreadyRunning,
  ScheduleOverlapPolicy,
} from "@temporalio/client";
import type { Duration } from "@temporalio/common";
import { WORKFLOW_NAMES, WorkflowName } from "@ringee/platform";

interface ScheduleDef {
  id: string;
  workflow: WorkflowName;
  /** Interval between runs, e.g. "30s", "15m". */
  every: Duration;
  /**
   * After downtime, missed runs inside this window are executed on recovery
   * (collapsed to one by the SKIP overlap policy) — this is what guarantees
   * the pollers catch up instead of silently losing ticks.
   */
  catchupWindow: Duration;
}

/**
 * Replaces the old worker's setInterval pollers. Cadence notes: the three
 * outbox drains ran every 5s as setIntervals; as Schedules they run every 15s
 * to keep workflow-history volume reasonable on a self-hosted cluster (they
 * drain 25 items per tick, so worst-case added latency is ~10s).
 */
const SCHEDULES: ScheduleDef[] = [
  {
    id: "ringee.retry-scheduler",
    workflow: WORKFLOW_NAMES.retryScheduler,
    every: "30s",
    catchupWindow: "1m",
  },
  {
    id: "ringee.callback-scheduler",
    workflow: WORKFLOW_NAMES.callbackScheduler,
    every: "30s",
    catchupWindow: "1m",
  },
  {
    id: "ringee.heartbeat-check",
    workflow: WORKFLOW_NAMES.heartbeatCheck,
    every: "15s",
    catchupWindow: "1m",
  },
  {
    id: "ringee.campaign-completion-check",
    workflow: WORKFLOW_NAMES.campaignCompletionCheck,
    every: "1m",
    catchupWindow: "2m",
  },
  {
    id: "ringee.crm-drain",
    workflow: WORKFLOW_NAMES.crmDrain,
    every: "15s",
    catchupWindow: "1m",
  },
  {
    id: "ringee.crm-bulk-sync",
    workflow: WORKFLOW_NAMES.crmBulkSync,
    every: "30m",
    catchupWindow: "10m",
  },
  {
    id: "ringee.enrichment-drain",
    workflow: WORKFLOW_NAMES.enrichmentDrain,
    every: "15s",
    catchupWindow: "1m",
  },
  {
    id: "ringee.reminder-scheduler",
    workflow: WORKFLOW_NAMES.reminderScheduler,
    every: "30s",
    catchupWindow: "1m",
  },
  {
    id: "ringee.custom-integrations-drain",
    workflow: WORKFLOW_NAMES.customIntegrationsDrain,
    every: "15s",
    catchupWindow: "1m",
  },
  {
    // Carriers review regulatory documents over hours/days, so a slow cadence
    // is plenty; this reconciles pending number orders → approved/rejected.
    id: "ringee.number-verification-check",
    workflow: WORKFLOW_NAMES.numberVerificationCheck,
    every: "5m",
    catchupWindow: "30m",
  },
  {
    // AI pipeline batch cadence. The per-(pipeline,context) gating (every 4h OR
    // 25 new eligible, min 5) is decided inside PipelineRunService; the poller
    // just ticks often enough to honor that without much lag.
    id: "ringee.ai-pipeline-scheduler",
    workflow: WORKFLOW_NAMES.pipelineScheduler,
    every: "15m",
    catchupWindow: "1h",
  },
  {
    // Recompute caller-ID health scores from a moving window and apply
    // active⇄cooling transitions. Reputation moves slowly, so a 30m cadence is
    // plenty and keeps workflow-history volume low.
    id: "ringee.caller-id-health",
    workflow: WORKFLOW_NAMES.callerIdHealthRecompute,
    every: "30m",
    catchupWindow: "1h",
  },
];

/**
 * Idempotently converge Temporal Schedules to the table above. Existing
 * schedules are updated in place (preserving run history and pause state), so
 * cadence changes take effect on the next deploy without manual cleanup.
 */
export async function ensureSchedules(
  client: Client,
  taskQueue: string,
): Promise<void> {
  const logger = new Logger("TemporalSchedules");

  for (const def of SCHEDULES) {
    const action = {
      type: "startWorkflow" as const,
      workflowType: def.workflow,
      taskQueue,
      args: [] as unknown[],
    };
    const spec = { intervals: [{ every: def.every }] };
    const policies = {
      overlap: ScheduleOverlapPolicy.SKIP,
      catchupWindow: def.catchupWindow,
    };

    try {
      await client.schedule.create({
        scheduleId: def.id,
        action,
        spec,
        policies,
      });
      logger.log(`Schedule created: ${def.id} (every ${def.every})`);
    } catch (err) {
      if (err instanceof ScheduleAlreadyRunning) {
        const handle = client.schedule.getHandle(def.id);
        await handle.update((prev) => ({
          ...prev,
          action: { ...prev.action, ...action },
          spec,
          policies: { ...prev.policies, ...policies },
        }));
        logger.log(`Schedule updated: ${def.id} (every ${def.every})`);
      } else {
        throw err;
      }
    }
  }
}
