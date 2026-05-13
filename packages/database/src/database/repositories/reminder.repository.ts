import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import {
  Reminder,
  ReminderStatus,
  ReminderSubjectType,
  Prisma,
} from "@prisma/client";

export interface ReminderOwnerScope {
  userId: string;
  organizationId?: string | null;
}

export interface ReminderUpsertInput {
  userId: string;
  organizationId?: string | null;
  subjectType: ReminderSubjectType;
  subjectId: string;
  fireAt: Date;
  channels: string[];
  dedupeKey: string;
}

@Injectable()
export class ReminderRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Idempotent schedule. If a reminder with the same dedupeKey already exists
   * and is still actionable (pending/snoozed), update its fireAt/channels.
   * If it was sent/failed/cancelled, leave it alone — we don't resurrect a
   * past delivery.
   */
  async upsertPending(input: ReminderUpsertInput): Promise<Reminder | null> {
    if (input.fireAt.getTime() <= Date.now()) {
      // Backfill / past-event safety: never schedule a reminder for an event
      // whose fire time has already passed.
      return null;
    }

    const existing = await this.prisma.reminder.findUnique({
      where: { dedupeKey: input.dedupeKey },
    });

    if (existing) {
      if (
        existing.status === ReminderStatus.sent ||
        existing.status === ReminderStatus.failed ||
        existing.status === ReminderStatus.cancelled
      ) {
        return existing;
      }
      return this.prisma.reminder.update({
        where: { id: existing.id },
        data: {
          fireAt: input.fireAt,
          channels: input.channels,
          status: ReminderStatus.pending,
          snoozedUntil: null,
        },
      });
    }

    return this.prisma.reminder.create({
      data: {
        userId: input.userId,
        organizationId: input.organizationId ?? null,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        fireAt: input.fireAt,
        channels: input.channels,
        dedupeKey: input.dedupeKey,
      },
    });
  }

  async findById(id: string): Promise<Reminder | null> {
    return this.prisma.reminder.findUnique({ where: { id } });
  }

  async findDuePending(limit = 50): Promise<Reminder[]> {
    return this.prisma.reminder.findMany({
      where: {
        status: ReminderStatus.pending,
        fireAt: { lte: new Date() },
      },
      orderBy: { fireAt: "asc" },
      take: limit,
    });
  }

  async markSent(id: string): Promise<Reminder> {
    return this.prisma.reminder.update({
      where: { id },
      data: { status: ReminderStatus.sent, sentAt: new Date() },
    });
  }

  async markFailed(id: string, error: string): Promise<Reminder> {
    return this.prisma.reminder.update({
      where: { id },
      data: {
        status: ReminderStatus.failed,
        attemptCount: { increment: 1 },
        lastError: error.slice(0, 1000),
      },
    });
  }

  async incrementAttempt(id: string): Promise<Reminder> {
    return this.prisma.reminder.update({
      where: { id },
      data: { attemptCount: { increment: 1 } },
    });
  }

  async snooze(id: string, until: Date): Promise<Reminder> {
    return this.prisma.reminder.update({
      where: { id },
      data: {
        status: ReminderStatus.snoozed,
        snoozedUntil: until,
        fireAt: until,
      },
    });
  }

  async unsnoozeDue(): Promise<number> {
    const result = await this.prisma.reminder.updateMany({
      where: {
        status: ReminderStatus.snoozed,
        snoozedUntil: { lte: new Date() },
      },
      data: { status: ReminderStatus.pending },
    });
    return result.count;
  }

  /**
   * Cancel every actionable reminder belonging to a subject. Used when the
   * underlying callback/meeting is cancelled or completed.
   */
  async cancelForSubject(
    subjectType: ReminderSubjectType,
    subjectId: string
  ): Promise<number> {
    const result = await this.prisma.reminder.updateMany({
      where: {
        subjectType,
        subjectId,
        status: { in: [ReminderStatus.pending, ReminderStatus.snoozed] },
      },
      data: { status: ReminderStatus.cancelled },
    });
    return result.count;
  }

  async listUpcomingForOwner(
    owner: ReminderOwnerScope,
    options?: {
      subjectType?: ReminderSubjectType;
      page?: number;
      limit?: number;
    }
  ): Promise<{
    data: Reminder[];
    meta: { total: number; page: number; limit: number; totalPages: number };
  }> {
    const { subjectType, page = 1, limit = 20 } = options || {};

    const where: Prisma.ReminderWhereInput = {
      ...(owner.organizationId
        ? { organizationId: owner.organizationId }
        : { userId: owner.userId, organizationId: null }),
      ...(subjectType ? { subjectType } : {}),
      status: { in: [ReminderStatus.pending, ReminderStatus.snoozed] },
    };

    const total = await this.prisma.reminder.count({ where });
    const data = await this.prisma.reminder.findMany({
      where,
      orderBy: { fireAt: "asc" },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
