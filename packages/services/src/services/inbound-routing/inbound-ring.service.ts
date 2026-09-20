import { Injectable, Logger } from "@nestjs/common";
import {
  Call,
  CallRepository,
  InboundRingAttemptRepository,
  InboundRingAttemptStatus,
} from "@ringee/database";
import {
  NotificationService,
  RealtimePresenceService,
  RealtimeUserEventsPublisher,
} from "@ringee/platform";
import { UserDeviceService } from "../user.device.service";
import { UserService } from "../user.service";

/** What one member was offered, and on what. */
export interface RingOffer {
  userId: string;
  /** Live dashboard/extension sockets. */
  sockets: number;
  /** Registered push devices. */
  devices: number;
}

export interface RingFanout {
  /** Members the call was offered to. */
  offered: RingOffer[];
  /** Members with nothing online to offer it to. */
  unreachable: string[];
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
  ) {}

  /**
   * Offer a call to a set of members at once and open a ring attempt for each.
   *
   * Members are offered the call in parallel, never in sequence: simultaneous
   * ringing is the whole point, and awaiting one member's push before sending
   * the next would stagger the group by the slowest device.
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
    await this.attempts.startMany(
      call.id,
      userIds.map((userId) => ({ userId })),
    );

    const results = await Promise.all(
      userIds.map(async (userId) => {
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
        `Inbound call ${call.id}: ${unreachable.length} of ${userIds.length} members had nothing online`,
      );
    return { offered, unreachable };
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
    },
  ): Promise<RingOffer> {
    const [sockets, devices, user] = await Promise.all([
      this.presence.list(userId).catch(() => []),
      this.userDevices.findActiveByUser(userId).catch(() => []),
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

    const attempts = await this.attempts.listByCall(call.id);
    const isTarget = attempts.length
      ? attempts.some((attempt) => attempt.userId === userId)
      : call.userId === userId;
    if (!isTarget) return { status: "not_a_target" };

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
    await Promise.allSettled(
      ended
        .filter((attempt) => attempt.userId)
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
    await this.cancelRinging(call, { reason }).catch((error: Error) =>
      this.logger.warn(
        `Could not cancel the ring legs of call ${call.id}: ${error.message}`,
      ),
    );
  }
}
