import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  ServiceUnavailableException,
} from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import {
  CallRepository,
  CallSessionRepository,
  CallStatus,
  CallOutcome,
  Call,
  InboundDestinationType,
  RecordingRepository,
  type CallDetail,
} from "@ringee/database";
import {
  OrchestratorService,
  OwnershipContext,
  RedisService,
  TelephonyService,
  carrierInboundLegCorrelation,
  carrierOutboundLeg,
  isCarrierCallKey,
  signCallCorrelation,
  verifyCallCorrelation,
  verifyCarrierCallKey,
} from "@ringee/platform";
import type {
  CarrierOutboundLeg,
  TelephonyEvent,
  CallTranscriptionPayload,
  CallRecordingErrorPayload,
  CallRecordingSavedPayload,
  CallMachineDetectionPayload,
  CallHangupPayload,
  CallCostPayload,
} from "@ringee/platform";
import { CallTranscriptionService } from "./call.transcription.service";
import { TranscriptionService } from "./transcription/transcription.service";
import { CallRecordingSettingsService } from "./transcription/call-recording-settings.service";
import { UserService } from "./user.service";
import { CreditService } from "./credit.service";
import { ContactService } from "./contact.service";
import { NumberPurchasedService } from "./number.purchased.service";
import { CallerIdRotationService } from "./caller-id-rotation/caller-id-rotation.service";
import { OrganizationService } from "./organization.service";
import { CallAttemptService } from "./outbound/call-attempt.service";
import { VoicemailDropService } from "./outbound/voicemail-drop.service";
import { VoiceAgentResultService } from "./voice-agents/voice-agent-result.service";
import { CrmCallLogService } from "./crm/crm-call-log.service";
import { InboxTimelineService } from "./inbox/inbox.timeline.service";
import { CustomIntegrationOutboundService } from "./custom-integrations/custom-integration-outbound.service";
import { PipelineFanoutService } from "./ai-pipeline";
import { ConcurrentCallGuardService } from "./security";
import { calculateCallCharge } from "./call-cost.util";
import { LOW_BALANCE_MAX_CALL_SECONDS, LOW_BALANCE_USD } from "./credit-policy";
import {
  ExternalCarrierService,
  EXTERNAL_PRE_DIAL_TTL_MS,
} from "./external-carrier/external-carrier.service";
import { parseSipTarget, sipUser } from "./external-carrier/sip-target";
import {
  destinationIdOf,
  destinationTypeOf,
  InboundCallRouterService,
} from "./inbound-routing/inbound-call-router.service";
import { InboundRouteResolverService } from "./inbound-routing/inbound-route-resolver.service";
import { InboundRingService } from "./inbound-routing/inbound-ring.service";
import type {
  InboundCallOrigin,
  InboundRouteResolution,
  RouteExecutionResult,
} from "./inbound-routing/inbound-routing.types";

/**
 * How long a lifecycle event that arrived before its `Call` row is kept so the
 * `call.initiated` handler can replay it. Generous: the only cost of an
 * unclaimed key is a few hundred bytes in Redis.
 */
const ORPHAN_EVENT_TTL_SECONDS = 15 * 60;

/** Redis key holding events that landed before the call they belong to. */
function orphanEventsKey(callControlId: string): string {
  return `ringee:orphan-call-events:v1:${callControlId}`;
}

/** Signed pre-dial token a browser leg carries to use an external carrier. */
const EXTERNAL_CALL_HEADER = "X-Ringee-Byoc-Call-Id";

/**
 * How long a pre-dial's carrier leg rings. A carrier network usually gives up
 * sooner; this only bounds a leg nobody ends.
 */
const EXTERNAL_CARRIER_RING_SECS = 90;

/**
 * Holds which Call Control leg a pre-dial was sent on through: set once, so a
 * pre-dial reaches its carrier once, and read if that carrier leg fails before
 * it is answered. Outlives the pre-dial window and the ring time.
 */
const CARRIER_OUTBOUND_BRIDGE_TTL_SECS = 10 * 60;
function carrierOutboundBridgeKey(callId: string): string {
  return `ringee:carrier-outbound-bridge:v1:${callId}`;
}

