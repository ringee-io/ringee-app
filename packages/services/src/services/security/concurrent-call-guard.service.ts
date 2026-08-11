import { Injectable, Logger } from "@nestjs/common";
import { Call, CallRepository, CallStatus } from "@ringee/database";
import { RedisService, TelephonyService } from "@ringee/platform";

/** Redis key holding the single dial lease a user is allowed to have. */
function leaseKey(userId: string): string {
  return `ringee:call-lease:v1:${userId}`;
}

/**
 * A lease starts short: it only has to cover the gap between "the API approved
 * the dial" and "Telnyx sent call.initiated". An abandoned dial therefore frees
 * the user in seconds instead of hours.
 */
const PENDING_LEASE_TTL_SECONDS = 90;

/**
 * Once bound to a real call the lease must outlive the longest plausible call,
 * because a lost `call.hangup` webhook would otherwise strand it.
 */
const ACTIVE_LEASE_TTL_SECONDS = 4 * 60 * 60;

/**
 * Below this age a lease is trusted on its own. Above it, a rejection is
 * confirmed against the database first — see {@link ConcurrentCallGuardService}.
 */
const LEASE_GRACE_MS = 60_000;

/**
 * Statuses that mean "this row is a call that is really up right now".
 *
 * `pending` is deliberately excluded: the SDK creates a pending row at
 * authorize time, and a caller who authorizes but never dials would otherwise
 * wedge their own account forever. That window is covered by the Redis lease,
 * which expires on its own.
 */
const OCCUPYING_STATUSES: CallStatus[] = [
  CallStatus.ringing,
  CallStatus.answered,
  CallStatus.recording,
];

/**
 * A `Call` row younger than this is believed on sight. Past it, the row is
 * confirmed against the provider BEFORE it is allowed to refuse a dial.
 *
 * Refusals are rare — they only happen to someone the database thinks is
 * already on a call — so paying one provider round-trip to be sure is cheap,
 * and it is what stops a single lost `call.hangup` webhook from bricking an
 * account. It also covers the everyday campaign case: the agent hangs up and
 * the next lead is dialed before the hangup webhook lands, which used to be
 * refused as a "concurrent call".
 */
const LIVENESS_TRUST_MS = 15_000;

/**
 * Ages past which the periodic sweep bothers to look at a row at all. Higher
 * than {@link LIVENESS_TRUST_MS} on purpose: the interactive path pays for
 * certainty because a user is waiting, while the background pass must not ask
 * the provider about every call in flight on the platform.
 */
export const RINGING_SUSPECT_MS = 2 * 60_000;
export const CONNECTED_SUSPECT_MS = 4 * 60 * 60_000;

/**
 * When the provider cannot be reached, a call keeps blocking until it passes
 * these ages — at which point it is closed anyway. Being permanently unable to
 * call is a worse failure than the remote chance of a second leg on a call
 * that really was still up.
 */
const RINGING_HARD_LIMIT_MS = 15 * 60_000;
const CONNECTED_HARD_LIMIT_MS = 8 * 60 * 60_000;

export interface DialLease {
  /** Stable identity of the device/surface that holds the lease. */
  deviceId: string;
  /** Human-readable label for the error message ("Chrome · macOS"). */
  deviceLabel: string | null;
  /** Dial surface: web | chrome_extension | sdk | session | campaign | sip_device. */
  source: string;
  /** Set once `call.initiated` binds the lease to a provider leg. */
  callControlId: string | null;
  /** ISO timestamp of when the lease was first taken. */
  at: string;
}

export interface DialPermit {
  allowed: true;
}

export interface DialRejection {
  allowed: false;
  holder: DialLease;
  /** Ready-to-show copy naming the device that is busy. */
  message: string;
}

export type DialDecision = DialPermit | DialRejection;

export interface DialRequest {
  /**
   * Identity of the calling device. Two dials with the SAME id are the same
   * device re-dialing (allowed); a different id while a lease is held is the
   * second-device case this guard exists to stop.
   */
  deviceId: string;
  deviceLabel?: string | null;
  source: string;
}

