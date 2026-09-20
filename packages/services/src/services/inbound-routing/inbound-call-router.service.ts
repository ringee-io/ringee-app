import { Injectable, Logger } from "@nestjs/common";
import { InboundDestinationType } from "@ringee/database";
import { UserDestinationHandler } from "./destinations/user.destination";
import { RingGroupDestinationHandler } from "./destinations/ring-group.destination";
import { DeskPhoneDestinationHandler } from "./destinations/desk-phone.destination";
import {
  AiReceptionistDestinationHandler,
  IvrDestinationHandler,
} from "./destinations/unsupported.destination";
import type {
  InboundDestination,
  InboundDestinationHandler,
  InboundTransport,
  RouteExecutionRequest,
  RouteExecutionResult,
} from "./inbound-routing.types";

/** The enum value a resolved destination corresponds to. */
export function destinationTypeOf(
  destination: InboundDestination,
): InboundDestinationType {
  switch (destination.type) {
    case "user":
      return InboundDestinationType.user;
    case "ring_group":
      return InboundDestinationType.ring_group;
    case "desk_phone":
      return InboundDestinationType.desk_phone;
  }
}

/** The id a resolved destination addresses. */
export function destinationIdOf(destination: InboundDestination): string {
  switch (destination.type) {
    case "user":
      return destination.userId;
    case "ring_group":
      return destination.ringGroupId;
    case "desk_phone":
      return destination.sipDeviceId;
  }
}

/**
 * Executes a routing decision. One dispatch, one handler per destination type,
 * and no destination-specific behavior anywhere else in the system.
 *
 * The router deliberately knows nothing about carriers or provider payloads —
 * it takes a call that already exists and a destination that has already been
 * resolved and verified. Adding `IVR` or `AI_RECEPTIONIST` is adding a handler
 * to this table: the carrier layer, the resolver and the call lifecycle are
 * untouched. The same is true in the other direction, which is what lets an
 * IVR eventually hand a call back in by calling `routeInboundCall` again with
 * the destination its menu chose.
 */
@Injectable()
export class InboundCallRouterService {
  private readonly logger = new Logger(InboundCallRouterService.name);
  private readonly handlers: ReadonlyMap<
    InboundDestinationType,
    InboundDestinationHandler
  >;

  constructor(
    user: UserDestinationHandler,
    ringGroup: RingGroupDestinationHandler,
    deskPhone: DeskPhoneDestinationHandler,
    ivr: IvrDestinationHandler,
    aiReceptionist: AiReceptionistDestinationHandler,
  ) {
    this.handlers = new Map(
      [user, ringGroup, deskPhone, ivr, aiReceptionist].map((handler) => [
        handler.type,
        handler,
      ]),
    );
  }

  /** Which transports can reach a destination type at all. */
  transportsFor(type: InboundDestinationType): readonly InboundTransport[] {
    return this.handlers.get(type)?.transports ?? [];
  }

  /**
   * Ring the destination that owns this call.
   *
   * A destination the delivering transport cannot reach is refused explicitly
   * rather than approximated: a carrier call parked on the Call Control
   * application cannot be offered to a browser at all until `DEBT-020` is
   * closed, and quietly ringing somebody else would be worse than saying so.
   */
  async routeInboundCall(
    request: RouteExecutionRequest,
  ): Promise<RouteExecutionResult> {
    const type = destinationTypeOf(request.destination);
    const handler = this.handlers.get(type);
    if (!handler)
      return {
        status: "failed",
        reason: "destination_not_implemented",
        detail: `no handler is registered for ${type}`,
      };

    if (!handler.transports.includes(request.origin.transport))
      return {
        status: "failed",
        reason: "transport_cannot_reach_destination",
        detail: `a ${type} destination cannot be reached over ${request.origin.transport}`,
      };

    const result = await handler.execute(request);
    if (result.status === "failed")
      this.logger.warn(
        `⛔ Call ${request.call.id} could not be routed to ${type} (${result.reason}): ${result.detail}`,
      );
    return result;
  }
}
