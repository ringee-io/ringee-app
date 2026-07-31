import { Injectable, Logger } from "@nestjs/common";
import { UserRepository } from "@ringee/database";
import { ClerkUserRepository, RedisService } from "@ringee/platform";
import {
  AgentSessionService,
  CLERK_USER_BAN_REASON,
  UserService,
} from "@ringee/services";

const STRIPE_PAYMENT_ABUSE_REASON = "stripe_payment_abuse";
const STRIPE_ABUSE_KEY_PREFIX = "stripe-abuse:v1";

@Injectable()
export class UserAccessEnforcementService {
  private readonly logger = new Logger(UserAccessEnforcementService.name);

  constructor(
    private readonly userRepository: UserRepository,
    private readonly userService: UserService,
    private readonly agentSessionService: AgentSessionService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Payment abuse is enforced in both identity and product layers:
   * - Clerk's native ban revokes sessions and prevents future sign-ins.
   * - Ringee's persistent block rejects future authenticated requests.
   * - Ringee canCall=false stops every outbound call path.
   * - Active campaign-agent sessions are forced offline immediately.
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

  /**
   * Mirrors Clerk's current ban state into Ringee from the signed user.updated
   * webhook. Clerk emits the same event for both ban and unban operations.
   *
   * An explicit Clerk unban is the administrator's source of truth: restore
   * Ringee access, outbound calling, and the user's Stripe fraud state.
   */
  async syncClerkAccessToRingee(
    userId: string,
    banned: boolean,
  ): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      this.logger.error(
        `Cannot synchronize Clerk access: Ringee user ${userId} was not found`,
      );
      return;
    }

    if (banned) {
      // Preserve a pre-existing Ringee block and its more specific reason.
      if (!user.blockedAt) {
        await this.disableRingeeDialer(userId, CLERK_USER_BAN_REASON);
      }
      return;
    }

    // `user.updated` also fires for normal profile/email changes. Only treat a
    // non-banned event as an administrative unban when Ringee still carries a
    // block that is known to have banned the Clerk identity.
    const isRestorableClerkBan =
      user.blockedAt &&
      (user.blockedReason === CLERK_USER_BAN_REASON ||
        user.blockedReason === STRIPE_PAYMENT_ABUSE_REASON);
    if (!isRestorableClerkBan) {
      return;
    }

    // Reset only this user's Stripe counters/block. Shared IP counters are not
    // user-owned and must not be erased by an account-level Clerk unban.
    await this.redis.delMany([
      `${STRIPE_ABUSE_KEY_PREFIX}:requests:user:${userId}`,
      `${STRIPE_ABUSE_KEY_PREFIX}:failures:user:${userId}`,
      `${STRIPE_ABUSE_KEY_PREFIX}:blocked:user:${userId}`,
    ]);
    const restored = await this.userRepository.update(userId, {
      blockedAt: null,
      blockedReason: null,
      canCall: true,
    });
    await this.userService.invalidateUserCache(restored);
    this.logger.log(
      `User ${userId} fully restored after Clerk unban (previousReason=${user.blockedReason ?? "none"}, canCall=true)`,
    );
  }

  private async disableRingeeDialer(
    userId: string,
    source: string,
  ): Promise<void> {
    await this.userService.blockAccount(userId, source);
    const sessionsDisabled =
      await this.agentSessionService.disableForUser(userId);
    this.logger.warn(
      `User ${userId} blocked and outbound calling disabled (${source}); ${sessionsDisabled} active dialer session(s) forced offline`,
    );
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
