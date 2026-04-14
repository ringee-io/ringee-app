import { Injectable, Logger } from "@nestjs/common";
import { UserActivitySnapshotRepository } from "@ringee/database";
import { TriggerLoopEventPublisher } from "./triggerloop-event-publisher.service";

/**
 * Tracks user activity transitions and emits the corresponding TriggerLoop
 * events — once and only once per transition.
 *
 *  • call.firstCompleted — emitted the first time a user completes a call.
 *    Uses `firstCallEmittedAt` to guard against re-emission on replay.
 *
 *  • user.becameActive — emitted when a user makes a call and their last
 *    inactive notification had already been sent (i.e. they were "inactive"
 *    in TriggerLoop's view). Cleared when `lastInactiveEmittedAt` is null,
 *    because in that state TriggerLoop never marked them inactive.
 *
 * Both are transition-only: calling this method twice for the same user in
 * the same state produces exactly one event.
 */
@Injectable()
export class TriggerLoopActivityService {
  private readonly logger = new Logger(TriggerLoopActivityService.name);

  constructor(
    private readonly snapshots: UserActivitySnapshotRepository,
    private readonly publisher: TriggerLoopEventPublisher,
  ) {}

  /**
   * Call this whenever a user completes a call (status = completed /
   * call.hangup with a connected leg). Safe to call on every call hangup —
   * the transition guard inside is idempotent.
   */
  async onCallCompleted(userId: string, callId: string): Promise<void> {
    const now = new Date();

    try {
      const snapshot = await this.snapshots.findByUserId(userId);

      const isFirstCall = !snapshot?.firstCallCompletedAt;
      const wasInactive = !!snapshot?.lastInactiveEmittedAt;

      // Update the snapshot: always touch lastActiveAt; set
      // firstCallCompletedAt only on the first call.
      await this.snapshots.upsert(userId, {
        lastActiveAt: now,
        ...(isFirstCall ? { firstCallCompletedAt: now } : {}),
        // Clear the inactive sentinel so the next inactivity sweep picks up
        // a fresh window starting from now.
        lastInactiveEmittedAt: null,
      });

      // Emit first-call event (once).
      if (isFirstCall && !snapshot?.firstCallEmittedAt) {
        await this.snapshots.upsert(userId, { firstCallEmittedAt: now });
        await this.publisher.firstCallCompleted(userId, callId);
        this.logger.log(`call.firstCompleted emitted for user ${userId}`);
      }

      // Emit becameActive only if TriggerLoop had marked them inactive.
      if (wasInactive) {
        await this.publisher.userBecameActive(userId);
        this.logger.log(`user.becameActive emitted for user ${userId}`);
      }
    } catch (err) {
      // Best-effort: a DB hiccup must not break the call completion path.
      this.logger.warn(
        `Activity tracking failed for user ${userId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
