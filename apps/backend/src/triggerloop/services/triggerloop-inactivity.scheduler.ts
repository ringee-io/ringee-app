import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";
import { UserActivitySnapshotRepository } from "@ringee/database";
import { TriggerLoopEventPublisher } from "./triggerloop-event-publisher.service";

/**
 * How long a user must be silent before we emit `user.inactive`.
 * Mirrors the first delay in reactivationFollowup so the workflow fires
 * shortly after the inactivity event arrives.
 */
const INACTIVITY_THRESHOLD_MS = 7 * 24 * 60 * 60_000; // 7 days

/** How many inactive candidates to process per tick. */
const BATCH_SIZE = 100;

/** How often to check for newly-inactive users. */
const CHECK_INTERVAL_MS = 10 * 60_000; // every 10 minutes

/**
 * Periodically scans `UserActivitySnapshot` for users who crossed the
 * inactivity threshold since we last emitted `user.inactive` for them.
 *
 * Transition semantics (no spam):
 *   - `lastInactiveEmittedAt` is null  → eligible to be notified
 *   - After emission, set `lastInactiveEmittedAt = now` so the next scan
 *     skips them.
 *   - When the user makes a call, `TriggerLoopActivityService.onCallCompleted`
 *     clears `lastInactiveEmittedAt` back to null, so the next inactivity
 *     period opens a fresh window.
 *
 * The inactivity event starts the `reactivationFollowup` workflow in
 * TriggerLoop. Calling `user.becameActive` later will close that workflow
 * via the evaluator's `signals.active` check.
 */
@Injectable()
export class TriggerLoopInactivityScheduler
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(TriggerLoopInactivityScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly snapshots: UserActivitySnapshotRepository,
    private readonly publisher: TriggerLoopEventPublisher,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), CHECK_INTERVAL_MS);
    this.logger.log("TriggerLoop inactivity scheduler started");
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.checkInactiveUsers();
    } catch (err) {
      this.logger.error(
        `Inactivity scan error: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      this.running = false;
    }
  }

  private async checkInactiveUsers() {
    const threshold = new Date(Date.now() - INACTIVITY_THRESHOLD_MS);

    const candidates = await this.snapshots.findInactiveCandidates({
      threshold,
      limit: BATCH_SIZE,
    });

    if (candidates.length === 0) return;

    this.logger.debug(
      `Inactivity scan: ${candidates.length} candidate(s) found`,
    );

    for (const snap of candidates) {
      try {
        // Mark before publishing so a crash between the two doesn't re-emit.
        await this.snapshots.upsert(snap.userId, {
          lastInactiveEmittedAt: new Date(),
        });
        // Publishing user.inactive is sufficient: the seed wires
        // reactivationFollowup as triggerEvent='user.inactive', so TriggerLoop
        // starts the workflow on the events endpoint. A second startWorkflow
        // call would always 409 against allowMultipleActiveInstances=false.
        await this.publisher.userInactive(snap.userId, snap.lastActiveAt!);
      } catch (err) {
        this.logger.warn(
          `Failed to emit inactivity for user ${snap.userId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }
}
