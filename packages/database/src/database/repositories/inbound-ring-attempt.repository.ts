import { Injectable } from "@nestjs/common";
import { InboundRingAttempt, InboundRingAttemptStatus } from "@prisma/client";
import { PrismaService } from "../prisma.service";

/** One endpoint a call was offered to. */
export type RingAttemptTarget = {
  userId?: string | null;
  sipDeviceId?: string | null;
};

/**
 * Data access for the legs of an inbound call. These rows are call *state*,
 * never calls of their own: they carry no cost, recording or history, and they
 * exist so a ring group can be cancelled, audited and replayed safely.
 */
@Injectable()
export class InboundRingAttemptRepository {
  constructor(private readonly prisma: PrismaService) {}

  listByCall(callId: string): Promise<InboundRingAttempt[]> {
    return this.prisma.inboundRingAttempt.findMany({
      where: { callId },
      orderBy: { startedAt: "asc" },
    });
  }

  /**
   * Opens one attempt per target. `skipDuplicates` makes a redelivered webhook
   * a no-op instead of ringing the same member twice.
   */
  async startMany(
    callId: string,
    targets: RingAttemptTarget[],
  ): Promise<number> {
    if (targets.length === 0) return 0;
    const { count } = await this.prisma.inboundRingAttempt.createMany({
      data: targets.map((target) => ({
        callId,
        userId: target.userId ?? null,
        sipDeviceId: target.sipDeviceId ?? null,
      })),
      skipDuplicates: true,
    });
    return count;
  }

  /** Records the winner. Only a still-ringing attempt can become the answer. */
  async markAnswered(callId: string, userId: string | null): Promise<boolean> {
    const { count } = await this.prisma.inboundRingAttempt.updateMany({
      where: {
        callId,
        userId,
        status: InboundRingAttemptStatus.ringing,
      },
      data: { status: InboundRingAttemptStatus.answered, endedAt: new Date() },
    });
    return count > 0;
  }

  /**
   * Ends every leg still ringing. With `exceptUserId` this is the "cancel the
   * others" half of a ring group answer; without it, the whole group is given
   * up on (the caller hung up, or the call failed).
   */
  async endRinging(
    callId: string,
    params: {
      status:
        | typeof InboundRingAttemptStatus.cancelled
        | typeof InboundRingAttemptStatus.failed;
      reason: string;
      exceptUserId?: string | null;
    },
  ): Promise<InboundRingAttempt[]> {
    const where = {
      callId,
      status: InboundRingAttemptStatus.ringing,
      // `userId != winner` alone would skip attempts with no member of their
      // own (a desk phone, and whatever an IVR leg turns out to be), leaving
      // them ringing after somebody else took the call.
      ...(params.exceptUserId
        ? {
            OR: [{ userId: null }, { userId: { not: params.exceptUserId } }],
          }
        : {}),
    };
    const ending = await this.prisma.inboundRingAttempt.findMany({ where });
    if (ending.length === 0) return [];
    await this.prisma.inboundRingAttempt.updateMany({
      where,
      data: {
        status: params.status,
        failureReason: params.reason,
        endedAt: new Date(),
      },
    });
    return ending;
  }
}
