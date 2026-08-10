import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { UserRepository } from "@ringee/database";
import {
  ClerkUserRepository,
  RealtimeDevice,
  RealtimePresenceService,
  RealtimeUserEventsPublisher,
  RedisService,
} from "@ringee/platform";
import {
  ActiveCallTerminationService,
  AgentSessionService,
  CallTerminationResult,
  CLERK_USER_BAN_REASON,
  UserService,
} from "@ringee/services";

const STRIPE_PAYMENT_ABUSE_REASON = "stripe_payment_abuse";
const STRIPE_ABUSE_KEY_PREFIX = "stripe-abuse:v1";

/** Copy shown to the end user on every device when access is cut. */
const BLOCKED_USER_MESSAGE =
  "Your Ringee account has been disabled and your active calls were ended. Contact support if you think this is a mistake.";

export interface UserAccessAdminState {
  ringeeBlocked: boolean;
  blockedAt: string | null;
  blockedReason: string | null;
  canCall: boolean;
  clerkBanned: boolean | null;
}

export interface EnforcementResult {
  /** Live calls that were hung up server-side. */
  calls: CallTerminationResult;
  /** Devices holding a realtime socket when the action ran. */
  devicesNotified: number;
  /** Campaign dialer sessions forced offline. */
  sessionsDisabled: number;
}

export interface UserAccessEnforcementResponse {
  access: UserAccessAdminState;
  enforcement: EnforcementResult;
}

@Injectable()
export class UserAccessEnforcementService {
  private readonly logger = new Logger(UserAccessEnforcementService.name);

  constructor(
    private readonly userRepository: UserRepository,
    private readonly userService: UserService,
    private readonly agentSessionService: AgentSessionService,
    private readonly redis: RedisService,
    private readonly callTermination: ActiveCallTerminationService,
    private readonly realtimeEvents: RealtimeUserEventsPublisher,
    private readonly presence: RealtimePresenceService,
  ) {}

