import { Injectable } from "@nestjs/common";
import { OfferStatsRepository } from "@ringee/database";
import { OwnershipContext, RedisService } from "@ringee/platform";
import { OfferContextMember, OfferEligibilityContext } from "./offer.types";

const MS_PER_DAY = 86_400_000;

/**
 * Short enough that a user who just crossed a threshold sees the offer almost
 * immediately, long enough that a dashboard poll does not re-count calls.
 */
const CONTEXT_TTL_SECONDS = 60;

/** Signup date never changes; only evict it when the user does. */
const PROFILE_TTL_SECONDS = 3600;

/**
 * Wire form of the workspace snapshot — `Date`s survive JSON as ISO strings.
 *
 * An organization snapshot is shared by every member, so it holds no
 * caller-specific slice: `user.*` is derived from `members` at hydrate time.
 */
interface CachedContext {
  user: {
    id: string;
    totalCalls: number;
    role: string | null;
  } | null;
  organization: {
    id: string;
    totalCalls: number;
    memberCount: number;
    createdAt: string;
  } | null;
  workspace: { type: "personal" | "organization"; balance: number };
  members: OfferContextMember[];
}

/**
 * Builds the normalized snapshot every offer is evaluated against.
 *
 * Built ONCE per request, cached briefly in Redis, and passed to the engine for
 * all offers. This is the only component allowed to read the facts an offer can
 * condition on; adding a new fact means adding a field here, not letting an
 * offer query for itself.
 */
@Injectable()
export class OfferContextBuilder {
  constructor(
    private readonly statsRepository: OfferStatsRepository,
    private readonly redis: RedisService,
  ) {}

  async build(
    ctx: OwnershipContext,
    options?: { role?: string | null; skipCache?: boolean },
  ): Promise<OfferEligibilityContext | null> {
    const key = this.cacheKey(ctx);
    const cached = options?.skipCache
      ? undefined
      : await this.redis.get<CachedContext>(key);

    const snapshot = cached ?? (await this.load(ctx));
    if (!snapshot) return null;

    if (!cached) {
      await this.redis
        .set(key, snapshot, CONTEXT_TTL_SECONDS)
        .catch(() => undefined);
    }

    const createdAt = await this.userCreatedAt(ctx.userId);
    if (!createdAt) return null;

    return this.hydrate(snapshot, {
      userId: ctx.userId,
      userCreatedAt: createdAt,
      role: options?.role ?? null,
    });
  }

  private async userCreatedAt(userId: string): Promise<Date | null> {
    const key = `offers:profile:${userId}`;
    const cached = await this.redis.get<string>(key);
    if (cached) return new Date(cached);

    const profile = await this.statsRepository.userProfile(userId);
    if (!profile) return null;

    await this.redis
      .set(key, profile.createdAt.toISOString(), PROFILE_TTL_SECONDS)
      .catch(() => undefined);
    return profile.createdAt;
  }

  /** Drops the cached snapshot so the next read reflects a just-changed fact. */
  async invalidate(ctx: OwnershipContext): Promise<void> {
    await this.redis.del(this.cacheKey(ctx)).catch(() => undefined);
  }

  private cacheKey(ctx: OwnershipContext): string {
    return ctx.organizationId
      ? `offers:context:org:${ctx.organizationId}`
      : `offers:context:user:${ctx.userId}`;
  }

  private async load(ctx: OwnershipContext): Promise<CachedContext | null> {
    if (ctx.organizationId) {
      const stats = await this.statsRepository.organizationStats(
        ctx.organizationId,
      );
      if (!stats) return null;

      return {
        // Caller-specific facts are derived per member at hydrate time so this
        // snapshot can be reused by the whole organization.
        user: null,
        organization: {
          id: stats.organization.id,
          totalCalls: stats.organization.totalCalls,
          memberCount: stats.organization.memberCount,
          createdAt: stats.organization.createdAt.toISOString(),
        },
        workspace: { type: "organization", balance: stats.balance },
        members: stats.members,
      };
    }

    const stats = await this.statsRepository.personalStats(ctx.userId);
    if (!stats) return null;

    return {
      user: {
        id: stats.user.id,
        totalCalls: stats.user.totalCalls,
        role: null,
      },
      organization: null,
      workspace: { type: "personal", balance: stats.balance },
      members: [],
    };
  }

  /**
   * Turns a shared workspace snapshot into this caller's context. Inside an
   * organization the caller's own `totalCalls` and role come from `members`,
   * which is why the snapshot itself stays caller-agnostic.
   */
  private hydrate(
    snapshot: CachedContext,
    caller: { userId: string; userCreatedAt: Date; role: string | null },
  ): OfferEligibilityContext {
    const now = new Date();
    const orgCreatedAt = snapshot.organization
      ? new Date(snapshot.organization.createdAt)
      : null;
    const self = snapshot.members.find((m) => m.userId === caller.userId);

    return {
      user: {
        id: caller.userId,
        // Inside an organization "my calls" means my calls FOR that org.
        totalCalls: self?.totalCalls ?? snapshot.user?.totalCalls ?? 0,
        createdAt: caller.userCreatedAt,
        daysSinceSignup: Math.max(
          0,
          Math.floor(
            (now.getTime() - caller.userCreatedAt.getTime()) / MS_PER_DAY,
          ),
        ),
        role: caller.role ?? self?.role ?? null,
      },
      organization:
        snapshot.organization && orgCreatedAt
          ? {
              id: snapshot.organization.id,
              totalCalls: snapshot.organization.totalCalls,
              memberCount: snapshot.organization.memberCount,
              createdAt: orgCreatedAt,
              daysSinceCreated: Math.max(
                0,
                Math.floor(
                  (now.getTime() - orgCreatedAt.getTime()) / MS_PER_DAY,
                ),
              ),
            }
          : null,
      workspace: snapshot.workspace,
      members: snapshot.members,
      now,
    };
  }

  /**
   * Re-derives the context as it looks to another member of the same
   * organization. Used to count how many teammates qualify without building
   * (and caching) a full context per member.
   */
  static forMember(
    context: OfferEligibilityContext,
    member: OfferContextMember,
  ): OfferEligibilityContext {
    return {
      ...context,
      user: {
        ...context.user,
        id: member.userId,
        totalCalls: member.totalCalls,
        role: member.role,
      },
    };
  }
}
