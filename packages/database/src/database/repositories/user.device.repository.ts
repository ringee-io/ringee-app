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

  /**
   * Upsert a device token for a user. Used by mobile clients on every
   * sign-in / app launch.
   *   - If the token already exists for this user → bump lastActive, clear
   *     revokedAt (reactivates a device that previously signed out).
   *   - If the token exists but for a different user → reassign it. This
   *     covers the "device swap" case where the same phone signs into a
   *     different Ringee account.
   *   - Otherwise → create.
   *
   * We dedupe by `fcmToken` because vendors recycle tokens between
   * accounts on the same physical device.
   */
  async registerToken(userId: string, fcmToken: string): Promise<UserDevice> {
    const existing = await this.prisma.userDevice.findFirst({
      where: { fcmToken },
    });

    if (existing) {
      return this.prisma.userDevice.update({
        where: { id: existing.id },
        data: {
          userId,
          revokedAt: null,
          lastActive: new Date(),
        },
      });
    }

    return this.prisma.userDevice.create({
      data: { userId, fcmToken },
    });
  }

  /**
   * Revoke a specific token for a specific user (sign-out). Idempotent —
   * missing tokens are a no-op so a flaky sign-out flow doesn't error.
   *
   * Scoped by `userId` on purpose: tokens are guessable-by-possession, and an
   * unscoped revoke let any authenticated caller sign another user's device
   * out of push.
   */
  async revokeToken(userId: string, fcmToken: string): Promise<void> {
    await this.prisma.userDevice.updateMany({
      where: { userId, fcmToken, revokedAt: null },
      data: { revokedAt: new Date() },
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
