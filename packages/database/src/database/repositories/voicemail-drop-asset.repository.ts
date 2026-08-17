import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { VoicemailDropAsset } from "@prisma/client";

@Injectable()
export class VoicemailDropAssetRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    organizationId: string;
    userId: string;
    name: string;
    description?: string | null;
    fileUrl: string;
    durationSec?: number;
    isDefault?: boolean;
  }): Promise<VoicemailDropAsset> {
    return this.prisma.voicemailDropAsset.create({ data });
  }

  async findById(id: string): Promise<VoicemailDropAsset | null> {
    return this.prisma.voicemailDropAsset.findUnique({ where: { id } });
  }

  /** Scoped lookup used by every mutation so one org cannot touch another's. */
  async findByIdForOrganization(
    id: string,
    organizationId: string,
  ): Promise<VoicemailDropAsset | null> {
    return this.prisma.voicemailDropAsset.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
  }

  async findByOrganization(
    organizationId: string,
  ): Promise<VoicemailDropAsset[]> {
    return this.prisma.voicemailDropAsset.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
  }

  async findDefault(
    organizationId: string,
  ): Promise<VoicemailDropAsset | null> {
    return this.prisma.voicemailDropAsset.findFirst({
      where: { organizationId, isDefault: true, deletedAt: null },
    });
  }

  async update(
    id: string,
    data: Partial<
      Pick<VoicemailDropAsset, "name" | "description" | "isDefault">
    >,
  ): Promise<VoicemailDropAsset> {
    return this.prisma.voicemailDropAsset.update({ where: { id }, data });
  }

  /** Clears the default flag across the org before a new default is set. */
  async clearDefault(organizationId: string): Promise<void> {
    await this.prisma.voicemailDropAsset.updateMany({
      where: { organizationId, isDefault: true },
      data: { isDefault: false },
    });
  }

  /**
   * Soft delete: InboxEvent rows keep pointing at the asset so already-sent
   * drops still render their name and audio in the timeline.
   */
  async delete(id: string): Promise<VoicemailDropAsset> {
    return this.prisma.voicemailDropAsset.update({
      where: { id },
      data: { deletedAt: new Date(), isDefault: false },
    });
  }
}
