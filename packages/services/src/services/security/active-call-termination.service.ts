import { Injectable, Logger } from "@nestjs/common";
import { CallRepository } from "@ringee/database";
import { TelephonyService } from "@ringee/platform";
import { ConcurrentCallGuardService } from "./concurrent-call-guard.service";

export interface CallTerminationResult {
  /** Ringee ids of the calls that were live when the sweep started. */
  callIds: string[];
  /** Calls the provider confirmed it hung up. */
  terminated: number;
  /**
   * Live rows with no `callControlId` yet (the leg was still being set up when
   * the sweep ran). They are closed locally; the provider-side leg is stopped
   * by the account block on the next control command.
   */
  withoutControlId: number;
  /** Calls whose provider hangup failed — surfaced so admins can retry. */
  failed: number;
}

/**
 * Kills every call a user currently has in flight, server-side.
 *
 * This is the authoritative half of an enforcement action: it does not depend
 * on the browser cooperating, on a WebSocket being connected, or on the device
 * even being online. The realtime broadcast that goes out alongside it only
 * makes the UI catch up instantly.
 *
 * Every hangup is attempted independently — one dead `callControlId` must not
 * leave the rest of the user's calls up.
 */
@Injectable()
export class ActiveCallTerminationService {
  private readonly logger = new Logger(ActiveCallTerminationService.name);

  constructor(
    private readonly callRepository: CallRepository,
    private readonly telephony: TelephonyService,
    private readonly concurrentCallGuard: ConcurrentCallGuardService,
  ) {}

  async terminateAllForUser(
    userId: string,
    reason: string,
  ): Promise<CallTerminationResult> {
    const activeCalls = await this.callRepository.findActiveByUserId(userId);
    const result: CallTerminationResult = {
      callIds: activeCalls.map((call) => call.id),
      terminated: 0,
      withoutControlId: 0,
      failed: 0,
    };

    // Drop the one-call-at-a-time lease unconditionally: the calls it protected
    // are being killed, and a leftover lease would lock the user out of dialing
    // for hours once their access is restored.
    await this.concurrentCallGuard.release(userId).catch(() => undefined);

    if (activeCalls.length === 0) {
      return result;
    }

    const errorMessage = `terminated_by_platform:${reason}`;
    const outcomes = await Promise.allSettled(
      activeCalls.map(async (call) => {
        if (!call.callControlId) {
          return "no_control_id" as const;
        }
        await this.telephony.hangupCall(call.callControlId);
        return "terminated" as const;
      }),
    );

    for (const [index, outcome] of outcomes.entries()) {
      const call = activeCalls[index];

      if (outcome.status === "rejected") {
        result.failed += 1;
        this.logger.error(
          `Could not hang up call ${call.id} (control ${call.callControlId}) while enforcing "${reason}" on user ${userId}: ${
            outcome.reason instanceof Error
              ? outcome.reason.message
              : String(outcome.reason)
          }`,
        );
        // Leave the row open: the call may still be up, and the webhook (or a
        // retry from the backoffice) remains the source of truth.
        continue;
      }

      if (outcome.value === "no_control_id") {
        result.withoutControlId += 1;
      } else {
        result.terminated += 1;
      }

      await this.callRepository
        .markForciblyEnded(call.id, errorMessage)
        .catch((error) =>
          this.logger.warn(
            `Hung up call ${call.id} but could not close its row: ${
              error instanceof Error ? error.message : String(error)
            }`,
          ),
        );
    }

    this.logger.warn(
      `Enforcement "${reason}" on user ${userId}: ${result.terminated} call(s) hung up, ${result.withoutControlId} closed without a control id, ${result.failed} failed`,
    );
    return result;
  }
}
