import {
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  Call,
  CallRepository,
  SipDeviceRepository,
  OrganizationRepository,
  InboundRouteRepository,
  InboundRingAttemptRepository,
  InboundRingAttemptStatus,
} from "@ringee/database";
import {
  NotificationService,
  RedisService,
  TelephonyService,
  VoiceAgentProviderService,
  signCallCorrelation,
  verifyCallCorrelation,
  type OwnershipContext,
  type TelephonyEvent,
  RealtimePresenceService,
  RealtimeUserEventsPublisher,
} from "@ringee/platform";
import { UserDeviceService } from "../user.device.service";
import { UserService } from "../user.service";

import { randomUUID } from "crypto";
import { apiConfiguration } from "@ringee/configuration";
import { CreditService } from "../credit.service";
import { calculateCallCharge, fromTelephonyCostParts } from "../call-cost.util";
import type {
  RouteExecutionRequest,
  RouteExecutionResult,
} from "./inbound-routing.types";

interface BrowserEndpoint {
  username: string;
  expiresAt: string;
  readyUntil: number;
}

/**
 * How long a connection is trusted to still accept this account's SIP URI
 * calls before the setting is written again. The write is idempotent; the
 * marker only keeps it off every dial.
 */
const INTERNAL_CALLING_TTL_SECONDS = 6 * 60 * 60;

/**
 * When an AI handoff that neither connected nor ended is given up on. Longer
 * than the longest ring it can legitimately wait for — a ring group rings for
 * up to 300 seconds — so the provider's own ring timeout always ends a normal
 * one first.
 */
export const STALLED_TRANSFER_MS = (300 + 60) * 1000;

/** What one member was offered, and on what. */
export interface RingOffer {
  userId: string;
  /** Live dashboard/extension sockets. */
  sockets: number;
  /** Registered push devices. */
  devices: number;
}

export interface RingFanout {
  /** Members this invocation offered the call to. */
  offered: RingOffer[];
  /** Members with nothing online to offer it to. */
  unreachable: string[];
  /** Members an earlier delivery of the same webhook is already ringing. */
  alreadyRinging: string[];
}

/** Outcome of a member trying to take an inbound call. */
export type RingClaim =
  | { status: "won"; call: Call }
  | { status: "lost"; answeredByUserId: string | null }
  | { status: "gone"; detail: string }
  | { status: "not_a_target" };

/**
 * The legs of one inbound call, and the election between them.
 *
 * A ring group is several endpoints ringing for **one** Ringee call: no second
 * `Call` row, no second recording, no second ledger entry. What this service
 * owns is the part that cannot live in a client — which members are being rung,
 * which one got it, and telling the rest to stop.
 *
 * The election is a single conditional UPDATE (`claimInboundAnswer`). Two
 * members pressing answer in the same millisecond, on different API instances,
 * still produce exactly one winner, because only one of the two statements can
 * match an unclaimed row.
 */
@Injectable()
export class InboundRingService {
  private readonly logger = new Logger(InboundRingService.name);

  constructor(
    private readonly attempts: InboundRingAttemptRepository,
    private readonly callRepository: CallRepository,
    private readonly userDevices: UserDeviceService,
    private readonly users: UserService,
    private readonly notifications: NotificationService,
    private readonly presence: RealtimePresenceService,
    private readonly realtime: RealtimeUserEventsPublisher,
    private readonly telephony: TelephonyService,
    private readonly redis: RedisService,
    private readonly sipDevices: SipDeviceRepository,
    private readonly organizations: OrganizationRepository,
    private readonly credits: CreditService,
    private readonly routes: InboundRouteRepository,
    private readonly voiceAgents: VoiceAgentProviderService,
  ) {}

  private browserKey(ctx: OwnershipContext) {
    return `inbound-browser:${ctx.organizationId ?? "personal"}:${ctx.userId}`;
  }

