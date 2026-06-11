import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";
import { TriggerLoopOutboxService } from "./triggerloop-outbox.service";

const DRAIN_INTERVAL_MS = 15_000;
const BATCH_SIZE = 50;

/**
 * Periodically drains the TriggerLoop outbox. Runs in-process with the
 * backend on a plain setInterval — lightweight and fine for Ringee's scale.
 * If the platform later grows a dedicated job runner this can be moved
 * without changing the service it calls.
 */
@Injectable()
export class TriggerLoopOutboxScheduler
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(TriggerLoopOutboxScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private draining = false;

  constructor(private readonly outbox: TriggerLoopOutboxService) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), DRAIN_INTERVAL_MS);
    this.logger.log("TriggerLoop outbox scheduler started");
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick() {
    // Overlap-guard: a slow TriggerLoop could cause a prior drain to still
    // be in flight when the next interval fires. Skip this tick if so —
    // the reserved rows aren't due to be reclaimed until the window closes.
    if (this.draining) return;
    this.draining = true;
    try {
      const result = await this.outbox.drainOnce(BATCH_SIZE);
      if (result.processed > 0) {
        this.logger.debug(
          `Outbox drain: processed=${result.processed} sent=${result.sent} retried=${result.retried} dropped=${result.dropped}`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Outbox drain error: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      this.draining = false;
    }
  }
}
