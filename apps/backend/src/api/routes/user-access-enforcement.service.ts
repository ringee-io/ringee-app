import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { UserRepository } from "@ringee/database";
import { ClerkUserRepository, RedisService } from "@ringee/platform";
import {
  AgentSessionService,
  CLERK_USER_BAN_REASON,
  UserService,
} from "@ringee/services";

const STRIPE_PAYMENT_ABUSE_REASON = "stripe_payment_abuse";
const STRIPE_ABUSE_KEY_PREFIX = "stripe-abuse:v1";

export interface UserAccessAdminState {
  ringeeBlocked: boolean;
  blockedAt: string | null;
  blockedReason: string | null;
  canCall: boolean;
  clerkBanned: boolean | null;
}

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
    this.logger.log(`Ringee block removed by backoffice for user ${userId}`);
    return this.getAdminState(userId);
  }

  /** Ban or unban the Clerk identity and mirror the result into Ringee now. */
  async setClerkBan(
    userId: string,
    banned: boolean,
  ): Promise<UserAccessAdminState> {
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
    await this.syncClerkAccessToRingee(userId, banned);
    this.logger.log(
      `Clerk identity ${banned ? "banned" : "unbanned"} by backoffice for user ${userId}`,
    );
    return this.getAdminState(userId);
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
    await this.resetStripeAbuseState(userId);
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
