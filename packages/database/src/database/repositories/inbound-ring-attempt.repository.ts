import { Injectable } from "@nestjs/common";
import {
  InboundRingAttempt,
  InboundRingAttemptStatus,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../prisma.service";

/** One endpoint a call was offered to. */
export type RingAttemptTarget = {
  userId?: string | null;
  sipDeviceId?: string | null;
  endpointKey?: string;
  recipientConnectionId?: string;
};

/**
 * Data access for the legs of an inbound call. These rows are call *state*,
 * never calls of their own. Provider handles and settled endpoint costs live
 * here; recording and history belong to the original Call. Attempts let a
 * ring group be cancelled, audited and replayed safely.
 */
@Injectable()
export class InboundRingAttemptRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string) {
    return this.prisma.inboundRingAttempt.findUnique({
      where: { id },
      include: { call: true },
    });
  }

  findByControlId(providerCallControlId: string) {
    return this.prisma.inboundRingAttempt.findFirst({
      where: {
        OR: [
          { providerCallControlId },
          { recipientCallControlId: providerCallControlId },
        ],
      },
      include: { call: true },
    });
  }

  findBySessionId(sessionId: string) {
    return this.prisma.inboundRingAttempt.findFirst({
      where: {
        OR: [
          { providerCallSessionId: sessionId },
          { recipientCallSessionId: sessionId },
        ],
      },
      include: { call: true },
    });
  }

  async bindRecipient(
    id: string,
    recipientCallControlId: string,
    recipientCallSessionId: string | null,
  ) {
    return this.prisma.inboundRingAttempt.updateMany({
      where: {
        id,
        OR: [{ recipientCallControlId: null }, { recipientCallControlId }],
      },
      data: { recipientCallControlId, recipientCallSessionId },
    });
  }

  update(id: string, data: Prisma.InboundRingAttemptUncheckedUpdateInput) {
    return this.prisma.inboundRingAttempt.update({ where: { id }, data });
  }

  async bindProvider(
    id: string,
    providerCallControlId: string,
    providerCallLegId: string | null,
    providerCallSessionId?: string | null,
  ) {
    return this.prisma.inboundRingAttempt.updateMany({
      where: {
        id,
        OR: [{ providerCallControlId: null }, { providerCallControlId }],
      },
      data: { providerCallControlId, providerCallLegId, providerCallSessionId },
    });
  }

  listByCall(callId: string): Promise<InboundRingAttempt[]> {
    return this.prisma.inboundRingAttempt.findMany({
      where: { callId },
      orderBy: { startedAt: "asc" },
    });
  }

  /**
   * Opens one attempt per target and returns the rows this call actually
   * inserted. `skipDuplicates` makes a redelivered webhook a no-op, and the
   * insert is what says so: a target already on the list comes back missing,
   * so the caller can ring the new endpoints without ringing the rest twice.
   * Two concurrent redeliveries are safe for the same reason — the unique
   * index on (callId, userId) decides which of them owns each row.
   */
  async startMany(
    callId: string,
    targets: RingAttemptTarget[],
  ): Promise<InboundRingAttempt[]> {
    if (targets.length === 0) return [];
    return this.prisma.inboundRingAttempt.createManyAndReturn({
      data: targets.map((target) => ({
        callId,
        userId: target.userId ?? null,
        sipDeviceId: target.sipDeviceId ?? null,
        recipientConnectionId: target.recipientConnectionId,
        endpointKey:
          target.endpointKey ??
          (target.sipDeviceId
            ? `desk:${target.sipDeviceId}`
            : `user:${target.userId}`),
      })),
      skipDuplicates: true,
    });
  }

  /**
   * Frees the endpoints of an earlier handoff on the same call, so a new one
   * opens fresh attempts — new ids, so a new dial command and correlation —
   * instead of finding them taken. The rows stay as history. Attempts of the
   * current handoff started after `before` and are never touched.
   */
  async retireEndedBefore(callId: string, before: Date): Promise<void> {
    const ended = await this.prisma.inboundRingAttempt.findMany({
      where: {
        callId,
        endedAt: { lt: before },
        NOT: { endpointKey: { contains: "#" } },
      },
      select: { id: true, endpointKey: true },
    });
    for (const attempt of ended)
      await this.prisma.inboundRingAttempt.update({
        where: { id: attempt.id },
        data: { endpointKey: `${attempt.endpointKey}#${attempt.id}` },
      });
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
