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
 * How long an *unbound* lease (a dial that pre-flight approved but that has not
 * reached `call.initiated` yet) may refuse another device on its own.
 *
 * This is the one and only window where a lease speaks without the database
 * behind it, so it is sized to the real race — the seconds between "the API
 * said yes" and "the provider says the leg is up" — and nothing more. Past it
 * an unbound lease is an ABANDONED pre-flight (the browser never placed the
 * leg, a later gate refused the dial, the tab was closed) and must not stand in
 * anyone's way. Erring towards "allow" is deliberate: a genuine second leg is
 * still killed by the `call.initiated` backstop, while a false refusal is a
 * user who simply cannot call.
 */
const DIAL_RACE_WINDOW_MS = 20_000;

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

/**
 * Is this row a server-originated voicemail drop — a leg NOBODY is on?
 *
 * Telnyx dials it, answering-machine detection runs, the asset is played into
 * the greeting and it hangs up. The row lands as `outbound`/`ringing` under the
 * member who pressed "drop", so counting it marks them busy for the 20-40 s the
 * drop takes. In a campaign that is every no-answer lead, and the agent is
 * refused the very next dial they were about to make. Voicemail drops are an
 * organization-only feature, which is why this only ever bit teams.
 *
 * The marker is the `client_state` the drop stamps on its own leg, the same one
 * `CallService.handleVoicemailDropEvent` routes on — not `source`, which the
 * caller may override (the session dialer sends `source: "session"`).
 */
function isServerOriginatedDrop(call: Call): boolean {
  if (!call.clientState) return false;
  try {
    const decoded: unknown = JSON.parse(
      Buffer.from(call.clientState, "base64").toString("utf-8"),
    );
    const action = (decoded as { action?: unknown } | null)?.action;
    return typeof action === "string" && action.startsWith("voicemail_drop");
  } catch {
    // A normal leg carries the literal "initiate_call", which is not JSON.
    return false;
  }
}

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
 *   `call.hangup` webhook, a Redis key that survived a crash, a pre-flight the
 *   browser never turned into a leg), so losing the `SET NX` is never on its
 *   own a reason to refuse: a rejection is only issued when the database still
 *   shows a live call. Otherwise the stale lease is taken over. The single
 *   exception is {@link DIAL_RACE_WINDOW_MS} — the seconds in which the winning
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
 *
 * Everything here is keyed on ONE user id and nothing else. The rule exists to
 * stop a single account being shared across people, so it must never be able to
 * refuse one teammate because of another teammate's call: an organization has
 * as many simultaneous calls as it has members. Whenever a dial is refused, the
 * owner of the lease and the owner of the live call are by construction the
 * same `userId` that asked — see {@link occupiesTheUser} for the one place
 * where a `Call` row can name someone other than the person on the call.
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

    // Losing the SET NX only means SOMETHING holds the key. It is not yet a
    // reason to refuse: a lease outlives its call whenever a `call.hangup` is
    // lost, and it outlives a dial that was approved and never placed. So the
    // database (checked against the provider) gets the first and last word, and
    // the lease alone is trusted only inside the race window below.
    const live = await this.findOccupyingCall(userId);
    if (live) {
      await this.writeLease(
        userId,
        { ...holder, callControlId: live.callControlId },
        ACTIVE_LEASE_TTL_SECONDS,
      );
      return this.reject(holder, holder.deviceId === request.deviceId);
    }

    // Nothing is live anywhere. The only honest reason left to refuse is a
    // genuine race: another device won the lease seconds ago and its leg has
    // not reached `call.initiated` yet, so no row exists to find. A lease that
    // is already BOUND to a call the database no longer shows as live is a
    // ghost, not a race — that user hung up and the webhook never landed.
    if (
      holder.deviceId !== request.deviceId &&
      !holder.callControlId &&
      this.ageMs(holder.at) < DIAL_RACE_WINDOW_MS
    ) {
      return this.reject(holder);
    }

    this.logger.warn(
      `Taking over a stale dial lease for user ${userId} ` +
        `(was ${holder.source}/${holder.deviceId}, bound to ${holder.callControlId ?? "no leg"}, ` +
        `taken ${holder.at}; no live call in the database)`,
    );
    await this.writeLease(userId, lease);
    return { allowed: true };
  }

  /**
   * Age of a lease in milliseconds, or `Infinity` when its timestamp cannot be
   * read. An unparseable lease must read as OLD, never as "taken this instant":
   * the fresh reading is the one that refuses a dial.
   */
  private ageMs(at: string): number {
    const taken = Date.parse(at);
    return Number.isNaN(taken) ? Number.POSITIVE_INFINITY : Date.now() - taken;
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
   * Free the slot.
   *
   * With a `callControlId`, ONLY the lease bound to that exact leg is released.
   * A lease bound to a different call belongs to the call that replaced this
   * one, and an UNBOUND lease is a dial being placed right this moment — a late
   * hangup from an older call (or from a voicemail drop, which never took a
   * lease at all) freeing either would hand the slot to a second device.
   *
   * Without a `callControlId` the release is unconditional: that is the account
   * termination path, where every call is being killed on purpose.
   */
  async release(userId: string, callControlId?: string | null): Promise<void> {
    const holder = await this.readLease(userId);
    if (!holder) return;
    if (callControlId && holder.callControlId !== callControlId) {
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
   * Give the slot back when an approved dial never became a call.
   *
   * Every surface reserves the slot in pre-flight and can still refuse the dial
   * a few lines later — no caller ID for the destination's country, DNC, no
   * credit, an invalid number — and the browser can simply fail to place the
   * WebRTC leg. Without this the user keeps a lease they are not using for the
   * whole {@link PENDING_LEASE_TTL_SECONDS}, which reaches them as a phantom
   * "you already have a call in progress" on their very next attempt from
   * another surface.
   *
   * Only an UNBOUND lease still owned by this device is dropped, so a dial that
   * did connect in the meantime can never be unlocked by a late abandon.
   */
  async releasePending(userId: string, deviceId: string): Promise<void> {
    const holder = await this.readLease(userId);
    if (!holder || holder.callControlId || holder.deviceId !== deviceId) {
      return;
    }
    await this.redis
      .del(leaseKey(userId))
      .catch((error) =>
        this.logger.warn(
          `Could not release the pending dial lease for user ${userId}: ${this.message(error)}`,
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
   *
   * An inbound leg inside an ORGANIZATION never occupies anyone. Its row is
   * attributed to the number's owner (`NumberPurchased.userId` — whoever bought
   * it) and not to whichever teammate actually picked up, because at
   * `call.initiated` nobody has answered yet. In a personal workspace those are
   * the same person; in a team they are not, and counting it would mark the
   * admin who bought the numbers busy for every call the rest of the team
   * takes — one member's activity refusing another member's dial, which is
   * exactly the cross-user block this rule must never produce.
   */
  private occupiesTheUser(call: Call): boolean {
    if (isServerOriginatedDrop(call)) return false;

    const direction = (call.direction ?? "outbound").toLowerCase();
    const inbound = ["inbound", "incoming"].includes(direction);

    if (inbound && call.organizationId) return false;

    if (
      call.status === CallStatus.answered ||
      call.status === CallStatus.recording
    ) {
      return true;
    }
    return !inbound;
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
