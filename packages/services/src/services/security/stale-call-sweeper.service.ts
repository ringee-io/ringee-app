import { Injectable, Logger } from "@nestjs/common";
import { CallRepository } from "@ringee/database";
import {
  InboundRingService,
  STALLED_TRANSFER_MS,
} from "../inbound-routing/inbound-ring.service";
import { EXTERNAL_PRE_DIAL_TTL_MS } from "../external-carrier/external-carrier.service";
import {
  CONNECTED_SUSPECT_MS,
  ConcurrentCallGuardService,
  RINGING_SUSPECT_MS,
} from "./concurrent-call-guard.service";

/** Rows examined per tick. Keeps one sweep bounded on a noisy day. */
const SWEEP_BATCH_SIZE = 100;

/**
 * Closes calls that the provider stopped telling us about.
 *
 * Every `Call` row that still claims to be live occupies its owner's single
 * call slot, so a `call.hangup` webhook that never arrived (provider retry
 * exhausted, deploy mid-delivery, an event dropped on the floor) used to lock
 * that user out of calling *permanently* — the guard treats the database as
 * the truth, and nothing ever corrected it.
 *
 * The dial pre-flight already heals the row it trips over, which fixes the
 * user the moment they try again. This sweep is the other half: it reaches the
 * users who simply stopped being able to call and never retried, and it keeps
 * history and dashboards from carrying calls that are eternally "in progress".
 */
@Injectable()
export class StaleCallSweeperService {
  private readonly logger = new Logger(StaleCallSweeperService.name);

  constructor(
    private readonly callRepository: CallRepository,
    private readonly concurrentCallGuard: ConcurrentCallGuardService,
    private readonly inboundRing: InboundRingService,
  ) {}

  /** Returns how many ghost calls were closed. */
  async sweep(limit = SWEEP_BATCH_SIZE): Promise<number> {
    const now = Date.now();
    // Normal ring timeout is handled by provider events. This bounds abandoned
    // handoffs after an uncertain command response or a process restart, and
    // never holds up the sweep below, which is what frees users' call slots.
    await this.inboundRing
      .expireStalledTransfers(new Date(now - STALLED_TRANSFER_MS), limit)
      .catch((error: Error) =>
        this.logger.warn(`Stalled transfer sweep failed: ${error.message}`),
      );
    // Atomic against call.initiated adoption: never closes a row whose provider
    // leg won the race, and never touches SDK/campaign pre-dials.
    const expired = await this.callRepository.expirePendingExternalCalls(
      new Date(now - EXTERNAL_PRE_DIAL_TTL_MS),
    );
    const stuck = await this.callRepository.findStuckActive({
      ringingBefore: new Date(now - RINGING_SUSPECT_MS),
      connectedBefore: new Date(now - CONNECTED_SUSPECT_MS),
      limit,
    });

    if (stuck.length === 0) return expired;

    let closed = 0;
    for (const call of stuck) {
      // The guard owns the "is it really up?" decision (it asks the provider)
      // and the cleanup, so both paths cannot drift apart.
      const live = await this.concurrentCallGuard
        .confirmStillLive(call)
        .catch((error: Error) => {
          this.logger.warn(
            `Could not reconcile call ${call.id}: ${error.message}`,
          );
          return true;
        });
      if (!live) closed++;
    }

    if (closed > 0) {
      this.logger.log(
        `Stale call sweep: closed ${closed}/${stuck.length} calls that were still marked live`,
      );
    }
    return closed + expired;
  }
}