/**
 * Enforces "one call at a time per user, across every device".
 *
 * Two stores, each doing what it is good at:
 *
 * - **Redis holds a lease** (`SET NX`), which makes the decision atomic. Two
 *   devices dialing in the same millisecond both pass a naive database check;
 *   only one can win a `SET NX`.
 * - **Postgres holds the truth.** A lease can outlive its call (a dropped
 *   `call.hangup` webhook, a Redis key that survived a crash), so once a lease
 *   is older than {@link LEASE_GRACE_MS} a rejection is only issued if the
 *   database still shows a live call. Otherwise the stale lease is taken over.
 *   Inside the grace window the lease is trusted alone, because the winning
 *   dial has not produced a `Call` row yet.
 * - **The provider is the referee.** Postgres only knows what the webhooks
 *   told it, and a lost/late/out-of-order `call.hangup` leaves a row claiming
 *   to be live forever. So before any call row is allowed to refuse a dial it
 *   is confirmed against Telnyx (see {@link ConcurrentCallGuardService.confirmStillLive}),
 *   and closed on the spot when the leg is gone. A missed webhook then costs
 *   the user one round-trip instead of locking them out of calling for good.
 *
 * An inbound call that is merely ringing does NOT occupy the user — nobody has
 * picked it up, and it must not stop them from dialing out.
 */
@Injectable()
export class ConcurrentCallGuardService {
  private readonly logger = new Logger(ConcurrentCallGuardService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly callRepository: CallRepository,
    private readonly telephonyService: TelephonyService,
  ) {}

  /**
   * Reserve the user's single call slot.
   *
   * Returns a rejection instead of throwing so each surface can map it to its
   * own error shape (HTTP 409, an SDK error code, a `BlockedCallLog` row).
   */
  async requestDial(
    userId: string,
    request: DialRequest,
  ): Promise<DialDecision> {
    const lease: DialLease = {
      deviceId: request.deviceId,
      deviceLabel: request.deviceLabel ?? null,
      source: request.source,
      callControlId: null,
      at: new Date().toISOString(),
    };

    const acquired = await this.redis
      .setIfAbsent(
        leaseKey(userId),
        JSON.stringify(lease),
        PENDING_LEASE_TTL_SECONDS,
      )
      .catch((error) => {
        // Redis is an availability dependency here, not a security one: the
        // webhook backstop still kills a genuine second call. Fail open so a
        // cache outage cannot stop the whole product from dialing.
        this.logger.error(
          `Could not acquire dial lease for user ${userId}, allowing the dial: ${this.message(error)}`,
        );
        return true;
      });

    if (acquired) return { allowed: true };

    const holder = await this.readLease(userId);
    if (!holder) {
      // Expired between the SET NX and the read — retry once, and if that also
      // loses, someone genuinely beat us to it.
      return this.requestDialAfterRace(userId, lease);
    }

    // Same device: almost always a re-dial moments after hanging up, before the
    // provider's hangup webhook landed — the lease is stale and should not stand
    // in the user's way. It is NOT a licence to run two calls, so the database
    // still has the last word.
    if (holder.deviceId === request.deviceId) {
      const stillOnACall = await this.findOccupyingCall(userId);
      if (!stillOnACall) {
        await this.writeLease(userId, lease);
        return { allowed: true };
      }
      await this.writeLease(
        userId,
        { ...holder, callControlId: stillOnACall.callControlId },
        ACTIVE_LEASE_TTL_SECONDS,
      );
      return this.reject(holder, true);
    }

    if (Date.now() - Date.parse(holder.at) < LEASE_GRACE_MS) {
      return this.reject(holder);
    }

    // Old lease: only a real call in the database justifies refusing.
    const live = await this.findOccupyingCall(userId);
    if (live) {
      await this.writeLease(
        userId,
        { ...holder, callControlId: live.callControlId },
        ACTIVE_LEASE_TTL_SECONDS,
      );
      return this.reject(holder);
    }

    this.logger.warn(
      `Taking over a stale dial lease for user ${userId} (was ${holder.source}/${holder.deviceId}, no live call in the database)`,
    );
    await this.writeLease(userId, lease);
    return { allowed: true };
  }

  /**
   * Promote the pending lease to the real call and extend it for the call's
   * lifetime. Called from the `call.initiated` webhook.
   */
  async bindToCall(userId: string, callControlId: string): Promise<void> {
    const holder = await this.readLease(userId);
    const lease: DialLease = holder
      ? { ...holder, callControlId }
      : {
          // No lease means the dial skipped pre-flight (a direct WebRTC client).
          // Record one anyway so the next device is refused.
          deviceId: `call:${callControlId}`,
          deviceLabel: null,
          source: "unknown",
          callControlId,
          at: new Date().toISOString(),
        };
    await this.writeLease(userId, lease, ACTIVE_LEASE_TTL_SECONDS);
  }

