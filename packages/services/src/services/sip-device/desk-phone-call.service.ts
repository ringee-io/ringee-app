import { Injectable, Logger } from "@nestjs/common";
import {
  CallRepository,
  CallStatus,
  NumberPurchasedRepository,
  SipDeviceRepository,
  SipDeviceStatus,
  SipDeviceWithNumber,
  BlockedCallLogRepository,
} from "@ringee/database";
import { OwnershipContext, TelnyxService } from "@ringee/platform";
import { apiConfiguration } from "@ringee/configuration";
import { CreditService } from "../credit.service";
import { UserService } from "../user.service";
import { ContactService } from "../contact.service";
import { NumberPurchasedService } from "../number.purchased.service";
import { ComplianceService } from "../outbound/compliance.service";
import { ConcurrentCallGuardService } from "../security";
import { SipDeviceService } from "./sip-device.service";
import { calculateCallCharge, readProfitMultiplier } from "../call-cost.util";

type BlockReason =
  | "DEVICE_NOT_FOUND"
  | "DEVICE_DISABLED"
  | "OUTBOUND_DISABLED"
  | "USER_CALLING_DISABLED"
  | "INVALID_DESTINATION"
  | "NO_CALLER_ID"
  | "CALLER_ID_NOT_ALLOWED"
  | "DNC"
  | "CONCURRENT_CALL"
  | "INSUFFICIENT_CREDITS";

const E164 = /^\+[1-9]\d{6,14}$/;

/**
 * Handles Telnyx events delivered to the dedicated desk-phone webhook. Distinct
 * from CallService so desk-phone parking/validation can evolve (and be turned
 * off) independently of the WebRTC web/extension/mobile flow.
 *
 * Outbound flow (Park Outbound Calls): the phone dials → Telnyx parks the call
 * and posts `call.initiated` here → we validate device / caller-ID / DNC /
 * credit → on pass we bridge the parked leg to the PSTN, on fail we hang up and
 * write a BlockedCallLog. Lifecycle events (answered/hangup/cost) are recorded
 * the same way the main flow records them, with source = "sip_device".
 */
@Injectable()
export class DeskPhoneCallService {
  private readonly logger = new Logger(DeskPhoneCallService.name);

  constructor(
    private readonly sipDeviceRepo: SipDeviceRepository,
    private readonly sipDeviceService: SipDeviceService,
    private readonly blockedCallRepo: BlockedCallLogRepository,
    private readonly callRepository: CallRepository,
    private readonly numberRepo: NumberPurchasedRepository,
    private readonly numberPurchasedService: NumberPurchasedService,
    private readonly creditService: CreditService,
    private readonly userService: UserService,
    private readonly contactService: ContactService,
    private readonly complianceService: ComplianceService,
    private readonly telnyx: TelnyxService,
    private readonly concurrentCallGuard: ConcurrentCallGuardService,
  ) {}

  async handleEvent(event: {
    id?: string;
    event_type: string;
    payload?: any;
  }): Promise<void> {
    const { event_type, payload } = event;
    const callControlId = payload?.call_control_id;
    if (!callControlId) {
      this.logger.warn(
        `Desk-phone event ${event_type} without call_control_id`,
      );
      return;
    }

    switch (event_type) {
      case "call.initiated":
        return this.onInitiated(event);
      case "call.answered":
        await this.callRepository
          .updateStatus(callControlId, CallStatus.answered)
          .catch(() => undefined);
        return;
      case "call.hangup": {
        const ended = await this.callRepository
          .completeCall(
            callControlId,
            payload.start_time ?? new Date().toISOString(),
            payload.end_time ?? new Date().toISOString(),
          )
          .catch(() => null);
        // Desk-phone legs are parked on their own webhook, so the main call
        // webhook never runs for them — free the single call slot here or the
        // handset keeps the user "busy" until the lease TTL expires.
        if (ended?.userId) {
          await this.concurrentCallGuard
            .release(ended.userId, callControlId)
            .catch(() => undefined);
        }
        return;
      }
      case "call.cost":
        return this.onCost(callControlId, payload);
      default:
        // Other lifecycle events are not material to V1 desk phones.
        return;
    }
  }

