import { Injectable, Optional } from "@nestjs/common";
import {
  ProviderDispatchDeferredError,
  ProviderDispatchService,
  type DispatchSource,
  type OwnershipContext,
} from "@ringee/platform";

/**
 * Paces a person's dial at its pre-flight (CPS-002, CPS-003).
 *
 * A browser, the extension, the SDK and a dialing session place their own leg:
 * the server only authorizes it. The pre-flight is the one moment the server
 * can still decide WHEN, so it holds the answer until the shared clock has a
 * slot — and the browser dials right after, within the jitter the safety margin
 * is sized for. That slot is a direct start: it comes from the same start
 * budget every server-sent leg spends, so a browser's grant and a server's
 * cannot both take one moment of capacity. It spaces grants, not dials: a
 * browser that dials late can still start beside a server leg granted after
 * it. The leg itself is counted later, when its
 * webhook arrives (`ProviderDispatchService.observeExternalAttempt`), so nothing
 * is counted twice.
 *
 * Interactive capacity is reserved and the wait is bounded. If the account
 * remains busy, or coordination is unavailable, return an explicit deferral.
 * No process-local fallback or overage may override the shared ceiling.
 *
 * Call it as the LAST gate, after the rules that can refuse the dial: a dial
 * that DNC or credit refuses must not spend a slot, and a deferral thrown here
 * runs the caller's existing hand-back of the one-call-at-a-time lease.
 */
@Injectable()
export class DialPacingService {
  constructor(
    @Optional() private readonly dispatch?: ProviderDispatchService,
  ) {}

  async paceInteractive(
    source: DispatchSource,
    ctx: OwnershipContext,
  ): Promise<void> {
    if (!this.dispatch) return;
    const decision = await this.dispatch.admit({
      source,
      workspace: ctx,
      countAttempt: false,
      directStart: true,
    });
    if (!decision.granted) {
      throw new ProviderDispatchDeferredError(
        decision.reason,
        decision.retryAfterMs,
      );
    }
  }
}
