import { Injectable, Logger } from "@nestjs/common";
import { AiVoiceAgentCallDispatchRepository } from "@ringee/database";
import { DISPATCH_CLAIM_LEASE_MS } from "../voice-agents/voice-agent-call.service";
import { DispatchAlertService } from "./dispatch-alert.service";
import { DispatchStatsService } from "./dispatch-stats.service";

export interface DispatchMaintenanceSummary {
  flushedHours: number | null;
  expired: number | null;
  alerts: number | null;
}

/**
 * The books of outbound pacing, kept once a minute from the orchestrator: the
 * hours' counters flushed to PostgreSQL, what waited too long expired, and the
 * alerts evaluated. Each step stands alone — a missing table or a Redis outage
 * stops that step, not the others — and the next run is the retry.
 */
@Injectable()
export class DispatchMaintenanceService {
  private readonly logger = new Logger(DispatchMaintenanceService.name);
  private readonly lastWarned = new Map<string, number>();

  constructor(
    private readonly stats: DispatchStatsService,
    private readonly alerts: DispatchAlertService,
    private readonly dispatches: AiVoiceAgentCallDispatchRepository,
  ) {}

  async run(nowMs = Date.now()): Promise<DispatchMaintenanceSummary> {
    const summary: DispatchMaintenanceSummary = {
      flushedHours: null,
      expired: null,
      alerts: null,
    };
    summary.flushedHours = await this.step(
      "rollup",
      async () => (await this.stats.rollup(nowMs)).flushed,
    );
    summary.expired = await this.step(
      "expiry",
      async () =>
        (
          await this.dispatches.expireDue(
            new Date(nowMs),
            DISPATCH_CLAIM_LEASE_MS,
          )
        ).length,
    );
    summary.alerts = await this.step(
      "alerts",
      async () => (await this.alerts.evaluate(nowMs)).length,
    );
    return summary;
  }

  /** A failing step is reported once an hour, never as a failed schedule tick. */
  private async step<T>(
    name: string,
    work: () => Promise<T>,
  ): Promise<T | null> {
    try {
      return await work();
    } catch (error) {
      const now = Date.now();
      if (now - (this.lastWarned.get(name) ?? 0) > 3_600_000) {
        this.lastWarned.set(name, now);
        this.logger.warn(
          `Dispatch maintenance step "${name}" failed (will retry): ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return null;
    }
  }
}