  // ───────────────────────────────────────────────────────────────────────

  private async onInitiated(event: {
    id?: string;
    payload?: any;
  }): Promise<void> {
    const payload = event.payload ?? {};
    const callControlId = payload.call_control_id as string;
    const connectionId = payload.connection_id as string | undefined;

    // The bridge leg we create by transferring the parked call also fires
    // call.initiated on this same connection. It carries our client_state, so
    // skip it — otherwise we'd validate and dial again in an endless loop.
    if (this.isRingeeOriginatedLeg(payload.client_state)) return;

    // Idempotency: if we already created a Call for this leg, skip.
    const existing = await this.callRepository.findByControlId(callControlId);
    if (existing) return;

    const device = connectionId
      ? await this.sipDeviceRepo.findByConnectionId(connectionId)
      : null;

    if (!device) {
      this.logger.warn(
        `Desk-phone call on unknown connection ${connectionId} — hanging up`,
      );
      await this.telnyx.hangupCall(callControlId).catch(() => undefined);
      await this.blockedCallRepo.record({
        source: "sip_device",
        reason: "DEVICE_NOT_FOUND",
        fromNumber: payload.from ?? null,
        toNumber: payload.to ?? null,
        telnyxConnectionId: connectionId ?? null,
        providerEventId: event.id ?? null,
        providerCallId: callControlId,
      });
      return;
    }

    // Observing any call on the connection proves the phone is registered.
    void this.sipDeviceService.markRegistered(device.id);

    const direction = (payload.direction as string | undefined) ?? "outbound";
    if (direction === "inbound" || direction === "incoming") {
      return this.recordInbound(device, payload);
    }
    return this.handleOutbound(device, payload, event.id ?? null);
  }

  /**
   * Inbound call to the device's number. Telnyx already rings the registered
   * phone; we only record it in history (source = sip_device). We never try to
   * deliver it to Ringee Web/Extension/Mobile — that's the whole point of
   * desk-phone-only inbound.
   */
  private async recordInbound(
    device: SipDeviceWithNumber,
    payload: any,
  ): Promise<void> {
    const ctx = this.ownerCtx(device);
    const contact = await this.contactService
      .findByPhone(ctx, payload.from)
      .catch(() => null);

    await this.callRepository
      .createCall(ctx, {
        contact: contact ? { connect: { id: contact.id } } : undefined,
        fromNumber: payload.from,
        toNumber: payload.to,
        connectionId: device.telnyxConnectionId,
        callControlId: payload.call_control_id,
        direction: "inbound",
        callSessionId: payload.call_session_id,
        callLegId: payload.call_leg_id,
        status: CallStatus.ringing,
        startedAt: payload.start_time,
        source: "sip_device",
        sipDevice: { connect: { id: device.id } },
      })
      .catch((err) =>
        this.logger.warn(
          `Failed to record inbound desk-phone call: ${err.message}`,
        ),
      );
  }

