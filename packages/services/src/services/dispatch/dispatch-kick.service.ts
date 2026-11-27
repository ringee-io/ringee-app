import { Injectable, Logger, Optional } from "@nestjs/common";
import { OrchestratorService, RedisService } from "@ringee/platform";

/**
 * Wakes the queue's pump now instead of at its next scheduled tick (CPS-006).
 *
 * A separate class on purpose: the service that enqueues a call and the service
 * that dispatches it depend on each other's work, and this is the only thing
 * the first needs from the second. Best effort and never throws — the pump also
 * runs on a schedule, so a lost kick costs seconds, not a call.
 */
@Injectable()
export class DispatchKickService {
  private readonly logger = new Logger(DispatchKickService.name);

  constructor(
    @Optional() private readonly redis?: RedisService,
    @Optional() private readonly orchestrator?: OrchestratorService,
  ) {}

  /** At most one wake-up a second, across every API replica. */
  async kick(): Promise<void> {
    if (!this.orchestrator) return;
    try {
      const fresh = this.redis
        ? await this.redis.setIfAbsent("ringee:dispatch:kick", "1", 1)
        : true;
      if (!fresh) return;
      await this.orchestrator.triggerDispatchQueue("enqueue");
    } catch (error) {
      this.logger.debug(
        `Could not wake the dispatch queue: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
