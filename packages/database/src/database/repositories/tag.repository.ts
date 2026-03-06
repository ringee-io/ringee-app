import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { Tag } from "@prisma/client";
import {
  OwnershipContext,
  buildOwnershipFilter,
} from "@ringee/platform";

@Injectable()
export class TagRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    ctx: OwnershipContext,
    data: { name: string; color?: string }
  ): Promise<Tag> {
    return this.prisma.tag.create({
      data: {
        name: data.name,
        color: data.color,
        userId: ctx.userId,
        organizationId: ctx.organizationId ?? null,
      },
    });
  }

  async findById(id: string): Promise<Tag | null> {
    return this.prisma.tag.findFirst({
      where: { id, deletedAt: null },
    });
  }

  async listByOwner(ctx: OwnershipContext): Promise<Tag[]> {
    const ownershipFilter = buildOwnershipFilter(ctx);
    return this.prisma.tag.findMany({
      where: {
        ...ownershipFilter,
        deletedAt: null,
      },
      orderBy: { name: "asc" },
    });
  }

  async update(
    id: string,
    data: { name?: string; color?: string }
  ): Promise<Tag> {
    return this.prisma.tag.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<Tag> {
    // Remove all contact associations before soft-deleting the tag
    await this.prisma.contactTag.deleteMany({
      where: { tagId: id },
    });
    
    return this.prisma.tag.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async assignToContact(
    contactId: string,
    tagIds: string[]
  ): Promise<number> {
    if (tagIds.length === 0) return 0;

    const data = tagIds.map((tagId) => ({
      contactId,
      tagId,
    }));

    const result = await this.prisma.contactTag.createMany({
      data,
      skipDuplicates: true,
    });

    return result.count;
  }

  async removeFromContact(
    contactId: string,
    tagIds: string[]
  ): Promise<number> {
    if (tagIds.length === 0) return 0;

    const result = await this.prisma.contactTag.deleteMany({
      where: {
        contactId,
        tagId: { in: tagIds },
      },
    });

    return result.count;
  }

  async getContactTags(contactId: string): Promise<Tag[]> {
    const contactTags = await this.prisma.contactTag.findMany({
      where: { contactId },
      include: { tag: true },
    });

    return contactTags
      .map((ct) => ct.tag)
      .filter((tag) => tag.deletedAt === null);
  }

  async setContactTags(contactId: string, tagIds: string[]): Promise<void> {
    // Remove all existing tags
    await this.prisma.contactTag.deleteMany({
      where: { contactId },
    });

    // Add new tags
    if (tagIds.length > 0) {
      await this.prisma.contactTag.createMany({
        data: tagIds.map((tagId) => ({
          contactId,
          tagId,
        })),
      });
    }
  }

  async assignTagsToContacts(
    contactIds: string[],
    tagIds: string[]
  ): Promise<number> {
    if (contactIds.length === 0 || tagIds.length === 0) return 0;

    const data: { contactId: string; tagId: string }[] = [];
    for (const contactId of contactIds) {
      for (const tagId of tagIds) {
        data.push({ contactId, tagId });
      }
    }

    const result = await this.prisma.contactTag.createMany({
      data,
      skipDuplicates: true,
    });

    return result.count;
  }
}
