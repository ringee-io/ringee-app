import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  ContactRepository,
  Tag,
  TagRepository,
  UserRepository,
  OrganizationRepository,
} from "@ringee/database";
import { CreateTagDto, UpdateTagDto, OwnershipContext } from "@ringee/platform";

@Injectable()
export class TagService {
  constructor(
    private readonly repo: TagRepository,
    private readonly userRepo: UserRepository,
    private readonly orgRepo: OrganizationRepository,
    private readonly contactRepo: ContactRepository,
  ) {}

  async createTag(ctx: OwnershipContext, dto: CreateTagDto): Promise<Tag> {
    console.log("[TagService] createTag called with ctx:", JSON.stringify(ctx));

    if (!ctx.userId) {
      throw new BadRequestException("User ID is required to create a tag");
    }

    // Map Clerk IDs to DB UUIDs
    const dbUserId = await this.resolveUserId(ctx.userId);
    const dbOrgId = ctx.organizationId
      ? await this.resolveOrgId(ctx.organizationId)
      : null;

    console.log(
      "[TagService] Resolved IDs - userId:",
      dbUserId,
      "orgId:",
      dbOrgId,
    );

    return this.repo.create(
      { userId: dbUserId, organizationId: dbOrgId },
      {
        name: dto.name.trim(),
        color: dto.color,
      },
    );
  }

  async getTagById(ctx: OwnershipContext, id: string): Promise<Tag> {
    return this.ensureOwned(ctx, id);
  }

  async listTags(ctx: OwnershipContext): Promise<Tag[]> {
    // Map Clerk IDs to DB UUIDs for filtering
    const dbUserId = await this.resolveUserId(ctx.userId);
    const dbOrgId = ctx.organizationId
      ? await this.resolveOrgId(ctx.organizationId)
      : null;

    return this.repo.listByOwner({ userId: dbUserId, organizationId: dbOrgId });
  }

  async updateTag(
    ctx: OwnershipContext,
    id: string,
    dto: UpdateTagDto,
  ): Promise<Tag> {
    await this.ensureOwned(ctx, id);
    return this.repo.update(id, {
      name: dto.name?.trim(),
      color: dto.color,
    });
  }

  async deleteTag(ctx: OwnershipContext, id: string): Promise<Tag> {
    await this.ensureOwned(ctx, id);
    return this.repo.delete(id);
  }

  async assignTagsToContact(
    contactId: string,
    tagIds: string[],
  ): Promise<number> {
    return this.repo.assignToContact(contactId, tagIds);
  }

  async removeTagsFromContact(
    ctx: OwnershipContext,
    contactId: string,
    tagIds: string[],
  ): Promise<number> {
    await this.ensureContactOwned(ctx, contactId);
    return this.repo.removeFromContact(contactId, tagIds);
  }

  /** Replaces the contact's tags; every tag must belong to the workspace. */
  async setContactTags(
    ctx: OwnershipContext,
    contactId: string,
    tagIds: string[],
  ): Promise<void> {
    const scope = await this.resolveCtx(ctx);
    await this.ensureContactOwned(scope, contactId);
    const uniqueTagIds = [...new Set(tagIds)];
    const ownedTagIds = await this.repo.findOwnedIds(scope, uniqueTagIds);
    if (ownedTagIds.length !== uniqueTagIds.length) {
      throw new BadRequestException(
        "One or more tags are invalid or do not belong to this workspace",
      );
    }
    return this.repo.setContactTags(contactId, uniqueTagIds);
  }

  async getContactTags(
    ctx: OwnershipContext,
    contactId: string,
  ): Promise<Tag[]> {
    await this.ensureContactOwned(ctx, contactId);
    return this.repo.getContactTags(contactId);
  }

  async assignTagsToContacts(
    contactIds: string[],
    tagIds: string[],
  ): Promise<number> {
    return this.repo.assignTagsToContacts(contactIds, tagIds);
  }

  /**
   * Tags the workspace's own contacts among `contactIds` with one of its own
   * tags. Ids from elsewhere (a model's tool call, a client) are dropped, never
   * linked: a tag must not reach into another workspace's contacts.
   */
  async tagOwnedContacts(
    ctx: OwnershipContext,
    contactIds: string[],
    tagId: string,
  ): Promise<{ tagged: number; skipped: number }> {
    const scope = await this.resolveCtx(ctx);
    await this.ensureOwned(scope, tagId);
    const unique = [...new Set(contactIds)];
    const owned = await this.contactRepo.findOwnedIds(scope, unique);
    await this.repo.assignTagsToContacts(owned, [tagId]);
    return { tagged: owned.length, skipped: unique.length - owned.length };
  }

  private async ensureOwned(ctx: OwnershipContext, id: string): Promise<Tag> {
    const tag = await this.repo.findByIdForOwner(
      await this.resolveCtx(ctx),
      id,
    );
    if (!tag) throw new NotFoundException("Tag not found");
    return tag;
  }

  private async ensureContactOwned(
    ctx: OwnershipContext,
    contactId: string,
  ): Promise<void> {
    const contact = await this.contactRepo.findByIdForOwner(
      await this.resolveCtx(ctx),
      contactId,
    );
    if (!contact) throw new NotFoundException("Contact not found");
  }

  /** The context with Clerk ids mapped to Ringee ids, as tags are stored. */
  private async resolveCtx(ctx: OwnershipContext): Promise<OwnershipContext> {
    return {
      userId: await this.resolveUserId(ctx.userId),
      organizationId: ctx.organizationId
        ? await this.resolveOrgId(ctx.organizationId)
        : null,
    };
  }

  private async resolveUserId(clerkOrDbId: string): Promise<string> {
    // If it starts with 'user_', it's a Clerk ID - look up by clerkId
    if (clerkOrDbId.startsWith("user_")) {
      const user = await this.userRepo.findByClerkId(clerkOrDbId);
      if (!user) throw new BadRequestException("User not found");
      return user.id;
    }

    // It's a UUID - verify it exists in the database
    const user = await this.userRepo.findById(clerkOrDbId);
    if (!user) {
      console.error(
        `[TagService] User UUID ${clerkOrDbId} not found in database!`,
      );
      console.error(
        `[TagService] This means Clerk privateMetadata.userId is out of sync with local DB`,
      );
      console.error(
        `[TagService] Run: UPDATE "User" SET id = '${clerkOrDbId}' WHERE id = (SELECT id FROM "User" LIMIT 1);`,
      );
      console.error(
        `[TagService] Or update Clerk privateMetadata.userId to match an existing user`,
      );
      throw new BadRequestException(
        `User not found in database. The Clerk privateMetadata.userId (${clerkOrDbId}) doesn't match any local user. Please sync your Clerk user with local database.`,
      );
    }
    return user.id;
  }

  private async resolveOrgId(clerkOrDbId: string): Promise<string> {
    // If it starts with 'org_', it's a Clerk ID
    if (clerkOrDbId.startsWith("org_")) {
      const org = await this.orgRepo.findByClerkId(clerkOrDbId);
      if (!org) throw new BadRequestException("Organization not found");
      return org.id;
    }
    // Assume it's already a DB UUID
    return clerkOrDbId;
  }
}
