import { Injectable, Logger } from "@nestjs/common";
import { InboundDestinationType } from "@ringee/database";
import { InboundRingService } from "../inbound-ring.service";
import type {
  InboundDestinationHandler,
  InboundTransport,
  RouteExecutionRequest,
  RouteExecutionResult,
} from "../inbound-routing.types";

/** How long a WebRTC destination rings before the group is given up on. */
export const USER_RING_SECONDS = 45;

/**
 * `USER` — the call belongs to one Ringee user, on whatever Ringee app they
 * have open.
 *
 * Ringee does not open the leg: the provider offers it on the shared WebRTC
 * credential every dashboard registers with (`DEBT-020`). What this handler
 * adds is the part that is Ringee's: telling that user's sessions and devices
 * the call is **theirs**, and opening the ring attempt the answer is claimed
 * against.
 *
 * A user with nothing online is deliberately **not** a failure. That is the
 * behavior every existing number has today — the leg is still offered, an
 * unattended browser may still be registered, and refusing the call here would
 * be a regression for every customer who has no mobile app installed.
 */
@Injectable()
export class UserDestinationHandler implements InboundDestinationHandler {
  readonly type = InboundDestinationType.user;
  readonly transports: readonly InboundTransport[] = ["ringee_webrtc"];
  private readonly logger = new Logger(UserDestinationHandler.name);

  constructor(private readonly ring: InboundRingService) {}

  async execute(request: RouteExecutionRequest): Promise<RouteExecutionResult> {
    const { destination, call } = request;
    if (destination.type !== "user")
      return {
        status: "failed",
        reason: "destination_missing",
        detail: "a user handler was given another destination",
      };

    const fanout = await this.ring.offerToMembers(call, [destination.userId], {
      callerName: request.callerName,
      destinationType: "user",
      ringSeconds: USER_RING_SECONDS,
    });
    if (fanout.unreachable.length)
      this.logger.log(
        `Inbound call ${call.id}: ${destination.userId} has nothing online; the leg is still offered`,
      );
    return { status: "ringing", targets: 1 };
  }
}
