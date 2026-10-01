import { Injectable } from "@nestjs/common";
import {
  CliAuthRequest,
  CliAuthRequestStatus,
  PersonalApiKey,
} from "@prisma/client";
import { PrismaService } from "../prisma.service";

/**
 * Persistence for `ringee login` device requests. Every state change is a
 * compare-and-set on `status`, so a double click, a replayed approval or two
 * concurrent polls can never approve twice or mint two keys.
 */
@Injectable()
export class CliAuthRequestRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: {
    userCode: string;
    deviceCodeHash: string;
    deviceName: string | null;
    platform: string | null;
    clientVersion: string | null;
    requestIp: string | null;
    expiresAt: Date;
  }): Promise<CliAuthRequest> {
    return this.prisma.cliAuthRequest.create({ data });
  }

  findByUserCode(userCode: string): Promise<CliAuthRequest | null> {
    return this.prisma.cliAuthRequest.findUnique({ where: { userCode } });
  }

  findByDeviceCodeHash(deviceCodeHash: string): Promise<CliAuthRequest | null> {
    return this.prisma.cliAuthRequest.findUnique({ where: { deviceCodeHash } });
  }

  /** pending → approved | denied, only while unexpired. */
  async decide(
    id: string,
    decision: Extract<CliAuthRequestStatus, "approved" | "denied">,
    userId: string,
  ): Promise<boolean> {
    const now = new Date();
    const { count } = await this.prisma.cliAuthRequest.updateMany({
      where: { id, status: "pending", expiresAt: { gt: now } },
      data: { status: decision, userId, decidedAt: now },
    });
    return count > 0;
  }

  /**
   * approved → consumed and the API key row in ONE transaction. Returns null
   * when another poll already consumed the request.
   */
  async consumeWithKey(
    id: string,
    key: {
      userId: string;
      name: string;
      prefix: string;
      keyHash: string;
    },
  ): Promise<PersonalApiKey | null> {
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const { count } = await tx.cliAuthRequest.updateMany({
        where: { id, status: "approved", userId: key.userId },
        data: { status: "consumed", consumedAt: now },
      });
      if (count === 0) return null;

      const created = await tx.personalApiKey.create({
        data: { ...key, source: "cli" },
      });
      await tx.cliAuthRequest.update({
        where: { id },
        data: { apiKeyId: created.id },
      });
      return created;
    });
  }

  /** Housekeeping: requests are only useful for a few minutes. */
  async deleteExpiredBefore(cutoff: Date): Promise<void> {
    await this.prisma.cliAuthRequest.deleteMany({
      where: { expiresAt: { lt: cutoff } },
    });
  }

  async countByStatus(
    start: Date,
    end: Date,
  ): Promise<Record<CliAuthRequestStatus, number>> {
    const rows = await this.prisma.cliAuthRequest.groupBy({
      by: ["status"],
      where: { createdAt: { gte: start, lte: end } },
      _count: { _all: true },
    });
    const out: Record<CliAuthRequestStatus, number> = {
      pending: 0,
      approved: 0,
      denied: 0,
      consumed: 0,
    };
    for (const r of rows) out[r.status] = r._count._all;
    return out;
  }
}
