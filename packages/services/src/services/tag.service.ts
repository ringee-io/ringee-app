import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Tag, TagRepository, UserRepository, OrganizationRepository } from "@ringee/database";
import {
  CreateTagDto,
  UpdateTagDto,
  OwnershipContext,
} from "@ringee/platform";

@Injectable()
export class TagService {
  constructor(
    private readonly repo: TagRepository,
    private readonly userRepo: UserRepository,
    private readonly orgRepo: OrganizationRepository,
  ) {}

  async createTag(ctx: OwnershipContext, dto: CreateTagDto): Promise<Tag> {
    console.log('[TagService] createTag called with ctx:', JSON.stringify(ctx));
    
    if (!ctx.userId) {
      throw new BadRequestException("User ID is required to create a tag");
    }

    // Map Clerk IDs to DB UUIDs
    const dbUserId = await this.resolveUserId(ctx.userId);
    const dbOrgId = ctx.organizationId 
      ? await this.resolveOrgId(ctx.organizationId)
      : null;

    console.log('[TagService] Resolved IDs - userId:', dbUserId, 'orgId:', dbOrgId);

    return this.repo.create(
      { userId: dbUserId, organizationId: dbOrgId },
      {
        name: dto.name.trim(),
        color: dto.color,
      }
    );
  }

  async getTagById(id: string): Promise<Tag> {
    const tag = await this.repo.findById(id);
    if (!tag) throw new NotFoundException("Tag not found");
    return tag;
  }

  async listTags(ctx: OwnershipContext): Promise<Tag[]> {
    // Map Clerk IDs to DB UUIDs for filtering
    const dbUserId = await this.resolveUserId(ctx.userId);
    const dbOrgId = ctx.organizationId 
      ? await this.resolveOrgId(ctx.organizationId)
      : null;

    return this.repo.listByOwner({ userId: dbUserId, organizationId: dbOrgId });
  }

  async updateTag(id: string, dto: UpdateTagDto): Promise<Tag> {
    await this.ensureExists(id);
    return this.repo.update(id, {
      name: dto.name?.trim(),
      color: dto.color,
    });
  }

  async deleteTag(id: string): Promise<Tag> {
    await this.ensureExists(id);
    return this.repo.delete(id);
  }

  async assignTagsToContact(
    contactId: string,
    tagIds: string[]
  ): Promise<number> {
    return this.repo.assignToContact(contactId, tagIds);
  }

  async removeTagsFromContact(
    contactId: string,
    tagIds: string[]
  ): Promise<number> {
    return this.repo.removeFromContact(contactId, tagIds);
  }

  async setContactTags(contactId: string, tagIds: string[]): Promise<void> {
    return this.repo.setContactTags(contactId, tagIds);
  }

  async getContactTags(contactId: string): Promise<Tag[]> {
    return this.repo.getContactTags(contactId);
  }

  async assignTagsToContacts(
    contactIds: string[],
    tagIds: string[]
  ): Promise<number> {
    return this.repo.assignTagsToContacts(contactIds, tagIds);
  }

  private async ensureExists(id: string): Promise<Tag> {
    const tag = await this.repo.findById(id);
    if (!tag) throw new NotFoundException("Tag not found");
    return tag;
  }

  private async resolveUserId(clerkOrDbId: string): Promise<string> {
    // If it starts with 'user_', it's a Clerk ID - look up by clerkId
    if (clerkOrDbId.startsWith('user_')) {
      const user = await this.userRepo.findByClerkId(clerkOrDbId);
      if (!user) throw new BadRequestException("User not found");
      return user.id;
    }
    
    // It's a UUID - verify it exists in the database
    const user = await this.userRepo.findById(clerkOrDbId);
    if (!user) {
      console.error(`[TagService] User UUID ${clerkOrDbId} not found in database!`);
      console.error(`[TagService] This means Clerk privateMetadata.userId is out of sync with local DB`);
      console.error(`[TagService] Run: UPDATE "User" SET id = '${clerkOrDbId}' WHERE id = (SELECT id FROM "User" LIMIT 1);`);
      console.error(`[TagService] Or update Clerk privateMetadata.userId to match an existing user`);
      throw new BadRequestException(
        `User not found in database. The Clerk privateMetadata.userId (${clerkOrDbId}) doesn't match any local user. Please sync your Clerk user with local database.`
      );
    }
    return user.id;
  }

  private async resolveOrgId(clerkOrDbId: string): Promise<string> {
    // If it starts with 'org_', it's a Clerk ID
    if (clerkOrDbId.startsWith('org_')) {
      const org = await this.orgRepo.findByClerkId(clerkOrDbId);
      if (!org) throw new BadRequestException("Organization not found");
      return org.id;
    }
    // Assume it's already a DB UUID
    return clerkOrDbId;
  }
}

