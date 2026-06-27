import { Injectable, Logger } from "@nestjs/common";
import { Prisma, BlockedCallLog } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { OwnershipContext, buildOwnershipFilter } from "@ringee/platform";

export interface BlockedCallLogInput {
  organizationId?: string | null;
  userId?: string | null;
  sipDeviceId?: string | null;
  source?: string;
  fromNumber?: string | null;
  toNumber?: string | null;
  callerId?: string | null;
  reason: string;
  detail?: string | null;
  providerEventId?: string | null;
  providerCallId?: string | null;
  telnyxConnectionId?: string | null;
}

/**
 * Append-only audit of outbound attempts Ringee refused to connect. Inserts are
 * idempotent on `providerEventId` so duplicate Telnyx webhook deliveries don't
 * create duplicate rows.
 */
@Injectable()
export class BlockedCallLogRepository {
  private readonly logger = new Logger(BlockedCallLogRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(input: BlockedCallLogInput): Promise<void> {
    if (input.providerEventId) {
      const existing = await this.prisma.blockedCallLog.findUnique({
        where: { providerEventId: input.providerEventId },
        select: { id: true },
      });
      if (existing) return;
    }

    try {
      await this.prisma.blockedCallLog.create({
        data: {
          organizationId: input.organizationId ?? null,
          userId: input.userId ?? null,
          sipDeviceId: input.sipDeviceId ?? null,
          source: input.source ?? "sip_device",
          fromNumber: input.fromNumber ?? null,
          toNumber: input.toNumber ?? null,
          callerId: input.callerId ?? null,
          reason: input.reason,
          detail: input.detail ?? null,
          providerEventId: input.providerEventId ?? null,
          providerCallId: input.providerCallId ?? null,
          telnyxConnectionId: input.telnyxConnectionId ?? null,
        },
      });
    } catch (error) {
      // A concurrent delivery may have inserted the same providerEventId first.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return;
      }
      this.logger.error(
        `Failed to record BlockedCallLog (${input.reason}): ${
          (error as Error).message
        }`,
      );
    }
  }

  async listByOwner(
    ctx: OwnershipContext,
    options: { page?: number; limit?: number } = {},
  ): Promise<{ data: BlockedCallLog[]; total: number }> {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 25));
    const where = buildOwnershipFilter(ctx);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.blockedCallLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.blockedCallLog.count({ where }),
    ]);
    return { data, total };
  }
}