  /**
   * Free the slot. A `callControlId` is required to release a lease that is
   * already bound, so a late webhook from an older call cannot unlock the call
   * that replaced it.
   */
  async release(userId: string, callControlId?: string | null): Promise<void> {
    const holder = await this.readLease(userId);
    if (!holder) return;
    if (
      holder.callControlId &&
      callControlId &&
      holder.callControlId !== callControlId
    ) {
      return;
    }
    await this.redis
      .del(leaseKey(userId))
      .catch((error) =>
        this.logger.warn(
          `Could not release dial lease for user ${userId}: ${this.message(error)}`,
        ),
      );
  }

  /**
   * Release ONLY when the lease is still bound to this exact call. Cleanup of
   * an abandoned call can run long after the fact — possibly while a fresh
   * dial is mid-flight — and deleting that dial's lease would hand the slot to
   * a second device.
   */
  private async releaseIfBoundTo(
    userId: string,
    callControlId: string | null,
  ): Promise<void> {
    const holder = await this.readLease(userId);
    if (!holder || !callControlId) return;
    if (holder.callControlId !== callControlId) return;
    await this.redis
      .del(leaseKey(userId))
      .catch((error) =>
        this.logger.warn(
          `Could not release dial lease for user ${userId}: ${this.message(error)}`,
        ),
      );
  }

  /**
   * The user's call that is genuinely occupying them, if any.
   *
   * `excludeCallControlId` lets the `call.initiated` backstop ignore the leg it
   * is currently processing.
   */
  async findOccupyingCall(
    userId: string,
    excludeCallControlId?: string | null,
  ): Promise<Call | null> {
    const calls = await this.callRepository
      .findActiveByUserId(userId)
      .catch((error) => {
        this.logger.error(
          `Could not read active calls for user ${userId}: ${this.message(error)}`,
        );
        return [] as Call[];
      });

    const candidates = calls.filter(
      (call) =>
        OCCUPYING_STATUSES.includes(call.status) &&
        call.callControlId !== excludeCallControlId &&
        this.occupiesTheUser(call),
    );

    // Newest first (the repository orders by createdAt desc): the call the user
    // is really on is the one most likely to confirm, and it short-circuits the
    // rest.
    for (const candidate of candidates) {
      if (await this.confirmStillLive(candidate)) return candidate;
    }
    return null;
  }

  /**
   * Is this call really still up?
   *
   * A row that was just written is believed as-is; anything older is checked
   * against the provider and CLOSED here when the leg is gone. That write is
   * what makes the rule self-healing: the same ghost call cannot block the
   * next dial, and it stops sitting in history/dashboards as an eternal
   * "in progress" call.
   *
   * Also used by the periodic sweep (see StaleCallSweeperService), so a user
   * who never retries is unblocked without touching the product.
   */
  async confirmStillLive(call: Call): Promise<boolean> {
    const connected =
      call.status === CallStatus.answered ||
      call.status === CallStatus.recording;
    const age = Date.now() - this.livenessAnchor(call).getTime();

    if (age < LIVENESS_TRUST_MS) return true;

    const alive = call.callControlId
      ? await this.telephonyService
          .isCallAlive(call.callControlId)
          .catch(() => null)
      : false;

    if (alive === true) return true;

    if (alive === null) {
      // The provider could not answer. Keep believing the row until it gets
      // absurd, then close it anyway rather than lock the user out.
      const hardLimit = connected
        ? CONNECTED_HARD_LIMIT_MS
        : RINGING_HARD_LIMIT_MS;
      if (age < hardLimit) return true;
    }

    await this.closeAbandonedCall(
      call,
      alive === null
        ? "provider could not be reached and the call is far past any plausible duration"
        : "the provider has no such leg any more",
    );
    return false;
  }