  /**
   * Payment abuse is enforced in both identity and product layers:
   * - Clerk's native ban revokes sessions and prevents future sign-ins.
   * - Ringee's persistent block rejects future authenticated requests.
   * - Ringee canCall=false stops every outbound call path.
   * - Every live call is hung up at the provider, and every signed-in device is
   *   told to tear down over its WebSocket.
   *
   * The two branches run independently so a temporary Clerk outage never
   * leaves the Ringee dialer enabled, and a local DB failure never prevents
   * Clerk from ejecting the attacker.
   */
  async banForPaymentAbuse(userId: string): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      this.logger.error(
        `Cannot enforce payment-abuse ban: Ringee user ${userId} was not found`,
      );
      return;
    }

    const clerkBan = user.clerkId
      ? ClerkUserRepository.banUser(user.clerkId)
      : Promise.reject(new Error("User has no Clerk id"));
    const localDisable = this.disableRingeeDialer(
      user.id,
      STRIPE_PAYMENT_ABUSE_REASON,
    );

    const [clerkResult, localResult] = await Promise.allSettled([
      clerkBan,
      localDisable,
    ]);
    if (clerkResult.status === "rejected") {
      this.logger.error(
        `Failed to revoke Clerk sessions for Ringee user ${user.id}: ${this.errorMessage(clerkResult.reason)}`,
      );
    } else {
      this.logger.warn(
        `Banned Clerk identity and revoked sessions for Ringee user ${user.id}`,
      );
    }
    if (localResult.status === "rejected") {
      this.logger.error(
        `Failed to disable Ringee dialer for user ${user.id}: ${this.errorMessage(localResult.reason)}`,
      );
    }
  }

  /** Current access state displayed by the protected backoffice. */
  async getAdminState(userId: string): Promise<UserAccessAdminState> {
    const user = await this.requireUser(userId);
    let clerkBanned: boolean | null = null;

    if (user.clerkId) {
      try {
        const clerkUser = await ClerkUserRepository.findById(user.clerkId);
        clerkBanned = clerkUser.banned;
      } catch (error) {
        this.logger.warn(
          `Could not read Clerk ban state for Ringee user ${userId}: ${this.errorMessage(error)}`,
        );
      }
    }

    return {
      ringeeBlocked: Boolean(user.blockedAt),
      blockedAt: user.blockedAt?.toISOString() ?? null,
      blockedReason: user.blockedReason,
      canCall: user.canCall,
      clerkBanned,
    };
  }

  /** Devices with an open realtime socket, across every API instance. */
  async listConnectedDevices(userId: string): Promise<RealtimeDevice[]> {
    await this.requireUser(userId);
    return this.presence.list(userId);
  }

  /**
   * Drop every live call without touching the account's access.
   *
   * Useful on its own (a runaway campaign, a stuck leg) and deliberately
   * separate from the ban so an operator can pick the smaller hammer.
   */
  async terminateActiveCalls(
    userId: string,
    reason = "admin_forced_disconnect",
  ): Promise<EnforcementResult> {
    await this.requireUser(userId);
    const calls = await this.callTermination.terminateAllForUser(
      userId,
      reason,
    );
    const devicesNotified = await this.notifyDevices(userId, () =>
      this.realtimeEvents.callsTerminated(userId, {
        reason,
        message: "An administrator ended your active calls.",
        terminatedCallIds: calls.callIds,
        at: new Date().toISOString(),
      }),
    );

    this.logger.warn(
      `Backoffice force-disconnected user ${userId}: ${calls.terminated} call(s) hung up, ${devicesNotified} device(s) notified`,
    );
    return { calls, devicesNotified, sessionsDisabled: 0 };
  }

  /** Clear only the per-user Stripe abuse counters and temporary block. */
  async restoreStripeAbuse(userId: string): Promise<UserAccessAdminState> {
    await this.requireUser(userId);
    await this.resetStripeAbuseState(userId);
    this.logger.log(`Stripe abuse state restored for user ${userId}`);
    return this.getAdminState(userId);
  }

  /** Explicit super-admin repair: remove any Ringee block and enable calling. */
  async removeRingeeBlock(userId: string): Promise<UserAccessAdminState> {
    await this.requireUser(userId);
    const restored = await this.userRepository.update(userId, {
      blockedAt: null,
      blockedReason: null,
      canCall: true,
    });
    await this.userService.invalidateUserCache(restored);
    await this.realtimeEvents.accountRestored(userId).catch(() => undefined);
    this.logger.log(`Ringee block removed by backoffice for user ${userId}`);
    return this.getAdminState(userId);
  }

  /**
   * Ban or unban the Clerk identity and mirror the result into Ringee now.
   *
   * On a ban the lockdown always runs, even if the user was already blocked:
   * the administrator's intent is "cut this account off right now", and a
   * pre-existing block says nothing about calls that are still up.
   */
  async setClerkBan(
    userId: string,
    banned: boolean,
  ): Promise<UserAccessEnforcementResponse> {
    const user = await this.requireUser(userId);
    if (!user.clerkId) {
      throw new BadRequestException("User has no Clerk identity");
    }

    if (banned) {
      await ClerkUserRepository.banUser(user.clerkId);
    } else {
      await ClerkUserRepository.unbanUser(user.clerkId);
    }

    // Do not wait for eventual webhook delivery before reflecting the action.
    // The signed user.updated webhook remains an idempotent fallback.
    const synced = await this.syncClerkAccessToRingee(userId, banned);

    // `syncClerkAccessToRingee` already locks down when it is the call that
    // blocks the account. Only run it here when the user was blocked before —
    // an admin pressing "ban" must still cut any call that is up right now.
    const enforcement = banned
      ? (synced ?? (await this.lockdown(userId, CLERK_USER_BAN_REASON)))
      : { calls: this.emptyCalls(), devicesNotified: 0, sessionsDisabled: 0 };

    this.logger.log(
      `Clerk identity ${banned ? "banned" : "unbanned"} by backoffice for user ${userId}`,
    );
    return { access: await this.getAdminState(userId), enforcement };
  }

  /**
   * Mirrors Clerk's current ban state into Ringee from the signed user.updated
   * webhook. Clerk emits the same event for both ban and unban operations.
   *
   * An explicit Clerk unban is the administrator's source of truth: restore
   * Ringee access, outbound calling, and the user's Stripe fraud state.
   *
   * Returns the enforcement result when this call is the one that blocked the
   * account, so a caller that already knows about the ban does not run (and
   * broadcast) a second lockdown.
   */
  async syncClerkAccessToRingee(
    userId: string,
    banned: boolean,
  ): Promise<EnforcementResult | null> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      this.logger.error(
        `Cannot synchronize Clerk access: Ringee user ${userId} was not found`,
      );
      return null;
    }

    if (banned) {
      // Preserve a pre-existing Ringee block and its more specific reason.
      if (!user.blockedAt) {
        return this.disableRingeeDialer(userId, CLERK_USER_BAN_REASON);
      }
      return null;
    }

    // `user.updated` also fires for normal profile/email changes. Only treat a
    // non-banned event as an administrative unban when Ringee still carries a
    // block that is known to have banned the Clerk identity.
    const isRestorableClerkBan =
      user.blockedAt &&
      (user.blockedReason === CLERK_USER_BAN_REASON ||
        user.blockedReason === STRIPE_PAYMENT_ABUSE_REASON);
    if (!isRestorableClerkBan) {
      return null;
    }

    // Reset only this user's Stripe counters/block. Shared IP counters are not
    // user-owned and must not be erased by an account-level Clerk unban.
    await this.resetStripeAbuseState(userId);
    const restored = await this.userRepository.update(userId, {
      blockedAt: null,
      blockedReason: null,
      canCall: true,
    });
    await this.userService.invalidateUserCache(restored);
    await this.realtimeEvents.accountRestored(userId).catch(() => undefined);
    this.logger.log(
      `User ${userId} fully restored after Clerk unban (previousReason=${user.blockedReason ?? "none"}, canCall=true)`,
    );
    return null;
  }

  private async disableRingeeDialer(
    userId: string,
    source: string,
  ): Promise<EnforcementResult> {
    await this.userService.blockAccount(userId, source);
    return this.lockdown(userId, source);
  }

  /**
   * The teeth of a ban. Runs after the account row is already blocked, in the
   * order that matters:
   *
   * 1. Hang up every live call at the provider — authoritative, and independent
   *    of whether any device is reachable.
   * 2. Force campaign dialer sessions offline so nothing redials.
   * 3. Push `account.blocked` to every signed-in device so each one tears down
   *    its WebRTC leg and locks the UI immediately instead of on next request.
   *
   * Every step is best-effort and isolated: a Telnyx timeout must not stop the
   * broadcast, and a Redis outage must not stop the hangups.
   */
  private async lockdown(
    userId: string,
    reason: string,
  ): Promise<EnforcementResult> {
    const calls = await this.callTermination
      .terminateAllForUser(userId, reason)
      .catch((error) => {
        this.logger.error(
          `Call termination failed while locking down user ${userId}: ${this.errorMessage(error)}`,
        );
        return this.emptyCalls();
      });

    const sessionsDisabled = await this.agentSessionService
      .disableForUser(userId)
      .catch((error) => {
        this.logger.error(
          `Could not disable dialer sessions for user ${userId}: ${this.errorMessage(error)}`,
        );
        return 0;
      });

    const devicesNotified = await this.notifyDevices(userId, () =>
      this.realtimeEvents.accountBlocked(userId, {
        reason,
        message: BLOCKED_USER_MESSAGE,
        blockedAt: new Date().toISOString(),
        terminatedCallIds: calls.callIds,
      }),
    );

    this.logger.warn(
      `Lockdown "${reason}" on user ${userId}: ${calls.terminated} call(s) hung up, ${sessionsDisabled} dialer session(s) offline, ${devicesNotified} device(s) notified`,
    );
    return { calls, devicesNotified, sessionsDisabled };
  }

  /**
   * Count the devices that were online, then publish. The count is read first
   * because `account.blocked` closes the sockets it is delivered to.
   */
  private async notifyDevices(
    userId: string,
    publish: () => Promise<void>,
  ): Promise<number> {
    const devices = await this.presence
      .list(userId)
      .catch(() => [] as RealtimeDevice[]);
    await publish().catch((error) =>
      this.logger.error(
        `Could not broadcast realtime event to user ${userId}: ${this.errorMessage(error)}`,
      ),
    );
    return devices.length;
  }

  private emptyCalls(): CallTerminationResult {
    return { callIds: [], terminated: 0, withoutControlId: 0, failed: 0 };
  }

  private resetStripeAbuseState(userId: string): Promise<void> {
    return this.redis.delMany([
      `${STRIPE_ABUSE_KEY_PREFIX}:requests:user:${userId}`,
      `${STRIPE_ABUSE_KEY_PREFIX}:failures:user:${userId}`,
      `${STRIPE_ABUSE_KEY_PREFIX}:blocked:user:${userId}`,
    ]);
  }

  private async requireUser(
    userId: string,
  ): Promise<NonNullable<Awaited<ReturnType<UserRepository["findById"]>>>> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException("User not found");
    }
    return user;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
