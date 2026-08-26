import { BadRequestException, Injectable } from "@nestjs/common";
import { User, UserRepository } from "@ringee/database";
import { RedisService } from "@ringee/platform";

export const CLERK_USER_BAN_REASON = "clerk_user_banned";

// Mirrors the mobile settings toggles. Missing keys default to "on" so a
// user who has never opened the screen still receives notifications.
export interface NotificationPreferences {
  callbacks: boolean;
  meetings: boolean;
  missedCalls: boolean;
}

export interface UserGeneralSettings {
  canCall: boolean;
  minimumCreditPurchase: number;
  freeCallTrial: boolean;
  numberPurchaseLimit: number | null;
  phoneRequired: boolean;
}

export interface UpdateUserGeneralSettingsInput {
  canCall?: boolean;
  minimumCreditPurchase?: number;
  freeCallTrial?: boolean;
  numberPurchaseLimit?: number | null;
  phoneRequired?: boolean;
}

const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  callbacks: true,
  meetings: true,
  missedCalls: true,
};

export function normalizeNotificationPreferences(
  raw: unknown,
): NotificationPreferences {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }
  const obj = raw as Record<string, unknown>;
  const pick = (k: keyof NotificationPreferences) =>
    typeof obj[k] === "boolean"
      ? (obj[k] as boolean)
      : DEFAULT_NOTIFICATION_PREFERENCES[k];
  return {
    callbacks: pick("callbacks"),
    meetings: pick("meetings"),
    missedCalls: pick("missedCalls"),
  };
}