  /**
   * Close a call whose hangup never reached us, and free the slot it was
   * holding. Best-effort on purpose: this runs inside dial pre-flight, and a
   * failed cleanup must not turn into a failed dial.
   */
  private async closeAbandonedCall(call: Call, why: string): Promise<void> {
    this.logger.warn(
      `Closing abandoned call ${call.id} (leg=${call.callControlId ?? "none"}, ` +
        `status=${call.status}, user=${call.userId ?? "none"}): ${why}`,
    );

    await this.callRepository
      .markForciblyEnded(
        call.id,
        `Closed automatically — no hangup event received (${why})`,
      )
      .catch((error) =>
        this.logger.error(
          `Could not close abandoned call ${call.id}: ${this.message(error)}`,
        ),
      );

    if (call.userId) {
      await this.releaseIfBoundTo(call.userId, call.callControlId);
    }
  }

  /**
   * The moment from which this call's plausible lifetime is measured.
   * `createdAt` is the backstop: `startedAt` comes from the provider payload
   * and may be missing on rows written by other dial surfaces.
   */
  private livenessAnchor(call: Call): Date {
    if (
      call.status === CallStatus.answered ||
      call.status === CallStatus.recording
    ) {
      return call.answeredAt ?? call.startedAt ?? call.createdAt;
    }
    return call.startedAt ?? call.createdAt;
  }

  /** Copy for a rejection that has no lease behind it (webhook backstop). */
  describeBusyCall(call: Call): string {
    const surface = this.describeSource(call.source);
    return `You already have a call in progress${surface ? ` on ${surface}` : ""} to ${call.toNumber}. Ringee allows one call at a time per user — end that call before starting another.`;
  }

  /**
   * An answered call always occupies the user. A ringing call only occupies
   * them when it is outbound: an inbound leg that is merely ringing has not
   * been picked up, and refusing to let someone dial out because a stranger is
   * calling them would be wrong.
   */
  private occupiesTheUser(call: Call): boolean {
    if (
      call.status === CallStatus.answered ||
      call.status === CallStatus.recording
    ) {
      return true;
    }
    const direction = (call.direction ?? "outbound").toLowerCase();
    return !["inbound", "incoming"].includes(direction);
  }

  private async requestDialAfterRace(
    userId: string,
    lease: DialLease,
  ): Promise<DialDecision> {
    const acquired = await this.redis
      .setIfAbsent(
        leaseKey(userId),
        JSON.stringify(lease),
        PENDING_LEASE_TTL_SECONDS,
      )
      .catch(() => true);
    if (acquired) return { allowed: true };

    const holder = (await this.readLease(userId)) ?? lease;
    return this.reject(holder);
  }

  /**
   * `sameDevice` drops the "on <device>" clause — telling someone their call is
   * on the very device they are looking at reads like a bug.
   */
  private reject(holder: DialLease, sameDevice = false): DialRejection {
    if (sameDevice) {
      return {
        allowed: false,
        holder,
        message:
          "You already have a call in progress. Ringee allows one call at a time — end it before starting another.",
      };
    }

    const device =
      holder.deviceLabel ??
      this.describeSource(holder.source) ??
      "another device";
    return {
      allowed: false,
      holder,
      message: `You already have a call in progress on ${device}. Ringee allows one call at a time per user — end that call before starting another.`,
    };
  }

  private describeSource(source: string | null): string | null {
    switch (source) {
      case "web":
        return "the web dialer";
      case "chrome_extension":
        return "the browser extension";
      case "mobile":
        return "the mobile app";
      case "sdk":
        return "an embedded dialer";
      case "session":
        return "a dialing session link";
      case "campaign":
        return "a campaign session";
      case "sip_device":
        return "a desk phone";
      default:
        return null;
    }
  }

  private async readLease(userId: string): Promise<DialLease | null> {
    const raw = await this.redis
      .get<DialLease | string>(leaseKey(userId))
      .catch(() => undefined);
    if (!raw) return null;
    if (typeof raw === "string") {
      try {
        return JSON.parse(raw) as DialLease;
      } catch {
        return null;
      }
    }
    return raw;
  }

  private async writeLease(
    userId: string,
    lease: DialLease,
    ttlSeconds = PENDING_LEASE_TTL_SECONDS,
  ): Promise<void> {
    await this.redis
      .set(leaseKey(userId), JSON.stringify(lease), ttlSeconds * 1000)
      .catch((error) =>
        this.logger.warn(
          `Could not write dial lease for user ${userId}: ${this.message(error)}`,
        ),
      );
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
