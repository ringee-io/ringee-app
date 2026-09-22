import { Injectable } from "@nestjs/common";
import { InboundDestinationType } from "@ringee/database";
import type {
  InboundDestinationHandler,
  InboundTransport,
  RouteExecutionRequest,
  RouteExecutionResult,
} from "../inbound-routing.types";

/**
 * A destination the model can express but the router cannot execute yet.
 *
 * It exists so the dispatch table is complete: an `IVR` route stored today
 * fails the same way wherever it is reached from, with a reason an operator
 * can read, instead of falling through to "ring the owner" and quietly doing
 * the wrong thing. Shipping the feature means replacing the subclass in the
 * registry — nothing in the carrier layer, the resolver or the call lifecycle
 * changes.
 */
abstract class UnsupportedDestinationHandler
  implements InboundDestinationHandler
{
  abstract readonly type: InboundDestinationType;
  abstract readonly label: string;
  readonly transports: readonly InboundTransport[] = [];

  async execute(request: RouteExecutionRequest): Promise<RouteExecutionResult> {
    return {
      status: "failed",
      reason: "destination_not_implemented",
      detail: `${this.label} destinations are not implemented yet (call ${request.call.id})`,
    };
  }
}

/** Reserved for the interactive menu. See docs/engineering/TELEPHONY.md. */
@Injectable()
export class IvrDestinationHandler extends UnsupportedDestinationHandler {
  readonly type = InboundDestinationType.ivr;
  readonly label = "IVR";
}

