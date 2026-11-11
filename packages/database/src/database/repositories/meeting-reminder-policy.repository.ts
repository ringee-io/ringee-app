import { Injectable } from "@nestjs/common";
import { MeetingReminderPolicy } from "@prisma/client";
import {
  buildOwnershipData,
  buildOwnershipFilter,
  type OwnershipContext,
} from "@ringee/platform";
import { PrismaService } from "../prisma.service";

export interface MeetingReminderPolicyInput {
  agentId: string;
  calendarId: string;
  offsetsMinutes: number[];
  windowStartMinute?: number;
  windowEndMinute?: number;
  windowDays?: number[];
  /**
   * Which meetings the policy covers (Stage 4C adoption). Only applied when
   * the policy is created; an existing policy keeps the coverage it was
   * adopted with — editing its offset is not a new scope decision.
   */
  coverage?: { coversMeetingsFrom: Date | null };
}

/** How many already-booked meetings one policy may include explicitly. */
export const MAX_INCLUDED_MEETINGS = 50;

/**
 * Reminder-call policies, one per calendar. Whether a write changes which
 * calls are due — and therefore bumps the version that stales every planned
 * execution — is the service's decision, passed in explicitly.
 */
@Injectable()
export class MeetingReminderPolicyRepository {
  constructor(private readonly prisma: PrismaService) {}

  listForOwner(
    ctx: OwnershipContext,
    options?: { agentId?: string },
  ): Promise<MeetingReminderPolicy[]> {
    return this.prisma.meetingReminderPolicy.findMany({
      where: {
        ...buildOwnershipFilter(ctx),
        ...(options?.agentId ? { agentId: options.agentId } : {}),
      },
      orderBy: { createdAt: "asc" },
    });
  }

  findForCalendar(
    ctx: OwnershipContext,
    calendarId: string,
  ): Promise<MeetingReminderPolicy | null> {
    return this.prisma.meetingReminderPolicy.findFirst({
      where: { ...buildOwnershipFilter(ctx), calendarId },
    });
  }

  findByIdForOwner(
    ctx: OwnershipContext,
    id: string,
  ): Promise<MeetingReminderPolicy | null> {
    return this.prisma.meetingReminderPolicy.findFirst({
      where: { ...buildOwnershipFilter(ctx), id },
    });
  }

  /**
   * Creates the calendar's policy or replaces it. Replacing always takes a new
   * version and a fresh activation time: whatever was planned under the old
   * settings is cancelled and replanned by the caller.
   */
  upsertForCalendar(
    ctx: OwnershipContext,
    input: MeetingReminderPolicyInput,
  ): Promise<MeetingReminderPolicy> {
    const now = new Date();
    const settings = {
      agentId: input.agentId,
      offsetsMinutes: input.offsetsMinutes,
      ...(input.windowStartMinute !== undefined
        ? { windowStartMinute: input.windowStartMinute }
        : {}),
      ...(input.windowEndMinute !== undefined
        ? { windowEndMinute: input.windowEndMinute }
        : {}),
      ...(input.windowDays !== undefined
        ? { windowDays: input.windowDays }
        : {}),
    };
    return this.prisma.meetingReminderPolicy.upsert({
      where: { calendarId: input.calendarId },
      create: {
        ...buildOwnershipData(ctx),
        calendarId: input.calendarId,
        enabled: true,
        activatedAt: now,
        ...(input.coverage
          ? { coversMeetingsFrom: input.coverage.coversMeetingsFrom }
          : {}),
        ...settings,
      },
      update: {
        ...settings,
        userId: ctx.userId,
        enabled: true,
        activatedAt: now,
        version: { increment: 1 },
      },
    });
  }

  /**
   * Switches a set of policies on or off. Both directions take a new version:
   * pausing stales what was planned, and resuming plans afresh from now —
   * offsets that passed while paused are never called late.
   */
  async setEnabled(
    ctx: OwnershipContext,
    ids: string[],
    enabled: boolean,
  ): Promise<MeetingReminderPolicy[]> {
    if (ids.length === 0) return [];
    await this.prisma.meetingReminderPolicy.updateMany({
      where: { ...buildOwnershipFilter(ctx), id: { in: ids } },
      data: {
        enabled,
        version: { increment: 1 },
        ...(enabled ? { activatedAt: new Date() } : {}),
      },
    });
    return this.prisma.meetingReminderPolicy.findMany({
      where: { ...buildOwnershipFilter(ctx), id: { in: ids } },
    });
  }

  /**
   * Adds already-booked meetings to a "new bookings only" policy — the
   * explicit "Include this meeting" of the adoption. Additive, bounded and
   * without a new version: what was planned stays valid, the included meeting
   * is simply planned too. A policy that already covers every meeting needs no
   * list and is left alone.
   */
  async includeMeetings(
    ctx: OwnershipContext,
    policyId: string,
    meetingIds: string[],
  ): Promise<MeetingReminderPolicy | null> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "MeetingReminderPolicy"
        WHERE "id" = ${policyId}::uuid FOR UPDATE`;
      const policy = await tx.meetingReminderPolicy.findFirst({
        where: { ...buildOwnershipFilter(ctx), id: policyId },
      });
      if (!policy) return null;
      if (!policy.coversMeetingsFrom) return policy;
      const included = [
        ...new Set([...(policy.includedMeetingIds ?? []), ...meetingIds]),
      ];
      if (included.length > MAX_INCLUDED_MEETINGS) {
        throw new Error("Too many meetings included in one reminder policy");
      }
      if (included.length === (policy.includedMeetingIds ?? []).length) {
        return policy;
      }
      return tx.meetingReminderPolicy.update({
        where: { id: policy.id },
        data: { includedMeetingIds: included },
      });
    });
  }

  /**
   * An explicit "also confirm the meetings already booked": the policy covers
   * every upcoming meeting from now on, like a policy set up in the rail.
   */
  async coverAllMeetings(
    ctx: OwnershipContext,
    policyId: string,
  ): Promise<MeetingReminderPolicy | null> {
    const { count } = await this.prisma.meetingReminderPolicy.updateMany({
      where: { ...buildOwnershipFilter(ctx), id: policyId },
      data: { coversMeetingsFrom: null },
    });
    return count === 1
      ? this.prisma.meetingReminderPolicy.findUnique({
          where: { id: policyId },
        })
      : null;
  }

  /** Removes the policies of calendars no longer covered by an agent's setup. */
  async deleteForOwner(ctx: OwnershipContext, ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const { count } = await this.prisma.meetingReminderPolicy.deleteMany({
      where: { ...buildOwnershipFilter(ctx), id: { in: ids } },
    });
    return count;
  }

  /**
   * The enabled policy covering a meeting's calendar. Worker-side lookup by
   * calendar: the caller derives the workspace from the meeting row and checks
   * it against the policy's.
   */
  findEnabledForCalendar(
    calendarId: string,
  ): Promise<MeetingReminderPolicy | null> {
    return this.prisma.meetingReminderPolicy.findFirst({
      where: { calendarId, enabled: true },
    });
  }

  findById(id: string): Promise<MeetingReminderPolicy | null> {
    return this.prisma.meetingReminderPolicy.findUnique({ where: { id } });
  }
}
