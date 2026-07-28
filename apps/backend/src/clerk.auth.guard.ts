import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ClerkUserRepository, IS_PUBLIC_KEY } from "@ringee/platform";
import { getAuth } from "@clerk/express";
import { OrganizationService, UserService } from "@ringee/services";
import { UserRepository } from "@ringee/database";

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  private readonly pendingUserSyncs = new Map<string, Promise<string>>();

  constructor(
    private reflector: Reflector,
    private readonly organizationService: OrganizationService,
    private readonly userService: UserService,
    private readonly userRepository: UserRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();

    const { isAuthenticated, orgId, orgRole, userId } = getAuth(request);

    if (!isAuthenticated) {
      throw new UnauthorizedException("Unauthorized");
    }

    const ringeeUser = await this.findCachedUserByClerkId(userId);
    if (ringeeUser?.blockedAt) {
      throw new ForbiddenException("Account disabled");
    }

    if (orgId) {
      const org = await this.organizationService.getByClerkId(orgId);

      if (!org) {
        throw new UnauthorizedException("Unauthorized");
      }

      request.clerkOrgId = org?.id;
      request.orgRole = orgRole || null;
    }

    request.clerkUserId = userId;
    request.resolveRingeeUser = () => this.resolveRingeeUser(userId);

    return isAuthenticated;
  }

  /**
   * Clerk can redirect a newly-created user before the `user.created` webhook
   * has created the matching local row and stored its UUID in private metadata.
   * Resolve that race on the first authenticated request. The post-signup
   * `/auth/sign-up/continue` page intentionally makes such a request before it
   * renders, so the account is already manageable from Ringee's backoffice
   * while phone verification is still pending.
   */
  private async resolveRingeeUser(clerkUserId: string) {
    const clerkUser = await ClerkUserRepository.findById(clerkUserId);
    const privateMetadata = clerkUser.privateMetadata as Record<
      string,
      unknown
    >;
    const metadataUserId = privateMetadata.userId;

    if (typeof metadataUserId === "string" && metadataUserId) {
      return { clerkUser, ringeeUserId: metadataUserId };
    }

    let pendingSync = this.pendingUserSyncs.get(clerkUserId);

    if (!pendingSync) {
      pendingSync = this.syncRingeeUser(clerkUserId, clerkUser);
      this.pendingUserSyncs.set(clerkUserId, pendingSync);
    }

    try {
      const ringeeUserId = await pendingSync;
      return { clerkUser, ringeeUserId };
    } finally {
      if (this.pendingUserSyncs.get(clerkUserId) === pendingSync) {
        this.pendingUserSyncs.delete(clerkUserId);
      }
    }
  }

  private async syncRingeeUser(
    clerkUserId: string,
    clerkUser: Awaited<ReturnType<typeof ClerkUserRepository.findById>>,
  ): Promise<string> {
    const existing = await this.findCachedUserByClerkId(clerkUserId);
    const user =
      existing ?? (await this.userRepository.syncFromClerkUser(clerkUser));

    if (!existing) {
      await this.userService.warmUserCache(user).catch((error) => {
        // Authentication must remain available if Redis has a transient
        // outage; PostgreSQL and Clerk are still the sources of truth.
        console.warn(
          `Could not cache Ringee user for Clerk user ${clerkUserId}`,
          error,
        );
      });
    }

    try {
      await ClerkUserRepository.updateMetadata(clerkUserId, {
        privateMetadata: {
          ...(clerkUser.privateMetadata as Record<string, unknown>),
          userId: user.id,
        },
      });
    } catch (error) {
      // The local user is already usable. Do not fail the dashboard if writing
      // the Clerk metadata is briefly unavailable; a later request or webhook
      // will retry the repair.
      console.warn(
        `Could not persist Ringee user metadata for Clerk user ${clerkUserId}`,
        error,
      );
    }

    return user.id;
  }

  private async findCachedUserByClerkId(clerkUserId: string) {
    try {
      return await this.userService.getCachedByClerkId(clerkUserId);
    } catch (error) {
      // Redis is an optimization here, not a signup dependency.
      console.warn(
        `Could not read cached Ringee user for Clerk user ${clerkUserId}`,
        error,
      );
      return this.userRepository.findByClerkId(clerkUserId);
    }
  }
}
