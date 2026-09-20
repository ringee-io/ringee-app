import { Injectable, Logger } from "@nestjs/common";
import { InboundDestinationType } from "@ringee/database";
import { InboundRingService } from "../inbound-ring.service";
import type {
  InboundDestinationHandler,
  InboundTransport,
  RouteExecutionRequest,
  RouteExecutionResult,
} from "../inbound-routing.types";

/**
 * `RING_GROUP` — every available member is offered the same call at the same
 * time, and the first to take it gets it.
 *
 * Three properties matter and are all enforced here or in `InboundRingService`:
 *
 * 1. **One call.** The members are legs of the single `Call` row the caller
 *    already has. Nothing in this path creates a second row, so there is one
 *    history entry, one recording and one charge however many phones rang.
 * 2. **One winner.** The answer is claimed with a conditional update, so two
 *    members answering in the same instant cannot both win — the loser is told
 *    the call was taken.
 * 3. **The rest stop.** Losing attempts are closed and their members told to
 *    stop presenting the call, immediately, not on a timeout.
 *
 * A group with no member online is an explicit failure: unlike a direct user
 * destination there is no legacy behavior to preserve, and silently ringing
 * nobody is the worst answer available.
 */
@Injectable()
export class RingGroupDestinationHandler implements InboundDestinationHandler {
  readonly type = InboundDestinationType.ring_group;
  readonly transports: readonly InboundTransport[] = ["ringee_webrtc"];
  private readonly logger = new Logger(RingGroupDestinationHandler.name);

  constructor(private readonly ring: InboundRingService) {}

  async execute(request: RouteExecutionRequest): Promise<RouteExecutionResult> {
    const { destination, call } = request;
    if (destination.type !== "ring_group")
      return {
        status: "failed",
        reason: "destination_missing",
        detail: "a ring group handler was given another destination",
      };

    const fanout = await this.ring.offerToMembers(
      call,
      destination.memberUserIds,
      {
        callerName: request.callerName,
        destinationType: "ring_group",
        ringGroupId: destination.ringGroupId,
        ringGroupName: destination.name,
        ringSeconds: destination.ringSeconds,
      },
    );

    if (fanout.offered.length === 0) {
      await this.ring.cancelRinging(call, {
        reason: "ring_group_no_available_members",
        status: "failed",
      });
      return {
        status: "failed",
        reason: "ring_group_no_available_members",
        detail: `no member of ${destination.name} is available`,
        callerMessage: "Nobody was available to take the call.",
      };
    }

    this.logger.log(
      `📞 Ringing ${fanout.offered.length} member(s) of ${destination.name} for call ${call.id}`,
    );
    return { status: "ringing", targets: fanout.offered.length };
  }
}
