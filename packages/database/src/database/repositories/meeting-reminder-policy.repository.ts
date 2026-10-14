import { Injectable } from "@nestjs/common";
import { MeetingReminderPolicy } from "@prisma/client";
import type { OrganizationOwnershipContext } from "@ringee/platform";
import { PrismaService } from "../prisma.service";

export interface MeetingReminderPolicyInput {
  agentId: string;
  calendarId: string;
  offsetsMinutes: number[];
  windowStartMinute?: number;
  windowEndMinute?: number;
  windowDays?: number[];
}

/**
 * Reminder-call policies, one per calendar. Whether a write changes which
 * calls are due — and therefore bumps the version that stales every planned
 * execution — is the service's decision, passed in explicitly.
 */
@Injectable()
export class MeetingReminderPolicyRepository {
  constructor(private readonly prisma: PrismaService) {}

  listForOwner(
    ctx: OrganizationOwnershipContext,
    options?: { agentId?: string },
  ): Promise<MeetingReminderPolicy[]> {
    return this.prisma.meetingReminderPolicy.findMany({
      where: {
        organizationId: ctx.organizationId,
        ...(options?.agentId ? { agentId: options.agentId } : {}),
      },
      orderBy: { createdAt: "asc" },
    });
  }

  findForCalendar(
    ctx: OrganizationOwnershipContext,
    calendarId: string,
  ): Promise<MeetingReminderPolicy | null> {
    return this.prisma.meetingReminderPolicy.findFirst({
      where: { organizationId: ctx.organizationId, calendarId },
    });
  }

  findByIdForOwner(
    ctx: OrganizationOwnershipContext,
    id: string,
  ): Promise<MeetingReminderPolicy | null> {
    return this.prisma.meetingReminderPolicy.findFirst({
      where: { organizationId: ctx.organizationId, id },
    });
  }

  /**
   * Creates the calendar's policy or replaces it. Replacing always takes a new
   * version and a fresh activation time: whatever was planned under the old
   * settings is cancelled and replanned by the caller.
   */
  upsertForCalendar(
    ctx: OrganizationOwnershipContext,
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
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        calendarId: input.calendarId,
        enabled: true,
        activatedAt: now,
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
    ctx: OrganizationOwnershipContext,
    ids: string[],
    enabled: boolean,
  ): Promise<MeetingReminderPolicy[]> {
    if (ids.length === 0) return [];
    await this.prisma.meetingReminderPolicy.updateMany({
      where: { organizationId: ctx.organizationId, id: { in: ids } },
      data: {
        enabled,
        version: { increment: 1 },
        ...(enabled ? { activatedAt: new Date() } : {}),
      },
    });
    return this.prisma.meetingReminderPolicy.findMany({
      where: { organizationId: ctx.organizationId, id: { in: ids } },
    });
  }

  /** Removes the policies of calendars no longer covered by an agent's setup. */
  async deleteForOwner(
    ctx: OrganizationOwnershipContext,
    ids: string[],
  ): Promise<number> {
    if (ids.length === 0) return 0;
    const { count } = await this.prisma.meetingReminderPolicy.deleteMany({
      where: { organizationId: ctx.organizationId, id: { in: ids } },
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