  /**
   * Parked outbound call: run the full validation pipeline, then either bridge
   * the call to the PSTN destination or hang up + log the block.
   */
  private async handleOutbound(
    device: SipDeviceWithNumber,
    payload: any,
    eventId: string | null,
  ): Promise<void> {
    const callControlId = payload.call_control_id as string;
    const ctx = this.ownerCtx(device);

    const block = async (reason: BlockReason, detail?: string) => {
      this.logger.warn(
        `Desk-phone outbound blocked (${reason}) device=${device.publicRef}: ${detail ?? ""}`,
      );
      // A refusal that lands AFTER the one-call slot was reserved has to hand
      // it back — a handset that was lifted and never connected must not keep
      // its owner busy until the lease expires. No-op when the slot is held by
      // something else (which is the case for CONCURRENT_CALL itself) or when
      // it is already bound to a real leg.
      await this.concurrentCallGuard.releasePending(
        device.userId,
        `sip:${device.id}`,
      );
      await this.telnyx.hangupCall(callControlId).catch(() => undefined);
      await this.blockedCallRepo.record({
        organizationId: device.organizationId,
        userId: device.userId,
        sipDeviceId: device.id,
        source: "sip_device",
        fromNumber: device.callerId,
        toNumber: payload.to ?? null,
        callerId: device.callerId,
        reason,
        detail: detail ?? null,
        telnyxConnectionId: device.telnyxConnectionId,
        providerEventId: eventId,
        providerCallId: callControlId,
      });
    };

    // 1) Device state.
    if (device.status === SipDeviceStatus.disabled || device.deletedAt) {
      return block("DEVICE_DISABLED");
    }
    if (!device.allowOutbound) {
      return block("OUTBOUND_DISABLED");
    }

    const user = await this.userService
      .getCachedUserById(device.userId)
      .catch(() => null);
    if (user?.canCall === false) {
      return block("USER_CALLING_DISABLED");
    }

    // One call at a time per user, across every device. Lifting the handset
    // while a browser call is up is exactly the case this rule forbids.
    const decision = await this.concurrentCallGuard.requestDial(device.userId, {
      deviceId: `sip:${device.id}`,
      deviceLabel: device.label ?? "a desk phone",
      source: "sip_device",
    });
    if (!decision.allowed) {
      return block("CONCURRENT_CALL", decision.message);
    }

    // 2) Destination normalization.
    const destination = this.normalizeE164(payload.to);
    if (!destination) {
      return block("INVALID_DESTINATION", `to=${payload.to}`);
    }

    // 3) Caller ID — forced to the device's assigned number, validated owned.
    const callerId = device.callerId;
    if (!callerId) {
      return block("NO_CALLER_ID", "device has no caller ID assigned");
    }
    const callerNumber = await this.numberRepo
      .findByPhoneNumber(callerId)
      .catch(() => null);
    const callerOwned = callerNumber
      ? ctx.organizationId
        ? callerNumber.organizationId === ctx.organizationId
        : callerNumber.userId === ctx.userId && !callerNumber.organizationId
      : false;
    if (!callerNumber || callerNumber.deletedAt || !callerOwned) {
      return block(
        "CALLER_ID_NOT_ALLOWED",
        `caller ID ${callerId} not owned by workspace`,
      );
    }

    // 4) DNC — blocking.
    const dnc = await this.complianceService
      .findOnDNC(ctx, destination)
      .catch(() => null);
    if (dnc) {
      return block("DNC", dnc.reason ?? "destination on DNC list");
    }

    // 5) Credit — balance gate (real cost settled on call.cost).
    if (!user?.freeCallTrial) {
      const balance = await this.creditService.getBalance(ctx).catch(() => 0);
      if (balance <= 0) {
        return block("INSUFFICIENT_CREDITS");
      }
    }

    // 6) Everything passed → bridge the parked leg to the PSTN. A hard
    //    per-call time limit caps runaway spend on an unattended desk phone
    //    (Telnyx auto-ends the call); the real cost is still settled on
    //    call.cost. A device-level dailySpendLimit can override the default.
    const maxMinutes = apiConfiguration.DESK_PHONE_MAX_CALL_MINUTES;
    await this.telnyx.connectParkedCall(callControlId, {
      to: destination,
      from: callerId,
      clientState: { sipDeviceId: device.id, source: "sip_device" },
      timeLimitSecs:
        maxMinutes && maxMinutes > 0 ? Math.floor(maxMinutes * 60) : undefined,
    });

    // 7) Record the call in history (source = Desk Phone).
    const contact = await this.contactService
      .findOrCreateByPhone(ctx, destination)
      .catch(() => null);

    await this.callRepository
      .createCall(ctx, {
        contact: contact ? { connect: { id: contact.id } } : undefined,
        fromNumber: callerId,
        toNumber: destination,
        connectionId: device.telnyxConnectionId,
        callControlId,
        direction: "outbound",
        callSessionId: payload.call_session_id,
        callLegId: payload.call_leg_id,
        status: CallStatus.ringing,
        startedAt: payload.start_time,
        source: "sip_device",
        sipDevice: { connect: { id: device.id } },
        callerId: { connect: { id: callerNumber.id } },
      })
      .catch((err) =>
        this.logger.error(
          `Failed to record desk-phone outbound call: ${err.message}`,
        ),
      );

    // Bind the reservation to this leg. Desk phones are parked on their own
    // webhook, so `CallService`'s `call.initiated` backstop — which binds every
    // other surface — never sees them. Unbound, the reservation would expire
    // mid-call after PENDING_LEASE_TTL_SECONDS (letting a second device in on a
    // long call) and the hangup below could not identify which leg it frees.
    await this.concurrentCallGuard.bindToCall(device.userId, callControlId);
  }