@Injectable()
export class CallService implements OnModuleDestroy {
  private readonly logger = new Logger(CallService.name);
  private readonly lowBalanceHangupTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly callRepository: CallRepository,
    private readonly transcriptionService: CallTranscriptionService,
    private readonly userService: UserService,
    private readonly creditService: CreditService,
    private readonly contactService: ContactService,
    private readonly numberPurchasedService: NumberPurchasedService,
    private readonly callerIdRotationService: CallerIdRotationService,
    private readonly orchestratorService: OrchestratorService,
    private readonly organizationService: OrganizationService,
    private readonly callAttemptService: CallAttemptService,
    private readonly crmCallLogService: CrmCallLogService,
    private readonly inboxTimelineService: InboxTimelineService,
    private readonly recordingRepository: RecordingRepository,
    private readonly customIntegrationOutbound: CustomIntegrationOutboundService,
    private readonly callSessionRepository: CallSessionRepository,
    private readonly telephonyService: TelephonyService,
    private readonly recordingSettingsService: CallRecordingSettingsService,
    private readonly transcriptionOrchestrator: TranscriptionService,
    private readonly pipelineFanout: PipelineFanoutService,
    private readonly concurrentCallGuard: ConcurrentCallGuardService,
    private readonly redis: RedisService,
    private readonly voicemailDropService: VoicemailDropService,
    private readonly voiceAgentResults: VoiceAgentResultService,
    private readonly externalCarriers: ExternalCarrierService,
    private readonly inboundRoutes: InboundRouteResolverService,
    private readonly inboundRouter: InboundCallRouterService,
    private readonly inboundRing: InboundRingService,
  ) {}

  /**
   * An inbound call, from any carrier.
   *
   * One path for every number Ringee serves. The carrier layer says **which
   * number** was called and proves it; the routing layer says **who owns the
   * call**; the router rings them. Nothing in here knows a provider's names,
   * and nothing in here decides a destination.
   */
  private async handleInboundCall(event: TelephonyEvent): Promise<void> {
    // A call a customer's PBX delivered arrives on the Call Control
    // application addressed with a signed routing key; Ringee's own numbers
    // never do, and identify themselves by the number that was dialed.
    const carrier = await this.externalCarriers.identifyInbound(event);
    if (carrier.kind === "refused")
      return this.refuseInboundLeg(event, carrier.reason);

    const origin: InboundCallOrigin =
      carrier.kind === "identified"
        ? {
            transport: "call_control",
            toNumber: carrier.toNumber,
            fromNumber: carrier.fromNumber,
            callerId: carrier.callerId,
            number: { kind: "external", id: carrier.externalNumberId },
            organizationId: carrier.organizationId,
            externalCarrierId: carrier.externalCarrierId,
            externalSipEndpointId: carrier.externalSipEndpointId,
          }
        : {
            transport: "ringee_webrtc",
            toNumber: event.to ?? "",
            fromNumber: event.from ?? "",
            callerId: event.from ?? null,
          };

    const resolution = await this.inboundRoutes.resolve(origin);
    if (resolution.kind === "unknown_number") {
      // Unchanged: a number no workspace owns is logged and left alone. The
      // leg is not ours to hang up.
      this.logger.warn(`⚠️ Number ${origin.toNumber} not found`);
      return;
    }
    if (resolution.kind === "unroutable")
      return this.refuseInboundLeg(
        event,
        `${resolution.reason} — ${resolution.detail}`,
      );

    await this.deliverInboundCall(event, origin, resolution);
  }

  /**
   * An inbound leg that must not be delivered: hung up rather than left
   * ringing into nothing, and leaving no history row. A redelivery that finds
   * a call already ringing or answered is left alone — editing a route must
   * not disconnect the call that already reached its destination.
   */
  private async refuseInboundLeg(
    event: TelephonyEvent,
    reason: string,
  ): Promise<void> {
    const { callControlId } = event;
    const existing = await this.callRepository.findByControlId(callControlId);
    if (existing) {
      await this.replayParkedCallEvents(callControlId);
      return;
    }
    this.logger.warn(`⛔ Hanging up inbound call ${callControlId}: ${reason}`);
    await this.telephonyService
      .hangupCall(callControlId)
      .catch((err) =>
        this.logger.error(
          `Failed to hang up inbound call ${callControlId}: ${err.message}`,
        ),
      );
  }

  /**
   * Record the one logical call and ring its destination.
   *
   * However many endpoints a destination rings, there is exactly one `Call`
   * row: one history entry, one recording, one charge. `Call.status` is still
   * written only here; the router opens legs and the ring service elects the
   * winner, neither of them touches the lifecycle.
   */
  private async deliverInboundCall(
    event: TelephonyEvent,
    origin: InboundCallOrigin,
    resolution: Extract<InboundRouteResolution, { kind: "routed" }>,
  ): Promise<void> {
    const { callControlId } = event;
    const { ctx, destination } = resolution;
    const destinationId = destinationIdOf(destination);

    const existing = await this.callRepository.findByControlId(callControlId);
    // A redelivery is not a new routing decision. A leg already ringing its
    // destination — or answered — is left exactly as it is.
    if (existing?.answeredAt || existing?.endedAt) {
      await this.replayParkedCallEvents(callControlId);
      return;
    }

    const contact = await this.contactService
      .findByPhone(ctx, origin.fromNumber)
      .catch(() => null);
    const { call, created } = await this.callRepository.createInboundOnce(ctx, {
      contact: contact ? { connect: { id: contact.id } } : undefined,
      fromNumber: origin.fromNumber,
      toNumber: origin.toNumber,
      connectionId:
        origin.transport === "call_control"
          ? (event.connectionId ?? undefined)
          : apiConfiguration.TELNYX_CONNECTION_ID,
      callControlId,
      direction: "inbound",
      callSessionId: event.callSessionId ?? undefined,
      callLegId: event.callLegId ?? undefined,
      status: CallStatus.ringing,
      startedAt: event.startedAt ?? undefined,
      clientState: Buffer.from("initiate_call").toString("base64"),
      ...(destination.type === "desk_phone"
        ? {
            source: "sip_device",
            sipDevice: { connect: { id: destination.sipDeviceId } },
          }
        : {}),
      externalCarrierId: origin.externalCarrierId,
      externalSipEndpointId: origin.externalSipEndpointId,
      // What routed this call, kept on the row so history reads correctly
      // after the route or the group it named is edited away.
      inboundRoute: resolution.routeId
        ? { connect: { id: resolution.routeId } }
        : undefined,
      inboundDestinationType: destinationTypeOf(destination),
      inboundDestinationId: destinationId,
      ringGroup:
        destination.type === "ring_group"
          ? { connect: { id: destination.ringGroupId } }
          : undefined,
      routedAt: new Date(),
    });

    if (created) {
      void this.inboxTimelineService
        .ensureThreadForCall(call)
        .catch((err) =>
          this.logger.error(
            `Inbox ensureThreadForCall failed (inbound, call=${call.id}): ${err.message}`,
            err.stack,
          ),
        );
    }

    // A hangup that beat this webhook closes the row before anything rings.
    await this.replayParkedCallEvents(callControlId);
    const current = await this.callRepository.findById(call.id);
    if (!current || current.endedAt || current.answeredAt) return;
    if (
      call.userId !== ctx.userId ||
      call.organizationId !== (ctx.organizationId ?? null) ||
      call.inboundDestinationId !== destinationId
    ) {
      // A retry after the route was changed must not ring a different
      // recipient using the original recipient's row and correlation token.
      await this.telephonyService.hangupCall(callControlId);
      return;
    }

    const result = await this.inboundRouter.routeInboundCall({
      call,
      ctx,
      origin,
      destination,
      callerName: contact?.name ?? null,
    });
    if (result.status === "failed") await this.failInboundCall(call, result);
  }

  /** Nothing could take the call: say so on the row, stop ringing, hang up. */
  private async failInboundCall(
    call: Call,
    result: Extract<RouteExecutionResult, { status: "failed" }>,
  ): Promise<void> {
    this.logger.error(
      `Inbound call ${call.id} was not delivered (${result.reason}): ${result.detail}`,
    );
    await this.callRepository
      .updateControlState(call.callControlId!, {
        errorMessage: result.callerMessage ?? "This call could not be routed.",
      })
      .catch(() => undefined);
    await this.inboundRing.cancelForEndedCall(call, result.reason);
    await this.telephonyService
      .hangupCall(call.callControlId!)
      .catch(() => undefined);
  }

  /**
   * Webhooks of the desk phone leg the `DESK_PHONE` destination opened. That
   * leg is part of the original call, never a call of its own: nothing here
   * creates a row, and the caller's leg keeps reporting its own lifecycle.
   * Returns true when the event belonged to such a leg.
   */
  private async handleDeskPhoneInboundLeg(
    event: TelephonyEvent,
  ): Promise<boolean> {
    const correlation = carrierInboundLegCorrelation(event.clientState);
    // Only the Call Control application opens that leg. A browser can attach
    // any client state to its own calls; those stay ordinary, billed legs.
    if (
      !correlation ||
      !event.connectionId ||
      event.connectionId !== apiConfiguration.TELNYX_CALL_CONTROL_APP_ID
    )
      return false;
    const id = verifyCallCorrelation(correlation);
    const call = id ? await this.callRepository.findById(id) : null;
    // Whatever carrier delivered it, the leg belongs to a desk phone
    // destination of an inbound call and to nothing else.
    if (
      !call?.callControlId ||
      !call.sipDeviceId ||
      call.direction !== "inbound"
    ) {
      if (event.type === "call.initiated") {
        this.logger.warn(
          `⛔ Hanging up leg ${event.callControlId}: desk phone state does not match an inbound call`,
        );
        await this.telephonyService
          .hangupCall(event.callControlId)
          .catch(() => undefined);
      }
      return true;
    }

    if (event.type === "call.answered") {
      await this.answerDeskPhoneInboundOnce(call.callControlId, call.userId);
    } else if (event.type === "call.hangup" && !call.endedAt) {
      // The phone did not take the call — busy, declined, unreachable, no
      // answer — or hung up after talking. The caller's leg ends with it; what
      // happens next (voicemail, another extension) is the PBX's decision.
      const cause = (event.payload as CallHangupPayload).hangup_cause;
      if (!call.answeredAt && cause !== "originator_cancel") {
        await this.callRepository
          .updateControlState(call.callControlId, {
            errorMessage: `The desk phone did not answer${cause ? ` (${cause})` : ""}.`,
          })
          .catch(() => undefined);
      }
      await this.telephonyService
        .hangupCall(call.callControlId, `carrier-inbound-end-${call.id}`)
        .catch((err) =>
          this.logger.warn(
            `Inbound call ${call.id} was already ending: ${err.message}`,
          ),
        );
    }
    return true;
  }

  /**
   * An outbound call through an external carrier on the Call Control
   * application: the browser's call arriving there, addressed with its
   * pre-dial's key, which is sent on to the carrier; and the legs marked as
   * not the call itself — the carrier leg, and an entry leg that was refused
   * or only relays. Marked legs are never recorded or billed. Returns true
   * when the event was handled here.
   */
  private async handleCarrierOutboundLeg(
    event: TelephonyEvent,
  ): Promise<boolean> {
    // Only the application's own legs. A browser can put any address or
    // client state on its own calls; those stay ordinary, billed legs.
    const appId = apiConfiguration.TELNYX_CALL_CONTROL_APP_ID;
    if (!appId || event.connectionId !== appId) return false;
    if (
      event.type === "call.initiated" &&
      event.direction === "inbound" &&
      isCarrierCallKey(sipUser(event.to))
    ) {
      await this.bridgeExternalOutbound(event);
      return true;
    }
    const leg = carrierOutboundLeg(event.clientState);
    if (!leg) return false;
    if (leg.leg === "carrier" && event.type === "call.hangup")
      await this.endExternalOutbound(leg, event);
    return true;
  }

  /**
   * The browser's pre-dialed call reached the Call Control application. The
   * key names the row and the browser's token must name the same one;
   * everything else — that it is still a live pre-dial, and where it goes —
   * comes from Ringee's own records. It is sent on to its carrier exactly
   * once: a second call dialed with the same key, or anything that does not
   * verify, is hung up.
   *
   * Telnyx delivers the browser's call to the application as this very leg —
   * the browser's side has no Call Control leg of its own — so this leg is the
   * call: it is bound to the row like any browser-placed leg, and its webhooks
   * run the ordinary lifecycle, billing included.
   */
  private async bridgeExternalOutbound(event: TelephonyEvent): Promise<void> {
    const entry = event.callControlId;
    const refuse = async (reason: string) => {
      this.logger.warn(`⛔ Refusing external carrier call ${entry}: ${reason}`);
      await this.telephonyService
        .refuseCarrierOutbound(entry, `carrier-outbound-refuse-${entry}`)
        .catch((err) =>
          this.logger.error(
            `Failed to refuse external carrier call ${entry}: ${err.message}`,
          ),
        );
    };

    const id = verifyCarrierCallKey(sipUser(event.to));
    const call = id ? await this.callRepository.findById(id) : null;
    if (
      !call?.userId ||
      !call.externalSipEndpointId ||
      call.direction !== "outbound" ||
      call.endedAt ||
      (call.status !== CallStatus.pending &&
        call.status !== CallStatus.ringing) ||
      Date.now() - call.createdAt.getTime() > EXTERNAL_PRE_DIAL_TTL_MS
    )
      return refuse("no usable external carrier pre-dial for this call");
    const token = this.getCustomHeader(
      event.customHeaders,
      EXTERNAL_CALL_HEADER,
    );
    if (!token || verifyCallCorrelation(token) !== call.id)
      return refuse("its pre-dial token is missing or names another call");

    const ctx: OwnershipContext = {
      userId: call.userId,
      organizationId: call.organizationId,
    };
    const destination = await this.externalCarriers.outboundCarrierDestination(
      ctx,
      {
        fromNumber: call.fromNumber,
        toNumber: call.toNumber,
        externalSipEndpointId: call.externalSipEndpointId,
      },
    );
    if (!destination) {
      await this.callRepository.failPendingExternalCall(
        ctx,
        call.id,
        "The external carrier route is no longer available.",
      );
      return refuse("the external carrier route no longer holds");
    }

    // Were the browser's side reported as a leg of its own and bound first,
    // this one only relays it, and must belong to the same call session.
    const relay = !!call.callControlId && call.callControlId !== entry;
    if (
      relay &&
      (!call.callSessionId || call.callSessionId !== event.callSessionId)
    )
      return refuse("its pre-dial is carried by another call");
    // A leg the gates refuse is ended with its mark, like any refused entry
    // leg, so its later webhooks — its cost included — are recognized.
    if (
      !call.callControlId &&
      !(await this.claimExternalOutbound(ctx, call, event, refuse, (leg) =>
        this.telephonyService.refuseCarrierOutbound(
          leg,
          `carrier-outbound-refuse-${leg}`,
        ),
      ))
    )
      return;

    // One carrier leg per pre-dial. A redelivered webhook for the leg already
    // sent on changes nothing; any other leg with the same key reaches nobody.
    const claim = carrierOutboundBridgeKey(call.id);
    let claimed: boolean;
    try {
      claimed = await this.redis.setIfAbsent(
        claim,
        entry,
        CARRIER_OUTBOUND_BRIDGE_TTL_SECS,
      );
      if (!claimed && (await this.redis.getRaw(claim)) === entry) return;
    } catch {
      claimed = false;
    }
    if (!claimed) {
      if (relay) return refuse("this pre-dial is already connected");
      this.logger.warn(
        `⛔ External carrier call ${call.id} could not be sent on: its carrier leg is already claimed`,
      );
      await this.telephonyService.hangupCall(entry).catch(() => undefined);
      return;
    }

    this.logger.log(
      `🔀 Sending external carrier call ${call.id} on to its carrier (${
        relay ? `relayed by ${entry}` : `leg ${entry}`
      })`,
    );
    try {
      await this.telephonyService.connectOutboundToCarrier(entry, {
        destinationUri: destination,
        from: call.fromNumber,
        correlation: signCallCorrelation(call.id),
        commandId: `carrier-outbound-${call.id}`,
        timeoutSecs: EXTERNAL_CARRIER_RING_SECS,
        markEntry: relay,
      });
    } catch (error) {
      const reason = `the carrier leg could not be started (${error instanceof Error ? error.name : "error"})`;
      if (relay) return refuse(reason);
      this.logger.warn(`⛔ External carrier call ${call.id}: ${reason}`);
      await this.callRepository
        .updateControlState(entry, {
          errorMessage: "The external carrier could not be reached.",
        })
        .catch(() => undefined);
      // The leg is the call: its own hangup ends the row the ordinary way.
      await this.telephonyService.hangupCall(entry).catch(() => undefined);
    }
  }

  /**
   * The carrier leg ended: busy, declined, unanswered, unreachable — or the
   * far end hung up after talking. A transfer that fails leaves the browser's
   * call parked on the application, so it is ended here, with the cause on
   * the row.
   */
  private async endExternalOutbound(
    leg: CarrierOutboundLeg,
    event: TelephonyEvent,
  ): Promise<void> {
    const id = leg.call ? verifyCallCorrelation(leg.call) : null;
    const call = id ? await this.callRepository.findById(id) : null;
    if (!call?.externalSipEndpointId || call.direction !== "outbound") return;
    const cause = (event.payload as CallHangupPayload).hangup_cause;
    if (call.callControlId && !call.answeredAt && cause !== "originator_cancel")
      await this.callRepository
        .updateControlState(call.callControlId, {
          errorMessage: `The external carrier did not connect the call${cause ? ` (${cause})` : ""}.`,
        })
        .catch(() => undefined);
    // After a conversation both sides end together; only an unanswered
    // attempt leaves the browser's call parked on the application.
    if (call.answeredAt) return;
    const ending = `carrier-outbound-end-${call.id}`;
    const entry = await this.redis
      .getRaw(carrierOutboundBridgeKey(call.id))
      .catch(() => null);
    if (entry && entry !== call.callControlId)
      await this.telephonyService
        .refuseCarrierOutbound(entry, ending)
        .catch(() => undefined);
    if (call.callControlId)
      await this.telephonyService
        .hangupCall(call.callControlId, ending)
        .catch((err) =>
          this.logger.debug(
            `External carrier call ${call.id} was already ending: ${err.message}`,
          ),
        );
  }

  /**
   * The desk phone answered an inbound call. Either leg may report it, so the
   * row turns answered — and answer automation runs — only once. The phone's
   * owner is recorded as the member who took it, the same way a ring group
   * records its winner.
   */
  private async answerDeskPhoneInboundOnce(
    callControlId: string,
    ownerUserId: string | null,
  ) {
    const answered = await this.callRepository.markAnsweredOnce(
      callControlId,
      ownerUserId,
    );
    if (!answered) return;
    await this.inboundRing.recordAnswer(answered, ownerUserId);
    await this.applyAnswerAutomation(answered);
  }

  /**
   * Dial pre-flight for a call from an external (Bring Your Own Carrier)
   * number on the ordinary web dialer. Same shape as the SDK's authorize: the
   * `Call` row is created here and the browser gets a signed token to place
   * the leg with. `call.initiated` adopts the row, so status, cost, recording,
   * CRM and history all run through the normal lifecycle.
   *
   * The browser's leg goes to Ringee's own Call Control application, addressed
   * with the call's signed key — never to the carrier. When it arrives there,
   * the server sends it on to the carrier (`bridgeExternalOutbound`).
   */
  async prepareExternalOutbound(
    ctx: OwnershipContext,
    numberId: string,
    destination: string,
  ) {
    const route = await this.externalCarriers.resolveOutbound(
      ctx,
      numberId,
      destination,
    );
    const user = await this.userService.getCachedUserById(ctx.userId);
    if (user?.canCall === false)
      throw new ForbiddenException(
        "Outbound calling is disabled for this account.",
      );
    if (!user?.freeCallTrial && (await this.creditService.getBalance(ctx)) <= 0)
      throw new HttpException(
        "Not enough credit to place this call.",
        HttpStatus.PAYMENT_REQUIRED,
      );
    const contact = await this.contactService.findByPhone(ctx, route.toNumber);
    const call = await this.callRepository.createCall(ctx, {
      fromNumber: route.fromNumber,
      toNumber: route.toNumber,
      direction: "outbound",
      source: "web",
      status: CallStatus.pending,
      clientState: Buffer.from("initiate_call").toString("base64"),
      contact: contact ? { connect: { id: contact.id } } : undefined,
      externalCarrierId: route.externalCarrierId,
      externalSipEndpointId: route.externalSipEndpointId,
    });
    let destinationUri: string;
    try {
      destinationUri = await this.externalCarriers.outboundEntry(call.id);
    } catch (error) {
      await this.callRepository
        .failPendingExternalCall(ctx, call.id, "The call could not be started.")
        .catch(() => undefined);
      throw error;
    }
    return {
      phoneNumber: route.fromNumber,
      numberId: null,
      rotated: false,
      reason: "external_carrier",
      destinationUri,
      callToken: signCallCorrelation(call.id),
    };
  }

  /** A pre-dial whose leg never reached the provider must not stay pending. */
  async abandonExternalOutbound(ctx: OwnershipContext, token: string) {
    const id = verifyCallCorrelation(token);
    if (!id) return;
    await this.callRepository.failPendingExternalCall(
      ctx,
      id,
      "The call could not be started.",
    );
  }

  /**
   * `call.initiated` for the browser's leg of an external carrier pre-dial.
   * Only a pre-dial issued by `prepareExternalOutbound` may use a carrier: the
   * token names the row, and the leg must be addressed with that same row's
   * call key, so a token cannot carry another call. Where the call then goes
   * is not the browser's to say: the server sends it on from its own records
   * (`bridgeExternalOutbound`).
   */
  private async adoptExternalOutbound(
    token: string | null,
    event: TelephonyEvent,
  ): Promise<void> {
    const { callControlId } = event;
    const refuse = async (reason: string) => {
      this.logger.warn(
        `⛔ Hanging up external carrier leg ${callControlId}: ${reason}`,
      );
      await this.telephonyService
        .hangupCall(callControlId)
        .catch((err) =>
          this.logger.error(
            `Failed to hang up external carrier leg ${callControlId}: ${err.message}`,
            err.stack,
          ),
        );
    };

    const id = token ? verifyCallCorrelation(token) : null;
    const call = id ? await this.callRepository.findById(id) : null;
    if (call && call.callControlId === callControlId) {
      // Redelivered call.initiated for a leg this row already owns.
      await this.replayParkedCallEvents(callControlId);
      return;
    }
    if (
      !call?.userId ||
      !call.externalSipEndpointId ||
      call.direction !== "outbound" ||
      call.status !== CallStatus.pending ||
      call.callControlId ||
      Date.now() - call.createdAt.getTime() > EXTERNAL_PRE_DIAL_TTL_MS
    ) {
      if (call?.userId && call.externalSipEndpointId && !call.callControlId)
        await this.callRepository.failPendingExternalCall(
          { userId: call.userId, organizationId: call.organizationId },
          call.id,
          "The call authorization expired or is no longer available.",
        );
      return refuse("no usable external carrier pre-dial for this leg");
    }

    const ctx: OwnershipContext = {
      userId: call.userId,
      organizationId: call.organizationId,
    };
    const host = await this.externalCarriers.confirmOutboundRoute(ctx, {
      fromNumber: call.fromNumber,
      externalSipEndpointId: call.externalSipEndpointId,
    });
    // The provider may report the destination with or without its host; the
    // key is the proof, and it must be this row's.
    if (!host || verifyCarrierCallKey(sipUser(event.to)) !== call.id) {
      await this.callRepository.failPendingExternalCall(
        ctx,
        call.id,
        "The external carrier route is no longer available.",
      );
      return refuse(
        host
          ? `leg is not addressed with its own call key (to=${event.to})`
          : "the external carrier route no longer holds",
      );
    }

    await this.claimExternalOutbound(ctx, call, event, refuse);
  }

  /**
   * Binds a leg to its pre-dial's row: the same credit and one-call gates, in
   * the same order, as every other browser-placed leg, then an atomic claim,
   * so exactly one leg carries a pre-dial. True when the row is this leg's.
   * `endLeg` is how a leg the gates refuse ends (hung up by default).
   */
  private async claimExternalOutbound(
    ctx: OwnershipContext,
    call: Call,
    event: TelephonyEvent,
    refuse: (reason: string) => Promise<void>,
    endLeg?: (callControlId: string) => Promise<void>,
  ): Promise<boolean> {
    const { callControlId } = event;
    if (
      !(await this.ensureCallAffordable(ctx, callControlId, endLeg)) ||
      !(await this.ensureNoConcurrentCall(ctx, callControlId, endLeg))
    ) {
      await this.callRepository.failPendingExternalCall(
        ctx,
        call.id,
        "The call was refused.",
      );
      return false;
    }

    const claimed = await this.callRepository.claimPendingCall(call.id, {
      callControlId,
      callSessionId: event.callSessionId,
      callLegId: event.callLegId,
      connectionId: event.connectionId ?? apiConfiguration.TELNYX_CONNECTION_ID,
      startedAt: event.startedAt,
    });
    if (!claimed) {
      const current = await this.callRepository.findById(call.id);
      if (current?.callControlId !== callControlId) {
        await refuse("its pre-dial was already used by another leg");
        return false;
      }
      await this.replayParkedCallEvents(callControlId);
      return true;
    }

    const adopted = await this.callRepository.findById(call.id);
    if (adopted) {
      void this.inboxTimelineService
        .ensureThreadForCall(adopted)
        .catch((err) =>
          this.logger.error(
            `Inbox ensureThreadForCall failed (external carrier, call=${adopted.id}): ${err.message}`,
            err.stack,
          ),
        );
    }
    this.logger.log(
      `📞 External carrier call ${callControlId} adopted → ${call.id}`,
    );
    await this.replayParkedCallEvents(callControlId);
    return true;
  }

  onModuleDestroy(): void {
    for (const timer of this.lowBalanceHangupTimers.values()) {
      clearTimeout(timer);
    }
    this.lowBalanceHangupTimers.clear();
  }

  /**
   * Persist a post-call disposition and IMMEDIATELY push it to the CRM — the
   * user's request is the ONLY thing that fires the note for answered dialer
   * calls (the hangup webhook merely prepares the sync snapshot).
   *
   * Centralized here on purpose: every disposition entry point (web dialer,
   * mobile, extension) must trigger the sync, or the note never reaches the
   * CRM at all.
   *
   * `outcome` is optional — a bare "close"/"skip" with no outcome still
   * finalizes the note with whatever metadata the call already carries.
   */
  async setOutcome(
    callId: string,
    opts: { outcome?: CallOutcome | null; outcomeNote?: string | null } = {},
  ): Promise<Call | null> {
    const call =
      opts.outcome != null
        ? await this.callRepository.updateOutcome(
            callId,
            opts.outcome,
            opts.outcomeNote ?? undefined,
          )
        : await this.callRepository.findById(callId);

    // AI Pipeline: mobile and any other callers that centralize outcome writes
    // here must feed the same idempotent fan-out as the web/meeting flow.
    if (call?.outcome) {
      this.pipelineFanout.handleCallFinalized(call.id);
    }

    // Best-effort: fold the finalized disposition into the held call-log note
    // and push it now. CRM problems must never fail the disposition.
    void this.crmCallLogService
      .enqueueOutcomeUpdate(callId)
      .catch((err: Error) =>
        this.logger.warn(
          `crm outcome update failed for call ${callId}: ${err.message}`,
        ),
      );

    return call;
  }

  /**
   * Apply the call owner's recording/transcription settings when a call is
   * answered. Both actions are best-effort: a transcription/recording failure
   * must never break webhook processing of the live call.
   *
   * Resolution follows the context rule (org settings when the call has an
   * organizationId, otherwise the user's settings).
   */
  private async applyAnswerAutomation(call: Call): Promise<void> {
    if (!call.callControlId) return;
    const ctx: OwnershipContext = {
      userId: call.userId!,
      organizationId: call.organizationId,
    };

    let settings;
    try {
      settings = await this.recordingSettingsService.resolve(ctx);
    } catch (err) {
      this.logger.warn(
        `Could not resolve recording settings for call ${call.id}: ${(err as Error).message}`,
      );
      return;
    }

    if (settings.recordAllCalls) {
      await this.telephonyService
        .startRecording(call.callControlId)
        .then(() =>
          this.logger.log(`⏺️ Auto-recording started for call ${call.id}`),
        )
        .catch((err) =>
          this.logger.error(
            `Auto-recording failed for call ${call.id}: ${err.message}`,
          ),
        );
    }

    if (settings.transcribeRealtime) {
      // Realtime transcription is independent of recording.
      await this.transcriptionOrchestrator
        .startRealtimeForCall(call)
        .catch((err: Error) =>
          this.logger.error(
            `Auto realtime transcription failed for call ${call.id}: ${err.message}`,
          ),
        );
    }
  }

  /**
   * On hangup, stop any live transcription. The media bridge finalizes the
   * realtime transcript status when Telnyx closes the stream. Automatic
   * transcription from the recording is triggered later, in the worker, once
   * the recordingUrl becomes available (see worker.processCallRecording).
   */
  private async applyHangupAutomation(call: Call): Promise<void> {
    await this.transcriptionOrchestrator
      .stopRealtimeForCall(call)
      .catch((err: Error) =>
        this.logger.warn(
          `stopRealtime on hangup failed for call ${call.id}: ${err.message}`,
        ),
      );
  }

  /**
   * Park a lifecycle event whose `Call` row does not exist yet.
   *
   * Telnyx does not guarantee webhook ordering, and `call.initiated` is our
   * slowest handler (ownership, credit, concurrency, contact lookup) — so on a
   * fast-failing dial `call.hangup` regularly wins the race. Dropping it left
   * the row the initiated handler was about to write stuck in `ringing`
   * forever, which permanently occupied the user's single call slot and made
   * every later dial fail with "you already have a call in progress".
   */
  private async parkOrphanCallEvent(
    callControlId: string,
    event: TelephonyEvent,
  ): Promise<void> {
    this.logger.warn(
      `⏳ ${event.type} arrived before its call row (${callControlId}) — parking it for replay`,
    );
    const parked = await this.readParkedCallEvents(callControlId);
    await this.redis
      .set(
        orphanEventsKey(callControlId),
        JSON.stringify([...parked, event]),
        ORPHAN_EVENT_TTL_SECONDS * 1000,
      )
      .catch((error: Error) =>
        this.logger.error(
          `Could not park ${event.type} for ${callControlId}: ${error.message}`,
        ),
      );
  }

  /**
   * Replay whatever landed early, in arrival order, now that the row exists.
   * Called at the end of every `call.initiated` path that persisted a call.
   */
  private async replayParkedCallEvents(callControlId: string): Promise<void> {
    const parked = await this.readParkedCallEvents(callControlId);
    if (parked.length === 0) return;

    await this.redis.del(orphanEventsKey(callControlId)).catch(() => undefined);

    for (const event of parked) {
      this.logger.warn(
        `↩️ Replaying out-of-order ${event.type} for ${callControlId}`,
      );
      await this.handleTelephonyEvent(event).catch((error: Error) =>
        this.logger.error(
          `Replay of ${event.type} for ${callControlId} failed: ${error.message}`,
          error.stack,
        ),
      );
    }
  }

  private async readParkedCallEvents(
    callControlId: string,
  ): Promise<TelephonyEvent[]> {
    const raw = await this.redis
      .get<TelephonyEvent[] | string>(orphanEventsKey(callControlId))
      .catch(() => undefined);
    if (!raw) return [];
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (!Array.isArray(parsed)) return [];
      // `occurredAt` is a Date on the way in and a string on the way back out
      // of Redis; revive it so a replayed event is shaped like a fresh one.
      return (parsed as TelephonyEvent[]).map((event) => ({
        ...event,
        occurredAt: event.occurredAt ? new Date(event.occurredAt) : null,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Authoritative half of the one-call-at-a-time rule.
   *
   * Every dial surface refuses a second concurrent call up front, but a client
   * can always talk to Telnyx directly and skip that check — the WebRTC leg is
   * placed by the browser, not by us. This runs on `call.initiated` for every
   * outbound leg and hangs up the newcomer when the user is already on a call,
   * so the rule holds no matter how the call was started.
   *
   * Only a personal-workspace call is limited (CALL-001). An organization leg is
   * let through without binding the lease, which would otherwise overwrite the
   * reservation of a personal call running at the same time.
   *
   * Returns false when the event must stop being processed. `endLeg` is how
   * a refused leg ends; a leg that must keep its own marker supplies it.
   */
  private async ensureNoConcurrentCall(
    ctx: OwnershipContext,
    callControlId: string,
    endLeg: (callControlId: string) => Promise<void> = (id) =>
      this.telephonyService.hangupCall(id),
  ): Promise<boolean> {
    if (
      !(await this.concurrentCallGuard.appliesTo(
        ctx.userId,
        ctx.organizationId,
      ))
    ) {
      return true;
    }

    const busy = await this.concurrentCallGuard.findOccupyingCall(
      ctx.userId,
      callControlId,
    );
    if (!busy) {
      // Bind the lease to this leg so it survives for the call's lifetime and
      // so a dial that never went through pre-flight still holds the slot.
      await this.concurrentCallGuard.bindToCall(ctx.userId, callControlId);
      return true;
    }

    this.logger.warn(
      `⛔ Hanging up call ${callControlId}: user ${ctx.userId} is already on call ` +
        `${busy.id} (${busy.callControlId}, source=${busy.source ?? "unknown"})`,
    );
    await endLeg(callControlId).catch((err) =>
      this.logger.error(
        `Failed to hang up concurrent call ${callControlId}: ${err.message}`,
        err.stack,
      ),
    );
    return false;
  }

  /**
   * Decide whether `ctx`'s owner may place/continue a call.
   * Owners flagged with an active free-call trial are always allowed.
   * Otherwise a positive credit balance (user or organization, resolved from
   * the context) is required. If neither holds, the live call is ended with
   * `endLeg` (hung up by default) and `false` is returned so the caller stops
   * processing the event.
   */
  private async ensureCallAffordable(
    ctx: OwnershipContext,
    callControlId: string,
    endLeg: (callControlId: string) => Promise<void> = (id) =>
      this.telephonyService.hangupCall(id),
  ): Promise<boolean> {
    const user = await this.userService.getCachedUserById(ctx.userId);
    if (user?.canCall === false) {
      this.logger.warn(
        `⛔ Hanging up call ${callControlId}: outbound calling disabled ` +
          `(userId=${ctx.userId})`,
      );
      await endLeg(callControlId).catch((err) =>
        this.logger.error(
          `Failed to hang up disabled call ${callControlId}: ${err.message}`,
          err.stack,
        ),
      );
      return false;
    }
    if (user?.freeCallTrial) {
      return true;
    }

    const balance = await this.creditService.getBalance(ctx);
    if (balance > 0) {
      return true;
    }

    this.logger.warn(
      `⛔ Hanging up call ${callControlId}: no credit ` +
        `(userId=${ctx.userId} orgId=${ctx.organizationId})`,
    );
    await endLeg(callControlId).catch((err) =>
      this.logger.error(
        `Failed to hang up call ${callControlId}: ${err.message}`,
        err.stack,
      ),
    );
    return false;
  }

  /**
   * Adopt a pre-created SDK `Call` (source="sdk", status=pending) when the
   * Telnyx `call.initiated` webhook carries a valid signed correlation token.
   * Returns true when the token was handled (adopted OR hung up for credit),
   * false when it should be ignored (bad signature / not adoptable).
   */
  private async adoptSdkCall(
    correlationToken: string,
    callControlId: string,
    event: TelephonyEvent,
  ): Promise<boolean> {
    const callId = verifyCallCorrelation(correlationToken);
    if (!callId) return false;

    const existing = await this.callRepository.findById(callId);
    if (
      !existing ||
      existing.source !== "sdk" ||
      existing.status !== CallStatus.pending ||
      existing.callControlId ||
      !existing.userId
    ) {
      return false;
    }

    const ctx: OwnershipContext = {
      userId: existing.userId,
      organizationId: existing.organizationId,
    };

    // Same credit/enablement gate as the web path (hangs up if unaffordable).
    if (!(await this.ensureCallAffordable(ctx, callControlId))) {
      return true;
    }

    // Same one-call-at-a-time rule as the web path. The row being adopted is
    // still `pending`, so it never counts as the user's occupying call.
    if (!(await this.ensureNoConcurrentCall(ctx, callControlId))) {
      return true;
    }

    // Audit which owned number presented as caller ID.
    const presentedNumberId = await this.callerIdRotationService
      .registerOutboundCall(ctx, event.from ?? "")
      .catch(() => null);

    const adopted = await this.callRepository.attachTelephony(existing.id, {
      callControlId,
      callSessionId: event.callSessionId ?? undefined,
      callLegId: event.callLegId ?? undefined,
      connectionId: apiConfiguration.TELNYX_CONNECTION_ID,
      startedAt: event.startedAt ?? undefined,
      status: CallStatus.ringing,
      callerIdId: presentedNumberId ?? existing.callerIdId ?? undefined,
    });

    if (adopted) {
      void this.inboxTimelineService
        .ensureThreadForCall(adopted)
        .catch((err) =>
          this.logger.error(
            `Inbox ensureThreadForCall failed (sdk, call=${adopted.id}): ${err.message}`,
            err.stack,
          ),
        );
    }

    this.logger.log(`📞 SDK call ${callControlId} adopted → ${existing.id}`);
    return true;
  }

  private clearLowBalanceHangup(callControlId: string): void {
    const timer = this.lowBalanceHangupTimers.get(callControlId);
    if (!timer) return;
    clearTimeout(timer);
    this.lowBalanceHangupTimers.delete(callControlId);
  }

  private scheduleLowBalanceHangup(
    call: Call,
    balance: number,
    maxSeconds: number,
  ): void {
    if (!call.callControlId) return;

    this.clearLowBalanceHangup(call.callControlId);

    const timer = setTimeout(() => {
      this.telephonyService
        .hangupCall(call.callControlId!)
        .then(() =>
          this.logger.warn(
            `⏳ Low-balance duration limit reached (${maxSeconds}s). Hanging up call ${call.callControlId}`,
          ),
        )
        .catch((err) =>
          this.logger.error(
            `Failed low-balance hangup for call ${call.callControlId}: ${err.message}`,
            err.stack,
          ),
        )
        .finally(() => this.lowBalanceHangupTimers.delete(call.callControlId!));
    }, maxSeconds * 1000);

    timer.unref?.();
    this.lowBalanceHangupTimers.set(call.callControlId, timer);

    this.logger.warn(
      `Low-balance policy armed for call ${call.callControlId}: balance=$${balance.toFixed(2)}; maxDuration=${maxSeconds}s`,
    );
  }

  /**
   * Re-check balance once the call is answered:
   * - balance <= 0: hang up immediately
   * - balance <= $1: cap call duration to 5 minutes
   */
  private async enforceAnsweredCreditPolicy(call: Call): Promise<boolean> {
    if (!call.callControlId || !call.userId) return true;

    const direction = (call.direction || "").toLowerCase();
    if (!["outbound", "outgoing"].includes(direction)) {
      return true;
    }

    const ctx: OwnershipContext = {
      userId: call.userId,
      organizationId: call.organizationId,
    };

    const user = await this.userService.getCachedUserById(ctx.userId);
    if (user?.canCall === false) {
      this.logger.warn(
        `⛔ Hanging up answered call ${call.callControlId}: outbound calling disabled ` +
          `(userId=${ctx.userId})`,
      );
      await this.telephonyService
        .hangupCall(call.callControlId)
        .catch((err) =>
          this.logger.error(
            `Failed to hang up disabled call ${call.callControlId}: ${err.message}`,
            err.stack,
          ),
        );
      return false;
    }
    if (user?.freeCallTrial) {
      return true;
    }

    const balance = await this.creditService.getBalance(ctx);
    if (balance <= 0) {
      this.logger.warn(
        `⛔ Hanging up answered call ${call.callControlId}: no credit ` +
          `(userId=${ctx.userId} orgId=${ctx.organizationId})`,
      );
      await this.telephonyService
        .hangupCall(call.callControlId)
        .catch((err) =>
          this.logger.error(
            `Failed to hang up call ${call.callControlId}: ${err.message}`,
            err.stack,
          ),
        );
      return false;
    }

    if (balance <= LOW_BALANCE_USD) {
      this.scheduleLowBalanceHangup(
        call,
        balance,
        LOW_BALANCE_MAX_CALL_SECONDS,
      );
    } else {
      this.clearLowBalanceHangup(call.callControlId);
    }

    return true;
  }

  /**
   * Extract a custom header value from a Telnyx call.initiated payload.
   * Telnyx delivers custom headers as an array of `{ name, value }` objects;
   * names are case-insensitive in SIP, so we compare lower-cased.
   */
  private getCustomHeader(headers: unknown, name: string): string | null {
    if (!Array.isArray(headers)) return null;
    const target = name.toLowerCase();
    const found = (headers as Array<{ name?: string; value?: string }>).find(
      (h) => typeof h?.name === "string" && h.name.toLowerCase() === target,
    );
    return found?.value ?? null;
  }

  /**
   * A backstop just hung up a leg. When the leg was a campaign dial, hand its
   * assignment back so the agent is not left `dialing` a call that no longer
   * exists. Best-effort: the leg is already down either way.
   */
  private async releaseRefusedCampaignLeg(
    callAttemptId: string | null,
    userId: string,
    blocked: { reason: string; message: string },
  ): Promise<void> {
    if (!callAttemptId) return;
    await this.callAttemptService
      .handleDialRefused(callAttemptId, userId, blocked)
      .catch((err: Error) =>
        this.logger.warn(
          `Could not release refused campaign attempt ${callAttemptId}: ${err.message}`,
        ),
      );
  }

  /**
   * Extract callAttemptId from the leg's client state if present.
   * Returns null if the call is not a campaign call.
   */
  private extractCallAttemptId(clientState: string | null): string | null {
    try {
      if (!clientState) return null;
      const decoded = Buffer.from(clientState, "base64").toString("utf-8");
      const parsed = JSON.parse(decoded);
      return parsed.callAttemptId ?? null;
    } catch {
      return null;
    }
  }

  async findOneBySessionId(callSessionId: string): Promise<Call | null> {
    return this.callRepository.findOneBySessionId(callSessionId);
  }

  async findById(id: string): Promise<Call | null> {
    return this.callRepository.findById(id);
  }

  async findByControlId(callControlId: string): Promise<Call | null> {
    return this.callRepository.findByControlId(callControlId);
  }

  async listByOwnerPaginated(
    ctx: OwnershipContext,
    options: {
      page?: number;
      limit?: number;
      status?: CallStatus[];
      outcome?: CallOutcome[];
      contactId?: string;
      dateFrom?: string;
      dateTo?: string;
      campaignId?: string;
      excludeCampaignCalls?: boolean;
      includeMeetings?: boolean;
      includeTranscriptions?: boolean;
      userId?: string;
      orderBy?: "createdAt" | "startedAt" | "endedAt";
      sortDirection?: "asc" | "desc";
    } = {},
  ): Promise<{
    data: Call[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    return this.callRepository.listByOwnerPaginated(ctx, options);
  }

  /**
   * One call with everything the detail screen shows.
   *
   * `NotFoundException` is deliberately the only failure: a call in another
   * workspace, a call belonging to a teammate a member may not see, and a call
   * that never existed are all the same answer, so the id cannot be used to
   * probe for what exists.
   */
  async getDetailForOwner(
    ctx: OwnershipContext,
    id: string,
    options: { filterUserId?: string } = {},
  ): Promise<CallDetail> {
    const call = await this.callRepository.findDetailForOwner(ctx, id, options);
    if (!call) throw new NotFoundException("Call not found");
    return call;
  }

  async getNavigationForOwner(
    ctx: OwnershipContext,
    id: string,
    options: {
      filterUserId?: string;
      dateFrom?: string;
      dateTo?: string;
    } = {},
  ) {
    const navigation = await this.callRepository.findNavigationForOwner(
      ctx,
      id,
      options,
    );
    if (!navigation) throw new NotFoundException("Call not found");
    return navigation;
  }

  async listWithRecordings(params: {
    ctx: OwnershipContext;
    dateFrom?: Date;
    dateTo?: Date;
    page?: number;
    limit?: number;
    filterUserId?: string;
  }): Promise<{
    data: Call[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    return this.callRepository.listWithRecordings(params);
  }

  /**
   * The Clerk user id the dialing client attributed this leg to, or `null`.
   *
   * `null` is a real answer and callers MUST treat it as one: a leg with no
   * `X-User-Id` (an old client, a direct SIP/WebRTC client, a browser that
   * dialed before Clerk hydrated and sent an empty value) belongs to nobody we
   * can name. It used to be handed to the user lookup as `undefined`, which
   * resolved to an arbitrary account — that account was then billed for the
   * call and had its single call slot taken by a stranger.
   */
  getClerkUserIdFromHeaders(headers: any): string | null {
    if (!Array.isArray(headers)) return null;
    const value = headers.find(
      (header: any) => header?.name === "X-User-Id",
    )?.value;
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  async getOrganizationIdFromHeaders(headers: any): Promise<string | null> {
    const clerkOrganizationId = Array.isArray(headers)
      ? headers?.find((header: any) => header.name === "X-Organization-Id")
          ?.value || null
      : null;

    if (!clerkOrganizationId) {
      return null;
    }

    const organization =
      await this.organizationService.getByClerkId(clerkOrganizationId);

    return organization?.id || null;
  }

  /**
   * Consume the events belonging to a server-originated voicemail drop.
   *
   * Returns true when the event was fully handled here. Only the leg's own
   * choreography is claimed (answer → machine detection → playback → hangup
   * command); `call.hangup` and `call.cost` deliberately fall through so a
   * drop is completed, priced and charged like any other call.
   */
  private async handleVoicemailDropEvent(
    event: TelephonyEvent,
    callControlId: string,
  ): Promise<boolean> {
    const { type: eventType, payload } = event;

    // Events a drop's own choreography can consume. Note that the carrier's
    // premium answering-machine tier is folded into
    // `call.machine.greeting.ended` during normalization, so there is one case
    // here where the raw provider feed has two.
    switch (eventType) {
      case "call.initiated":
      case "call.answered":
      case "call.machine.detection.ended":
      case "call.machine.greeting.ended":
      case "call.playback.started":
      case "call.playback.ended":
        break;
      default:
        return false;
    }

    const dropState = this.voicemailDropService.parseClientState(
      event.clientState ?? undefined,
    );
    const isPlayback = this.voicemailDropService.isPlaybackState(
      event.clientState ?? undefined,
    );
    if (!dropState && !isPlayback) {
      return false;
    }

    switch (eventType) {
      case "call.initiated":
        // The Call row was written at dial time — nothing to adopt, and the
        // WebRTC attribution path below would drop this leg anyway.
        return true;

      case "call.answered":
        // Status only: a drop must not trigger recording, transcription or
        // answer-rate credit for the presented caller ID.
        await this.callRepository
          .updateStatus(callControlId, CallStatus.answered)
          .catch((err) =>
            this.logger.warn(
              `Failed to mark voicemail drop ${callControlId} answered: ${err.message}`,
            ),
          );
        return true;

      case "call.machine.detection.ended": {
        // A drop exists to land in the mailbox. `machine` is the only verdict
        // that leads to playback — and even then we wait for the greeting to
        // finish, because talking over it means the mailbox records a message
        // that starts mid-sentence. Anything else (a human picked up, or
        // Telnyx could not tell) ends the leg without playing: a wrong guess
        // here means a stranger answers to silence.
        const result = (payload as CallMachineDetectionPayload)?.result;
        if (result !== "machine") {
          this.logger.log(
            `📼 Voicemail drop ${callControlId} not delivered (AMD result: ${
              result ?? "unknown"
            }) — hanging up without playback`,
          );
          await this.voicemailDropService.abortDrop(callControlId);
        }
        return true;
      }

      case "call.machine.greeting.ended":
        if (dropState) {
          await this.voicemailDropService.handleGreetingEnded(
            callControlId,
            dropState,
          );
        }
        return true;

      case "call.playback.started":
        return true;

      case "call.playback.ended":
        await this.voicemailDropService.handlePlaybackEnded(callControlId);
        return true;

      default:
        return false;
    }
  }

  /**
   * Single entry point for inbound telephony events, in Ringee's own
   * vocabulary. The carrier adapter translates its webhooks into
   * `TelephonyEvent` (see TelnyxEventNormalizer), so this switch — and the call
   * lifecycle it drives — has no provider names in it.
   */
  async handleTelephonyEvent(event: TelephonyEvent) {
    const { type: eventType, callControlId, payload } = event;
    if (await this.handleDeskPhoneInboundLeg(event)) return;
    if (await this.handleCarrierOutboundLeg(event)) return;

    if (eventType === "unknown") {
      // Carriers emit far more than Ringee acts on. Record it and move on.
      await this.callRepository.logEvent(
        callControlId,
        event.providerEventType,
        payload,
      );
      return;
    }

    this.logger.debug(
      `📨 Telephony event received: ${eventType} (${event.provider}:${event.providerEventType})`,
    );

    // Voicemail drops are the one outbound leg we originate server-side: the
    // Call row already exists and answering-machine detection — not a human
    // agent — drives the leg. Everything up to hangup is handled here so the
    // WebRTC-shaped logic below never sees it.
    if (await this.handleVoicemailDropEvent(event, callControlId)) {
      return;
    }

    // AI voice agent conversations are the other leg nobody is on: the provider
    // runs the conversation and reports what it produced. The result service
    // owns those events end to end, so the WebRTC-shaped logic below never
    // sees them.
    if (await this.voiceAgentResults.handleTelephonyEvent(event)) {
      return;
    }

    switch (eventType) {
      case "call.initiated":
        // A leg sent to an external carrier reaches a customer's PBX, which
        // terminates it on their own carrier. It is either the pre-dial this
        // server issued or it is hung up — never attributed from headers.
        if (event.direction === "outbound") {
          const externalToken = this.getCustomHeader(
            event.customHeaders,
            EXTERNAL_CALL_HEADER,
          );
          const target = parseSipTarget(event.to);
          // An `@` that does not parse cleanly has no host this server can
          // vouch for, so it takes the same checked path as a carrier host.
          const malformedSipTarget = !target && !!event.to?.includes("@");
          if (
            externalToken ||
            malformedSipTarget ||
            isCarrierCallKey(sipUser(event.to)) ||
            (target && (await this.externalCarriers.isCarrierHost(target.host)))
          ) {
            await this.adoptExternalOutbound(externalToken, event);
            return;
          }
        }
        if (event.direction === "inbound") {
          // Every inbound call — Ringee number, customer carrier, future
          // trunk — takes the same path: identify the number, resolve its
          // destination, ring it. No routing decision is made in here.
          await this.handleInboundCall(event);
          return;
        }

        // Dialer SDK path: the browser embeds a SIGNED correlation token
        // (`X-Ringee-Call-Id`) for a `Call` already created at authorize time
        // (source="sdk"). Adopt that row instead of creating a duplicate. If
        // the token is invalid or the row isn't adoptable, drop rather than
        // fall through to the web-create path.
        {
          const sdkCorrelation = this.getCustomHeader(
            event.customHeaders,
            "X-Ringee-Call-Id",
          );
          if (sdkCorrelation) {
            const handled = await this.adoptSdkCall(
              sdkCorrelation,
              callControlId,
              event,
            );
            if (!handled) {
              this.logger.warn(
                `⚠️ SDK correlation present but not adoptable; dropping ${callControlId}`,
              );
            } else {
              await this.replayParkedCallEvents(callControlId);
            }
            return;
          }
        }

        // Public CallSession dialer path: the WebRTC client embeds the session
        // id and item id as custom headers so we can attribute the call to
        // the session owner without exposing their Clerk/DB ids in the URL.
        const ringeeSessionId = this.getCustomHeader(
          event.customHeaders,
          "X-Ringee-Call-Session-Id",
        );
        const ringeeSessionItemId = this.getCustomHeader(
          event.customHeaders,
          "X-Ringee-Call-Session-Item-Id",
        );

        let outboundCtx: OwnershipContext;
        if (ringeeSessionId) {
          const callSession =
            await this.callSessionRepository.findById(ringeeSessionId);
          if (!callSession || callSession.deletedAt) {
            this.logger.warn(
              `⚠️ Call session ${ringeeSessionId} not found or deleted`,
            );
            return;
          }
          outboundCtx = {
            userId: callSession.userId,
            organizationId: callSession.organizationId,
          };
        } else {
          const clerkUserId = this.getClerkUserIdFromHeaders(
            event.customHeaders,
          );

          if (!clerkUserId) {
            // Drop the leg rather than guess. Attributing an unidentified call
            // to "whoever the lookup returns" bills a stranger and takes their
            // one-call-at-a-time slot, which shows up as a teammate being told
            // they are already on a call they never made.
            this.logger.warn(
              `⚠️ Dropping outbound call ${callControlId}: no X-User-Id custom header ` +
                `(from=${event.from} to=${event.to}) — it cannot be attributed to a user`,
            );
            return;
          }

          const organizationId = await this.getOrganizationIdFromHeaders(
            event.customHeaders,
          );
          const user = await this.userService.getCachedByClerkId(clerkUserId);

          if (!user) {
            this.logger.warn(`⚠️ User ${clerkUserId} not found`);
            return;
          }

          outboundCtx = {
            userId: user.id,
            organizationId: organizationId,
          };
        }

        // A campaign leg names its CallAttempt in `client_state`. When that
        // attempt really was handed to this user, the call is the campaign's:
        // its credit gate and its bill belong to the campaign's organization,
        // not to whichever organization the agent's browser has active. Read
        // from the header, a switch of organization in another tab made this
        // backstop hang up every leg the dialer placed.
        const initiatedAttemptId = this.extractCallAttemptId(event.clientState);
        if (initiatedAttemptId && !ringeeSessionId) {
          const campaignLeg = await this.callAttemptService
            .resolveCampaignLeg(initiatedAttemptId, outboundCtx.userId)
            .catch(() => null);
          if (
            campaignLeg &&
            campaignLeg.organizationId !== outboundCtx.organizationId
          ) {
            this.logger.warn(
              `Campaign leg ${callControlId} attributed to the campaign's organization ${campaignLeg.organizationId} ` +
                `(browser sent ${outboundCtx.organizationId ?? "none"})`,
            );
            outboundCtx = {
              ...outboundCtx,
              organizationId: campaignLeg.organizationId,
            };
          }
        }

        // Credit-only gate: callers need credit > 0 to place calls.
        if (!(await this.ensureCallAffordable(outboundCtx, callControlId))) {
          await this.releaseRefusedCampaignLeg(
            initiatedAttemptId,
            outboundCtx.userId,
            {
              reason: "CALL_REFUSED",
              message:
                "The call was stopped: there is no credit left, or calling is disabled for you. Dialing is paused.",
            },
          );
          return;
        }

        // One call at a time per user, across every device. Enforced here too
        // because the browser places the WebRTC leg and can bypass pre-flight.
        if (!(await this.ensureNoConcurrentCall(outboundCtx, callControlId))) {
          await this.releaseRefusedCampaignLeg(
            initiatedAttemptId,
            outboundCtx.userId,
            {
              reason: "CONCURRENT_CALL",
              message:
                "The call was stopped because you are already on another call. Dialing is paused — resume when you're free.",
            },
          );
          return;
        }

        const contact = await this.contactService.findByPhone(
          outboundCtx,
          event.to ?? "",
        );

        // Resolve which owned number this call presents as caller ID (by its
        // `from`) so we can audit it on the Call row and count it toward the
        // number's daily usage / reputation. Best-effort: never block the call.
        const presentedNumberId = await this.callerIdRotationService
          .registerOutboundCall(outboundCtx, event.from ?? "")
          .catch(() => null);

        const outboundCall = await this.callRepository.createCall(outboundCtx, {
          contact: contact ? { connect: { id: contact.id } } : undefined,
          fromNumber: event.from ?? "",
          toNumber: event.to ?? "",
          connectionId: apiConfiguration.TELNYX_CONNECTION_ID,
          callControlId,
          direction: event.direction ?? "outbound",
          callSessionId: event.callSessionId ?? undefined,
          callLegId: event.callLegId ?? undefined,
          status: CallStatus.ringing,
          startedAt: event.startedAt ?? undefined,
          clientState: Buffer.from("initiate_call").toString("base64"),
          callerId: presentedNumberId
            ? { connect: { id: presentedNumberId } }
            : undefined,
        });

        // Inbox thread materialises now so the conversation appears
        // immediately in the inbox while the call is still in progress.
        if (outboundCall) {
          void this.inboxTimelineService
            .ensureThreadForCall(outboundCall)
            .catch((err) =>
              this.logger.error(
                `Inbox ensureThreadForCall failed (outbound, call=${outboundCall.id}): ${err.message}`,
                err.stack,
              ),
            );
        }

        // Link to campaign call attempt if present
        if (initiatedAttemptId && outboundCall) {
          await this.callAttemptService.handleWebhookEvent(
            initiatedAttemptId,
            eventType,
            outboundCall,
          );
        }

        // Link to the originating CallSessionItem so the public dialer
        // can resolve the Ringee callId without an extra round-trip.
        if (ringeeSessionItemId && outboundCall) {
          await this.callSessionRepository
            .updateItem(ringeeSessionItemId, {
              call: { connect: { id: outboundCall.id } },
            })
            .catch((err) =>
              this.logger.warn(
                `Failed to link CallSessionItem ${ringeeSessionItemId} to call ${outboundCall.id}: ${err.message}`,
              ),
            );
        }

        this.logger.log(`📞 Llamada ${callControlId} iniciada`);

        // Apply any answered/hangup that overtook this webhook. Without this
        // the row below stays `ringing` with no `endedAt` forever and blocks
        // every future dial by this user.
        await this.replayParkedCallEvents(callControlId);
        break;

      case "call.answered": {
        const ringingCall =
          await this.callRepository.findByControlId(callControlId);
        if (!ringingCall) {
          // Beat `call.initiated` here too — park instead of throwing on a
          // missing row (which used to 500 the webhook).
          await this.parkOrphanCallEvent(callControlId, event);
          break;
        }
        if (
          ringingCall.direction === "inbound" &&
          ringingCall.sipDeviceId &&
          (ringingCall.inboundDestinationType ===
            InboundDestinationType.desk_phone ||
            ringingCall.externalSipEndpointId)
        ) {
          await this.answerDeskPhoneInboundOnce(
            callControlId,
            ringingCall.userId,
          );
          break;
        }

        const answeredCall = await this.callRepository.updateStatus(
          callControlId,
          CallStatus.answered,
        );
        const answeredAttemptId = this.extractCallAttemptId(event.clientState);
        if (answeredAttemptId && answeredCall) {
          await this.callAttemptService.handleWebhookEvent(
            answeredAttemptId,
            eventType,
            answeredCall,
          );
        }

        if (answeredCall) {
          const canContinue =
            await this.enforceAnsweredCreditPolicy(answeredCall);
          if (!canContinue) {
            break;
          }
        }

        // Whoever took it, no other endpoint may keep ringing for this call.
        // The claim endpoint already does this for a member who answers in
        // the dashboard; this covers an answer the provider reports first.
        if (answeredCall?.direction === "inbound") {
          await this.inboundRing.recordAnswer(
            answeredCall,
            answeredCall.answeredByUserId,
          );
        }

        // Apply Record all / Transcribe realtime settings once the call is up.
        if (answeredCall) {
          await this.applyAnswerAutomation(answeredCall);
        }
        break;
      }

      case "call.hangup": {
        const hangupPayload = payload as CallHangupPayload;

        this.clearLowBalanceHangup(callControlId);

        const hangupCall = await this.callRepository.completeCall(
          callControlId,
          hangupPayload.start_time!,
          hangupPayload.end_time!,
          hangupPayload.hangup_cause,
        );

        if (!hangupCall) {
          // The row does not exist YET: this hangup overtook `call.initiated`.
          // Park it so that handler can close the call it is about to create.
          await this.parkOrphanCallEvent(callControlId, event);
          break;
        }

        // The caller is gone: nothing may still be ringing for this call,
        // whether one endpoint was offered it or a whole ring group.
        if (hangupCall.direction === "inbound") {
          await this.inboundRing.cancelForEndedCall(
            hangupCall,
            `caller_hangup${hangupPayload.hangup_cause ? `:${hangupPayload.hangup_cause}` : ""}`,
          );
        }

        // Free the user's single call slot as soon as the leg is down, so they
        // can dial again from any device without waiting for a TTL.
        if (hangupCall?.userId) {
          await this.concurrentCallGuard
            .release(hangupCall.userId, callControlId)
            .catch((err: Error) =>
              this.logger.warn(
                `Could not release the dial lease for call ${callControlId}: ${err.message}`,
              ),
            );
        }
        const hangupAttemptId = this.extractCallAttemptId(event.clientState);
        if (hangupAttemptId && hangupCall) {
          await this.callAttemptService.handleWebhookEvent(
            hangupAttemptId,
            eventType,
            hangupCall,
          );
        }
        if (hangupCall) {
          // Stop live transcription; recording-based auto transcription is
          // triggered later when the recordingUrl is available.
          await this.applyHangupAutomation(hangupCall);
          await this.transcriptionOrchestrator
            .chargeRealtimeOnHangup(hangupCall)
            .catch((err: Error) =>
              this.logger.warn(
                `realtime transcription charge on hangup failed for call ${hangupCall.id}: ${err.message}`,
              ),
            );
        }
        if (hangupCall) {
          // Never let a background failure here bubble out as an unhandled
          // rejection: that takes the process down mid-webhook and leaves the
          // very orphaned "live" calls this rule chokes on.
          void this.crmCallLogService
            .handleCallCompleted(hangupCall)
            .catch((err: Error) =>
              this.logger.error(
                `CRM handleCallCompleted failed for call ${hangupCall.id}: ${err.message}`,
                err.stack,
              ),
            );
          // Custom Integrations outbound — choose the most specific event.
          void this.customIntegrationOutbound.enqueueCallTerminal(hangupCall);
          // Inbox timeline hook (best-effort, never block hangup processing)
          const ctx = InboxTimelineService.buildOwnershipFromCall(hangupCall);
          if (ctx) {
            void this.inboxTimelineService
              .appendCallEvent({ ctx, call: hangupCall })
              .then((event) => {
                if (event) {
                  this.logger.log(
                    `Inbox event ${event.id} (${event.kind}) appended for call ${hangupCall.id}`,
                  );
                }
              })
              .catch((err) =>
                this.logger.error(
                  `Inbox appendCallEvent failed for call=${hangupCall.id} ` +
                    `userId=${hangupCall.userId} orgId=${hangupCall.organizationId}: ${err.message}`,
                  err.stack,
                ),
              );
          }
        }
        break;
      }

      case "call.recording.saved": {
        this.logger.debug(
          `💾 Recording saved payload: ${JSON.stringify(payload)}`,
        );
        const savedPayload = payload as CallRecordingSavedPayload;
        try {
          await this.orchestratorService.processCallRecording({
            callControlId,
            recording: {
              publicUrl: savedPayload.recording_urls?.mp3,
              privateUrl: savedPayload.recording_urls?.mp3,
              recordingStartedAt: savedPayload.recording_started_at,
              recordingEndedAt: savedPayload.recording_ended_at,
            },
          });

          // Inbox timeline hook: surface a voicemail when the call outcome
          // marks the recording as a voicemail. We avoid duplicating
          // call_completed by being explicit about voicemail-only.
          const recordingCall =
            await this.callRepository.findByControlId(callControlId);
          if (
            recordingCall &&
            recordingCall.outcome === CallOutcome.voicemail
          ) {
            const recordings = await this.recordingRepository.findByCallId(
              recordingCall.id,
            );
            const latest = recordings[recordings.length - 1];
            const ctx =
              InboxTimelineService.buildOwnershipFromCall(recordingCall);
            if (latest && ctx) {
              void this.inboxTimelineService
                .appendVoicemailEvent({
                  ctx,
                  call: recordingCall,
                  recording: latest,
                })
                .catch((err) =>
                  this.logger.warn(
                    `Inbox appendVoicemailEvent failed: ${err.message}`,
                  ),
                );
            }
          }
        } catch (error) {
          this.logger.error(
            `❌ Error processing call recording: ${JSON.stringify(error, null, 2)}`,
          );
        }
        break;
      }

      case "call.streaming.failed": {
        // The carrier could not establish/keep the media stream → fail the realtime
        // transcript so the UI can offer "Try again".
        const failedCall =
          await this.callRepository.findByControlId(callControlId);
        if (failedCall) {
          const reason =
            (payload as { failure_reason?: string }).failure_reason ||
            "Telnyx media streaming failed";
          await this.transcriptionOrchestrator
            .markRealtimeFailed(failedCall, reason)
            .catch((err: Error) =>
              this.logger.warn(
                `markRealtimeFailed failed for call ${failedCall.id}: ${err.message}`,
              ),
            );
          this.logger.warn(
            `⚠️ streaming.failed for call ${failedCall.id}: ${reason}`,
          );
        }
        break;
      }

      case "call.recording.error": {
        const errorPayload = payload as CallRecordingErrorPayload;
        await this.callRepository.updateControlState(callControlId, {
          errorMessage: errorPayload.error,
          lastEventType: event.providerEventType,
        });
        break;
      }

      case "call.transcription": {
        const transcriptPayload = payload as CallTranscriptionPayload;
        const call = await this.callRepository.findByControlId(callControlId);

        if (!call) {
          this.logger.warn(`⚠️ Llamada ${callControlId} no encontrada`);
          return;
        }

        await this.transcriptionService.handleTranscriptionEvent(
          callControlId,
          transcriptPayload.transcription,
          call.id,
          transcriptPayload.track!,
          transcriptPayload.speaker!,
          transcriptPayload.is_final,
        );
        break;
      }
      case "call.cost": {
        try {
          const costPayload = payload as CallCostPayload;
          const call = await this.callRepository.findByControlId(callControlId);

          if (!call) {
            // A quick rejection may be priced before call.initiated finishes
            // adopting its pre-dial. Ask the provider to retry; acknowledging
            // this event would permanently lose the debit.
            throw new ServiceUnavailableException(
              "The call is not yet available for cost settlement.",
            );
          }

          // Idempotency guard: duplicated call.cost deliveries must not charge
          // credits more than once.
          if (call.totalCost != null) {
            this.logger.debug(
              `Skipping duplicate call.cost for ${callControlId} (already settled)`,
            );
            return;
          }

          const baseMargin = apiConfiguration.CALL_PROFIT_MARGIN;
          const recordingMargin = apiConfiguration.CALL_RECORDING_PROFIT_MARGIN;

          // Build context from call's ownership
          const callCtx: OwnershipContext = {
            userId: call.userId!,
            organizationId: call.organizationId,
          };

          // Calls placed from a verified caller ID may carry a surcharge on the
          // profit-margin multiplier. The surcharge is configuration
          // (CALLER_ID_PROFIT_MARGIN_SURCHARGE) and defaults to 0, which is the
          // behaviour that was actually in effect while it was hard-coded — so
          // pricing is unchanged until it is set deliberately. The provider
          // lookup is skipped entirely when there is no surcharge to apply.
          const callerIdSurcharge =
            apiConfiguration.CALLER_ID_PROFIT_MARGIN_SURCHARGE;
          const usedCallerId =
            callerIdSurcharge > 0
              ? await this.numberPurchasedService
                  .isVerifiedCallerId(callCtx, call.fromNumber)
                  .catch(() => false)
              : false;
          const profitMargin = usedCallerId
            ? baseMargin + callerIdSurcharge
            : baseMargin;
          const chargeBreakdown = calculateCallCharge({
            costParts: costPayload.cost_parts,
            totalCost: costPayload.total_cost,
            callProfitMultiplier: profitMargin,
            recordingProfitMultiplier: recordingMargin,
          });
          const { computedTotalCost } = chargeBreakdown;

          const balanceBefore = await this.creditService
            .getBalance(callCtx)
            .catch(() => 0);

          const totalCost = computedTotalCost;

          // Free-call trial intentionally disabled: always charge credits.
          if (totalCost > 0) {
            await this.creditService.consumeCredits(callCtx, totalCost, {
              idempotencyKey: `call-cost:${call.id}`,
              source: "telnyx.call.cost",
            });
          }

          await this.callRepository.updateCost(callControlId, totalCost, {
            ...(payload as Record<string, unknown>),
            ringeeCostBreakdown: {
              ...chargeBreakdown,
              callProfitMultiplier: profitMargin,
              recordingProfitMultiplier: recordingMargin,
            },
            ringeeComputedTotalCost: computedTotalCost,
            ringeeBalanceBefore: balanceBefore,
            ringeeChargeCapped: totalCost < computedTotalCost,
          });
          break;
        } catch (error) {
          console.error("Error processing call cost:", error);
          throw error;
        }
      }

      default:
        await this.callRepository.logEvent(
          callControlId,
          event.providerEventType,
          payload,
        );
        break;
    }
  }
}
