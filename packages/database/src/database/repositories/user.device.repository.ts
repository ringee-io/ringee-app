import { Injectable } from "@nestjs/common";
import { Prisma, UserDevice } from "@prisma/client";
import { PrismaService } from "../prisma.service";

@Injectable()
export class UserDeviceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    data: Prisma.UserDeviceUncheckedCreateInput,
  ): Promise<UserDevice> {
    return this.prisma.userDevice.create({ data });
  }

  async findActiveByUser(userId: string): Promise<UserDevice[]> {
    return this.prisma.userDevice.findMany({
      where: {
        userId,
        revokedAt: null,
      },
      orderBy: { lastActive: "desc" },
    });
  }

  async revokeOldestForUser(userId: string, keepCount: number): Promise<void> {
    const active = await this.prisma.userDevice.findMany({
      where: { userId, revokedAt: null },
      orderBy: { lastActive: "desc" },
      select: { id: true },
    });

    if (active.length <= keepCount) return;

    const toRevoke = active.slice(keepCount).map((d) => d.id);

    await this.prisma.userDevice.updateMany({
      where: { id: { in: toRevoke } },
      data: { revokedAt: new Date() },
    });
  }
}
