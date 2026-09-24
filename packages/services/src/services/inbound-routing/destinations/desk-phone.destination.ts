import { Injectable, Logger } from "@nestjs/common";
import {
  InboundDestinationType,
  InboundRingAttemptRepository,
} from "@ringee/database";
import {
  CarrierConnectionError,
  TelephonyService,
  signCallCorrelation,
} from "@ringee/platform";
import type {
  InboundDestinationHandler,
  InboundTransport,
  RouteExecutionRequest,
  RouteExecutionResult,
} from "../inbound-routing.types";

/**
 * How long a desk phone rings. Longer than a PBX usually rings an extension,
 * so the PBX's own timer — and its voicemail or next step — decides when to
 * stop, not Ringee.
 */
export const DESK_PHONE_RING_SECONDS = 120;

/**
 * `DESK_PHONE` — the call rings one SIP handset.
 *
 * This is the desk-phone routing that already existed, reached through the
 * router instead of from inside the carrier webhook. There is no second
 * implementation: the provider command is the same `connectInboundToDeskPhone`
 * transfer, with the same correlation token, the same per-call `command_id`
 * (so a redelivered webhook cannot ring the phone twice) and the same ring
 * timeout.
 *
 * Two transports reach a handset, and they are genuinely different mechanics:
 *
 * - `call_control` — the call is parked on the Call Control application and
 *   Ringee transfers it to the phone's SIP URI. Carrier (BYOC) calls arrive
 *   this way.
 * - `ringee_webrtc` — the number is assigned to the phone's own connection, so
 *   the provider is already ringing it and there is nothing to command. Ringee
 *   only records that the phone is the destination.
 */
@Injectable()
export class DeskPhoneDestinationHandler implements InboundDestinationHandler {
  readonly type = InboundDestinationType.desk_phone;
  readonly transports: readonly InboundTransport[] = [
    "call_control",
    "ringee_webrtc",
  ];
  private readonly logger = new Logger(DeskPhoneDestinationHandler.name);

  constructor(
    private readonly telephony: TelephonyService,
    private readonly attempts: InboundRingAttemptRepository,
  ) {}

  async execute(request: RouteExecutionRequest): Promise<RouteExecutionResult> {
    const { destination, call, origin } = request;
    if (destination.type !== "desk_phone")
      return {
        status: "failed",
        reason: "destination_missing",
        detail: "a desk phone handler was given another destination",
      };
    if (!call.callControlId)
      return {
        status: "failed",
        reason: "desk_phone_unavailable",
        detail: `call ${call.id} has no provider leg to connect`,
      };

    await this.attempts.startMany(call.id, [
      { userId: destination.ownerUserId, sipDeviceId: destination.sipDeviceId },
    ]);

    if (origin.transport === "ringee_webrtc") {
      // The number is assigned to the phone's own connection: the provider is
      // already ringing it. Commanding a transfer here would move a call that
      // is on its way to exactly the handset it is meant for.
      this.logger.log(
        `📞 Call ${call.id} is delivered to desk phone ${destination.sipDeviceId} by its number's own assignment`,
      );
      return { status: "ringing", targets: 1 };
    }

    try {
      await this.telephony.connectInboundToDeskPhone(call.callControlId, {
        sipUsername: destination.sipUsername,
        // A caller with no E.164 number is shown by name against the number
        // that was called.
        from: origin.callerId ?? call.toNumber,
        fromDisplayName: origin.callerId
          ? null
          : origin.fromNumber || "Unknown",
        correlation: signCallCorrelation(call.id),
        // Same id on a redelivery: the phone is never rung twice.
        commandId: `carrier-inbound-${call.id}`,
        timeoutSecs: DESK_PHONE_RING_SECONDS,
      });
    } catch (error) {
      const detail =
        error instanceof CarrierConnectionError
          ? "the provider refused the transfer"
          : (error as Error).message;
      return {
        status: "failed",
        reason: "provider_refused",
        detail: `could not ring desk phone ${destination.sipDeviceId}: ${detail}`,
        callerMessage: "The desk phone could not be reached.",
      };
    }
    return { status: "ringing", targets: 1 };
  }
}
