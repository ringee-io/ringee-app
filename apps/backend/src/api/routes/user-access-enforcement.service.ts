import { Injectable, Logger } from "@nestjs/common";
import { UserRepository } from "@ringee/database";
import { ClerkUserRepository } from "@ringee/platform";
import {
  AgentSessionService,
  CLERK_USER_BAN_REASON,
  UserService,
} from "@ringee/services";

@Injectable()
export class UserAccessEnforcementService {
  private readonly logger = new Logger(UserAccessEnforcementService.name);

  constructor(
    private readonly userRepository: UserRepository,
    private readonly userService: UserService,
    private readonly agentSessionService: AgentSessionService,
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
      "stripe_payment_abuse",
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
   * Only a block created by this synchronization is cleared on unban. A Clerk
   * profile update must never lift a stronger product-side block such as
   * payment abuse.
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

    if (user.blockedAt && user.blockedReason === CLERK_USER_BAN_REASON) {
      const unblocked = await this.userService.unblockAccount(
        userId,
        CLERK_USER_BAN_REASON,
      );
      if (unblocked) {
        this.logger.log(
          `User ${userId} unblocked after Clerk access was restored`,
        );
      }
    }
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