@Injectable()
export class UserService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Cache keys for a user. We mirror the same record under both its internal
   * id and its Clerk id so either lookup is a hit and a single write can
   * warm/clear both. The organization is cached the same way upstream by
   * OrganizationService.
   */
  private static idKey(id: string): string {
    return `user:id:${id}`;
  }

  private static clerkKey(clerkId: string): string {
    return `user:clerk:${clerkId}`;
  }

  /**
   * A caller that has no identifier must get `null`, never "some user".
   * Without this an absent id builds the literal key `user:clerk:undefined` and
   * falls through to a repository lookup, and the repository is where a missing
   * filter used to resolve to an arbitrary account (see UserRepository).
   */
  private static missingId(value: string | null | undefined): boolean {
    return typeof value !== "string" || value.trim() === "";
  }

  /** How long a cached user stays warm (1 hour). */
  private static readonly USER_CACHE_TTL_MS = 60 * 60 * 1000;

  /** Mirror a freshly-read user under both of its cache keys. */
  private async cacheUser(user: User): Promise<void> {
    const entries: Array<[string, unknown, number]> = [
      [UserService.idKey(user.id), user, UserService.USER_CACHE_TTL_MS],
    ];
    if (user.clerkId) {
      entries.push([
        UserService.clerkKey(user.clerkId),
        user,
        UserService.USER_CACHE_TTL_MS,
      ]);
    }
    await this.redisService.setMany(entries);
  }

  /**
   * Warm both user cache aliases after an external synchronization (for
   * example, Clerk's first-login repair path) without reading the row again.
   */
  async warmUserCache(user: User): Promise<void> {
    await this.cacheUser(user);
  }

  /**
   * Cached lookup by internal id. Use this on read-mostly/hot paths; reach for
   * {@link getUserById} only when you explicitly need an uncached read.
   */
  async getCachedUserById(id: string): Promise<User | null> {
    if (UserService.missingId(id)) return null;
    const cached = await this.redisService.get<User>(UserService.idKey(id));
    if (cached) {
      return cached;
    }
    const user = await this.userRepository.findById(id);
    if (user) {
      await this.cacheUser(user);
    }
    return user;
  }

  /** Cached lookup by Clerk id (see {@link getCachedUserById}). */
  async getCachedByClerkId(clerkId: string): Promise<User | null> {
    if (UserService.missingId(clerkId)) return null;
    const cached = await this.redisService.get<User>(
      UserService.clerkKey(clerkId),
    );
    if (cached) {
      return cached;
    }
    const user = await this.userRepository.findByClerkId(clerkId);
    if (user) {
      await this.cacheUser(user);
    }
    return user;
  }

  /**
   * Drop every cached entry for a user. Call after any write that changes a
   * field other read paths rely on (free trial, customer id, profile, …).
   */
  async invalidateUserCache(user: Pick<User, "id" | "clerkId">): Promise<void> {
    const keys = [UserService.idKey(user.id)];
    if (user.clerkId) {
      keys.push(UserService.clerkKey(user.clerkId));
    }
    await this.redisService.delMany(keys);
  }

  async getNotificationPreferences(
    userId: string,
  ): Promise<NotificationPreferences> {
    const user = await this.userRepository.findById(userId);
    return normalizeNotificationPreferences(
      (user as { notificationPreferences?: unknown } | null)
        ?.notificationPreferences,
    );
  }

  async setNotificationPreferences(
    userId: string,
    patch: Partial<NotificationPreferences>,
  ): Promise<NotificationPreferences> {
    const current = await this.getNotificationPreferences(userId);
    const next: NotificationPreferences = {
      callbacks:
        typeof patch.callbacks === "boolean"
          ? patch.callbacks
          : current.callbacks,
      meetings:
        typeof patch.meetings === "boolean" ? patch.meetings : current.meetings,
      missedCalls:
        typeof patch.missedCalls === "boolean"
          ? patch.missedCalls
          : current.missedCalls,
    };
    const updated = await this.userRepository.update(userId, {
      // Prisma's InputJsonValue requires an index signature; spread to make
      // the literal compatible without losing the structural typing above.
      notificationPreferences: { ...next },
    });
    await this.invalidateUserCache(updated);
    return next;
  }

  async getUserById(id: string): Promise<User | null> {
    return this.userRepository.findById(id);
  }

  async getByClerkId(clerkId: string): Promise<User | null> {
    return this.userRepository.findByClerkId(clerkId);
  }

  async getByClerkIds(
    clerkIds: string[],
  ): Promise<{ id: string; clerkId: string | null }[]> {
    return this.userRepository.findByClerkIds(clerkIds);
  }

  async patchCustomerId(userId: string, customerId: string): Promise<User> {
    const user = await this.userRepository.update(userId, { customerId });
    await this.invalidateUserCache(user);
    return user;
  }

  async updateGeneralSettings(
    userId: string,
    input: UpdateUserGeneralSettingsInput,
  ): Promise<UserGeneralSettings> {
    const updated = await this.userRepository.update(userId, {
      ...(input.canCall !== undefined ? { canCall: input.canCall } : {}),
      ...(input.minimumCreditPurchase !== undefined
        ? { minimumCreditPurchase: input.minimumCreditPurchase }
        : {}),
      ...(input.freeCallTrial !== undefined
        ? { freeCallTrial: input.freeCallTrial }
        : {}),
      ...(input.numberPurchaseLimit !== undefined
        ? { numberPurchaseLimit: input.numberPurchaseLimit }
        : {}),
      ...(input.phoneRequired !== undefined
        ? { phoneRequired: input.phoneRequired }
        : {}),
    });
    await this.invalidateUserCache(updated);
    return {
      canCall: updated.canCall,
      minimumCreditPurchase: updated.minimumCreditPurchase,
      freeCallTrial: updated.freeCallTrial ?? false,
      numberPurchaseLimit: updated.numberPurchaseLimit,
      phoneRequired: updated.phoneRequired,
    };
  }

  /**
   * Permanently deny Ringee access and outbound calling. Session revocation is
   * handled by the identity adapter so this method remains the local source of
   * truth if the user signs in to Clerk again.
   */
  async blockAccount(userId: string, reason: string): Promise<User> {
    const updated = await this.userRepository.update(userId, {
      blockedAt: new Date(),
      blockedReason: reason,
      canCall: false,
    });
    await this.invalidateUserCache(updated);
    return updated;
  }

  /**
   * Restore product access after the identity provider removes its ban.
   * The repository verifies the reason atomically so a concurrent, stronger
   * product-side block cannot be cleared by an identity-provider update.
   */
  async unblockAccount(
    userId: string,
    expectedReason: string,
  ): Promise<User | null> {
    const updated = await this.userRepository.unblockIfReason(
      userId,
      expectedReason,
    );
    if (!updated) {
      return null;
    }
    await this.invalidateUserCache(updated);
    return updated;
  }

  async assertMinimumCreditPurchase(
    userId: string,
    amount: number,
  ): Promise<void> {
    const user = await this.getCachedUserById(userId);
    if (!user) {
      throw new BadRequestException("User not found");
    }
    const minimum = user.minimumCreditPurchase;
    if (amount < minimum) {
      throw new BadRequestException(
        `The minimum credit purchase for this account is $${minimum.toFixed(2)}. Enter $${minimum.toFixed(2)} or more.`,
      );
    }
  }

  async consumeFreeCallTrial(userId: string): Promise<User> {
    try {
      const user = await this.userRepository.updateFreeCallTrial(userId, false);
      await this.invalidateUserCache(user);
      return user;
    } catch (error) {
      console.error(
        "Error consuming free call trial:",
        JSON.stringify(error, null, 2),
      );
      throw new BadRequestException(error);
    }
  }
}
