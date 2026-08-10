import { Injectable, Logger } from "@nestjs/common";
import { Call, CallRepository, CallStatus } from "@ringee/database";
import { RedisService } from "@ringee/platform";

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

    return (
      calls.find(
        (call) =>
          OCCUPYING_STATUSES.includes(call.status) &&
          call.callControlId !== excludeCallControlId &&
          this.occupiesTheUser(call),
      ) ?? null
    );
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
