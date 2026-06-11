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
    fileUrl: string;
    durationSec?: number;
    isDefault?: boolean;
  }): Promise<VoicemailDropAsset> {
    return this.prisma.voicemailDropAsset.create({ data });
  }

  async findById(id: string): Promise<VoicemailDropAsset | null> {
    return this.prisma.voicemailDropAsset.findUnique({ where: { id } });
  }

  async findByOrganization(
    organizationId: string,
  ): Promise<VoicemailDropAsset[]> {
    return this.prisma.voicemailDropAsset.findMany({
      where: { organizationId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
  }

  async findDefault(
    organizationId: string,
  ): Promise<VoicemailDropAsset | null> {
    return this.prisma.voicemailDropAsset.findFirst({
      where: { organizationId, isDefault: true },
    });
  }

  async update(
    id: string,
    data: Partial<Pick<VoicemailDropAsset, "name" | "isDefault">>,
  ): Promise<VoicemailDropAsset> {
    return this.prisma.voicemailDropAsset.update({ where: { id }, data });
  }

  async delete(id: string): Promise<VoicemailDropAsset> {
    return this.prisma.voicemailDropAsset.delete({ where: { id } });
  }
}
