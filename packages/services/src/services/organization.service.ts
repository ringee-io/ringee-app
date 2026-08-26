import { ForbiddenException, Injectable } from "@nestjs/common";
import { Organization, OrganizationRepository } from "@ringee/database";
import { RedisService } from "@ringee/platform";

/** One switchable workspace the user can scope their MCP session to. */
export interface UserWorkspaceMembership {
  id: string;
  name: string;
  slug: string | null;
  imageUrl: string | null;
  role: string;
}

@Injectable()
export class OrganizationService {
  constructor(
    private readonly organizationRepository: OrganizationRepository,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Redis key holding the user's chosen MCP workspace (an organization id).
   * Absent = personal scope. This is how OAuth callers (ChatGPT), whose tokens
   * never carry an active organization, pick which workspace they operate in.
   */
  private static workspaceKey(userId: string): string {
    return `mcp:workspace:${userId}`;
  }

  async getOrganizationById(id: string): Promise<Organization | null> {
    return this.organizationRepository.findById(id);
  }

  async getByClerkId(clerkId: string): Promise<Organization | null> {
    // No id, no organization. Without this the cache key becomes the literal
    // `organization:undefined` and the lookup behind it used to resolve to an
    // arbitrary tenant (see OrganizationRepository).
    if (typeof clerkId !== "string" || !clerkId.trim()) return null;

    const cachedOrg = await this.redisService.get<Organization>(
      `organization:${clerkId}`,
    );

    if (cachedOrg) {
      return cachedOrg;
    }

    const org = await this.organizationRepository.findByClerkId(clerkId);

    if (org) {
      await this.redisService.set(`organization:${clerkId}`, org);
    }

    return org;
  }
  async updateCustomerId(
    id: string,
    customerId: string,
  ): Promise<Organization> {
    return this.organizationRepository.updateCustomerId(id, customerId);
  }

  /** Organizations the user can switch into (resolved memberships only). */
  async listMembershipsForUser(
    userId: string,
  ): Promise<UserWorkspaceMembership[]> {
    const memberships =
      await this.organizationRepository.findMembershipsByUserId(userId);
    return memberships.map((m) => ({
      id: m.organization.id,
      name: m.organization.name,
      slug: m.organization.slug,
      imageUrl: m.organization.imageUrl,
      role: m.role,
    }));
  }

  /**
   * The user's currently selected MCP workspace organization id, or null for
   * the personal scope. Re-validates membership on every read so a revoked
   * member silently falls back to personal (and the stale key is cleared).
   */
  async getActiveWorkspaceOrgId(userId: string): Promise<string | null> {
    const orgId = await this.redisService.get<string>(
      OrganizationService.workspaceKey(userId),
    );
    if (!orgId) {
      return null;
    }
    const stillMember = await this.organizationRepository.isMember(
      userId,
      orgId,
    );
    if (!stillMember) {
      await this.redisService.del(OrganizationService.workspaceKey(userId));
      return null;
    }
    return orgId;
  }

  /**
   * Persist the user's chosen MCP workspace. `null` selects the personal
   * scope; an organization id requires a resolved membership. Takes effect on
   * the next MCP request (each request re-resolves the scope from this value).
   */
  async setActiveWorkspace(
    userId: string,
    organizationId: string | null,
  ): Promise<void> {
    const key = OrganizationService.workspaceKey(userId);
    if (!organizationId) {
      await this.redisService.del(key);
      return;
    }
    const isMember = await this.organizationRepository.isMember(
      userId,
      organizationId,
    );
    if (!isMember) {
      throw new ForbiddenException("You are not a member of that organization");
    }
    await this.redisService.set(key, organizationId);
  }
}