  /**
   * Lets the Call Control application reach a credential at its SIP URI. Only
   * this account's connections can; the marker keeps the provider write off
   * the dial path and off every dashboard load.
   */
  private async ensureInternalCalling(connectionId: string): Promise<void> {
    const key = `inbound-internal-calling:${connectionId}`;
    if (await this.redis.has(key)) return;
    try {
      await this.telephony.allowDeskPhoneInternalCalls(connectionId);
      await this.redis.set(key, "1", INTERNAL_CALLING_TTL_SECONDS * 1000);
    } catch (error) {
      // A connection already configured still takes the dial; one that is
      // not refuses it, and that refusal is handled like any other.
      this.logger.warn(
        `Could not confirm internal SIP calling on ${connectionId}: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Credentials stay between the authenticated browser and the provider.
   *
   * Only a workspace whose calls are actually delivered by server-dialed legs
   * gets one: every other dashboard keeps exactly the single shared client it
   * had, and no credential is minted for it every hour.
   */
  async createBrowserEndpoint(ctx: OwnershipContext) {
    if (
      !ctx.organizationId ||
      !(await this.routes.hasControlledRoutes(ctx.organizationId))
    )
      return { enabled: false as const };
    const credential = await this.telephony.createTelephonyCredential(
      ctx.userId,
      "inbound-routing",
    );
    const endpointId = randomUUID();
    await this.redis.hashSet(
      this.browserKey(ctx),
      endpointId,
      {
        username: credential.sipUsername,
        expiresAt: credential.expiresAt,
        readyUntil: 0,
      },
      3600,
    );
    return { enabled: true as const, endpointId, ...credential };
  }

  async touchBrowserEndpoint(
    ctx: OwnershipContext,
    endpointId: string,
    remove = false,
  ) {
    const key = this.browserKey(ctx);
    const endpoints = await this.redis.hashGetAll<BrowserEndpoint>(key);
    const endpoint = endpoints[endpointId];
    if (!endpoint || Date.parse(endpoint.expiresAt) <= Date.now())
      throw new NotFoundException("Browser endpoint expired.");
    if (remove) await this.redis.hashDelete(key, endpointId);
    else
      await this.redis.hashSet(
        key,
        endpointId,
        { ...endpoint, readyUntil: Date.now() + 75_000 },
        3600,
      );
    return { ready: !remove };
  }

  /** Resolve only server-issued browser endpoints and workspace-owned handsets. */
  async controlledTargets(ctx: OwnershipContext, userIds: string[]) {
    const members = ctx.organizationId
      ? new Set(
          (
            await this.organizations.listMembersWithUsers(ctx.organizationId)
          ).flatMap((m) => (m.userId ? [m.userId] : [])),
        )
      : new Set([ctx.userId]);
    const allowed = userIds.filter((id) => members.has(id));
    const devices = apiConfiguration.DESK_PHONES_ENABLED
      ? await this.sipDevices.listByOwner(ctx)
      : [];
    const browsers = await Promise.all(
      allowed.map(async (userId) => {
        const entries = await this.redis.hashGetAll<BrowserEndpoint>(
          this.browserKey({ ...ctx, userId }),
        );
        return Object.entries(entries)
          .filter(
            ([, e]) =>
              e.readyUntil > Date.now() &&
              Date.parse(e.expiresAt) > Date.now() + 60_000,
          )
          .map(([id, e]) => ({
            userId,
            endpointKey: `browser:${id}`,
            sipUsername: e.username,
            sipDeviceId: null as string | null,
            recipientConnectionId: apiConfiguration.TELNYX_CONNECTION_ID,
          }));
      }),
    );
    return [
      ...browsers.flat(),
      ...devices
        .filter(
          (d) =>
            allowed.includes(d.userId) &&
            d.allowInbound &&
            !d.deletedAt &&
            d.status !== "disabled",
        )
        .map((d) => ({
          userId: d.userId,
          endpointKey: `desk:${d.id}`,
          sipUsername: d.sipUsername,
          sipDeviceId: d.id,
          recipientConnectionId: d.telnyxConnectionId,
        })),
    ];
  }

  async offerControlled(
    request: RouteExecutionRequest,
    userIds: string[],
    ringSeconds: number,
  ): Promise<RouteExecutionResult> {
    const { call, ctx, destination } = request;
    if (!call.callControlId)
      return {
        status: "failed",
        reason: "provider_refused",
        detail: "Missing caller leg",
      };
    const targets = await this.controlledTargets(ctx, userIds);
    // Duplicate prevention is per handoff: an assistant that retries after a
    // failed transfer may ring the same endpoints again.
    if (call.inboundTransferRequestedAt)
      await this.attempts.retireEndedBefore(
        call.id,
        call.inboundTransferRequestedAt,
      );
    const started = await this.attempts.startMany(call.id, targets);
    const notified = new Set<string>();
    const freshUsers = new Set(started.map((a) => a.userId));
    const attempts = await this.attempts.listByCall(call.id);
    await Promise.all(
      attempts
        .filter((a) => a.status === "ringing")
        .map(async (attempt) => {
          const target = targets.find(
            (t) => t.endpointKey === attempt.endpointKey,
          );
          if (!target) {
            if (!attempt.providerCallControlId)
              await this.attempts.update(attempt.id, {
                status: "failed",
                endedAt: new Date(),
                failureReason: "endpoint_unavailable",
              });
            return;
          }
          try {
            if (target.sipDeviceId) {
              const device = await this.sipDevices.findActiveById(
                target.sipDeviceId,
              );
              if (
                !device?.allowInbound ||
                device.organizationId !== (ctx.organizationId ?? null)
              ) {
                await this.attempts.update(attempt.id, {
                  status: "failed",
                  endedAt: new Date(),
                  failureReason: "device_unavailable",
                });
                return;
              }
            }
            if (!attempt.providerCallControlId)
              await this.ensureInternalCalling(target.recipientConnectionId);
            // Retries use the same command and correlation; a lost response never opens another leg.
            const handle = attempt.providerCallControlId
              ? {
                  callControlId: attempt.providerCallControlId,
                  callLegId: attempt.providerCallLegId,
                  callSessionId: attempt.providerCallSessionId,
                }
              : await this.telephony.dialInboundEndpoint({
                  sipUsername: target.sipUsername,
                  from: /^\+[1-9]\d{6,14}$/.test(call.fromNumber)
                    ? call.fromNumber
                    : call.toNumber,
                  correlation: signCallCorrelation(attempt.id),
                  commandId: `inbound-endpoint-${attempt.id}`,
                  timeoutSecs: ringSeconds,
                });
            await this.attempts.bindProvider(
              attempt.id,
              handle.callControlId,
              handle.callLegId,
              handle.callSessionId,
            );
            const current = await this.callRepository.findById(call.id);
            if (
              !current ||
              current.endedAt ||
              (current.answeredByRingAttemptId &&
                current.answeredByRingAttemptId !== attempt.id)
            ) {
              await this.telephony.hangupCall(
                handle.callControlId,
                `inbound-cancel-${attempt.id}`,
              );
              return;
            }
            if (!freshUsers.has(target.userId) || notified.has(target.userId))
              return;
            notified.add(target.userId);
            await this.offerToMember(call, target.userId, {
              callerName: request.callerName,
              destinationType:
                destination.type === "ring_group" ? "ring_group" : "user",
              ringGroupId:
                destination.type === "ring_group"
                  ? destination.ringGroupId
                  : null,
              ringGroupName:
                destination.type === "ring_group" ? destination.name : null,
              ringSeconds,
              // The leg rings a browser credential or a handset. A mobile push
              // would present a call the app has no leg to answer.
              push: false,
            });
          } catch (error) {
            // A definitive refusal has no leg to await. Uncertain outcomes are
            // retried with the same provider command and bounded by the call sweep.
            if (
              !(error instanceof HttpException) ||
              ![400, 401, 403, 404, 422].includes(error.getStatus())
            )
              throw error;
            await this.attempts.update(attempt.id, {
              status: "failed",
              endedAt: new Date(),
              failureReason: "provider_refused",
            });
          }
        }),
    );
    const live = await this.attempts.listByCall(call.id);
    const count = live.filter(
      (a) =>
        a.providerCallControlId &&
        (a.status === "ringing" || a.status === "answered"),
    ).length;
    return count
      ? { status: "ringing", targets: count }
      : {
          status: "failed",
          reason: "user_unavailable",
          detail: "No registered endpoint is available",
          callerMessage: "Nobody is available to take the call.",
        };
  }

  /**
   * Ends one leg. A leg the provider says is already gone is the outcome
   * wanted, so a definitive refusal is not an error; an uncertain one is
   * rethrown so the webhook is redelivered and the same command replayed.
   */
  private async endLeg(callControlId: string, commandId?: string) {
    try {
      await this.telephony.hangupCall(callControlId, commandId);
    } catch (error) {
      const status = error instanceof HttpException ? error.getStatus() : 0;
      if (status >= 400 && status < 500 && status !== 408 && status !== 429)
        return;
      throw error;
    }
  }

  /** Called only by CallService after provider signature verification. */
  async handleControlledEvent(event: TelephonyEvent): Promise<boolean> {
    if (event.connectionId !== apiConfiguration.TELNYX_CALL_CONTROL_APP_ID) {
      const id = event.inboundRingAttempt
        ? verifyCallCorrelation(event.inboundRingAttempt)
        : null;
      const recipient = id
        ? await this.attempts.findById(id)
        : await this.attempts.findByControlId(event.callControlId);
      if (
        !recipient ||
        !recipient.recipientConnectionId ||
        recipient.recipientConnectionId !== event.connectionId
      )
        return false;
      // A copied header on an outbound call must never suppress its normal
      // authorization, history or billing. Only the incoming peer can bind.
      if (recipient.recipientCallControlId === event.callControlId) return true;
      if (recipient.recipientCallControlId || event.direction !== "inbound")
        return false;
      // The handset/browser's mirror leg has no independent Ringee history or charge.
      const bound = await this.attempts.bindRecipient(
        recipient.id,
        event.callControlId,
        event.callSessionId,
      );
      return bound.count === 1;
    }
    let attempt = await this.attempts.findByControlId(event.callControlId);
    // Only a leg this application dialed can be bound by its correlation. A
    // caller who replays a copied header on an inbound call is routed as the
    // ordinary inbound call it is.
    if (!attempt && event.inboundRingAttempt && event.direction !== "inbound") {
      const id = verifyCallCorrelation(event.inboundRingAttempt);
      attempt = id ? await this.attempts.findById(id) : null;
      if (
        !attempt ||
        (attempt.providerCallControlId &&
          attempt.providerCallControlId !== event.callControlId)
      ) {
        if (event.type === "call.initiated")
          await this.endLeg(event.callControlId);
        return true;
      }
      await this.attempts.bindProvider(
        attempt.id,
        event.callControlId,
        event.callLegId,
        event.callSessionId,
      );
    }
    if (!attempt) return false;
    const call = attempt.call;
    if (!call.callControlId || call.direction !== "inbound" || !attempt.userId)
      return true;
    if (event.type === "call.cost") {
      if (attempt.chargedCredits == null && event.cost) {
        const charge = calculateCallCharge({
          costParts: fromTelephonyCostParts(event.cost.parts),
          totalCost: event.cost.total,
          callProfitMultiplier: apiConfiguration.CALL_PROFIT_MARGIN,
          recordingProfitMultiplier:
            apiConfiguration.CALL_RECORDING_PROFIT_MARGIN,
        });
        if (charge.computedTotalCost > 0)
          await this.credits.consumeCredits(
            { userId: call.userId!, organizationId: call.organizationId },
            charge.computedTotalCost,
            {
              idempotencyKey: `inbound-leg-cost:${attempt.id}`,
              source: "inbound-routing",
            },
          );
        await this.attempts.update(attempt.id, {
          chargedCredits: charge.computedTotalCost,
        });
      }
      return true;
    }
    // A redelivered hangup must finish what its first delivery started — that
    // one may have ended the attempt and then failed to end the caller. A leg
    // Ringee cancelled has nothing to finish: after a handoff is handed back
    // to the assistant, its hangup must not end the caller.
    const replayableHangup =
      event.type === "call.hangup" && attempt.status !== "cancelled";
    if (
      call.endedAt ||
      (!replayableHangup &&
        (call.inboundTransferState === "failed" ||
          attempt.endedAt ||
          attempt.status === "cancelled" ||
          attempt.status === "failed"))
    ) {
      if (event.type === "call.answered" || event.type === "call.initiated")
        await this.endLeg(event.callControlId, `inbound-cancel-${attempt.id}`);
      return true;
    }
    if (event.type === "call.answered") {
      // Membership is checked again after ringing; removal cannot grant access to a live caller.
      if (
        call.organizationId &&
        !(await this.organizations.isMember(
          attempt.userId,
          call.organizationId,
        ))
      ) {
        await this.endLeg(event.callControlId, `inbound-cancel-${attempt.id}`);
        return true;
      }
      if (attempt.sipDeviceId) {
        const device = await this.sipDevices.findActiveById(
          attempt.sipDeviceId,
        );
        if (
          !device?.allowInbound ||
          device.userId !== attempt.userId ||
          device.organizationId !== call.organizationId
        ) {
          await this.endLeg(
            event.callControlId,
            `inbound-cancel-${attempt.id}`,
          );
          return true;
        }
      }
      const claim = await this.callRepository.claimInboundEndpoint(
        call.id,
        attempt.id,
        attempt.userId,
      );
      if (!claim.won) {
        await this.endLeg(event.callControlId, `inbound-cancel-${attempt.id}`);
        return true;
      }
      // The transfer tool stops the assistant once the endpoints ring; an
      // answer that beat that command must not bridge the person into the AI.
      // Same command id, so after the tool's stop this is a no-op.
      if (call.inboundDestinationType === "ai_receptionist")
        await this.voiceAgents
          .stopInboundAssistant(
            call.callControlId,
            `receptionist-stop-${call.id}`,
          )
          .catch((error: Error) =>
            this.logger.warn(
              `Could not confirm the assistant stopped on call ${call.id}: ${error.message}`,
            ),
          );
      if (!call.answeredAt)
        await this.telephony.answerInboundCall(
          call.callControlId,
          `inbound-answer-${call.id}`,
        );
      await this.telephony.bridgeCalls(
        call.callControlId,
        event.callControlId,
        `inbound-bridge-${attempt.id}`,
      );
      await this.attempts.update(attempt.id, { status: "answered" });
      await this.callRepository.updateControlState(call.callControlId, {
        ...(call.inboundTransferState
          ? { inboundTransferState: "connected" }
          : {}),
        ...(attempt.sipDeviceId ? { sipDeviceId: attempt.sipDeviceId } : {}),
      });
      await this.cancelRinging(call, {
        reason: "answered_elsewhere",
        answeredByUserId: attempt.userId,
      });
    } else if (event.type === "call.hangup") {
      if (!attempt.endedAt)
        await this.attempts.update(attempt.id, {
          status: attempt.status === "answered" ? "answered" : "failed",
          endedAt: event.occurredAt ?? new Date(),
        });
      const remaining = await this.attempts.listByCall(call.id);
      const winnerLeft = call.answeredByRingAttemptId === attempt.id;
      // A handoff given back to the assistant is the AI's conversation again.
      const handedBack =
        call.inboundDestinationType === "ai_receptionist" &&
        !call.inboundTransferState;
      if (
        winnerLeft ||
        (!handedBack &&
          !remaining.some(
            (a) =>
              a.status === "ringing" || (a.status === "answered" && !a.endedAt),
          ))
      ) {
        // Nobody took the handoff: say so on the call, so its history does
        // not read as an AI conversation that simply ended.
        if (
          !winnerLeft &&
          !call.answeredByRingAttemptId &&
          call.inboundTransferState === "ringing"
        )
          await this.callRepository.updateControlState(call.callControlId, {
            inboundTransferState: "failed",
            errorMessage: "Nobody answered the transfer.",
          });
        await this.endLeg(call.callControlId, `inbound-end-${call.id}`);
      }
    }
    return true;
  }

  /** Reuses the periodic call sweep to bound a handoff interrupted by a crash or lost webhook. */
  async expireStalledTransfers(before: Date, limit: number): Promise<void> {
    const calls = await this.callRepository.findStalledInboundTransfers(
      before,
      limit,
    );
    for (const call of calls) {
      try {
        if (
          !(await this.callRepository.failStalledInboundTransfer(
            call.id,
            before,
          ))
        )
          continue;
        await this.cancelRinging(call, { reason: "transfer_timeout" });
        await this.endLeg(
          call.callControlId!,
          `receptionist-timeout-${call.id}`,
        );
      } catch {
        // Keep the failed marker so the next sweep retries the same commands.
        this.logger.warn(`Could not end stalled inbound transfer ${call.id}`);
      }
    }
  }

  async browserLeg(ctx: OwnershipContext, controlId: string) {
    const attempt = await this.attempts.findByControlId(controlId);
    if (
      !attempt ||
      attempt.userId !== ctx.userId ||
      attempt.call.organizationId !== (ctx.organizationId ?? null)
    )
      throw new NotFoundException("This call was not offered to you.");
    const call = attempt.call;
    return {
      callId: call.id,
      callControlId: call.callControlId,
      toNumber: call.toNumber,
      fromNumber: call.fromNumber,
      callerName: null,
      destinationType:
        call.inboundTransferDestinationType === "ring_group" ||
        call.inboundDestinationType === "ring_group"
          ? "ring_group"
          : "user",
      ringGroupId: call.ringGroupId,
      ringGroupName: null,
      ringSeconds: 45,
      at: new Date().toISOString(),
    };
  }

  /**
   * Offer a call to a set of members at once and open a ring attempt for each.
   *
   * Members are offered the call in parallel, never in sequence: simultaneous
   * ringing is the whole point, and awaiting one member's push before sending
   * the next would stagger the group by the slowest device.
   *
   * Only the members whose attempt row this call inserted are notified. A
   * redelivered webhook therefore rings nobody a second time, and says so
   * through `alreadyRinging` rather than through an empty fanout, which a
   * caller would read as "nobody was available" and fail a live call over.
   */
  async offerToMembers(
    call: Call,
    userIds: string[],
    context: {
      callerName: string | null;
      destinationType: "user" | "ring_group";
      ringGroupId?: string | null;
      ringGroupName?: string | null;
      ringSeconds: number;
    },
  ): Promise<RingFanout> {
    const started = await this.attempts.startMany(
      call.id,
      userIds.map((userId) => ({ userId })),
    );
    const fresh = new Set(
      started
        .map((attempt) => attempt.userId)
        .filter((userId): userId is string => !!userId),
    );
    // A duplicate is only "already ringing" while its attempt still is. One
    // that ended — failed, cancelled, answered — stays ended: counting it
    // would report a group nobody is ringing as ringing, and a redelivery
    // after the group failed would never fail the call again.
    const duplicates = userIds.filter((userId) => !fresh.has(userId));
    const ringing = duplicates.length
      ? new Set(
          (await this.attempts.listByCall(call.id))
            .filter(
              (attempt) => attempt.status === InboundRingAttemptStatus.ringing,
            )
            .map((attempt) => attempt.userId),
        )
      : new Set<string | null>();
    const alreadyRinging = duplicates.filter((userId) => ringing.has(userId));

    const results = await Promise.all(
      userIds
        .filter((userId) => fresh.has(userId))
        .map(async (userId) => {
          const offer = await this.offerToMember(call, userId, context);
          return { userId, offer };
        }),
    );

    const offered = results
      .filter(({ offer }) => offer.sockets > 0 || offer.devices > 0)
      .map(({ offer }) => offer);
    const unreachable = results
      .filter(({ offer }) => offer.sockets === 0 && offer.devices === 0)
      .map(({ userId }) => userId);

    if (unreachable.length)
      this.logger.log(
        `Inbound call ${call.id}: ${unreachable.length} of ${results.length} members offered had nothing online`,
      );
    if (alreadyRinging.length)
      this.logger.log(
        `Inbound call ${call.id}: ${alreadyRinging.length} member(s) were already ringing from an earlier delivery`,
      );
    return { offered, unreachable, alreadyRinging };
  }

  private async offerToMember(
    call: Call,
    userId: string,
    context: {
      callerName: string | null;
      destinationType: "user" | "ring_group";
      ringGroupId?: string | null;
      ringGroupName?: string | null;
      ringSeconds: number;
      /** False when the leg cannot reach the mobile app. */
      push?: boolean;
    },
  ): Promise<RingOffer> {
    const [sockets, devices, user] = await Promise.all([
      this.presence.list(userId).catch(() => []),
      context.push === false
        ? Promise.resolve([])
        : this.userDevices.findActiveByUser(userId).catch(() => []),
      this.users.getCachedUserById(userId).catch(() => null),
    ]);

    if (sockets.length)
      await this.realtime
        .inboundCallRinging(userId, {
          callId: call.id,
          callControlId: call.callControlId ?? "",
          toNumber: call.toNumber,
          fromNumber: call.fromNumber,
          callerName: context.callerName,
          destinationType: context.destinationType,
          ringGroupId: context.ringGroupId ?? null,
          ringGroupName: context.ringGroupName ?? null,
          ringSeconds: context.ringSeconds,
          at: new Date().toISOString(),
        })
        .catch((error: Error) =>
          this.logger.warn(
            `Could not tell ${userId} about inbound call ${call.id}: ${error.message}`,
          ),
        );

    // The push payload is the contract the mobile app already reads. It is
    // sent unchanged for every destination, so a ring group looks to a phone
    // exactly like a direct call.
    if (devices.length)
      await Promise.allSettled(
        devices.map((device) =>
          this.notifications.sendNotification(device.fcmToken, {
            title: "📞 Incoming Call",
            body: `Call from ${context.callerName || call.fromNumber}`,
            data: {
              type: "INCOMING_CALL",
              callerNumber: call.fromNumber,
              toNumber: call.toNumber,
              clerkUserId: user?.clerkId ?? "",
              userId,
              callSessionId: call.callSessionId ?? "",
              callControlId: call.callControlId ?? "",
              url: `/dashboard/call?control=${call.callSessionId ?? ""}`,
              title: "📞 Incoming Call",
            },
          }),
        ),
      );

    return { userId, sockets: sockets.length, devices: devices.length };
  }

  /**
   * A member takes the call. Exactly one can: the claim is a conditional
   * update on the call row, and the loser is told so rather than being allowed
   * to answer a leg somebody else already has.
   *
   * Only a member the call was actually offered to may claim it. A call with
   * no attempts at all is a single-destination call and belongs to its owner.
   */
  async claim(callControlId: string, userId: string): Promise<RingClaim> {
    const call = await this.callRepository.findByControlId(callControlId);
    if (!call) return { status: "gone", detail: "no such call" };
    if (call.endedAt)
      return { status: "gone", detail: "the call already ended" };

    if (
      call.inboundDestinationType === "ai_receptionist" &&
      call.inboundTransferState !== "ringing"
    )
      return {
        status: "gone",
        detail: "The AI conversation is not being transferred.",
      };
    const attempts = await this.attempts.listByCall(call.id);
    const isTarget = attempts.length
      ? attempts.some((attempt) => attempt.userId === userId)
      : call.userId === userId;
    if (!isTarget) return { status: "not_a_target" };
    // Controlled media legs elect the endpoint on the provider's answer. A UI
    // claim only authorizes answering, otherwise a lost browser would block all handsets.
    if (
      attempts.some(
        (attempt) =>
          attempt.endpointKey?.startsWith("browser:") ||
          attempt.providerCallControlId,
      )
    ) {
      if (call.answeredByUserId && call.answeredByUserId !== userId)
        return { status: "lost", answeredByUserId: call.answeredByUserId };
      return attempts.some(
        (attempt) => attempt.userId === userId && attempt.status === "ringing",
      )
        ? { status: "won", call }
        : { status: "gone", detail: "No ringing endpoint" };
    }

    const { won, call: claimed } = await this.callRepository.claimInboundAnswer(
      callControlId,
      userId,
    );
    if (!won)
      return {
        status: "lost",
        answeredByUserId: claimed?.answeredByUserId ?? null,
      };

    await this.attempts.markAnswered(call.id, userId);
    await this.cancelRinging(call, {
      reason: "answered_elsewhere",
      exceptUserId: userId,
      answeredByUserId: userId,
    });
    this.logger.log(`📞 Inbound call ${call.id} was taken by ${userId}`);
    return { status: "won", call: claimed ?? call };
  }

  /**
   * The answer was reported by the provider rather than claimed by a member —
   * a desk phone picking up, or a device that answered the leg directly.
   * Record the winner on the legs and stop the rest, exactly as a claim does.
   */
  async recordAnswer(call: Call, userId: string | null): Promise<void> {
    if (userId) await this.attempts.markAnswered(call.id, userId);
    await this.cancelRinging(call, {
      reason: "answered_elsewhere",
      exceptUserId: userId,
      answeredByUserId: userId,
    });
  }

  /**
   * End every leg still ringing and tell those members to stop. Used when
   * somebody else won, when the caller disconnected while endpoints were
   * ringing, and when a destination was given up on.
   */
  async cancelRinging(
    call: Call,
    params: {
      reason: string;
      exceptUserId?: string | null;
      answeredByUserId?: string | null;
      /** `failed` when nothing could take the call, `cancelled` otherwise. */
      status?:
        | typeof InboundRingAttemptStatus.cancelled
        | typeof InboundRingAttemptStatus.failed;
    },
  ): Promise<number> {
    const ended = await this.attempts.endRinging(call.id, {
      status: params.status ?? InboundRingAttemptStatus.cancelled,
      reason: params.reason,
      exceptUserId: params.exceptUserId ?? null,
    });
    const cancelled = (await this.attempts.listByCall(call.id)).filter(
      (attempt) =>
        attempt.providerCallControlId &&
        (attempt.status === "cancelled" || attempt.status === "failed"),
    );
    // Best effort: a leg that is already gone refuses the command, and one
    // that is somehow still ringing is hung up when it answers a cancelled
    // attempt. Neither may stop the members from being told.
    await Promise.allSettled(
      cancelled.map((attempt) =>
        this.telephony.hangupCall(
          attempt.providerCallControlId!,
          `inbound-cancel-${attempt.id}`,
        ),
      ),
    );
    // The winner's other endpoints stop ringing, but the winner is not told
    // their own call was cancelled: that would take it off their screen.
    await Promise.allSettled(
      ended
        .filter(
          (attempt) =>
            attempt.userId &&
            attempt.userId !== (params.answeredByUserId ?? null),
        )
        .map((attempt) =>
          this.realtime.inboundCallCancelled(attempt.userId!, {
            callId: call.id,
            callControlId: call.callControlId ?? "",
            reason: params.reason,
            answeredByUserId: params.answeredByUserId ?? null,
            at: new Date().toISOString(),
          }),
        ),
    );
    return ended.length;
  }

  /** The caller's leg is gone: nothing should still be ringing for it. */
  async cancelForEndedCall(call: Call, reason: string): Promise<void> {
    const endpoints = await this.attempts.listByCall(call.id);
    await Promise.allSettled(
      endpoints
        .filter((a) => a.providerCallControlId)
        .map((a) =>
          this.telephony.hangupCall(
            a.providerCallControlId!,
            `inbound-cancel-${a.id}`,
          ),
        ),
    );
    await this.cancelRinging(call, { reason }).catch((error: Error) =>
      this.logger.warn(
        `Could not cancel the ring legs of call ${call.id}: ${error.message}`,
      ),
    );
  }
}
