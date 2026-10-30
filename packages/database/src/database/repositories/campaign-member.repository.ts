import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";

@Injectable()
export class CampaignMemberRepository {
  constructor(private readonly prisma: PrismaService) {}

  async addMember(campaignId: string, userId: string, role = "agent") {
    return this.prisma.campaignMember.upsert({
      where: { campaignId_userId: { campaignId, userId } },
      update: { role },
      create: { campaignId, userId, role },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, clerkId: true },
        },
      },
    });
  }

  async removeMember(campaignId: string, userId: string) {
    return this.prisma.campaignMember.delete({
      where: { campaignId_userId: { campaignId, userId } },
    });
  }

  async findByCampaign(campaignId: string) {
    return this.prisma.campaignMember.findMany({
      where: { campaignId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            clerkId: true,
            emails: { select: { email: true }, take: 1 },
          },
        },
      },
      orderBy: { assignedAt: "asc" },
    });
  }

  /** Which of `userIds` are assigned to the campaign. */
  async listMemberUserIds(
    campaignId: string,
    userIds: string[],
  ): Promise<string[]> {
    if (userIds.length === 0) return [];
    const rows = await this.prisma.campaignMember.findMany({
      where: { campaignId, userId: { in: userIds } },
      select: { userId: true },
    });
    return rows.map((row) => row.userId);
  }

  async isMember(campaignId: string, userId: string): Promise<boolean> {
    const member = await this.prisma.campaignMember.findUnique({
      where: { campaignId_userId: { campaignId, userId } },
    });
    return !!member;
  }

  async countByCampaign(campaignId: string): Promise<number> {
    return this.prisma.campaignMember.count({ where: { campaignId } });
  }
}