  /**
   * Settle real cost on the CDR. Mirrors CallService margin logic and is made
   * idempotent so duplicate `call.cost` deliveries don't double-charge.
   */
  private async onCost(callControlId: string, payload: any): Promise<void> {
    const call = await this.callRepository.findByControlId(callControlId);
    if (!call || call.source !== "sip_device") return;
    // Idempotency: already settled.
    if (call.totalCost != null) return;

    const ctx: OwnershipContext = {
      userId: call.userId!,
      organizationId: call.organizationId,
    };
    const user = await this.userService
      .getCachedUserById(call.userId!)
      .catch(() => null);

    const baseMargin = readProfitMultiplier(process.env.CALL_PROFIT_MARGIN);
    const recordingMargin = readProfitMultiplier(
      process.env.CALL_RECORDING_PROFIT_MARGIN,
      baseMargin,
    );
    const usedCallerId = await this.numberPurchasedService
      .isVerifiedCallerId(ctx, call.fromNumber)
      .catch(() => false);
    const profitMargin = usedCallerId ? baseMargin + 0.3 : baseMargin;
    const chargeBreakdown = calculateCallCharge({
      costParts: payload.cost_parts,
      totalCost: payload.total_cost,
      callProfitMultiplier: profitMargin,
      recordingProfitMultiplier: recordingMargin,
    });
    const totalCost = chargeBreakdown.computedTotalCost;

    if (user?.freeCallTrial) {
      await this.userService
        .consumeFreeCallTrial(user.id)
        .catch(() => undefined);
    } else {
      await this.creditService
        .consumeCredits(ctx, totalCost, {
          idempotencyKey: `call-cost:${call.id}`,
          source: "telnyx.desk-phone.call.cost",
        })
        .catch((err) =>
          this.logger.error(
            `Desk-phone credit settle failed for call ${call.id}: ${err.message}`,
          ),
        );
    }
    await this.callRepository
      .updateCost(callControlId, totalCost, {
        ...payload,
        ringeeCostBreakdown: {
          ...chargeBreakdown,
          callProfitMultiplier: profitMargin,
          recordingProfitMultiplier: recordingMargin,
        },
        ringeeComputedTotalCost: totalCost,
      })
      .catch(() => undefined);
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private ownerCtx(device: SipDeviceWithNumber): OwnershipContext {
    return { userId: device.userId, organizationId: device.organizationId };
  }

  /** True for a leg Ringee itself dialed (the park→bridge transfer leg). */
  private isRingeeOriginatedLeg(clientState?: string): boolean {
    if (!clientState) return false;
    try {
      const decoded = JSON.parse(
        Buffer.from(clientState, "base64").toString("utf-8"),
      );
      return decoded?.source === "sip_device";
    } catch {
      return false;
    }
  }

  private normalizeE164(raw?: string): string | null {
    if (!raw) return null;
    const cleaned = String(raw).replace(/[^\d+]/g, "");
    const withPlus = cleaned.startsWith("+") ? cleaned : `+${cleaned}`;
    return E164.test(withPlus) ? withPlus : null;
  }
}
